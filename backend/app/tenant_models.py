from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import declarative_base


TenantBase = declarative_base()


class AuditLog(TenantBase):
    """Append-only record of who performed a mutating action, and when.

    Stored centrally (school_accounts.db) with account_code so actions across
    all tenant schools are queryable in one place.
    """

    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    account_code = Column(String, nullable=True, index=True)
    actor_email = Column(String, nullable=True, index=True)
    actor_role = Column(String, nullable=True)
    method = Column(String, nullable=False)
    path = Column(String, nullable=False)
    status_code = Column(Integer, nullable=True)
    client_ip = Column(String, nullable=True)
    detail = Column(Text, nullable=True)


class SchoolAccount(TenantBase):
    __tablename__ = "school_accounts"

    id = Column(Integer, primary_key=True, index=True)
    school_name = Column(String, nullable=False)
    account_code = Column(String, nullable=False, unique=True, index=True)
    domain = Column(String, nullable=True, unique=True, index=True)
    school_type = Column(String, nullable=True, default="English Medium")
    curriculum = Column(String, nullable=True, default="CBSE")
    country = Column(String, nullable=True, default="India")
    timezone = Column(String, nullable=True, default="Asia/Calcutta")
    database_url = Column(String, nullable=False)
    status = Column(String, nullable=False, default="Active")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PasswordResetToken(TenantBase):
    """Single-use, expiring password-reset tokens.

    Stored centrally so the raw token from a reset link is enough to locate the
    tenant (account_code) and user (email) without knowing them up front. Only
    the SHA-256 hash of the token is persisted, so a DB leak can't be replayed.
    """

    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token_hash = Column(String, nullable=False, unique=True, index=True)
    account_code = Column(String, nullable=False, index=True)
    email = Column(String, nullable=False, index=True)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class SchoolFeature(TenantBase):
    __tablename__ = "school_features"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, nullable=False, index=True)
    feature_key = Column(String, nullable=False, index=True)
    is_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("account_id", "feature_key", name="uq_account_feature"),
    )


class PlatformAdmin(TenantBase):
    """Owner-level users of the ERP company itself. Lives in the CENTRAL
    registry database, completely separate from any school's users."""

    __tablename__ = "platform_admins"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False, unique=True, index=True)
    password_hash = Column(String, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SubscriptionPlan(TenantBase):
    """Available plans the owner sells to schools."""

    __tablename__ = "subscription_plans"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)          # Basic, Standard, Premium
    price_monthly = Column(Integer, default=0)                   # in smallest currency unit
    price_yearly = Column(Integer, default=0)
    max_students = Column(Integer, nullable=True)                # null = unlimited
    max_users = Column(Integer, nullable=True)
    description = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SchoolSubscription(TenantBase):
    """A school's active or past subscription."""

    __tablename__ = "school_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, nullable=False, index=True)
    plan_id = Column(Integer, nullable=False)

    billing_cycle = Column(String, default="yearly")             # monthly / yearly
    amount_paid = Column(Integer, default=0)                     # last payment amount
    currency = Column(String, default="INR")

    start_date = Column(DateTime, nullable=False)
    expiry_date = Column(DateTime, nullable=False)
    status = Column(String, default="Active")                    # Active / Expired / Cancelled

    payment_reference = Column(String, nullable=True)            # txn id / cheque no
    remarks = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("account_id", "start_date", name="uq_sub_account_start"),
    )


class PlatformNotification(TenantBase):
    """Notifications pushed by the owner to school admins."""

    __tablename__ = "platform_notifications"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(Integer, nullable=True, index=True)      # null = broadcast to all
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    notification_type = Column(String, default="info")           # info / warning / urgent
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
