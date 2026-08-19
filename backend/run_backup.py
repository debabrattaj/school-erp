"""Back up every database — the manual and cron entrypoint.

Exists because backups were being taken with an ad-hoc `python -c`, which
skips load_dotenv() and so silently backed up the SQLite fallback files
instead of the real Postgres databases — while reporting success. A backup
that reports ok:true having copied the wrong database is worse than no
backup, because it is trusted.

This prints what it actually captured, per database, with the backend it came
from, and exits non-zero if any of them failed.

Usage:
  python run_backup.py
  python run_backup.py --check    # show what would be backed up, write nothing
"""

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv  # noqa: E402
load_dotenv()

from app.backup import BACKUP_DIR, _discover_databases, backup_all  # noqa: E402
from app.tenant import backend_of, database_config_problems  # noqa: E402
from manage_migrations import _redact, tenant_urls  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Back up every database")
    parser.add_argument("--check", action="store_true",
                        help="list what would be backed up, write nothing")
    args = parser.parse_args()

    databases = _discover_databases()

    print("will back up:")
    for name, url in sorted(databases.items()):
        print(f"   {name:14} [{backend_of(url) or '?'}] {_redact(url)}")

    # The backup is only meaningful if it covers what a migration would alter.
    gap = [u for u in tenant_urls() if u not in set(databases.values())]
    if gap:
        print()
        print("WARNING — migrations would touch these, and they are NOT in the backup:")
        for u in gap:
            print(f"   {_redact(u)}")

    for problem in database_config_problems():
        print(f"\n  ! {problem}")

    if args.check:
        return 1 if gap else 0

    print()
    result = backup_all()
    print(f"written to: {os.path.abspath(os.path.join(BACKUP_DIR, result['timestamp']))}")
    print()
    print(f"{'database':<14} {'result':<8} {'bytes':>12}  file")
    failed = 0
    for entry in result["databases"]:
        if entry.get("ok"):
            # .sql means pg_dump ran; .db means a SQLite file was copied. If a
            # Postgres school shows .db here, the wrong thing was captured.
            suffix = ".sql" if backend_of(databases.get(entry["name"], "")) == "postgresql" else ".db"
            print(f"{entry['name']:<14} {'ok':<8} {entry.get('bytes', 0):>12,}  {entry['name']}{suffix}")
        else:
            failed += 1
            print(f"{entry['name']:<14} {'FAILED':<8} {'-':>12}")
            # In full: a truncated pg_dump error hides whether the cause was
            # authentication, a bad URL, or a client/server version mismatch,
            # and those need completely different fixes.
            for line in (entry.get("error") or "").strip().splitlines():
                print(f"    {line}")

    print()
    if failed or gap:
        print(f"NOT SAFE TO MIGRATE — {failed} backup failure(s), {len(gap)} database(s) uncovered")
        return 1

    print("All databases captured. Safe to migrate.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
