"""Scheduled Exam Template auto-creation — the cron entrypoint.

Intended to be run daily from an external scheduler — a cPanel Cron Job on
the box that also runs the app, or any OS cron. See SETUP.md "Scheduled
exam creation" for the exact cPanel wiring.

For every tenant school database, this finds every academic year currently
in range (start_date has arrived, end_date hasn't passed yet) and, for each
active Exam Template, creates that year's Exam once offset_days past the
year's start_date arrives — reusing the same create_exam logic the manual
"New Exam" screen uses, so the created row is exactly what a staff member
creating it by hand would produce, plus a link back to the template it
came from.

Because Exam.exam_name must be unique across the whole exams table (a
pre-existing rule, not something this script relaxes), the created name is
"{template.name} ({academic_year})" — e.g. "Unit Test 1 (2026-27)" — so the
same template can fire every year without colliding with itself or with a
prior year's exam of the same type.

Safe to re-run: an exam_generation_runs row already marked "success" for a
(template, academic_year) pair is never regenerated. A run that failed
(most likely because a staff member already created an identically-named
exam by hand) is retried on the next pass rather than silently skipped
forever, in case the conflict has since been resolved.

Usage:
  python run_scheduled_exams.py             # create every due exam
  python run_scheduled_exams.py --dry-run   # log what would happen, change nothing
"""

import argparse
import logging
import os
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv  # noqa: E402
load_dotenv()

from fastapi import HTTPException  # noqa: E402

from app.exam_scheduling import exam_fire_date, is_exam_due  # noqa: E402
from app.models import AcademicYear, Exam, ExamGenerationRun, ExamTemplate  # noqa: E402
from app.routes.exams import create_exam  # noqa: E402
from app.schemas import ExamCreate  # noqa: E402
from app.tenant import (  # noqa: E402
    CentralSessionLocal,
    DEFAULT_ACCOUNT_CODE,
    DEFAULT_SCHOOL_DATABASE_URL,
    get_school_session_factory,
    init_tenant_registry,
)
from app.tenant_models import SchoolAccount  # noqa: E402

logger = logging.getLogger("exam_scheduler")


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


def years_in_range(db, today: date) -> list[AcademicYear]:
    return (
        db.query(AcademicYear)
        .filter(AcademicYear.start_date.isnot(None))
        .filter(AcademicYear.start_date <= today)
        .filter((AcademicYear.end_date.is_(None)) | (AcademicYear.end_date >= today))
        .all()
    )


def generate_one(db, account_code: str, template: ExamTemplate, year: AcademicYear, fire_date: date) -> None:
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


def run_for_tenant(account_code: str, database_url: str, dry_run: bool) -> int:
    session_factory = get_school_session_factory(database_url)
    db = session_factory()
    processed = 0
    try:
        today = date.today()
        templates = db.query(ExamTemplate).filter(ExamTemplate.is_active.is_(True)).all()
        if not templates:
            return 0

        for year in years_in_range(db, today):
            for template in templates:
                if not is_exam_due(year.start_date, template.offset_days, today):
                    continue

                already_succeeded = (
                    db.query(ExamGenerationRun)
                    .filter(
                        ExamGenerationRun.exam_template_id == template.id,
                        ExamGenerationRun.academic_year == year.name,
                        ExamGenerationRun.status == "success",
                    )
                    .first()
                )
                if already_succeeded:
                    continue

                fire_on = exam_fire_date(year.start_date, template.offset_days)
                if dry_run:
                    logger.info(
                        "[dry-run] %s: would create exam for template=%s year=%s on %s",
                        account_code, template.name, year.name, fire_on,
                    )
                else:
                    generate_one(db, account_code, template, year, fire_on)
                processed += 1
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
