from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError

from app.database import Base
from app.models import User
from app.security import get_current_user, hash_password, validate_password
from app.db_migrations import stamp_tenant_db
from app.routes.platform import require_platform_owner
from app.tenant import (
    CentralSessionLocal,
    DEFAULT_FEATURES,
    get_account,
    get_account_code_from_request,
    get_feature_map,
    get_school_session_factory,
)
from app.tenant_models import SchoolAccount, SchoolFeature
from app.schemas import SchoolAccountCreate, SchoolAccountResponse, SchoolFeatureUpdate

router = APIRouter(prefix="/accounts", tags=["School Accounts"])


def account_to_response(account: SchoolAccount):
    return {
        "id": account.id,
        "school_name": account.school_name,
        "account_code": account.account_code,
        "domain": account.domain,
        "school_type": account.school_type,
        "curriculum": account.curriculum,
        "country": account.country,
        "timezone": account.timezone,
        "database_url": account.database_url,
        "status": account.status,
        "features": get_feature_map(account.id),
    }


@router.get("/me")
def get_current_account(
    request: Request,
    current_user=Depends(get_current_user),
):
    account = get_account(get_account_code_from_request(request))
    return {
        "account": {
            key: value
            for key, value in account.items()
            if key not in {"database_url"}
        },
        "features": get_feature_map(account["id"]),
        "user": {
            "id": current_user.id,
            "name": current_user.name,
            "email": current_user.email,
            "role": current_user.role,
        },
    }


@router.get("/", response_model=list[SchoolAccountResponse])
def list_accounts(owner=Depends(require_platform_owner)):
    db = CentralSessionLocal()
    try:
        accounts = db.query(SchoolAccount).order_by(SchoolAccount.id.desc()).all()
        return [account_to_response(account) for account in accounts]
    finally:
        db.close()


@router.post("/", response_model=SchoolAccountResponse)
def create_account(
    payload: SchoolAccountCreate,
    owner=Depends(require_platform_owner),
):
    validate_password(payload.admin_password)

    db = CentralSessionLocal()
    try:
        database_url = payload.database_url

        if not database_url:
            safe_code = "".join(
                char.lower() if char.isalnum() else "_"
                for char in payload.account_code
            ).strip("_")
            database_url = f"sqlite:///./school_erp_{safe_code}.db"

        account = SchoolAccount(
            school_name=payload.school_name,
            account_code=payload.account_code,
            domain=payload.domain,
            school_type=payload.school_type,
            curriculum=payload.curriculum,
            country=payload.country,
            timezone=payload.timezone,
            database_url=database_url,
            status=payload.status,
        )
        db.add(account)
        db.commit()
        db.refresh(account)

        for feature_key, enabled in DEFAULT_FEATURES.items():
            db.add(
                SchoolFeature(
                    account_id=account.id,
                    feature_key=feature_key,
                    is_enabled=payload.features.get(feature_key, enabled)
                    if payload.features
                    else enabled,
                )
            )

        db.commit()

        school_session_factory = get_school_session_factory(database_url)
        school_db = school_session_factory()
        try:
            Base.metadata.create_all(bind=school_db.get_bind())

            admin_exists = (
                school_db.query(User)
                .filter(User.email == payload.admin_email)
                .first()
            )

            if not admin_exists:
                school_db.add(
                    User(
                        name=payload.admin_name,
                        email=payload.admin_email,
                        password_hash=hash_password(payload.admin_password),
                        role="Admin",
                    )
                )
                school_db.commit()
        finally:
            school_db.close()

        stamp_tenant_db(database_url)

        return account_to_response(account)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Account code or domain already exists",
        )
    finally:
        db.close()


@router.put("/{account_code}/features")
def update_account_features(
    account_code: str,
    payload: SchoolFeatureUpdate,
    owner=Depends(require_platform_owner),
):
    db = CentralSessionLocal()
    try:
        account = (
            db.query(SchoolAccount)
            .filter(SchoolAccount.account_code == account_code)
            .first()
        )

        if not account:
            raise HTTPException(status_code=404, detail="School account not found")

        existing = {
            feature.feature_key: feature
            for feature in db.query(SchoolFeature)
            .filter(SchoolFeature.account_id == account.id)
            .all()
        }

        for feature_key, is_enabled in payload.features.items():
            if feature_key in existing:
                existing[feature_key].is_enabled = is_enabled
            else:
                db.add(
                    SchoolFeature(
                        account_id=account.id,
                        feature_key=feature_key,
                        is_enabled=is_enabled,
                    )
                )

        db.commit()

        return {"features": get_feature_map(account.id)}
    finally:
        db.close()
