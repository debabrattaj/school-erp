import os
from functools import lru_cache

from fastapi import HTTPException, Request
from jose import jwt, JWTError
from sqlalchemy.orm import sessionmaker

from app.database import Base, make_engine, ensure_database_exists
from app.tenant_models import SchoolAccount, SchoolFeature, TenantBase

# Duplicated from app.security rather than imported, to avoid a circular
# import (security.py -> database.py -> [deferred] tenant.py). Must stay in
# sync with security.py's SECRET_KEY/ALGORITHM.
_JWT_SECRET_KEY = os.getenv("SECRET_KEY")
_JWT_ALGORITHM = "HS256"


CENTRAL_DATABASE_URL = os.getenv(
    "CENTRAL_DATABASE_URL",
    "sqlite:///./school_accounts.db",
)
DEFAULT_ACCOUNT_CODE = os.getenv("DEFAULT_ACCOUNT_CODE", "default")
DEFAULT_SCHOOL_DATABASE_URL = os.getenv(
    "DEFAULT_SCHOOL_DATABASE_URL",
    "sqlite:///./school_erp.db",
)

def backend_of(url: str | None) -> str:
    """"postgresql", "sqlite", or "" -- the dialect part of a database URL."""
    if not url:
        return ""
    return url.split("://", 1)[0].split("+", 1)[0].strip().lower()


def database_config_problems() -> list[str]:
    """Configuration mistakes worth shouting about at startup.

    The one that matters is a split backend: the registry on SQLite while the
    schools are on Postgres, or the reverse. Nothing errors in that state --
    both halves work -- but the SQLite half is a file resolved relative to the
    working directory, so two commands run from different places silently read
    two different registries and disagree about which schools exist. That is
    exactly the failure this check exists to make visible.
    """
    problems = []
    central = backend_of(CENTRAL_DATABASE_URL)
    default = backend_of(DEFAULT_SCHOOL_DATABASE_URL)

    if central and default and central != default:
        problems.append(
            f"Split backend: the central registry is on {central} but the default "
            f"school is on {default}. A relative SQLite path is resolved against "
            f"the working directory, so commands run from different directories "
            f"will read different registries."
        )

    for label, url in (("CENTRAL_DATABASE_URL", CENTRAL_DATABASE_URL),
                       ("DEFAULT_SCHOOL_DATABASE_URL", DEFAULT_SCHOOL_DATABASE_URL)):
        if backend_of(url) == "sqlite" and url.startswith("sqlite:///./"):
            problems.append(
                f"{label} is a SQLite path relative to the working directory "
                f"({url}). Use an absolute path, or Postgres, so every entry "
                f"point reads the same file."
            )

    return problems


DEFAULT_FEATURES = {
    "dashboard": True,
    "students": True,
    "teachers": True,
    "classes": True,
    "attendance": True,
    "fees": True,
    "accounting": True,
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
    "academic_years": True,
    "parent_portal": True,
    "timetable": True,
    "payroll": True,
    "homework": True,
    # Sold separately: off until the platform owner switches it on for a
    # school in the Platform Console. Enforced server-side by
    # require_feature("online_tests") on the staff and portal routes, not just
    # by hiding the sidebar entry.
    "online_tests": False,
    # Proctoring add-on for Online Tests: browser lockdown (fullscreen,
    # visibility/blur, copy-paste) signal capture and teacher review. A
    # separate SKU from online_tests itself -- a school can run online tests
    # without ever buying this. Requires per-student guardian consent on top
    # of this flag; see is_feature_enabled() calls in routes/portal.py.
    "online_test_proctoring": False,
    # Sold separately: biometric attendance (device registry, punch ingest and
    # attendance derivation). Off until the platform owner enables it, and the
    # gate covers the device ingest endpoint too, so a lapsed school stops
    # accepting punches rather than collecting data it can no longer store.
    "biometric_attendance": False,
    # Off by default: the platform owner must switch each of these on per
    # school via the Platform Console before the matching cron script will
    # actually act on that school's data — a school's own Admin can still
    # configure fee structures / academic-year promotion settings / exam
    # templates freely, but nothing fires unattended until enabled here.
    "fee_auto_generation": False,
    "fee_reminders": False,
    "fee_late_charges": False,
    # Emails/SMSes borrowers about overdue library books on a schedule, same
    # opt-in gating as fee_reminders -- a module that messages parents/staff
    # unattended must not switch itself on.
    "library_reminders": False,
    "promotion_auto_generation": False,
    "exam_auto_generation": False,
    # Staff HR module, not every school runs leave/substitution through the
    # ERP yet -- off by default like the other operational add-ons (hostel,
    # transport, library), on once a school opts in via the Platform Console.
    "leave": False,
    # Core teaching workflow, alongside Homework and Timetable -- on by
    # default rather than an opt-in add-on.
    "syllabus": True,
    # Bulk-writes the whole school's period grid in one action, so it stays
    # opt-in like the other *_auto_generation automations even though it has
    # no cron component -- a school must choose to hand scheduling to the
    # algorithm rather than find their manually-built timetable overwritten.
    "timetable_auto_generation": False,
    # Emails staff on a schedule, so it stays opt-in like the other
    # unattended automations -- a school must choose this before the ERP
    # starts sending mail on its own.
    "admission_reminders": False,
}

ensure_database_exists(CENTRAL_DATABASE_URL)
central_engine = make_engine(CENTRAL_DATABASE_URL)

CentralSessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=central_engine,
)


@lru_cache(maxsize=128)
def get_school_session_factory(database_url: str):
    # On Postgres a new tenant database must be created before we can connect;
    # SQLite files are created automatically.
    ensure_database_exists(database_url)
    engine = make_engine(database_url)
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


def is_feature_enabled(account_code: str, feature_key: str) -> bool:
    """Whether the platform owner has switched a given feature on for this
    school. Used by the scheduled-automation cron scripts (fees, year-end
    promotion, exam creation) to gate themselves per tenant — every such
    feature defaults to False in DEFAULT_FEATURES, so an account with no
    explicit SchoolFeature row for this key is treated as disabled, same as
    an unknown/inactive account."""
    try:
        account = get_account(account_code)
    except HTTPException:
        return False
    return get_feature_map(account["id"]).get(feature_key, False)


def require_feature(feature_key: str):
    """Route dependency: 403 unless the platform owner enabled this module.

    Module flags used to be enforced only by hiding the entry in the sidebar,
    which left the endpoints themselves reachable — a school that hadn't been
    given a module could still drive it directly through the API. Any module
    that is optional or sold separately should gate its routes on this so the
    flag is a real entitlement check rather than a UI hint.

    Resolves the account the same way tenant routing does, so it agrees with
    whichever database the request is actually being served from.
    """

    def _check(request: Request):
        account_code = get_account_code_from_request(request)
        if not is_feature_enabled(account_code, feature_key):
            raise HTTPException(
                status_code=403,
                detail="This module is not enabled for your school.",
            )
        return True

    return _check


def get_account_code_from_request(request: Request):
    """Resolve which tenant database a request should use.

    Security-critical: a signed, verifiable bearer token's own account_code
    claim is authoritative and always wins over the client-supplied
    x-school-code header. Without this, a user could take their own valid
    token (issued for their real school) and replay it with a different
    school's header, getting routed to that other tenant's database — and
    if any user there happened to share their email, get authenticated as
    that unrelated person with no password check against that account.
    The header is only trusted when there is no valid token yet, i.e. for
    pre-auth flows (login, forgot-password) that must pick a tenant before
    a token exists.
    """
    auth_header = request.headers.get("authorization") or ""

    if auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1]
        try:
            payload = jwt.decode(token, _JWT_SECRET_KEY, algorithms=[_JWT_ALGORITHM])
            account_code = payload.get("account_code")
            if account_code:
                return account_code
        except JWTError:
            # Invalid/expired token: fall through to the header. Any
            # authenticated route will separately reject this request with
            # 401 when it re-verifies the token in get_current_user.
            pass

    header_code = request.headers.get("x-school-code")
    if header_code:
        return header_code

    return DEFAULT_ACCOUNT_CODE


def get_tenant_db(request: Request):
    account = get_account(get_account_code_from_request(request))
    session_factory = get_school_session_factory(account["database_url"])
    db = session_factory()
    try:
        yield db
    finally:
        db.close()
