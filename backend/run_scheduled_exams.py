"""Scheduled Exam Template auto-creation — the cron entrypoint.

Intended to be run daily from an external scheduler — a cPanel Cron Job on
the box that also runs the app, or any OS cron. See SETUP.md "Scheduled
exam creation" for the exact cPanel wiring.

Off by default per school: this only does anything for a tenant whose
central "exam_auto_generation" platform feature flag is on. That flag
defaults to False for every school and can only be switched on by the
platform owner via the Platform Console (PUT /platform/schools/{id}/features)
— a school's own Admin/Principal can create and edit Exam Templates freely,
but nothing actually fires until the platform owner has enabled it for
that school.

For every enabled tenant, this finds every active Exam Template whose
next_run_date has arrived, resolves which academic year that date falls
inside, and creates that year's Exam — reusing the same create_exam logic
the manual "Add Exam" screen uses, so the created row is exactly what a
staff member creating it by hand would produce, plus a link back to the
template it came from. next_run_date then advances to the same month/day
next year (same "mutable date that advances after firing" shape as
FeeStructure.next_run_date), so a template only needs to be set up once.

Because Exam.exam_name must be unique across the whole exams table (a
pre-existing rule, not something this script relaxes), the created name is
"{template.name} ({academic year})" — e.g. "Unit Test 1 (2026-27)" — so the
same template can fire every year without colliding with itself.

If no academic year covers a template's next_run_date (most likely because
staff hasn't created that year yet), the date is left where it is and the
template is retried on the next run rather than silently skipped or backed
up — the exam still gets created once the year exists, just possibly later
than the ideal date. A genuine exam-name collision (staff already created
an identically-named exam by hand) is logged and the date still advances,
since retrying against a collision that won't resolve itself is pointless.

Usage:
  python run_scheduled_exams.py             # create every due exam
  python run_scheduled_exams.py --dry-run   # log what would happen, change nothing
"""

import argparse
import logging
import os
import sys
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv  # noqa: E402
load_dotenv()

from fastapi import HTTPException  # noqa: E402

from app.exam_scheduling import advance_next_run, is_exam_due  # noqa: E402
from app.models import AcademicYear, ExamGenerationRun, ExamTemplate  # noqa: E402
from app.routes.exams import create_exam  # noqa: E402
from app.schemas import ExamCreate  # noqa: E402
from app.tenant import (  # noqa: E402
    CentralSessionLocal,
    DEFAULT_ACCOUNT_CODE,
    DEFAULT_SCHOOL_DATABASE_URL,
    get_account,
    get_feature_map,
    get_school_session_factory,
    init_tenant_registry,
)
from app.tenant_models import SchoolAccount  # noqa: E402

logger = logging.getLogger("exam_scheduler")

FEATURE_KEY = "exam_auto_generation"

# Guards against an infinite loop if next_run_date data is ever corrupted;
# 5 missed annual cycles is far more than a realistically-missed cron would
# ever accumulate.
MAX_CATCHUP_CYCLES = 5


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
    try:
        account = get_account(account_code)
    except HTTPException:
        return False
    return get_feature_map(account["id"]).get(FEATURE_KEY, False)


def resolve_academic_year(db, target_date: date) -> AcademicYear | None:
    return (
        db.query(AcademicYear)
        .filter(AcademicYear.start_date.isnot(None))
        .filter(AcademicYear.start_date <= target_date)
        .filter((AcademicYear.end_date.is_(None)) | (AcademicYear.end_date >= target_date))
        .first()
    )


def generate_one(db, account_code: str, template: ExamTemplate, fire_date: date) -> bool:
    """Returns True if the template's schedule should advance to next year."""
    year = resolve_academic_year(db, fire_date)
    if not year:
        run = ExamGenerationRun(
            exam_template_id=template.id,
            academic_year="",
            status="failed",
            error_message=f"No academic year covers {fire_date}; will retry once one exists.",
        )
        db.add(run)
        db.commit()
        logger.warning(
            "%s: template=%s due %s but no academic year covers that date — not advancing, will retry",
            account_code, template.name, fire_date,
        )
        return False

    exam_name = f"{template.name} ({year.name})"
    payload = ExamCreate(
        exam_name=exam_name,
        exam_type=template.exam_type,
        class_name=None,
        section=None,
        exam_date=fire_date,
        academic_year=year.name,
        remarks=f"Auto-created from Exam Template '{template.name}'",
    )

    try:
        exam = create_exam(exam=payload, db=db, current_user=None)
        exam.generated_from_template_id = template.id
        run = ExamGenerationRun(
            exam_template_id=template.id,
            academic_year=year.name,
            exam_id=exam.id,
            status="success",
        )
        db.add(run)
        db.commit()
        logger.info(
            "%s: created exam=%r for template=%s year=%s",
            account_code, exam_name, template.name, year.name,
        )
    except HTTPException as exc:
        db.rollback()
        run = ExamGenerationRun(
            exam_template_id=template.id,
            academic_year=year.name,
            status="failed",
            error_message=str(exc.detail)[:2000],
        )
        db.add(run)
        db.commit()
        logger.warning(
            "%s: could not auto-create exam=%r for template=%s year=%s: %s",
            account_code, exam_name, template.name, year.name, exc.detail,
        )

    return True


def process_template(db, account_code: str, template: ExamTemplate, today: date, dry_run: bool) -> int:
    cycles = 0

    while is_exam_due(template.next_run_date, today) and cycles < MAX_CATCHUP_CYCLES:
        fire_date = template.next_run_date

        if dry_run:
            logger.info(
                "[dry-run] %s: template=%s would fire for %s",
                account_code, template.name, fire_date,
            )
            template.next_run_date = advance_next_run(fire_date)
            cycles += 1
            continue

        should_advance = generate_one(db, account_code, template, fire_date)
        if not should_advance:
            break

        template.next_run_date = advance_next_run(fire_date)
        template.last_generated_at = datetime.utcnow()
        db.commit()
        cycles += 1

    return cycles


def run_for_tenant(account_code: str, database_url: str, dry_run: bool) -> int:
    if not is_enabled_for_tenant(account_code):
        logger.info("%s: exam_auto_generation not enabled by platform owner, skipping", account_code)
        return 0

    session_factory = get_school_session_factory(database_url)
    db = session_factory()
    processed = 0
    try:
        today = date.today()
        templates = (
            db.query(ExamTemplate)
            .filter(ExamTemplate.is_active.is_(True))
            .filter(ExamTemplate.next_run_date.isnot(None))
            .filter(ExamTemplate.next_run_date <= today)
            .all()
        )
        for template in templates:
            processed += process_template(db, account_code, template, today, dry_run)
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
        help="Log what would be created without creating any exams.",
    )
    args = parser.parse_args(argv)

    total = 0
    had_error = False

    for account_code, database_url in tenant_accounts():
        try:
            total += run_for_tenant(account_code, database_url, args.dry_run)
        except Exception:
            had_error = True
            logger.exception("Scheduled exam generation crashed for tenant %s", account_code)

    logger.info(
        "Done: %s exam(s) processed across all schools%s",
        total, " (dry run, nothing was changed)" if args.dry_run else "",
    )
    return 1 if had_error else 0


if __name__ == "__main__":
    raise SystemExit(main())
