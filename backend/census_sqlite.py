"""Row counts for a SQLite file, to decide whether it is worth keeping.

No .env and no app imports -- these are files nothing references any more, so
the question is only "is there anything in here", and asking it must not
depend on configuration that has already moved on.

Usage:
  python census_sqlite.py school_erp.db school_accounts.db
"""

import os
import sqlite3
import sys


def census(path: str) -> None:
    print(f"\n=== {path} ===")
    if not os.path.exists(path):
        print("   (missing)")
        return
    print(f"   {os.path.getsize(path):,} bytes")

    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        tables = [
            r[0] for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
        ]
        populated, total = [], 0
        for name in tables:
            count = conn.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
            total += count
            if count:
                populated.append((name, count))

        print(f"   {len(tables)} tables, {len(populated)} with rows")
        for name, count in populated:
            print(f"      {name:32} {count:>8,}")
        print(f"   TOTAL ROWS: {total:,}"
              f"   -> {'EMPTY — safe to delete' if total == 0 else 'HAS DATA'}")
    finally:
        conn.close()


if __name__ == "__main__":
    for arg in sys.argv[1:] or ["school_erp.db", "school_accounts.db"]:
        census(arg)
