import hashlib
import logging
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
)
from app.security import (
    verify_password,
    create_access_token,
    get_current_user,
    hash_password,
)
from app.tenant import (
    get_account,
    get_feature_map,
    get_school_session_factory,
    CentralSessionLocal,
)
from app.tenant_models import PasswordResetToken
from app.rate_limit import (
    login_keys,
    check_login_allowed,
    record_login_failure,
    clear_login_failures,
)

logger = logging.getLogger("auth")

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"]
)

# Reset links are valid for this long.
RESET_TOKEN_TTL_MINUTES = int(os.getenv("RESET_TOKEN_TTL_MINUTES", "30"))
# Minimum acceptable length for a new password chosen via reset.
MIN_PASSWORD_LENGTH = int(os.getenv("MIN_PASSWORD_LENGTH", "8"))
# Base URL of the frontend, used to build the reset link in the (logged) email.
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173")
# When true, the reset token is returned in the API response. DEV ONLY — there
# is no email transport yet, so this makes the flow testable. Never enable in
# production; it would let anyone reset any account.
RESET_DEBUG_RETURN_TOKEN = os.getenv("RESET_DEBUG_RETURN_TOKEN", "false").lower() == "true"


def _hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode()).hexdigest()


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

        clear_login_failures(keys)

        access_token = create_access_token(
            data={
                "sub": user.email,
                "role": user.role,
                "account_code": account["account_code"],
                "account_id": account["id"],
            }
        )
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
    # No email transport yet: log the link so it can be delivered manually / in
    # dev. Wire an email sender here to go live.
    logger.info("Password reset link for %s: %s", payload.email, reset_link)
    if RESET_DEBUG_RETURN_TOKEN:
        debug_token = raw_token

    if debug_token:
        return {**generic, "debug_token": debug_token, "debug_reset_link": reset_link}
    return generic


@router.post("/reset-password")
def reset_password_with_token(payload: ResetPasswordConfirm):
    """Complete a password reset using the token from the reset link."""
    if len(payload.new_password) < MIN_PASSWORD_LENGTH:
        raise HTTPException(
            status_code=400,
            detail=f"Password must be at least {MIN_PASSWORD_LENGTH} characters.",
        )

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
