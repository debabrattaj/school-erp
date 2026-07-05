from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User
from app.schemas import LoginRequest, TokenResponse, UserResponse
from app.security import verify_password, create_access_token, get_current_user
from app.tenant import get_account, get_feature_map, get_school_session_factory
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
