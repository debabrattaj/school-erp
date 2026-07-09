"""Run an Alembic command across every tenant school database.

The tenant schema (app.models / Base) lives in one database per school, so a
migration must be applied to each. This script discovers all tenant database
URLs (the default school DB plus every school in the central registry) and runs
the given Alembic command against each.

Usage:
  python manage_migrations.py upgrade head     # apply new migrations everywhere
  python manage_migrations.py stamp head        # mark existing DBs at a revision
  python manage_migrations.py current           # show each DB's revision

Note: the central registry DB (app.tenant_models / TenantBase) is NOT managed
here — it is small and additive and handled by create_all at startup.
"""

import os
import sys
import subprocess
from urllib.parse import urlsplit, urlunsplit

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.tenant import CentralSessionLocal, init_tenant_registry  # noqa: E402
from app.tenant_models import SchoolAccount  # noqa: E402

_SQLITE_PREFIX = "sqlite:///"


def _redact(url: str) -> str:
    """Strip credentials before a URL is printed to (deploy) logs."""
    parts = urlsplit(url)
    if not parts.password and not parts.username:
        return url
    netloc = parts.hostname or ""
    if parts.port:
        netloc += f":{parts.port}"
    if parts.username:
        netloc = f"{parts.username}:***@{netloc}"
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))


def tenant_urls() -> list[str]:
    urls = []
    default = os.getenv("DEFAULT_SCHOOL_DATABASE_URL", "sqlite:///./school_erp.db")
    urls.append(default)

    # On a brand-new deploy the central registry tables don't exist yet (they
    # are normally created by app startup) — this script may now run before
    # the app ever boots, so make sure they're there. Idempotent.
    init_tenant_registry()

    db = CentralSessionLocal()
    try:
        for account in db.query(SchoolAccount).all():
            if account.database_url and account.database_url not in urls:
                urls.append(account.database_url)
    finally:
        db.close()
    return urls


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 1

    alembic_args = sys.argv[1:]
    env = dict(os.environ)
    # Ensure the locally-installed alembic (.pylibs) is importable if present.
    pylibs = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".pylibs")
    if os.path.isdir(pylibs):
        env["PYTHONPATH"] = pylibs + os.pathsep + env.get("PYTHONPATH", "")

    failures = 0
    for url in tenant_urls():
        print(f"\n=== {_redact(url)} ===")
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "-x", f"db_url={url}", *alembic_args],
            env=env,
        )
        if result.returncode != 0:
            failures += 1
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
