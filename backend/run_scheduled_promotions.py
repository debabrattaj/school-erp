"""Scheduled year-end student promotion — the cron entrypoint.

Intended to be run daily from an external scheduler — a cPanel Cron Job on
the box that also runs the app, or any OS cron. See SETUP.md "Scheduled
year-end promotion" for the exact cPanel wiring.

Off by default per school: this only does anything for a tenant whose
central "promotion_auto_generation" platform feature flag is on. That flag
defaults to False for every school and can only be switched on by the
platform owner via the Platform Console (PUT /platform/schools/{id}/features)
— a school's own Admin/Principal can still configure an Academic Year's
auto-promote fields freely, but nothing actually promotes anyone until the
platform owner has enabled it for that school.

For every tenant school database, this finds every AcademicYear with
auto_promote_enabled=True whose auto_promote_date has arrived and that
hasn't already run (auto_promoted_at is None). For each one, it computes
the exact same promote/detain/graduate suggestions the manual "Year-End
Processing" screen's suggestions endpoint already computes (marks vs the
school's pass percentage), then applies them through the same
process_year_end logic the manual bulk action uses — so this is not a
separate promotion engine, it's the existing one, unattended.

A student with no marks recorded, or a "promote" suggestion with no class
Schoolment could confidently infer a target for (non-numeric class names
aren't auto-mapped — see _suggest_next_class), is left alone rather than
guessed at; staff can still handle those manually from the Year-End screen.

Safe to re-run: process_year_end already skips a student who's already
enrolled in the target academic year, so a crash between "promotion
applied" and "auto_promoted_at set" just means the next run picks up
wherever it left off instead of double-promoting anyone.

Usage:
  python run_scheduled_promotions.py             # process every due year
  python run_scheduled_promotions.py --dry-run   # log what would happen, change nothing
"""

import argparse
import logging
import os
import sys
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv  # noqa: E402
load_dotenv()

from app.models import AcademicYear, PromotionGenerationRun  # noqa: E402
from app.promotion_scheduling import is_promotion_due  # noqa: E402
from app.routes.student_enrollments import process_year_end, year_end_suggestions  # noqa: E402
from app.schemas import YearEndAction, YearEndRequest  # noqa: E402
from app.tenant import (  # noqa: E402
    CentralSessionLocal,
    DEFAULT_ACCOUNT_CODE,
    DEFAULT_SCHOOL_DATABASE_URL,
    get_school_session_factory,
    init_tenant_registry,
    is_feature_enabled,
)
from app.tenant_models import SchoolAccount  # noqa: E402

logger = logging.getLogger("promotion_scheduler")

FEATURE_KEY = "promotion_auto_generation"


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


def build_actions(db, year: AcademicYear) -> tuple[list[YearEndAction], int]:
    """Suggestions -> YearEndAction list, skipping anything the automatic
    suggestion logic can't confidently decide on its own."""
    result = year_end_suggestions(academic_year=year.name, db=db)

    actions = []
    unresolved = 0
    for item in result["suggestions"]:
        suggestion = item["suggestion"]
        if suggestion is None:
            unresolved += 1
            continue
        if suggestion == "promote" and not item["suggested_to_class_id"]:
            unresolved += 1
            continue
        actions.append(
            YearEndAction(
                student_id=item["student_id"],
                action=suggestion,
                to_class_id=item["suggested_to_class_id"] if suggestion == "promote" else None,
            )
        )
    return actions, unresolved


def run_one_year(db, account_code: str, year: AcademicYear, dry_run: bool) -> None:
    actions, unresolved = build_actions(db, year)

    if dry_run:
        logger.info(
            "[dry-run] %s: year=%s would process %s action(s), %s left for manual review",
            account_code, year.name, len(actions), unresolved,
        )
        return

    if not actions:
        run = PromotionGenerationRun(
            from_academic_year=year.name,
            to_academic_year=year.auto_promote_to_year,
            skipped_count=unresolved,
            status="success",
        )
        db.add(run)
        year.auto_promoted_at = datetime.utcnow()
        db.commit()
        logger.info("%s: year=%s had nothing auto-actionable (%s left for manual review)", account_code, year.name, unresolved)
        return

    try:
        payload = YearEndRequest(
            from_academic_year=year.name,
            to_academic_year=year.auto_promote_to_year,
            actions=actions,
            start_date=year.auto_promote_date,
            carry_forward_fees=bool(year.auto_promote_carry_forward_fees),
            remarks="Automatically processed by the scheduled year-end promotion job",
        )
        outcome = process_year_end(payload=payload, db=db)
        status = "success"
        error_message = None
    except Exception as exc:  # keep processing other tenants/years
        db.rollback()
        outcome = None
        status = "failed"
        error_message = str(exc)[:2000]
        logger.exception("%s: year=%s promotion run failed", account_code, year.name)

    run = PromotionGenerationRun(
        from_academic_year=year.name,
        to_academic_year=year.auto_promote_to_year,
        promoted_count=outcome["promoted_count"] if outcome else 0,
        detained_count=outcome["detained_count"] if outcome else 0,
        graduated_count=outcome["graduated_count"] if outcome else 0,
        skipped_count=(outcome["skipped_count"] if outcome else 0) + unresolved,
        status=status,
        error_message=error_message,
    )
    db.add(run)
    if status == "success":
        year.auto_promoted_at = datetime.utcnow()
    db.commit()

    logger.info(
        "%s: year=%s status=%s promoted=%s detained=%s graduated=%s skipped=%s",
        account_code, year.name, status,
        run.promoted_count, run.detained_count, run.graduated_count, run.skipped_count,
    )


def run_for_tenant(account_code: str, database_url: str, dry_run: bool) -> int:
    if not is_feature_enabled(account_code, FEATURE_KEY):
        logger.info("%s: %s not enabled by platform owner, skipping", account_code, FEATURE_KEY)
        return 0

    session_factory = get_school_session_factory(database_url)
    db = session_factory()
    processed = 0
    try:
        today = date.today()
        candidates = (
            db.query(AcademicYear)
            .filter(AcademicYear.auto_promote_enabled.is_(True))
            .filter(AcademicYear.auto_promote_date.isnot(None))
            .filter(AcademicYear.auto_promoted_at.is_(None))
            .all()
        )
        for year in candidates:
            if not is_promotion_due(year.auto_promote_enabled, year.auto_promote_date, year.auto_promoted_at, today):
                continue
            run_one_year(db, account_code, year, dry_run)
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
        help="Log what would be promoted without changing anything.",
    )
    args = parser.parse_args(argv)

    total_years = 0
    had_error = False

    for account_code, database_url in tenant_accounts():
        try:
            total_years += run_for_tenant(account_code, database_url, args.dry_run)
        except Exception:
            had_error = True
            logger.exception("Scheduled promotion run crashed for tenant %s", account_code)

    logger.info(
        "Done: %s academic year(s) processed across all schools%s",
        total_years, " (dry run, nothing was changed)" if args.dry_run else "",
    )
    return 1 if had_error else 0


if __name__ == "__main__":
    raise SystemExit(main())
