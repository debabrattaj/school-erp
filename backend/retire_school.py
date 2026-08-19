"""Remove a school from the registry, and optionally its database file.

Deleting the database file alone leaves the account registered, so the app
still lists the school and fails when anyone opens it. Deleting the registry
row alone leaves the file on disk with nobody able to reach it. This does
both, in the right order, along with the rows that hang off the account --
features, subscriptions, notifications, audit entries, reset tokens -- which
would otherwise point at an account_id that no longer exists.

Refuses to touch the default account, and refuses to drop a Postgres
database: that is a cPanel operation with its own confirmation, and a script
that could drop a live Postgres database on a typo has no business existing.

Nothing happens without --confirm. Take a backup first (run_backup.py) --
this checks for one and warns if the school is not in it.

Usage:
  python retire_school.py --account dav001 --account dav002
  python retire_school.py --account dav001 --confirm --delete-file
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv  # noqa: E402
load_dotenv()

from sqlalchemy import text  # noqa: E402

from app.backup import BACKUP_DIR  # noqa: E402
from app.tenant import (  # noqa: E402
    DEFAULT_ACCOUNT_CODE,
    CentralSessionLocal,
    backend_of,
    init_tenant_registry,
)
from app.tenant_models import SchoolAccount  # noqa: E402
from manage_migrations import _redact  # noqa: E402

# Tables to clear for a retired account, and the column that identifies it.
CHILD_TABLES = [
    ("school_features", "account_id"),
    ("school_subscriptions", "account_id"),
    ("platform_notifications", "account_id"),
    ("audit_logs", "account_code"),
    ("password_reset_tokens", "account_code"),
]


def sqlite_path(url: str) -> str | None:
    if backend_of(url) != "sqlite":
        return None
    raw = url.split("://", 1)[1]
    path = raw.lstrip("/") if not raw.startswith("//") else raw[1:]
    return os.path.abspath(path)


def latest_backup_holding(account_code: str) -> str | None:
    """The newest backup directory containing this school, if any."""
    if not os.path.isdir(BACKUP_DIR):
        return None
    for stamp in sorted(os.listdir(BACKUP_DIR), reverse=True):
        folder = os.path.join(BACKUP_DIR, stamp)
        if not os.path.isdir(folder):
            continue
        if any(f.startswith(f"{account_code}.") for f in os.listdir(folder)):
            return folder
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Retire a school from the registry")
    parser.add_argument("--account", action="append", required=True,
                        help="account_code to retire (repeatable)")
    parser.add_argument("--confirm", action="store_true", help="actually make the changes")
    parser.add_argument("--delete-file", action="store_true",
                        help="also delete the school's SQLite file")
    args = parser.parse_args()

    init_tenant_registry()
    db = CentralSessionLocal()
    blocked = False
    plan = []

    try:
        for code in args.account:
            account = (
                db.query(SchoolAccount).filter(SchoolAccount.account_code == code).first()
            )
            if not account:
                print(f"{code}: not in the registry — nothing to retire")
                continue
            if code == DEFAULT_ACCOUNT_CODE:
                print(f"{code}: REFUSED — this is the default account")
                blocked = True
                continue

            counts = {}
            for table, column in CHILD_TABLES:
                value = account.id if column == "account_id" else account.account_code
                try:
                    counts[table] = db.execute(
                        text(f"SELECT COUNT(*) FROM {table} WHERE {column} = :v"), {"v": value}
                    ).scalar()
                except Exception:
                    counts[table] = 0   # table absent on older registries

            path = sqlite_path(account.database_url or "")
            backup = latest_backup_holding(code)

            print(f"\n{code}  (id={account.id})  {account.school_name or ''}")
            print(f"   database : [{backend_of(account.database_url)}] {_redact(account.database_url or '')}")
            for table, n in counts.items():
                if n:
                    print(f"   {table:26} {n} row(s)")
            if path:
                exists = os.path.exists(path)
                size = f"{os.path.getsize(path):,} bytes" if exists else "missing"
                print(f"   file     : {path}  ({size})")
            else:
                print("   file     : not SQLite — the database itself will NOT be dropped")

            if backup:
                print(f"   backup   : {backup}")
            else:
                print("   backup   : *** NONE FOUND *** — run run_backup.py first")
                blocked = True

            plan.append((account, path))

        if not plan:
            return 0

        if blocked and args.confirm:
            print("\nRefusing to proceed: see the problems above.")
            return 1

        if not args.confirm:
            print("\nDRY RUN — nothing changed. Re-run with --confirm to apply.")
            return 0

        for account, path in plan:
            for table, column in CHILD_TABLES:
                value = account.id if column == "account_id" else account.account_code
                try:
                    db.execute(text(f"DELETE FROM {table} WHERE {column} = :v"), {"v": value})
                except Exception:
                    pass
            db.delete(account)
            print(f"{account.account_code}: registry rows removed")

            if path and args.delete_file and os.path.exists(path):
                os.remove(path)
                print(f"{account.account_code}: deleted {path}")
            elif path and not args.delete_file:
                print(f"{account.account_code}: file left in place ({path}) — pass --delete-file to remove")

        db.commit()
        print("\nDone. Run check_database_config.py to confirm.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
