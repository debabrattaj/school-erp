import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError

from app import models
from app.database import Base
from app.security import (
    SECRET_KEY,
    ALGORITHM,
    hash_password,
    verify_password,
)
from app.tenant import (
    CentralSessionLocal,
    DEFAULT_FEATURES,
    get_school_session_factory,
)
from app.tenant_models import (
    PlatformAdmin,
    PlatformNotification,
    SchoolAccount,
    SchoolFeature,
    SchoolSubscription,
    SubscriptionPlan,
)
from app.rate_limit import (
    login_keys,
    check_login_allowed,
    record_login_failure,
    clear_login_failures,
)

router = APIRouter(prefix="/platform", tags=["Platform Owner Console"])

platform_bearer = HTTPBearer()

PLATFORM_TOKEN_MINUTES = int(os.getenv("PLATFORM_TOKEN_MINUTES", "720"))

FEATURE_LABELS = {
    "dashboard": "Dashboard",
    "students": "Students",
    "teachers": "Teachers",
    "classes": "Classes",
    "attendance": "Attendance",
    "fees": "Fees",
    "exams": "Exams",
    "marks": "Marks",
    "reports": "Reports",
    "users": "User Management",
    "settings": "Institution Settings",
    "master_data": "Master Data",
    "student_layout": "Student Layout Builder",
    "report_card": "Report Card",
    "student_enrollments": "Student Enrollments",
    "admissions": "Admissions CRM",
    "admission_assessments": "Admission Tests",
    "parent_communication": "Communication",
    "student_services": "Student Services",
    "alumni_withdrawals": "Alumni & Exit",
    "counseling": "Counseling",
    "enrichment": "Enrichment",
    "compliance": "Compliance",
    "hostel": "Hostel",
    "transport": "Transport",
    "international_documents": "Intl. Documents",
    "health_infirmary": "Health Infirmary",
    "mess_management": "Mess Management",
    "library": "Library",
    "inventory": "Inventory",
    "house_system": "House System",
    "multi_curriculum": "Multi Curriculum",
    "academic_years": "Academic Years",
    "parent_portal": "Parent/Student Portal",
    "ai_chatbot": "AI Assistant",
}


def ensure_platform_owner():
    """Seed the first owner account. Uses PLATFORM_OWNER_EMAIL /
    PLATFORM_OWNER_PASSWORD / PLATFORM_OWNER_NAME from backend/.env when set;
    falls back to a dev default that MUST be changed before production."""
    db = CentralSessionLocal()
    try:
        if db.query(PlatformAdmin).count() > 0:
            return
        email = os.getenv("PLATFORM_OWNER_EMAIL", "owner@schoolerp.com")
        password = os.getenv("PLATFORM_OWNER_PASSWORD", "owner123")
        name = os.getenv("PLATFORM_OWNER_NAME", "Platform Owner")
        db.add(
            PlatformAdmin(
                name=name,
                email=email,
                password_hash=hash_password(password),
            )
        )
        db.commit()
    finally:
        db.close()


# ---------------- Auth ----------------


class PlatformLoginRequest(BaseModel):
    email: str
    password: str


@router.post("/auth/login")
def platform_login(payload: PlatformLoginRequest, request: Request):
    keys = login_keys(
        request.client.host if request.client else None,
        payload.email,
    )
    retry_after = check_login_allowed(keys)
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail="Too many failed login attempts. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    db = CentralSessionLocal()
    try:
        admin = (
            db.query(PlatformAdmin)
            .filter(PlatformAdmin.email == payload.email)
            .first()
        )
        if not admin or not admin.is_active or not verify_password(
            payload.password, admin.password_hash
        ):
            record_login_failure(keys)
            raise HTTPException(status_code=401, detail="Invalid credentials")

        clear_login_failures(keys)

        expire = datetime.now(timezone.utc) + timedelta(
            minutes=PLATFORM_TOKEN_MINUTES
        )
        token = jwt.encode(
            {
                "sub": str(admin.id),
                "scope": "platform",
                # deliberate: makes this token useless against school APIs,
                # since no tenant with this account code can exist
                "account_code": "__platform__",
                "exp": expire,
            },
            SECRET_KEY,
            algorithm=ALGORITHM,
        )
        return {
            "access_token": token,
            "owner": {"id": admin.id, "name": admin.name, "email": admin.email},
        }
    finally:
        db.close()


def require_platform_owner(
    credentials: HTTPAuthorizationCredentials = Depends(platform_bearer),
) -> PlatformAdmin:
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    if payload.get("scope") != "platform":
        raise HTTPException(
            status_code=403,
            detail="Platform owner access required",
        )

    db = CentralSessionLocal()
    try:
        admin = (
            db.query(PlatformAdmin)
            .filter(PlatformAdmin.id == int(payload.get("sub", 0)))
            .first()
        )
        if not admin or not admin.is_active:
            raise HTTPException(status_code=401, detail="Owner account not found")
        return admin
    finally:
        db.close()


# ---------------- Helpers ----------------


def tenant_stats(database_url: str) -> dict:
    """Open a tenant db defensively and count key records."""
    try:
        factory = get_school_session_factory(database_url)
        school_db = factory()
        try:
            return {
                "students": school_db.query(models.Student).count(),
                "users": school_db.query(models.User).count(),
                "teachers": school_db.query(models.Teacher).count(),
            }
        finally:
            school_db.close()
    except Exception:
        return {"students": None, "users": None, "teachers": None}


def account_summary(db, account: SchoolAccount, include_stats: bool = True):
    features = {
        f.feature_key: bool(f.is_enabled)
        for f in db.query(SchoolFeature)
        .filter(SchoolFeature.account_id == account.id)
        .all()
    }
    data = {
        "id": account.id,
        "school_name": account.school_name,
        "account_code": account.account_code,
        "domain": account.domain,
        "school_type": account.school_type,
        "curriculum": account.curriculum,
        "country": account.country,
        "timezone": account.timezone,
        "status": account.status,
        "created_at": account.created_at,
        "features": features,
        "features_enabled": sum(1 for v in features.values() if v),
        "features_total": len(features),
    }
    if include_stats:
        data["stats"] = tenant_stats(account.database_url)

    # active subscription
    active_sub = (
        db.query(SchoolSubscription)
        .filter(
            SchoolSubscription.account_id == account.id,
            SchoolSubscription.status == "Active",
        )
        .order_by(SchoolSubscription.start_date.desc())
        .first()
    )
    if active_sub:
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == active_sub.plan_id).first()
        now = datetime.utcnow()
        days_left = (active_sub.expiry_date - now).days if active_sub.expiry_date else None
        data["subscription"] = {
            "plan_name": plan.name if plan else None,
            "billing_cycle": active_sub.billing_cycle,
            "amount_paid": active_sub.amount_paid,
            "currency": active_sub.currency,
            "start_date": active_sub.start_date.isoformat() if active_sub.start_date else None,
            "expiry_date": active_sub.expiry_date.isoformat() if active_sub.expiry_date else None,
            "days_left": days_left,
            "is_expired": days_left is not None and days_left < 0,
            "is_expiring_soon": days_left is not None and 0 <= days_left <= 30,
            "status": active_sub.status,
        }
    else:
        data["subscription"] = None

    return data


def get_account_or_404(db, account_id: int) -> SchoolAccount:
    account = (
        db.query(SchoolAccount).filter(SchoolAccount.id == account_id).first()
    )
    if not account:
        raise HTTPException(status_code=404, detail="School not found")
    return account


# ---------------- Feature catalog ----------------


@router.get("/feature-catalog")
def feature_catalog(owner: PlatformAdmin = Depends(require_platform_owner)):
    return [
        {
            "key": key,
            "label": FEATURE_LABELS.get(key, key.replace("_", " ").title()),
            "default_enabled": enabled,
        }
        for key, enabled in DEFAULT_FEATURES.items()
    ]


# ---------------- Schools ----------------


@router.get("/schools")
def list_schools(owner: PlatformAdmin = Depends(require_platform_owner)):
    db = CentralSessionLocal()
    try:
        accounts = db.query(SchoolAccount).order_by(SchoolAccount.id).all()
        return [account_summary(db, account) for account in accounts]
    finally:
        db.close()


@router.get("/schools/{account_id}")
def school_detail(
    account_id: int,
    owner: PlatformAdmin = Depends(require_platform_owner),
):
    db = CentralSessionLocal()
    try:
        account = get_account_or_404(db, account_id)
        data = account_summary(db, account)

        # settings snapshot from inside the tenant db (best effort)
        try:
            factory = get_school_session_factory(account.database_url)
            school_db = factory()
            try:
                settings = school_db.query(models.SchoolSettings).first()
                data["settings_snapshot"] = (
                    {
                        "school_name": settings.school_name,
                        "academic_year": settings.academic_year,
                        "principal_name": settings.principal_name,
                        "phone": settings.phone,
                        "email": settings.email,
                    }
                    if settings
                    else None
                )
            finally:
                school_db.close()
        except Exception:
            data["settings_snapshot"] = None

        return data
    finally:
        db.close()


class SchoolCreateRequest(BaseModel):
    school_name: str
    account_code: str
    domain: str | None = None
    school_type: str | None = "English Medium"
    curriculum: str | None = "CBSE"
    country: str | None = "India"
    timezone: str | None = "Asia/Calcutta"
    admin_name: str
    admin_email: str
    admin_password: str
    features: dict[str, bool] | None = None


@router.post("/schools")
def create_school(
    payload: SchoolCreateRequest,
    owner: PlatformAdmin = Depends(require_platform_owner),
):
    account_code = payload.account_code.strip().lower()
    if not account_code or not account_code.replace("_", "").replace("-", "").isalnum():
        raise HTTPException(
            status_code=400,
            detail="Account code must be alphanumeric (dashes/underscores allowed)",
        )

    db = CentralSessionLocal()
    try:
        safe_code = "".join(
            c.lower() if c.isalnum() else "_" for c in account_code
        ).strip("_")
        database_url = f"sqlite:///./school_erp_{safe_code}.db"

        account = SchoolAccount(
            school_name=payload.school_name.strip(),
            account_code=account_code,
            domain=payload.domain,
            school_type=payload.school_type,
            curriculum=payload.curriculum,
            country=payload.country,
            timezone=payload.timezone,
            database_url=database_url,
            status="Active",
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

        # create the tenant database + seed its first Admin user
        factory = get_school_session_factory(database_url)
        school_db = factory()
        try:
            Base.metadata.create_all(bind=school_db.get_bind())
            school_db.add(
                models.User(
                    name=payload.admin_name,
                    email=payload.admin_email,
                    password_hash=hash_password(payload.admin_password),
                    role="Admin",
                )
            )
            school_db.commit()
        finally:
            school_db.close()

        return account_summary(db, account)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400, detail="Account code or domain already exists"
        )
    finally:
        db.close()


class SchoolUpdateRequest(BaseModel):
    school_name: str | None = None
    domain: str | None = None
    school_type: str | None = None
    curriculum: str | None = None
    country: str | None = None
    timezone: str | None = None
    status: str | None = None  # Active / Suspended


@router.put("/schools/{account_id}")
def update_school(
    account_id: int,
    payload: SchoolUpdateRequest,
    owner: PlatformAdmin = Depends(require_platform_owner),
):
    db = CentralSessionLocal()
    try:
        account = get_account_or_404(db, account_id)

        if payload.status is not None and payload.status not in ("Active", "Suspended"):
            raise HTTPException(
                status_code=400, detail="Status must be Active or Suspended"
            )

        for field in (
            "school_name",
            "domain",
            "school_type",
            "curriculum",
            "country",
            "timezone",
            "status",
        ):
            value = getattr(payload, field)
            if value is not None:
                setattr(account, field, value)

        account.updated_at = datetime.utcnow()
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=400, detail="Domain already exists")
        db.refresh(account)
        return account_summary(db, account)
    finally:
        db.close()


class FeatureUpdateRequest(BaseModel):
    features: dict[str, bool]


@router.put("/schools/{account_id}/features")
def update_school_features(
    account_id: int,
    payload: FeatureUpdateRequest,
    owner: PlatformAdmin = Depends(require_platform_owner),
):
    unknown = [k for k in payload.features if k not in DEFAULT_FEATURES]
    if unknown:
        raise HTTPException(
            status_code=400, detail=f"Unknown feature keys: {', '.join(unknown)}"
        )

    db = CentralSessionLocal()
    try:
        account = get_account_or_404(db, account_id)
        existing = {
            f.feature_key: f
            for f in db.query(SchoolFeature)
            .filter(SchoolFeature.account_id == account.id)
            .all()
        }
        for key, enabled in payload.features.items():
            if key in existing:
                existing[key].is_enabled = enabled
                existing[key].updated_at = datetime.utcnow()
            else:
                db.add(
                    SchoolFeature(
                        account_id=account.id, feature_key=key, is_enabled=enabled
                    )
                )
        db.commit()
        return account_summary(db, account, include_stats=False)
    finally:
        db.close()


class ResetAdminRequest(BaseModel):
    admin_email: str
    new_password: str
    admin_name: str | None = None


@router.post("/schools/{account_id}/reset-admin")
def reset_school_admin(
    account_id: int,
    payload: ResetAdminRequest,
    owner: PlatformAdmin = Depends(require_platform_owner),
):
    """Owner support tool: reset (or create) an Admin login inside a school."""
    db = CentralSessionLocal()
    try:
        account = get_account_or_404(db, account_id)
    finally:
        db.close()

    factory = get_school_session_factory(account.database_url)
    school_db = factory()
    try:
        user = (
            school_db.query(models.User)
            .filter(models.User.email == payload.admin_email)
            .first()
        )
        if user:
            user.password_hash = hash_password(payload.new_password)
            if user.role != "Admin":
                user.role = "Admin"
            action = "reset"
        else:
            school_db.add(
                models.User(
                    name=payload.admin_name or "School Admin",
                    email=payload.admin_email,
                    password_hash=hash_password(payload.new_password),
                    role="Admin",
                )
            )
            action = "created"
        school_db.commit()
        return {
            "message": f"Admin login {action} for {account.school_name}",
            "admin_email": payload.admin_email,
        }
    finally:
        school_db.close()


# ===================== Subscription Plans =====================


DEFAULT_PLANS = [
    {"name": "Basic", "price_monthly": 2999, "price_yearly": 29990, "max_students": 200, "max_users": 20, "description": "Up to 200 students, core modules"},
    {"name": "Standard", "price_monthly": 5999, "price_yearly": 59990, "max_students": 500, "max_users": 50, "description": "Up to 500 students, all modules"},
    {"name": "Premium", "price_monthly": 9999, "price_yearly": 99990, "max_students": None, "max_users": None, "description": "Unlimited students & users, priority support"},
]


def ensure_default_plans():
    db = CentralSessionLocal()
    try:
        if db.query(SubscriptionPlan).count() > 0:
            return
        for plan in DEFAULT_PLANS:
            db.add(SubscriptionPlan(**plan))
        db.commit()
    finally:
        db.close()


class PlanCreate(BaseModel):
    name: str
    price_monthly: int = 0
    price_yearly: int = 0
    max_students: int | None = None
    max_users: int | None = None
    description: str | None = None


class PlanUpdate(BaseModel):
    name: str | None = None
    price_monthly: int | None = None
    price_yearly: int | None = None
    max_students: int | None = None
    max_users: int | None = None
    description: str | None = None
    is_active: bool | None = None


def plan_to_dict(plan: SubscriptionPlan):
    return {
        "id": plan.id,
        "name": plan.name,
        "price_monthly": plan.price_monthly,
        "price_yearly": plan.price_yearly,
        "max_students": plan.max_students,
        "max_users": plan.max_users,
        "description": plan.description,
        "is_active": plan.is_active,
    }


@router.get("/plans")
def list_plans(owner: PlatformAdmin = Depends(require_platform_owner)):
    db = CentralSessionLocal()
    try:
        return [plan_to_dict(p) for p in db.query(SubscriptionPlan).order_by(SubscriptionPlan.id).all()]
    finally:
        db.close()


@router.post("/plans")
def create_plan(
    payload: PlanCreate,
    owner: PlatformAdmin = Depends(require_platform_owner),
):
    db = CentralSessionLocal()
    try:
        plan = SubscriptionPlan(
            name=payload.name.strip(),
            price_monthly=payload.price_monthly,
            price_yearly=payload.price_yearly,
            max_students=payload.max_students,
            max_users=payload.max_users,
            description=payload.description,
        )
        db.add(plan)
        db.commit()
        db.refresh(plan)
        return plan_to_dict(plan)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Plan name already exists")
    finally:
        db.close()


@router.put("/plans/{plan_id}")
def update_plan(
    plan_id: int,
    payload: PlanUpdate,
    owner: PlatformAdmin = Depends(require_platform_owner),
):
    db = CentralSessionLocal()
    try:
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == plan_id).first()
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")
        for field in ("name", "price_monthly", "price_yearly", "max_students", "max_users", "description", "is_active"):
            value = getattr(payload, field)
            if value is not None:
                setattr(plan, field, value)
        plan.updated_at = datetime.utcnow()
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=400, detail="Plan name already exists")
        db.refresh(plan)
        return plan_to_dict(plan)
    finally:
        db.close()


# ===================== Subscriptions (Billing) =====================


class SubscriptionCreate(BaseModel):
    account_id: int
    plan_id: int
    billing_cycle: str = "yearly"       # monthly / yearly
    amount_paid: int = 0
    currency: str = "INR"
    start_date: str                     # ISO date string
    months: int = 12                    # subscription duration
    payment_reference: str | None = None
    remarks: str | None = None


def sub_to_dict(sub: SchoolSubscription, db):
    plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == sub.plan_id).first()
    account = db.query(SchoolAccount).filter(SchoolAccount.id == sub.account_id).first()
    now = datetime.utcnow()
    days_left = (sub.expiry_date - now).days if sub.expiry_date else None
    return {
        "id": sub.id,
        "account_id": sub.account_id,
        "school_name": account.school_name if account else None,
        "plan_id": sub.plan_id,
        "plan_name": plan.name if plan else None,
        "billing_cycle": sub.billing_cycle,
        "amount_paid": sub.amount_paid,
        "currency": sub.currency,
        "start_date": sub.start_date.isoformat() if sub.start_date else None,
        "expiry_date": sub.expiry_date.isoformat() if sub.expiry_date else None,
        "days_left": days_left,
        "is_expired": days_left is not None and days_left < 0,
        "is_expiring_soon": days_left is not None and 0 <= days_left <= 30,
        "status": sub.status,
        "payment_reference": sub.payment_reference,
        "remarks": sub.remarks,
        "created_at": sub.created_at.isoformat() if sub.created_at else None,
    }


@router.get("/subscriptions")
def list_subscriptions(
    owner: PlatformAdmin = Depends(require_platform_owner),
):
    db = CentralSessionLocal()
    try:
        subs = db.query(SchoolSubscription).order_by(SchoolSubscription.expiry_date.desc()).all()
        return [sub_to_dict(s, db) for s in subs]
    finally:
        db.close()


@router.get("/schools/{account_id}/subscriptions")
def school_subscriptions(
    account_id: int,
    owner: PlatformAdmin = Depends(require_platform_owner),
):
    db = CentralSessionLocal()
    try:
        get_account_or_404(db, account_id)
        subs = (
            db.query(SchoolSubscription)
            .filter(SchoolSubscription.account_id == account_id)
            .order_by(SchoolSubscription.start_date.desc())
            .all()
        )
        return [sub_to_dict(s, db) for s in subs]
    finally:
        db.close()


@router.post("/subscriptions")
def create_subscription(
    payload: SubscriptionCreate,
    owner: PlatformAdmin = Depends(require_platform_owner),
):
    db = CentralSessionLocal()
    try:
        get_account_or_404(db, payload.account_id)
        plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == payload.plan_id).first()
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found")

        try:
            start = datetime.fromisoformat(payload.start_date)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid start_date format (use YYYY-MM-DD)")

        expiry = start + timedelta(days=payload.months * 30)

        amount = payload.amount_paid
        if amount == 0:
            amount = plan.price_yearly if payload.billing_cycle == "yearly" else plan.price_monthly

        sub = SchoolSubscription(
            account_id=payload.account_id,
            plan_id=payload.plan_id,
            billing_cycle=payload.billing_cycle,
            amount_paid=amount,
            currency=payload.currency,
            start_date=start,
            expiry_date=expiry,
            status="Active",
            payment_reference=payload.payment_reference,
            remarks=payload.remarks,
        )
        db.add(sub)

        # mark any previous Active subscriptions for this account as replaced
        db.query(SchoolSubscription).filter(
            SchoolSubscription.account_id == payload.account_id,
            SchoolSubscription.id != sub.id,
            SchoolSubscription.status == "Active",
        ).update({"status": "Replaced"})

        db.commit()
        db.refresh(sub)
        return sub_to_dict(sub, db)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Duplicate subscription for this start date")
    finally:
        db.close()


@router.get("/billing/summary")
def billing_summary(owner: PlatformAdmin = Depends(require_platform_owner)):
    """Dashboard-level billing overview."""
    db = CentralSessionLocal()
    try:
        now = datetime.utcnow()
        all_subs = db.query(SchoolSubscription).filter(SchoolSubscription.status == "Active").all()

        total_revenue = sum(s.amount_paid or 0 for s in all_subs)
        active_count = 0
        expiring_soon = []
        expired = []

        for sub in all_subs:
            days = (sub.expiry_date - now).days if sub.expiry_date else None
            account = db.query(SchoolAccount).filter(SchoolAccount.id == sub.account_id).first()
            school_name = account.school_name if account else f"Account #{sub.account_id}"
            plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == sub.plan_id).first()

            if days is not None and days < 0:
                expired.append({"school_name": school_name, "account_id": sub.account_id, "days_overdue": abs(days), "plan": plan.name if plan else None})
            else:
                active_count += 1
                if days is not None and days <= 30:
                    expiring_soon.append({"school_name": school_name, "account_id": sub.account_id, "days_left": days, "expiry_date": sub.expiry_date.isoformat(), "plan": plan.name if plan else None})

        return {
            "total_revenue": total_revenue,
            "active_subscriptions": active_count,
            "expired_count": len(expired),
            "expiring_soon_count": len(expiring_soon),
            "expiring_soon": sorted(expiring_soon, key=lambda x: x["days_left"]),
            "expired": expired,
        }
    finally:
        db.close()


# ===================== Platform Notifications =====================


class NotificationCreate(BaseModel):
    account_id: int | None = None       # null = broadcast to all schools
    title: str
    message: str
    notification_type: str = "info"     # info / warning / urgent


def notif_to_dict(notif: PlatformNotification, db):
    school_name = None
    if notif.account_id:
        account = db.query(SchoolAccount).filter(SchoolAccount.id == notif.account_id).first()
        school_name = account.school_name if account else None
    return {
        "id": notif.id,
        "account_id": notif.account_id,
        "school_name": school_name,
        "title": notif.title,
        "message": notif.message,
        "notification_type": notif.notification_type,
        "is_read": notif.is_read,
        "created_at": notif.created_at.isoformat() if notif.created_at else None,
    }


@router.get("/notifications")
def list_notifications(owner: PlatformAdmin = Depends(require_platform_owner)):
    db = CentralSessionLocal()
    try:
        notifs = db.query(PlatformNotification).order_by(PlatformNotification.created_at.desc()).limit(100).all()
        return [notif_to_dict(n, db) for n in notifs]
    finally:
        db.close()


@router.post("/notifications")
def send_notification(
    payload: NotificationCreate,
    owner: PlatformAdmin = Depends(require_platform_owner),
):
    if payload.notification_type not in ("info", "warning", "urgent"):
        raise HTTPException(status_code=400, detail="Type must be info, warning, or urgent")

    db = CentralSessionLocal()
    try:
        if payload.account_id:
            get_account_or_404(db, payload.account_id)

        notif = PlatformNotification(
            account_id=payload.account_id,
            title=payload.title.strip(),
            message=payload.message.strip(),
            notification_type=payload.notification_type,
        )
        db.add(notif)
        db.commit()
        db.refresh(notif)
        return notif_to_dict(notif, db)
    finally:
        db.close()


@router.post("/notifications/expiry-reminders")
def send_expiry_reminders(owner: PlatformAdmin = Depends(require_platform_owner)):
    """Auto-generate warning notifications for schools expiring within 30 days
    and urgent ones for already-expired subscriptions."""
    db = CentralSessionLocal()
    try:
        now = datetime.utcnow()
        active_subs = db.query(SchoolSubscription).filter(SchoolSubscription.status == "Active").all()
        sent = 0

        for sub in active_subs:
            days = (sub.expiry_date - now).days if sub.expiry_date else None
            if days is None:
                continue

            plan = db.query(SubscriptionPlan).filter(SubscriptionPlan.id == sub.plan_id).first()
            plan_name = plan.name if plan else "your plan"

            if days < 0:
                ntype, title = "urgent", "Subscription Expired"
                msg = f"Your {plan_name} subscription expired {abs(days)} day(s) ago. Please renew to avoid service interruption."
            elif days <= 30:
                ntype, title = "warning", "Subscription Expiring Soon"
                msg = f"Your {plan_name} subscription expires in {days} day(s) on {sub.expiry_date.strftime('%d %b %Y')}. Please renew to continue uninterrupted access."
            else:
                continue

            # skip if a similar notification was sent in the last 7 days
            recent = (
                db.query(PlatformNotification)
                .filter(
                    PlatformNotification.account_id == sub.account_id,
                    PlatformNotification.title == title,
                    PlatformNotification.created_at >= now - timedelta(days=7),
                )
                .first()
            )
            if recent:
                continue

            db.add(PlatformNotification(
                account_id=sub.account_id,
                title=title,
                message=msg,
                notification_type=ntype,
            ))
            sent += 1

        db.commit()
        return {"message": f"Sent {sent} expiry reminder(s)"}
    finally:
        db.close()


# Tenant-facing: school admins read their own notifications
@router.get("/my-notifications")
def my_notifications(
    credentials: HTTPAuthorizationCredentials = Depends(platform_bearer),
):
    """Returns notifications for the caller's school. Works with both
    platform owner tokens and regular school admin tokens."""
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    db = CentralSessionLocal()
    try:
        account_code = payload.get("account_code")
        is_platform = payload.get("scope") == "platform"

        query = db.query(PlatformNotification)

        if is_platform:
            # owner sees all notifications
            pass
        elif account_code and account_code != "__platform__":
            account = (
                db.query(SchoolAccount)
                .filter(SchoolAccount.account_code == account_code)
                .first()
            )
            if not account:
                return []
            # school sees its own + broadcasts (account_id is null)
            query = query.filter(
                (PlatformNotification.account_id == account.id)
                | (PlatformNotification.account_id == None)  # noqa: E711
            )
        else:
            return []

        notifs = query.order_by(PlatformNotification.created_at.desc()).limit(50).all()
        return [notif_to_dict(n, db) for n in notifs]
    finally:
        db.close()
