"""Scheduled late fee charging — the cron entrypoint.

Intended to be run daily from an external scheduler — a cPanel Cron Job on
the box that also runs the app, or any OS cron. See SETUP.md "Scheduled
late fee charging" for the exact cPanel wiring.

Off by default per school, same gating as the other automations: this only
does anything for a tenant whose central "fee_late_charges" platform
feature flag is on. A school's own Admin can still fill in the Late Fee
Amount/Frequency/Grace Days fields in Institution Settings freely, but no
fine is ever added to a real fee until the platform owner has enabled this
for that school via the Platform Console.

For every tenant school database, this finds every Fee with an outstanding
balance and a due_date that has passed (past any configured grace period),
computes what the fine should be as of today per late_fee_scheduling.py,
and — if that differs from what's already recorded — updates the fee's
late_fee_charged, due_amount and payment_status.

Safe to re-run: the fine is always recomputed from scratch for "as of
today" rather than incremented, so running this twice in one day (or
missing a day and catching up) lands on the same number either way.

Usage:
  python run_late_fee_charges.py             # apply late fees where due
  python run_late_fee_charges.py --dry-run   # log what would change, change nothing
"""

import argparse
import logging
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Must run before any app.* import that reads a DATABASE_URL env var at
# import time — see run_scheduled_fees.py for why this can't be left to a
# transitive import.
from dotenv import load_dotenv  # noqa: E402
load_dotenv()

from app.late_fee_scheduling import compute_late_fee  # noqa: E402
from app.models import Fee, SchoolSettings  # noqa: E402
from app.routes.fees import calculate_fee_status  # noqa: E402
from app.tenant import (  # noqa: E402
    CentralSessionLocal,
    DEFAULT_ACCOUNT_CODE,
    DEFAULT_SCHOOL_DATABASE_URL,
    get_school_session_factory,
    init_tenant_registry,
    is_feature_enabled,
)
from app.tenant_models import SchoolAccount  # noqa: E402

logger = logging.getLogger("late_fee_scheduler")

FEATURE_KEY = "fee_late_charges"


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


def run_for_tenant(account_code: str, database_url: str, dry_run: bool) -> int:
    if not is_feature_enabled(account_code, FEATURE_KEY):
        logger.info("%s: %s not enabled by platform owner, skipping", account_code, FEATURE_KEY)
        return 0

    session_factory = get_school_session_factory(database_url)
    db = session_factory()
    charged = 0
    try:
        settings = db.query(SchoolSettings).first()
        if not settings or not settings.late_fee_amount or not settings.late_fee_frequency:
            logger.info("%s: no late fee rule configured in Settings, skipping", account_code)
            return 0

        today = date.today()
        overdue_fees = (
            db.query(Fee)
            .filter(Fee.due_amount > 0)
            .filter(Fee.due_date.isnot(None))
            .filter(Fee.due_date <= today)
            .all()
        )

        for fee in overdue_fees:
            new_fine = compute_late_fee(
                fee.due_date,
                settings.late_fee_amount,
                settings.late_fee_frequency,
                settings.late_fee_grace_days,
                today,
            )
            if new_fine == (fee.late_fee_charged or 0):
                continue

            if dry_run:
                logger.info(
                    "[dry-run] %s: fee=%s late_fee_charged %.2f -> %.2f",
                    account_code, fee.id, fee.late_fee_charged or 0, new_fine,
                )
                continue

            fee.late_fee_charged = new_fine
            due_amount, payment_status = calculate_fee_status(
                fee.total_amount, fee.paid_amount, fee.concession_amount, fee.late_fee_charged
            )
            fee.due_amount = due_amount
            fee.payment_status = payment_status
            charged += 1

        if dry_run:
            db.rollback()
        else:
            db.commit()
    finally:
        db.close()

    return charged


def main(argv=None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Log what would change without writing anything.",
    )
    args = parser.parse_args(argv)

    total_charged = 0
    had_error = False

    for account_code, database_url in tenant_accounts():
        try:
            total_charged += run_for_tenant(account_code, database_url, args.dry_run)
        except Exception:
            had_error = True
            logger.exception("Scheduled late fee charging crashed for tenant %s", account_code)

    logger.info(
        "Done: %s fee(s) updated across all schools%s",
        total_charged, " (dry run, nothing was changed)" if args.dry_run else "",
    )
    return 1 if had_error else 0


if __name__ == "__main__":
    raise SystemExit(main())
