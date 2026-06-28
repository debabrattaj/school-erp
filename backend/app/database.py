from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from fastapi import Request

DATABASE_URL = "sqlite:///./school_erp.db"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()


def get_default_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_db(request: Request):
    from app.tenant import get_tenant_db

    yield from get_tenant_db(request)
