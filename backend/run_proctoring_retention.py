"""Online-exam proctoring retention -- the cron entrypoint.

Phase 1 proctoring collects only browser-reported signals (fullscreen exits,
tab switches, copy/paste attempts) -- no webcam snapshots or recordings exist
yet, that is Phase 2. The one field in this phase that can carry free text is
ProctoringEvent.detail, so retention here means: once a session's
retention_expires_at has passed, blank every one of its events' detail and
leave everything else in place -- event_type, severity, occurred_at, and the
session's own review record all survive, so the audit trail and flag counts
stay meaningful. Only the free-text content ages out. This also gives Phase 2
a job already shaped to extend: deleting snapshot files and blanking a future
storage-path column slots into the same per-session sweep.

Gated on the online_test_proctoring feature flag, unlike vehicle-tracking
housekeeping: a school that has since dropped the add-on still gets its old
data aged out (this is retention for data already collected, same reasoning
as run_tracking_housekeeping.py), but a school that never bought it has no
proctoring data to sweep in the first place, so the flag check is just a
cheap skip.

Usage:
  python run_proctoring_retention.py
  python run_proctoring_retention.py --dry-run   # report, write nothing
"""

import argparse
import logging
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv  # noqa: E402
load_dotenv()

from app.models import ProctoringEvent, ProctoringSession  # noqa: E402
from app.tenant import (  # noqa: E402
    CentralSessionLocal,
    DEFAULT_ACCOUNT_CODE,
    DEFAULT_SCHOOL_DATABASE_URL,
    get_school_session_factory,
    init_tenant_registry,
    is_feature_enabled,
)
from app.tenant_models import SchoolAccount  # noqa: E402

logger = logging.getLogger("proctoring_retention")

FEATURE_KEY = "online_test_proctoring"


def tenant_accounts() -> list[tuple[str, str]]:
    """[(account_code, database_url), ...] for the default school plus every
    active account in the central registry, de-duplicated by URL."""
    init_tenant_registry()

    accounts = [(DEFAULT_ACCOUNT_CODE, DEFAULT_SCHOOL_DATABASE_URL)]
    seen_urls = {DEFAULT_SCHOOL_DATABASE_URL}

    db = CentralSessionLocal()
    try:
        for account in db.query(SchoolAccount).filter(SchoolAccount.status == "Active").all():
            if account.database_url and account.database_url not in seen_urls:
                accounts.append((account.account_code, account.database_url))
                seen_urls.add(account.database_url)
    finally:
        db.close()

    return accounts


def is_enabled_for_tenant(account_code: str) -> bool:
    return is_feature_enabled(account_code, FEATURE_KEY)


def run_tenant(database_url: str, dry_run: bool = False) -> dict:
    session_factory = get_school_session_factory(database_url)
    db = session_factory()
    try:
        now = datetime.utcnow()
        expired_session_ids = [
            row[0]
            for row in db.query(ProctoringSession.id)
            .filter(
                ProctoringSession.retention_expires_at.isnot(None),
                ProctoringSession.retention_expires_at < now,
            )
            .all()
        ]

        if not expired_session_ids:
            return {"sessions_expired": 0, "events_blanked": 0}

        # Idempotent by construction: re-running finds detail already NULL
        # for anything already swept, so the second pass touches zero rows.
        query = db.query(ProctoringEvent).filter(
            ProctoringEvent.session_id.in_(expired_session_ids),
            ProctoringEvent.detail.isnot(None),
        )

        if dry_run:
            blanked = query.count()
        else:
            blanked = query.update({ProctoringEvent.detail: None}, synchronize_session=False)
            db.commit()

        return {"sessions_expired": len(expired_session_ids), "events_blanked": blanked}
    finally:
        db.close()


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Age out proctoring event detail past its retention window")
    parser.add_argument("--dry-run", action="store_true", help="report, write nothing")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    for account_code, database_url in tenant_accounts():
        if not is_enabled_for_tenant(account_code):
            continue
        try:
            result = run_tenant(database_url, dry_run=args.dry_run)
        except Exception as exc:  # one broken tenant must not stop the rest
            logger.exception("%s: proctoring retention failed: %s", account_code, exc)
            continue
        logger.info("%s: %s", account_code, result)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
