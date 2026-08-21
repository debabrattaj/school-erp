"""Admission follow-up reminders — the cron entrypoint.

Emails every staff member with an overdue or due-today admissions task or
inquiry follow-up assigned to them, one summary message per person per run.

Off by default per school: acts only on a tenant whose central
"admission_reminders" platform feature flag is on, the same gating as the
fee, promotion, exam and timetable-generation schedulers.

Once a day is the sensible schedule.

Usage:
  python run_admission_reminders.py
  python run_admission_reminders.py --dry-run          # report who would be emailed
  python run_admission_reminders.py --as-of 2026-09-01  # pretend it is another day
  python run_admission_reminders.py --limit 50          # smaller batch
"""

import argparse
import logging
import os
import sys
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv  # noqa: E402
load_dotenv()

from app import admission_reminders  # noqa: E402
from app.tenant import (  # noqa: E402
    CentralSessionLocal,
    DEFAULT_ACCOUNT_CODE,
    DEFAULT_SCHOOL_DATABASE_URL,
    get_school_session_factory,
    init_tenant_registry,
    is_feature_enabled,
)
from app.tenant_models import SchoolAccount  # noqa: E402

logger = logging.getLogger("admission_reminders")
FEATURE_KEY = "admission_reminders"


def tenant_accounts() -> list[tuple[str, str]]:
    """[(account_code, database_url), ...] for the default school plus every
    active account in the central registry, de-duplicated by URL."""
    init_tenant_registry()

    accounts = [(DEFAULT_ACCOUNT_CODE, DEFAULT_SCHOOL_DATABASE_URL)]
    seen = {DEFAULT_SCHOOL_DATABASE_URL}

    db = CentralSessionLocal()
    try:
        for account in db.query(SchoolAccount).filter(SchoolAccount.status == "Active").all():
            if account.database_url and account.database_url not in seen:
                accounts.append((account.account_code, account.database_url))
                seen.add(account.database_url)
    finally:
        db.close()

    return accounts


def run_tenant(database_url: str, as_of: date | None, dry_run: bool, limit: int) -> dict:
    factory = get_school_session_factory(database_url)
    db = factory()
    try:
        return admission_reminders.run_reminders(db, as_of=as_of, dry_run=dry_run, limit=limit)
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Send due admissions follow-up reminders")
    parser.add_argument("--dry-run", action="store_true",
                        help="report who would be emailed, send nothing")
    parser.add_argument("--as-of", help="run as though it were this date (YYYY-MM-DD)")
    parser.add_argument("--limit", type=int, default=admission_reminders.DEFAULT_BATCH_LIMIT,
                        help="most staff members to email in one run")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    as_of = None
    if args.as_of:
        try:
            as_of = datetime.strptime(args.as_of, "%Y-%m-%d").date()
        except ValueError:
            print("--as-of must be YYYY-MM-DD")
            return 1

    total_sent = 0
    for account_code, database_url in tenant_accounts():
        if not is_feature_enabled(account_code, FEATURE_KEY):
            logger.info("Skipping %s — %s is off for this school", account_code, FEATURE_KEY)
            continue

        try:
            result = run_tenant(database_url, as_of, args.dry_run, args.limit)
        except Exception as exc:   # one broken tenant must not stop the rest
            logger.exception("%s: reminder run failed: %s", account_code, exc)
            continue

        total_sent += result.get("sent", 0)
        logger.info(
            "%s: considered=%s sent=%s skipped=%s failed=%s%s",
            account_code, result.get("considered", 0), result.get("sent", 0),
            result.get("skipped", 0), result.get("failed", 0),
            " (dry run)" if args.dry_run else "",
        )

    logger.info("Done — %s reminder(s)%s", total_sent, " would be sent" if args.dry_run else " sent")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
