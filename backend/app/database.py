import os

from sqlalchemy import create_engine, text
from sqlalchemy.engine.url import make_url
from sqlalchemy.orm import sessionmaker, declarative_base
from fastapi import Request

# The default (single-tenant / "default" school) database. SQLite by default;
# point at Postgres by setting DEFAULT_SCHOOL_DATABASE_URL, e.g.
#   postgresql+psycopg://user:pass@host:5432/school_erp
DATABASE_URL = os.getenv("DEFAULT_SCHOOL_DATABASE_URL", "sqlite:///./school_erp.db")


def is_sqlite(url: str) -> bool:
    return url.startswith("sqlite")


def engine_kwargs(url: str) -> dict:
    """Dialect-appropriate create_engine kwargs."""
    if is_sqlite(url):
        # SQLite + threaded server needs this; file DBs have no real pool.
        return {"connect_args": {"check_same_thread": False}}
    # Postgres and other server DBs: verify connections before use.
    # query_cache_size=0 disables SQLAlchemy's compiled-statement cache. Some
    # WSGI hosts (e.g. Passenger) run concurrent requests as real OS threads
    # sharing this module-level engine, which can race on that cache's
    # lazily-computed result metadata (surfaces as a spurious
    # NotImplementedError deep in row processing). Most deployments (uvicorn,
    # gunicorn) don't hit this because they isolate concurrency differently.
    return {"pool_pre_ping": True, "query_cache_size": 0}


def make_engine(url: str):
    return create_engine(url, **engine_kwargs(url))


def build_tenant_database_url(safe_code: str) -> str:
    """Generate a fresh per-tenant connection string for a new school account.

    Mirrors the dialect of DEFAULT_SCHOOL_DATABASE_URL: SQLite gets its own
    file, Postgres (and other server DBs) get a same-server database named
    after the school, reusing the configured host/user/password/port.

    Some hosts (e.g. cPanel) force a fixed prefix on every database name they
    let you create. Set TENANT_DB_NAME_PREFIX to match so a database created
    ahead of time through the host's UI lines up with what the app expects.
    """
    if is_sqlite(DATABASE_URL):
        return f"sqlite:///./school_erp_{safe_code}.db"
    parsed = make_url(DATABASE_URL)
    prefix = os.getenv("TENANT_DB_NAME_PREFIX", "")
    return parsed.set(database=f"{prefix}school_erp_{safe_code}").render_as_string(hide_password=False)


def ensure_database_exists(url: str) -> None:
    """For server databases (Postgres), create the target database if it does
    not exist yet. SQLite files are created automatically on first connect, so
    this is a no-op there. Best-effort: never raises.
    """
    if is_sqlite(url):
        return
    if not url.startswith("postgresql"):
        return  # other backends are assumed to be provisioned externally

    try:
        parsed = make_url(url)
        dbname = parsed.database
        if not dbname:
            return
        # Connect to the server's maintenance DB with autocommit to run CREATE DATABASE.
        admin_url = parsed.set(database="postgres")
        admin_engine = create_engine(admin_url, isolation_level="AUTOCOMMIT")
        try:
            with admin_engine.connect() as conn:
                exists = conn.execute(
                    text("SELECT 1 FROM pg_database WHERE datname = :name"),
                    {"name": dbname},
                ).scalar()
                if not exists:
                    conn.execute(text(f'CREATE DATABASE "{dbname}"'))
        finally:
            admin_engine.dispose()
    except Exception:
        # If we can't provision (e.g. missing privileges), let the caller's
        # normal connection attempt surface a clearer error.
        pass


engine = make_engine(DATABASE_URL)

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
