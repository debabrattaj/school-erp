"""Move the central tenant registry from SQLite to Postgres.

The registry is small but load-bearing: it holds the platform-owner login
(platform_admins), which school lives in which database (school_accounts),
and every school's feature flags (school_features). Losing it does not lose
student data, but it does lose the ability to reach any of it.

Copies all eight registry tables, preserving primary keys so the foreign
keys between them stay valid, then resets the Postgres sequences -- inserting
explicit ids leaves a sequence at 1, and the next ordinary insert would
collide with an existing row. That is the step people forget.

Accounts named with --exclude are dropped along with the rows that hang off
them, so retiring a demo school does not leave orphaned features or
subscriptions pointing at an account_id that no longer exists.

The source is never modified. Run it, verify, and only then delete anything.

Usage:
  python migrate_registry_to_postgres.py --target "postgresql+psycopg://user:pass@localhost:5432/schoolm1_registry" --dry-run
  python migrate_registry_to_postgres.py --target "..." --exclude dav001 --exclude dav002
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv  # noqa: E402
load_dotenv()

from sqlalchemy import create_engine, inspect, select, text  # noqa: E402

from app.tenant import CENTRAL_DATABASE_URL, backend_of  # noqa: E402
from app.tenant_models import TenantBase  # noqa: E402
from manage_migrations import _redact  # noqa: E402

# Tables carrying account_id, which must lose the rows of an excluded account.
ACCOUNT_CHILD_TABLES = {
    "school_features": "account_id",
    "school_subscriptions": "account_id",
    "platform_notifications": "account_id",
}
# Tables keyed by account_code rather than id.
ACCOUNT_CODE_TABLES = {
    "audit_logs": "account_code",
    "password_reset_tokens": "account_code",
}


def excluded_account_ids(source_engine, exclude: list[str]) -> set[int]:
    if not exclude:
        return set()
    with source_engine.connect() as conn:
        rows = conn.execute(
            text("SELECT id, account_code FROM school_accounts")
        ).fetchall()
    return {r[0] for r in rows if r[1] in exclude}


def copy_table(source_engine, target_engine, table, drop_ids: set[int], exclude_codes: list[str]) -> dict:
    """Copy one table, skipping rows belonging to excluded accounts."""
    with source_engine.connect() as conn:
        rows = [dict(r._mapping) for r in conn.execute(select(table))]

    total = len(rows)
    if table.name == "school_accounts":
        rows = [r for r in rows if r.get("account_code") not in exclude_codes]
    elif table.name in ACCOUNT_CHILD_TABLES:
        column = ACCOUNT_CHILD_TABLES[table.name]
        rows = [r for r in rows if r.get(column) not in drop_ids]
    elif table.name in ACCOUNT_CODE_TABLES:
        column = ACCOUNT_CODE_TABLES[table.name]
        rows = [r for r in rows if r.get(column) not in exclude_codes]

    if rows:
        with target_engine.begin() as conn:
            conn.execute(table.insert(), rows)

    return {"table": table.name, "source": total, "copied": len(rows), "skipped": total - len(rows)}


def reset_sequences(target_engine) -> list[str]:
    """Advance each Postgres id sequence past the rows we just inserted.

    Explicit ids do not move a sequence. Without this the next insert into any
    of these tables fails on a duplicate key -- days later, with no obvious
    connection to the migration.
    """
    done = []
    with target_engine.begin() as conn:
        for table in TenantBase.metadata.sorted_tables:
            if "id" not in table.columns:
                continue
            conn.execute(text(
                f"SELECT setval(pg_get_serial_sequence('{table.name}', 'id'), "
                f"COALESCE((SELECT MAX(id) FROM {table.name}), 1), true)"
            ))
            done.append(table.name)
    return done


def main() -> int:
    parser = argparse.ArgumentParser(description="Move the tenant registry to Postgres")
    parser.add_argument("--target", required=True, help="destination Postgres URL")
    parser.add_argument("--source", default=CENTRAL_DATABASE_URL, help="source registry URL")
    parser.add_argument("--exclude", action="append", default=[],
                        help="account_code to leave behind (repeatable)")
    parser.add_argument("--dry-run", action="store_true", help="report, write nothing")
    args = parser.parse_args()

    if backend_of(args.target) != "postgresql":
        print(f"ERROR: --target must be a postgresql URL, got {backend_of(args.target) or '?'}")
        return 1

    print(f"source : {_redact(args.source)}")
    print(f"target : {_redact(args.target)}")
    if args.exclude:
        print(f"exclude: {', '.join(args.exclude)}")
    print()

    source_engine = create_engine(args.source)
    target_engine = create_engine(args.target)

    source_tables = set(inspect(source_engine).get_table_names())
    missing = [t.name for t in TenantBase.metadata.sorted_tables if t.name not in source_tables]
    if missing:
        print(f"note: absent from source, nothing to copy: {', '.join(missing)}")

    existing = set(inspect(target_engine).get_table_names())
    occupied = []
    for table in TenantBase.metadata.sorted_tables:
        if table.name not in existing:
            continue
        with target_engine.connect() as conn:
            if conn.execute(text(f"SELECT COUNT(*) FROM {table.name}")).scalar():
                occupied.append(table.name)
    if occupied:
        # Merging into a populated registry would collide on primary keys and
        # leave a half-copied result that is worse than either database alone.
        print(f"ERROR: the target already holds rows in: {', '.join(occupied)}")
        print("Point --target at an empty database, or clear it first.")
        return 1

    drop_ids = excluded_account_ids(source_engine, args.exclude)
    if args.exclude:
        print(f"excluded account ids: {sorted(drop_ids) or 'none matched'}\n")

    if args.dry_run:
        print("DRY RUN — nothing will be written\n")
    else:
        TenantBase.metadata.create_all(bind=target_engine)

    results = []
    for table in TenantBase.metadata.sorted_tables:
        if table.name not in source_tables:
            continue
        if args.dry_run:
            with source_engine.connect() as conn:
                total = conn.execute(text(f"SELECT COUNT(*) FROM {table.name}")).scalar()
            results.append({"table": table.name, "source": total, "copied": "-", "skipped": "-"})
            continue
        results.append(copy_table(source_engine, target_engine, table, drop_ids, args.exclude))

    print(f"{'table':<24} {'source':>8} {'copied':>8} {'skipped':>8}")
    for r in results:
        print(f"{r['table']:<24} {str(r['source']):>8} {str(r['copied']):>8} {str(r['skipped']):>8}")

    if not args.dry_run:
        print()
        print(f"sequences reset: {len(reset_sequences(target_engine))} tables")
        print()
        print("Next: point CENTRAL_DATABASE_URL at the target, restart, and run")
        print("      python check_database_config.py  to confirm before deleting anything.")

    source_engine.dispose()
    target_engine.dispose()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
