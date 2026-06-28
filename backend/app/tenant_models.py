from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import declarative_base


TenantBase = declarative_base()


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
