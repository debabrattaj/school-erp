"""Automatic weekly timetable generation.

Given each class's ClassSubject rows (subject, teacher, periods-per-week),
places every required period into a day/period grid so that:
  - no teacher is double-booked across any class at the same day and period,
  - no class has more than one entry in the same day/period slot,
  - a subject is not crammed into a single day more than necessary, and
  - existing recess/break rows for a class are left alone and never
    scheduled over.

This is a greedy, deterministic placement, not a true constraint solver:
subjects in higher demand (busier teachers, more weekly periods) are placed
first, while the grid still has the most room to work with. Whatever cannot
be placed is reported rather than silently dropped or forced into a clash --
an honest gap an Admin fills in by hand beats a plausible-looking clash the
module hid.

Kept out of the route module so the placement rules can be tested without
HTTP, matching syllabus.py / leave.py / fee_scheduling.py.
"""

from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app import models
from app.leave import WEEKDAY_NAMES as VALID_DAYS
from app.leave import working_day_names

DEFAULT_PERIODS_PER_DAY = 8
DEFAULT_DAY_START = "09:00"
DEFAULT_PERIOD_DURATION_MIN = 40


@dataclass
class PlacedEntry:
    class_id: int
    class_name: str
    section: str
    day_of_week: str
    period_no: int
    subject: str
    teacher_id: int | None
    teacher_name: str | None
    room: str | None
    start_time: str | None
    end_time: str | None


@dataclass
class UnplacedSubject:
    class_id: int
    class_name: str
    section: str
    subject: str
    teacher_id: int | None
    teacher_name: str | None
    requested: int
    placed: int


@dataclass
class GenerationResult:
    academic_year: str
    working_days: list[str]
    periods_per_day: int
    classes_processed: int = 0
    entries: list[PlacedEntry] = field(default_factory=list)
    unplaced: list[UnplacedSubject] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def resolve_working_days(db: Session, requested: list[str] | None) -> list[str]:
    """The ordered set of weekdays to schedule into.

    An explicit list wins; otherwise falls back to the same school-settings
    range leave accounting uses, so "which days does this school run" has
    one answer across the app rather than two that can drift apart.
    """
    if requested:
        return [d for d in VALID_DAYS if d in set(requested)]
    return [d for d in VALID_DAYS if d in working_day_names(db)]


def _to_min(hhmm: str) -> int:
    h, m = hhmm.split(":")
    return int(h) * 60 + int(m)


def _to_hhmm(mins: int) -> str:
    mins = mins % (24 * 60)
    return f"{mins // 60:02d}:{mins % 60:02d}"


def _class_period_slots(
    periods_per_day: int,
    day_start_min: int,
    period_duration_min: int,
    break_duration_by_period: dict[int, int],
) -> dict[int, tuple[str, str]]:
    """Start/end time for every period row of one class, in order.

    A break row's own duration_min shortens or lengthens that row same as it
    would for a manually-built grid, so an auto-generated timetable prints
    the same clock times a human editing the same class would have entered.
    """
    slots: dict[int, tuple[str, str]] = {}
    clock = day_start_min
    for period_no in range(1, periods_per_day + 1):
        duration = break_duration_by_period.get(period_no, period_duration_min)
        slots[period_no] = (_to_hhmm(clock), _to_hhmm(clock + duration))
        clock += duration
    return slots


def generate(
    db: Session,
    academic_year: str,
    class_ids: list[int],
    working_days: list[str],
    periods_per_day: int = DEFAULT_PERIODS_PER_DAY,
    day_start_time: str = DEFAULT_DAY_START,
    period_duration_min: int = DEFAULT_PERIOD_DURATION_MIN,
) -> GenerationResult:
    working_days = working_days or VALID_DAYS[:6]
    periods_per_day = max(1, periods_per_day)
    day_start_min = _to_min(day_start_time) if _valid_hhmm(day_start_time) else _to_min(DEFAULT_DAY_START)
    period_duration_min = max(5, period_duration_min)

    result = GenerationResult(
        academic_year=academic_year,
        working_days=working_days,
        periods_per_day=periods_per_day,
    )

    classes = (
        db.query(models.SchoolClass)
        .filter(models.SchoolClass.id.in_(class_ids))
        .order_by(models.SchoolClass.id)
        .all()
    )
    if not classes:
        result.warnings.append("No classes to generate a timetable for.")
        return result
    class_by_id = {c.id: c for c in classes}
    result.classes_processed = len(classes)

    teachers = {t.id: t for t in db.query(models.Teacher).all()}

    mappings = (
        db.query(models.ClassSubject)
        .filter(
            models.ClassSubject.class_id.in_(class_ids),
            models.ClassSubject.academic_year == academic_year,
            models.ClassSubject.is_active == True,  # noqa: E712
        )
        .all()
    )

    # Read every existing entry once. Breaks/recess block slots for their own
    # class; periods belonging to a class NOT in this run keep that
    # teacher's slot busy (the classes actually being regenerated have their
    # periods cleared by the caller, so their own existing periods must not
    # block anything here).
    existing = (
        db.query(models.TimetableEntry)
        .filter(models.TimetableEntry.academic_year == academic_year)
        .all()
    )

    blocked_slots: dict[int, set[tuple[str, int]]] = {}
    break_duration_by_class: dict[int, dict[int, int]] = {}
    for row in existing:
        if row.entry_type != "period" and row.class_id:
            for day in working_days:
                blocked_slots.setdefault(row.class_id, set()).add((day, row.period_no))
            break_duration_by_class.setdefault(row.class_id, {})[row.period_no] = (
                row.duration_min or period_duration_min
            )

    class_id_set = set(class_ids)
    teacher_busy: dict[int, set[tuple[str, int]]] = {}
    for row in existing:
        if row.entry_type == "period" and row.teacher_id and row.class_id not in class_id_set:
            teacher_busy.setdefault(row.teacher_id, set()).add((row.day_of_week, row.period_no))

    class_slot_used: dict[int, set[tuple[str, int]]] = {cid: set() for cid in class_ids}
    class_slots_cache: dict[int, dict[int, tuple[str, str]]] = {
        cls.id: _class_period_slots(
            periods_per_day, day_start_min, period_duration_min, break_duration_by_class.get(cls.id, {})
        )
        for cls in classes
    }

    # Priority: subjects taught by the busiest teachers first, then the
    # subjects with the most periods to place -- both are the placements
    # with the least room to move later.
    teacher_load: dict[int, int] = {}
    for mapping in mappings:
        if mapping.teacher_id:
            teacher_load[mapping.teacher_id] = teacher_load.get(mapping.teacher_id, 0) + (
                mapping.weekly_periods or 0
            )

    tasks = [m for m in mappings if (m.weekly_periods or 0) > 0]
    tasks.sort(
        key=lambda m: (
            -teacher_load.get(m.teacher_id, 0),
            -(m.weekly_periods or 0),
            m.class_id,
            m.subject_name,
        )
    )

    for index, mapping in enumerate(tasks):
        cls = class_by_id.get(mapping.class_id)
        if not cls:
            continue
        teacher = teachers.get(mapping.teacher_id) if mapping.teacher_id else None
        requested = mapping.weekly_periods or 0
        max_per_day = max(1, -(-requested // len(working_days))) if working_days else requested

        day_count: dict[str, int] = {}
        placed = 0
        rotate_by = index % len(working_days) if working_days else 0
        rotated_days = working_days[rotate_by:] + working_days[:rotate_by]
        class_slots = class_slots_cache.get(cls.id, {})

        for _occurrence in range(requested):
            slot = None
            for day in rotated_days:
                if day_count.get(day, 0) >= max_per_day:
                    continue
                for period_no in range(1, periods_per_day + 1):
                    key = (day, period_no)
                    if key in blocked_slots.get(cls.id, set()):
                        continue
                    if key in class_slot_used[cls.id]:
                        continue
                    if teacher and key in teacher_busy.get(teacher.id, set()):
                        continue
                    slot = key
                    break
                if slot:
                    break
            if not slot:
                break

            day, period_no = slot
            class_slot_used[cls.id].add(slot)
            if teacher:
                teacher_busy.setdefault(teacher.id, set()).add(slot)
            day_count[day] = day_count.get(day, 0) + 1
            placed += 1

            start_time, end_time = class_slots.get(period_no, (None, None))
            result.entries.append(
                PlacedEntry(
                    class_id=cls.id,
                    class_name=cls.class_name,
                    section=cls.section,
                    day_of_week=day,
                    period_no=period_no,
                    subject=mapping.subject_name,
                    teacher_id=teacher.id if teacher else None,
                    teacher_name=teacher.name if teacher else None,
                    room=cls.room_number,
                    start_time=start_time,
                    end_time=end_time,
                )
            )

        if placed < requested:
            result.unplaced.append(
                UnplacedSubject(
                    class_id=cls.id,
                    class_name=cls.class_name,
                    section=cls.section,
                    subject=mapping.subject_name,
                    teacher_id=teacher.id if teacher else None,
                    teacher_name=teacher.name if teacher else None,
                    requested=requested,
                    placed=placed,
                )
            )

    mapped_class_ids = {m.class_id for m in mappings}
    for cls in classes:
        if cls.id not in mapped_class_ids:
            result.warnings.append(f"{cls.class_name} - {cls.section} has no subjects mapped for {academic_year}.")

    return result


def _valid_hhmm(value: str) -> bool:
    try:
        h, m = value.split(":")
        return 0 <= int(h) <= 23 and 0 <= int(m) <= 59
    except (ValueError, AttributeError):
        return False
