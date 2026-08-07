"""Scheduled Fee Structure auto-generation — the cron entrypoint.

Intended to be run daily (or however often you want cycles checked) from an
external scheduler — a cPanel Cron Job on the box that also runs the app, or
any OS cron. See SETUP.md "Scheduled fee auto-generation" for the exact
cPanel wiring.

For every tenant school database (the default one plus every account in the
central registry), this finds every FeeStructure with auto_generate=True
whose next_run_date has arrived, bills every applicable class for that fee
type, then advances next_run_date to the next occurrence (or turns
auto_generate back off for a one-time "once" schedule). If a structure's
next_run_date is more than one cycle in the past — the cron didn't run for a
while — it catches up cycle by cycle rather than skipping straight to today.

Safe to re-run: fees created here are tagged with a billing_period (e.g.
"2026-08"), and a student who already has a fee for that (fee_type,
academic_year, billing_period) is never billed twice. Each (structure,
billing_period) attempt is also logged to fee_generation_runs for
after-the-fact troubleshooting.

Note: this only ADDS the new auto-generation columns' *data* — the columns
themselves come from the Alembic migration. Run
`python manage_migrations.py upgrade head` after deploying this before the
scheduler will find any FeeStructure rows to act on.

Usage:
  python run_scheduled_fees.py             # process every due cycle
  python run_scheduled_fees.py --dry-run   # log what would happen, change nothing
"""

import argparse
import logging
import os
import sys
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Must run before any app.* import that reads a DATABASE_URL env var at
# import time (app.tenant, app.database). Only app.security calls
# load_dotenv() normally; this script happens to import it transitively via
# app.routes.fees, but that's exactly the kind of fragile-by-luck ordering
# that broke manage_migrations.py, which has no such transitive import — do
# it explicitly here too rather than relying on it.
from dotenv import load_dotenv  # noqa: E402
load_dotenv()

from fastapi import HTTPException  # noqa: E402

from app.fee_scheduling import advance, billing_period_label  # noqa: E402
from app.models import FeeGenerationRun, FeeStructure, Student  # noqa: E402
from app.routes.fees import assign_class_fee  # noqa: E402
from app.tenant import (  # noqa: E402
    CentralSessionLocal,
    DEFAULT_ACCOUNT_CODE,
    DEFAULT_SCHOOL_DATABASE_URL,
    get_school_session_factory,
    init_tenant_registry,
)
from app.tenant_models import SchoolAccount  # noqa: E402

logger = logging.getLogger("fee_scheduler")

# Guards against an infinite loop if recurrence/next_run_date data is ever
# corrupted; 24 monthly cycles is 2 years of backlog, far more than a
# realistically-missed cron would ever accumulate.
MAX_CATCHUP_CYCLES = 24


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


def distinct_active_classes(db) -> list[str]:
    """Every class name with at least one active student — the target set
    for a FeeStructure with class_name=None ("applies to every class")."""
    rows = (
        db.query(Student.class_name)
        .filter(Student.class_name.isnot(None))
        .filter(Student.student_status == "Active")
        .distinct()
        .all()
    )
    return [row[0] for row in rows]


def run_one_cycle(db, structure: FeeStructure, period: str) -> None:
    existing_run = (
        db.query(FeeGenerationRun)
        .filter_by(fee_structure_id=structure.id, billing_period=period)
        .first()
    )
    if existing_run and existing_run.status == "success":
        logger.info(
            "structure=%s period=%s already generated at %s, skipping",
            structure.id, period, existing_run.run_at,
        )
        return

    target_classes = [structure.class_name] if structure.class_name else distinct_active_classes(db)

    billed = 0
    skipped = 0
    errors = []

    for class_name in target_classes:
        try:
            result = assign_class_fee(
                db,
                class_name=class_name,
                fee_type=structure.fee_type,
                academic_year=structure.academic_year,
                due_date=structure.due_date,
                billing_period=period,
                active_only=True,
            )
            billed += result.created_count
            skipped += result.skipped_count
        except HTTPException as exc:
            if exc.status_code == 404:
                continue  # nothing to bill in this class — not a failure
            errors.append(f"{class_name}: {exc.detail}")
        except Exception as exc:  # keep processing other classes/structures
            errors.append(f"{class_name}: {exc}")

    if errors and billed == 0:
        status = "failed"
    elif errors:
        status = "partial"
    else:
        status = "success"

    run = existing_run or FeeGenerationRun(
        fee_structure_id=structure.id,
        academic_year=structure.academic_year,
        fee_type=structure.fee_type,
        class_name=structure.class_name,
        billing_period=period,
    )
    run.students_billed = billed
    run.students_skipped = skipped
    run.status = status
    run.error_message = "; ".join(errors)[:2000] or None
    run.run_at = datetime.utcnow()
    db.add(run)
    db.commit()

    logger.info(
        "structure=%s fee_type=%s period=%s billed=%s skipped=%s status=%s",
        structure.id, structure.fee_type, period, billed, skipped, status,
    )


def process_structure(db, account_code: str, structure: FeeStructure, today: date, dry_run: bool) -> int:
    cycles = 0

    while structure.next_run_date and structure.next_run_date <= today and cycles < MAX_CATCHUP_CYCLES:
        period = billing_period_label(structure.recurrence, structure.next_run_date)

        if dry_run:
            logger.info(
                "[dry-run] %s: structure=%s fee_type=%s class=%s period=%s would run",
                account_code, structure.id, structure.fee_type,
                structure.class_name or "All Classes", period,
            )
        else:
            run_one_cycle(db, structure, period)

        next_date = advance(structure.recurrence, structure.next_run_date)
        # In dry-run this only mutates the in-memory object so the catch-up
        # loop can simulate multiple cycles; run_for_tenant rolls it back.
        structure.next_run_date = next_date
        if next_date is None:
            structure.auto_generate = False  # "once" schedules don't repeat
        cycles += 1

        if not dry_run:
            structure.last_generated_at = datetime.utcnow()
            db.commit()

        if next_date is None:
            break

    return cycles


def run_for_tenant(account_code: str, database_url: str, dry_run: bool) -> int:
    session_factory = get_school_session_factory(database_url)
    db = session_factory()
    processed = 0
    try:
        today = date.today()
        due = (
            db.query(FeeStructure)
            .filter(FeeStructure.auto_generate.is_(True))
            .filter(FeeStructure.next_run_date.isnot(None))
            .filter(FeeStructure.next_run_date <= today)
            .all()
        )
        for structure in due:
            processed += process_structure(db, account_code, structure, today, dry_run)
        if dry_run:
            db.rollback()
    finally:
        db.close()
    return processed


def main(argv=None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Log what would be generated without creating fees or advancing any schedule.",
    )
    args = parser.parse_args(argv)

    total_cycles = 0
    had_error = False

    for account_code, database_url in tenant_accounts():
        try:
            total_cycles += run_for_tenant(account_code, database_url, args.dry_run)
        except Exception:
            had_error = True
            logger.exception("Scheduled fee generation crashed for tenant %s", account_code)

    logger.info(
        "Done: %s billing cycle(s) processed across all schools%s",
        total_cycles, " (dry run, nothing was changed)" if args.dry_run else "",
    )
    return 1 if had_error else 0


if __name__ == "__main__":
    raise SystemExit(main())
