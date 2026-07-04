import os
from functools import lru_cache

from fastapi import HTTPException, Request
from jose import jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.tenant_models import SchoolAccount, SchoolFeature, TenantBase


CENTRAL_DATABASE_URL = os.getenv(
    "CENTRAL_DATABASE_URL",
    "sqlite:///./school_accounts.db",
)
DEFAULT_ACCOUNT_CODE = os.getenv("DEFAULT_ACCOUNT_CODE", "default")
DEFAULT_SCHOOL_DATABASE_URL = os.getenv(
    "DEFAULT_SCHOOL_DATABASE_URL",
    "sqlite:///./school_erp.db",
)

DEFAULT_FEATURES = {
    "dashboard": True,
    "students": True,
    "teachers": True,
    "classes": True,
    "attendance": True,
    "fees": True,
    "exams": True,
    "marks": True,
    "reports": True,
    "users": True,
    "settings": True,
    "master_data": True,
    "student_layout": True,
    "report_card": True,
    "student_enrollments": True,
    "admissions": True,
    "admission_assessments": True,
    "parent_communication": True,
    "student_services": True,
    "alumni_withdrawals": True,
    "counseling": True,
    "enrichment": True,
    "compliance": True,
    "hostel": False,
    "transport": False,
    "international_documents": True,
    "health_infirmary": False,
    "mess_management": False,
    "library": False,
    "inventory": False,
    "house_system": True,
    "multi_curriculum": True,
}

central_engine = create_engine(
    CENTRAL_DATABASE_URL,
    connect_args={"check_same_thread": False}
    if CENTRAL_DATABASE_URL.startswith("sqlite")
    else {},
)

CentralSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=central_engine,
)


@lru_cache(maxsize=128)
def get_school_session_factory(database_url: str):
    engine = create_engine(
        database_url,
        connect_args={"check_same_thread": False}
        if database_url.startswith("sqlite")
        else {},
    )
    Base.metadata.create_all(bind=engine)
    return sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_tenant_registry():
    TenantBase.metadata.create_all(bind=central_engine)

    db = CentralSessionLocal()
    try:
        account = (
            db.query(SchoolAccount)
            .filter(SchoolAccount.account_code == DEFAULT_ACCOUNT_CODE)
            .first()
        )

        if not account:
            account = SchoolAccount(
                school_name="Default School",
                account_code=DEFAULT_ACCOUNT_CODE,
                school_type="English Medium",
                curriculum="CBSE",
                country="India",
                timezone="Asia/Calcutta",
                database_url=DEFAULT_SCHOOL_DATABASE_URL,
                status="Active",
            )
            db.add(account)
            db.commit()
            db.refresh(account)

        existing_features = {
            feature.feature_key
            for feature in db.query(SchoolFeature)
            .filter(SchoolFeature.account_id == account.id)
            .all()
        }

        for feature_key, enabled in DEFAULT_FEATURES.items():
            if feature_key not in existing_features:
                db.add(
                    SchoolFeature(
                        account_id=account.id,
                        feature_key=feature_key,
                        is_enabled=enabled,
                    )
                )

        db.commit()
    finally:
        db.close()


def get_account(account_code: str | None):
    db = CentralSessionLocal()
    try:
        code = account_code or DEFAULT_ACCOUNT_CODE
        account = (
            db.query(SchoolAccount)
            .filter(SchoolAccount.account_code == code)
            .first()
        )

        if not account or account.status != "Active":
            raise HTTPException(status_code=404, detail="School account not found")

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
        }
    finally:
        db.close()


def get_feature_map(account_id: int):
    db = CentralSessionLocal()
    try:
        return {
            feature.feature_key: bool(feature.is_enabled)
            for feature in db.query(SchoolFeature)
            .filter(SchoolFeature.account_id == account_id)
            .all()
        }
    finally:
        db.close()


def get_account_code_from_request(request: Request):
    header_code = request.headers.get("x-school-code")

    if header_code:
        return header_code

    auth_header = request.headers.get("authorization") or ""

    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1]
        try:
            payload = jwt.get_unverified_claims(token)
            return payload.get("account_code") or DEFAULT_ACCOUNT_CODE
        except Exception:
            return DEFAULT_ACCOUNT_CODE

    return DEFAULT_ACCOUNT_CODE


def get_tenant_db(request: Request):
    account = get_account(get_account_code_from_request(request))
    session_factory = get_school_session_factory(account["database_url"])
    db = session_factory()
    try:
        yield db
    finally:
        db.close()
