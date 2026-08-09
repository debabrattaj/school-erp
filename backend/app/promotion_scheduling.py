"""Pure date checks for scheduled year-end student promotion.

No DB access here on purpose, mirrors fee_scheduling.py: the one place the
"is this due yet" logic lives, so it's unit-testable without a database.
run_scheduled_promotions.py and the academic_years route validation both
import from here.

Unlike fees, a school promotes students once per academic year transition,
not on a recurring monthly/quarterly cycle — so there's no "next run date"
state machine here, just a single scheduled date per academic year guarded
by auto_promoted_at once it fires.
"""

from datetime import date


def is_promotion_due(
    auto_promote_enabled: bool,
    auto_promote_date: date | None,
    auto_promoted_at,
    today: date,
) -> bool:
    if not auto_promote_enabled or not auto_promote_date:
        return False
    if auto_promoted_at is not None:
        return False
    return auto_promote_date <= today


def validate_promotion_schedule(
    auto_promote_enabled: bool,
    auto_promote_date: date | None,
    auto_promote_to_year: str | None,
) -> None:
    """Raises ValueError with a user-facing message if the auto-promotion
    fields on an AcademicYear don't make sense together. No-op when
    auto-promote is off."""
    if not auto_promote_enabled:
        return
    if not auto_promote_date:
        raise ValueError("auto_promote_date is required when auto-promote is enabled")
    if not auto_promote_to_year:
        raise ValueError("auto_promote_to_year is required when auto-promote is enabled")
