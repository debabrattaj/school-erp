"""Pure math for computing an overdue fee's fine.

No DB access here on purpose, same reasoning as fee_scheduling.py: this is
the one place "how many fine periods has this fee accrued" lives, so it can
be unit tested without a database. run_late_fee_charges.py imports from
here.
"""

from datetime import date

VALID_FREQUENCIES = ("One-Time", "Weekly", "Monthly")

_PERIOD_DAYS = {"Weekly": 7, "Monthly": 30}


def compute_late_fee(
    due_date: date | None,
    late_fee_amount: float | None,
    late_fee_frequency: str | None,
    grace_days: int,
    as_of: date,
) -> float:
    """The total fine that should be charged on a fee as of `as_of`.

    Always recomputed from scratch (never incremented), so re-running the
    cron daily is idempotent instead of compounding: a fee 10 days overdue
    on a Weekly rule owes exactly one period's fine whether this is the
    first time it's been checked or the tenth.
    """
    if not due_date or not late_fee_amount or late_fee_amount <= 0:
        return 0.0
    if late_fee_frequency not in VALID_FREQUENCIES:
        return 0.0

    grace_days = grace_days or 0
    overdue_since = due_date.toordinal() + grace_days
    days_overdue = as_of.toordinal() - overdue_since
    if days_overdue < 0:
        return 0.0

    if late_fee_frequency == "One-Time":
        return float(late_fee_amount)

    period_days = _PERIOD_DAYS[late_fee_frequency]
    periods_elapsed = days_overdue // period_days + 1
    return float(late_fee_amount) * periods_elapsed
