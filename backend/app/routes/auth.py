import hashlib
import os
import secrets
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import (
    LoginRequest,
    TokenResponse,
    UserResponse,
    ForgotPasswordRequest,
    ResetPasswordConfirm,
    MfaCodeRequest,
)
from app.totp import generate_secret, verify_totp, provisioning_uri
from app.security import (
    verify_password,
    create_access_token,
    get_current_user,
    hash_password,
    validate_password,
)
from app.tenant import (
    get_account,
    get_feature_map,
    get_school_session_factory,
    CentralSessionLocal,
)
from app.tenant_models import PasswordResetToken
from app.mailer import send_email
from app.rate_limit import (
    login_keys,
    check_login_allowed,
    record_login_failure,
    clear_login_failures,
)

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)

# Reset links are valid for this long.
RESET_TOKEN_TTL_MINUTES = int(os.getenv("RESET_TOKEN_TTL_MINUTES", "30"))
# Base URL of the frontend, used to build the reset link in the (logged) email.
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173")
# When true, the reset token is returned in the API response. DEV ONLY — there
# is no email transport yet, so this makes the flow testable. Never enable in
# production; it would let anyone reset any account.
RESET_DEBUG_RETURN_TOKEN = os.getenv("RESET_DEBUG_RETURN_TOKEN", "false").lower() == "true"


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()


def _resolve_permissions(db, role_name: str) -> dict:
    """Effective permission map for a user's role (system default or custom)."""
    import json
    from app.models import Role
    from app.permissions import SYSTEM_ROLE_PERMISSIONS

    if role_name in SYSTEM_ROLE_PERMISSIONS:
        return SYSTEM_ROLE_PERMISSIONS[role_name]
    role = db.query(Role).filter(Role.name == role_name).first()
    if role and role.permissions:
        try:
            return json.loads(role.permissions)
        except Exception:
            return {}
    return {}


@router.post("/login", response_model=TokenResponse)
def login(login_data: LoginRequest, request: Request):
    keys = login_keys(
        request.client.host if request.client else None,
        login_data.email,
    )
    retry_after = check_login_allowed(keys)
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail="Too many failed login attempts. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    account = get_account(login_data.account_code)
    session_factory = get_school_session_factory(account["database_url"])
    db = session_factory()

    try:
        user = db.query(User).filter(User.email == login_data.email).first()

        if not user:
            record_login_failure(keys)
            raise HTTPException(
                status_code=401,
                detail="Invalid email or password"
            )

        if not verify_password(login_data.password, user.password_hash):
            record_login_failure(keys)
            raise HTTPException(
                status_code=401,
                detail="Invalid email or password"
            )

        # Second factor: if the user has MFA enabled, a valid TOTP code is
        # required. A distinct 401 detail ("MFA_REQUIRED") tells the frontend to
        # prompt for the code without treating it as a wrong password.
        if user.mfa_enabled:
            if not login_data.mfa_code:
                raise HTTPException(status_code=401, detail="MFA_REQUIRED")
            if not verify_totp(user.mfa_secret, login_data.mfa_code):
                record_login_failure(keys)
                raise HTTPException(status_code=401, detail="Invalid authentication code.")

        clear_login_failures(keys)

        access_token = create_access_token(
            data={
                "sub": user.email,
                "role": user.role,
                "account_code": account["account_code"],
                "account_id": account["id"],
            }
        )

        user_permissions = _resolve_permissions(db, user.role)
    finally:
        db.close()

    features = get_feature_map(account["id"])

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": user.role,
            "mfa_enabled": user.mfa_enabled,
            "permissions": user_permissions,
            "account": {
                "id": account["id"],
                "school_name": account["school_name"],
                "account_code": account["account_code"],
                "school_type": account["school_type"],
                "curriculum": account["curriculum"],
                "country": account["country"],
                "timezone": account["timezone"],
            },
            "features": features,
        }
    }


@router.get("/me", response_model=UserResponse)
def get_logged_in_user(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/mfa/status")
def mfa_status(current_user: User = Depends(get_current_user)):
    return {"mfa_enabled": bool(current_user.mfa_enabled)}


@router.post("/mfa/setup")
def mfa_setup(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Begin MFA enrollment: generate a secret and return it plus the otpauth
    URI. MFA is not active until the code is verified.
    """
    if current_user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA is already enabled.")

    secret = generate_secret()
    current_user.mfa_secret = secret
    db.commit()

    return {
        "secret": secret,
        "otpauth_uri": provisioning_uri(secret, current_user.email),
    }


def _mfa_keys(request: Request, email: str) -> list[str]:
    """Rate-limit keys for a TOTP-code attempt, fully separate from
    login_keys() (distinct ip prefix too) so a flood of MFA guesses can't
    also exhaust the login lockout bucket for that IP — which would let
    someone guessing one account's MFA code lock everyone else on a shared
    office/school IP out of logging in."""
    ip = request.client.host if request.client else None
    keys = [f"mfa-ip:{ip or 'unknown'}"]
    if email:
        keys.append(f"mfa:{email.strip().lower()}")
    return keys


@router.post("/mfa/verify")
def mfa_verify(
    payload: MfaCodeRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Confirm enrollment by verifying the first code, which activates MFA."""
    if current_user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA is already enabled.")
    if not current_user.mfa_secret:
        raise HTTPException(status_code=400, detail="Start MFA setup first.")

    keys = _mfa_keys(request, current_user.email)
    retry_after = check_login_allowed(keys)
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail="Too many failed codes. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    if not verify_totp(current_user.mfa_secret, payload.code):
        record_login_failure(keys)
        raise HTTPException(status_code=400, detail="Invalid authentication code.")

    clear_login_failures(keys)
    current_user.mfa_enabled = True
    db.commit()
    return {"message": "Multi-factor authentication is now enabled."}


@router.post("/mfa/disable")
def mfa_disable(
    payload: MfaCodeRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Disable MFA. Requires a current code to prove possession of the device."""
    if not current_user.mfa_enabled:
        raise HTTPException(status_code=400, detail="MFA is not enabled.")

    keys = _mfa_keys(request, current_user.email)
    retry_after = check_login_allowed(keys)
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail="Too many failed codes. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    if not verify_totp(current_user.mfa_secret, payload.code):
        record_login_failure(keys)
        raise HTTPException(status_code=400, detail="Invalid authentication code.")

    clear_login_failures(keys)
    current_user.mfa_enabled = False
    current_user.mfa_secret = None
    db.commit()
    return {"message": "Multi-factor authentication has been disabled."}


@router.post("/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, request: Request):
    """Start a password reset. Always returns the same generic response so an
    attacker can't tell whether an email is registered (no user enumeration).
    """
    # Throttle abuse (spamming reset requests) using the same limiter as login.
    keys = login_keys(
        request.client.host if request.client else None,
        payload.email,
    )
    retry_after = check_login_allowed(keys)
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )
    record_login_failure(keys)

    generic = {
        "message": "If that account exists, a password reset link has been sent."
    }
    debug_token = None

    try:
        account = get_account(payload.account_code)
    except Exception:
        return generic

    session_factory = get_school_session_factory(account["database_url"])
    db = session_factory()
    try:
        user = db.query(User).filter(User.email == payload.email).first()
    finally:
        db.close()

    if not user:
        return generic

    raw_token = secrets.token_urlsafe(32)
    central = CentralSessionLocal()
    try:
        # Invalidate any earlier unused tokens for this account/email.
        central.query(PasswordResetToken).filter(
            PasswordResetToken.account_code == account["account_code"],
            PasswordResetToken.email == payload.email,
            PasswordResetToken.used == False,  # noqa: E712
        ).update({"used": True})

        central.add(
            PasswordResetToken(
                token_hash=_hash_token(raw_token),
                account_code=account["account_code"],
                email=payload.email,
                expires_at=datetime.utcnow() + timedelta(minutes=RESET_TOKEN_TTL_MINUTES),
                used=False,
            )
        )
        central.commit()
    except Exception:
        central.rollback()
        return generic
    finally:
        central.close()

    reset_link = (
        f"{FRONTEND_BASE_URL}/reset-password"
        f"?token={raw_token}&account_code={account['account_code']}"
    )
    # Deliver the reset link. In log-only mode (no SMTP configured) the mailer
    # logs it instead of sending — the flow still completes.
    subject = "Reset your School ERP password"
    body = (
        f"We received a request to reset your School ERP password.\n\n"
        f"Use the link below within {RESET_TOKEN_TTL_MINUTES} minutes to choose "
        f"a new password:\n\n{reset_link}\n\n"
        f"If you did not request this, you can safely ignore this email."
    )
    send_email(payload.email, subject, body)
    if RESET_DEBUG_RETURN_TOKEN:
        debug_token = raw_token

    if debug_token:
        return {**generic, "debug_token": debug_token, "debug_reset_link": reset_link}
    return generic


@router.post("/reset-password")
def reset_password_with_token(payload: ResetPasswordConfirm):
    """Complete a password reset using the token from the reset link."""
    validate_password(payload.new_password)

    central = CentralSessionLocal()
    try:
        record = (
            central.query(PasswordResetToken)
            .filter(PasswordResetToken.token_hash == _hash_token(payload.token))
            .first()
        )

        if (
            not record
            or record.used
            or record.expires_at < datetime.utcnow()
        ):
            raise HTTPException(
                status_code=400,
                detail="This reset link is invalid or has expired.",
            )

        account_code = record.account_code
        email = record.email
    finally:
        central.close()

    account = get_account(account_code)
    session_factory = get_school_session_factory(account["database_url"])
    db = session_factory()
    try:
        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(
                status_code=400,
                detail="This reset link is invalid or has expired.",
            )
        user.password_hash = hash_password(payload.new_password)
        db.commit()
    finally:
        db.close()

    # Mark the token used only after the password was successfully changed.
    central = CentralSessionLocal()
    try:
        central.query(PasswordResetToken).filter(
            PasswordResetToken.token_hash == _hash_token(payload.token)
        ).update({"used": True})
        central.commit()
    finally:
        central.close()

    return {"message": "Your password has been reset. You can now sign in."}
