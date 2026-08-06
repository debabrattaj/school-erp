"""Pure date math for recurring Fee Structure auto-generation.

No DB access here on purpose: this is the one place the "which cycle is
this, and when's the next one" logic lives, so it can be unit tested without
spinning up a database. `run_scheduled_fees.py` and the fee_structures route
validation both import from here.
"""

from datetime import date

VALID_RECURRENCES = ("monthly", "quarterly", "annually", "once")

# next_run_date's day-of-month is capped at this so add_months() never has to
# decide what "the 31st" means in a 30-day month.
MAX_SCHEDULE_DAY = 28

_INTERVAL_MONTHS = {"monthly": 1, "quarterly": 3, "annually": 12}


def add_months(d: date, months: int) -> date:
    """d shifted forward by `months` calendar months, same day-of-month.

    Only ever called with day <= MAX_SCHEDULE_DAY (enforced by
    validate_schedule), so every target month has that day.
    """
    month_index = d.month - 1 + months
    year = d.year + month_index // 12
    month = month_index % 12 + 1
    return date(year, month, d.day)


def billing_period_label(recurrence: str, on_date: date) -> str:
    """Canonical dedup key for a fire date, e.g. "2026-08" for monthly.

    Fees created for the same (fee_type, academic_year, billing_period) are
    treated as the same billing cycle and only ever generated once.
    """
    if recurrence == "monthly":
        return f"{on_date.year}-{on_date.month:02d}"
    if recurrence == "quarterly":
        quarter = (on_date.month - 1) // 3 + 1
        return f"{on_date.year}-Q{quarter}"
    if recurrence == "annually":
        return str(on_date.year)
    return on_date.isoformat()  # "once": the fire date itself is unique enough


def advance(recurrence: str, current: date) -> date | None:
    """Next fire date after `current`, or None if `recurrence` doesn't recur."""
    months = _INTERVAL_MONTHS.get(recurrence)
    if months is None:
        return None
    return add_months(current, months)


def validate_schedule(auto_generate: bool, recurrence: str | None, next_run_date: date | None) -> None:
    """Raises ValueError with a user-facing message if the schedule fields
    on a FeeStructure don't make sense together. No-op when auto-generate is off."""
    if not auto_generate:
        return
    if recurrence not in VALID_RECURRENCES:
        raise ValueError(f"recurrence must be one of: {', '.join(VALID_RECURRENCES)}")
    if not next_run_date:
        raise ValueError("next_run_date is required when auto_generate is enabled")
    if next_run_date.day > MAX_SCHEDULE_DAY:
        raise ValueError(f"next_run_date's day-of-month must be {MAX_SCHEDULE_DAY} or earlier")
