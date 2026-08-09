"""Pure date math for scheduled Exam Template auto-creation.

No DB access here on purpose, mirrors fee_scheduling.py. An Exam Template
fires on next_run_date, then advances to the same month/day next year — the
same "mutable next_run_date that advances after each fire" shape as
FeeStructure, just always annual rather than configurable recurrence
(a school exam inherently repeats once a year, not monthly/quarterly).
"""

from datetime import date


def is_exam_due(next_run_date: date | None, today: date) -> bool:
    if not next_run_date:
        return False
    return next_run_date <= today


def advance_next_run(next_run_date: date) -> date:
    """Same month/day, one year later. Feb 29 rolls back to Feb 28 in a
    non-leap year, same edge case fee_scheduling.add_months already has to
    handle for the 29th/30th/31st."""
    try:
        return next_run_date.replace(year=next_run_date.year + 1)
    except ValueError:
        return next_run_date.replace(year=next_run_date.year + 1, day=28)


def validate_schedule(is_active: bool, next_run_date: date | None) -> None:
    """Raises ValueError with a user-facing message if the template's
    schedule fields don't make sense together. No-op when inactive."""
    if is_active and not next_run_date:
        raise ValueError("next_run_date is required while the template is active")


def next_occurrence(month: int, day: int, today: date) -> date:
    """The next date (today or later) that falls on this month/day —
    this year if it hasn't passed yet, otherwise next year. Used by
    seed-from-year to turn a past exam's date into a useful future
    next_run_date instead of one already in the past."""
    try:
        candidate = date(today.year, month, day)
    except ValueError:
        candidate = date(today.year, month, 28)  # Feb 29 in a non-leap year
    if candidate < today:
        try:
            candidate = date(today.year + 1, month, day)
        except ValueError:
            candidate = date(today.year + 1, month, 28)
    return candidate
