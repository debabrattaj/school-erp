"""Pure date math for scheduled Exam Template auto-creation.

No DB access here on purpose, mirrors fee_scheduling.py. An Exam Template
recurs exactly once per academic year (unlike a Fee Structure, which can
recur many times within one year), so its "when does this fire" math is
just an offset from that year's start_date — no mutable next_run_date state
needed, since it's always computed fresh from the year currently in range.
"""

from datetime import date, timedelta


def exam_fire_date(year_start_date: date, offset_days: int) -> date:
    return year_start_date + timedelta(days=offset_days)


def is_exam_due(year_start_date: date | None, offset_days: int, today: date) -> bool:
    if not year_start_date:
        return False
    return exam_fire_date(year_start_date, offset_days) <= today


def validate_offset_days(offset_days: int) -> None:
    if offset_days < 0:
        raise ValueError(
            "offset_days must be zero or a positive number of days after the academic year's start date"
        )
