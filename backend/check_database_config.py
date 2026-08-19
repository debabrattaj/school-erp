"""What databases does this install actually use, and what is in them?

Written after a deploy stalled on two commands disagreeing about which
schools existed. The cause was a split backend -- the tenant registry on a
relative SQLite path while the schools were on Postgres -- so the answer
depended on the working directory. This prints the whole picture from one
place, including row counts, so "is there anything in this file worth
keeping" is a question with an answer rather than a guess.

Read-only. It opens every database it can find and writes to none of them.

Usage:
  python check_database_config.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv  # noqa: E402
load_dotenv()

from sqlalchemy import create_engine, inspect, text  # noqa: E402

from app.tenant import (  # noqa: E402
    CENTRAL_DATABASE_URL,
    DEFAULT_SCHOOL_DATABASE_URL,
    CentralSessionLocal,
    backend_of,
    database_config_problems,
    init_tenant_registry,
)
from app.tenant_models import SchoolAccount  # noqa: E402
from manage_migrations import _redact, tenant_urls  # noqa: E402

# The tables worth counting: if these are all zero the database holds no
# school, whatever its file size says.
CENSUS_TABLES = ["students", "teachers", "fees", "attendance", "marks", "users"]


def census(url: str) -> tuple[dict, str | None]:
    """Row counts for the tables that indicate a database is really in use."""
    try:
        engine = create_engine(url)
        counts = {}
        with engine.connect() as conn:
            present = set(inspect(engine).get_table_names())
            for table in CENSUS_TABLES:
                if table not in present:
                    continue
                counts[table] = conn.execute(
                    text(f"SELECT COUNT(*) FROM {table}")  # noqa: S608 - fixed list
                ).scalar()
        engine.dispose()
        return counts, None
    except Exception as exc:
        return {}, str(exc)[:200]


def sqlite_file(url: str) -> str | None:
    if backend_of(url) != "sqlite":
        return None
    path = url.split("://", 1)[1].lstrip("/")
    return os.path.abspath(path if path.startswith("/") else os.path.join(os.getcwd(), path))


def main() -> int:
    print("=" * 72)
    print("CONFIGURATION")
    print("=" * 72)
    print(f"working directory : {os.getcwd()}")
    print(f"central registry  : {_redact(CENTRAL_DATABASE_URL)}   [{backend_of(CENTRAL_DATABASE_URL)}]")
    print(f"default school    : {_redact(DEFAULT_SCHOOL_DATABASE_URL)}   [{backend_of(DEFAULT_SCHOOL_DATABASE_URL)}]")

    problems = database_config_problems()
    if problems:
        print()
        print("PROBLEMS")
        for p in problems:
            print(f"  ! {p}")

    print()
    print("=" * 72)
    print("REGISTERED SCHOOLS")
    print("=" * 72)
    init_tenant_registry()
    db = CentralSessionLocal()
    try:
        accounts = db.query(SchoolAccount).all()
        if not accounts:
            print("  (none registered)")
        for a in accounts:
            print(f"  {a.account_code:12} {(a.status or '?'):10} [{backend_of(a.database_url)}] "
                  f"{_redact(a.database_url or '(none)')}")
    finally:
        db.close()

    print()
    print("=" * 72)
    print("WHAT MIGRATIONS WOULD TOUCH, AND WHAT IS IN IT")
    print("=" * 72)
    for url in tenant_urls():
        counts, error = census(url)
        print(f"\n  {_redact(url)}")
        if error:
            print(f"     UNREADABLE: {error}")
            continue
        if not counts:
            print("     no recognisable tables — not an ERP database")
        else:
            total = sum(counts.values())
            summary = "  ".join(f"{k}={v}" for k, v in counts.items())
            print(f"     {summary}")
            print(f"     -> {'EMPTY (safe to discard)' if total == 0 else f'{total} rows — HAS DATA'}")

    print()
    print("=" * 72)
    print("SQLITE FILES ON DISK")
    print("=" * 72)
    here = os.path.dirname(os.path.abspath(__file__))
    referenced = {sqlite_file(u) for u in tenant_urls()} | {sqlite_file(CENTRAL_DATABASE_URL)}
    referenced.discard(None)

    found = sorted(f for f in os.listdir(here) if f.endswith(".db"))
    if not found:
        print("  (none)")
    for name in found:
        full = os.path.join(here, name)
        size = os.path.getsize(full)
        used = "IN USE" if full in referenced else "orphan — nothing references it"
        print(f"  {name:34} {size:>10,} bytes   {used}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
