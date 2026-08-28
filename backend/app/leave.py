"""Staff leave and substitute cover.

One subsystem rather than two: a class needs covering *because* its teacher is
away, so approving leave is what raises the cover requirement. Splitting them
would mean deriving "who is absent today" in a second place and letting the two
answers drift apart.

Kept out of the route module so the parts worth getting right -- counting
working days, deducting balances, and refusing to double-book a substitute --
can be tested without HTTP.
"""

from datetime import date, timedelta

from sqlalchemy.orm import Session

from app import models

WEEKDAY_NAMES = [
    "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
]

LEAVE_STATUSES = ("Requested", "Approved", "Rejected", "Cancelled")
COVER_STATUSES = ("Unassigned", "Assigned", "Cancelled")


class LeaveError(Exception):
    """A leave problem worth showing a human."""


# ---------------------------------------------------------------------------
# Working days
# ---------------------------------------------------------------------------


def working_day_names(db: Session) -> set[str]:
    """Which weekdays the school runs, from settings.

    Settings stores this as a range like "Monday-Saturday", which is how the
    setup screen writes it. Anything unparseable falls back to Monday-Saturday
    rather than to the whole week, because counting Sunday as a working day
    would silently charge staff an extra leave day for every weekend they span.
    """
    settings = db.query(models.SchoolSettings).first()
    raw = (getattr(settings, "working_days", None) or "").strip() if settings else ""

    if "-" in raw:
        start, _, end = raw.partition("-")
        start, end = start.strip().title(), end.strip().title()
        if start in WEEKDAY_NAMES and end in WEEKDAY_NAMES:
            i, j = WEEKDAY_NAMES.index(start), WEEKDAY_NAMES.index(end)
            if i <= j:
                return set(WEEKDAY_NAMES[i:j + 1])
            # A range that wraps the week end, e.g. Saturday-Wednesday.
            return set(WEEKDAY_NAMES[i:] + WEEKDAY_NAMES[:j + 1])

    if "," in raw:
        named = {part.strip().title() for part in raw.split(",")}
        valid = named & set(WEEKDAY_NAMES)
        if valid:
            return valid

    return set(WEEKDAY_NAMES[:6])  # Monday-Saturday


def count_leave_days(db: Session, from_date: date, to_date: date, is_half_day: bool = False) -> float:
    """Working days in an inclusive range.

    Non-working days inside the range are not charged: a Friday-to-Monday
    absence costs two days, not four, which is what staff expect and what the
    quota was set against.
    """
    if to_date < from_date:
        raise LeaveError("The end date cannot be before the start date.")

    working = working_day_names(db)
    days = 0
    cursor = from_date
    while cursor <= to_date:
        if WEEKDAY_NAMES[cursor.weekday()] in working:
            days += 1
        cursor += timedelta(days=1)

    if is_half_day:
        if from_date != to_date:
            raise LeaveError("A half day must start and end on the same date.")
        return 0.5 if days else 0.0

    return float(days)


def working_dates(db: Session, from_date: date, to_date: date) -> list[date]:
    """Every working date in an inclusive range."""
    working = working_day_names(db)
    out, cursor = [], from_date
    while cursor <= to_date:
        if WEEKDAY_NAMES[cursor.weekday()] in working:
            out.append(cursor)
        cursor += timedelta(days=1)
    return out


# ---------------------------------------------------------------------------
# Balances
# ---------------------------------------------------------------------------


def get_or_create_balance(
    db: Session, teacher_id: int, leave_type: models.LeaveType, academic_year: str | None
) -> models.LeaveBalance:
    """This teacher's balance for a leave type, seeded from the annual quota."""
    balance = (
        db.query(models.LeaveBalance)
        .filter(
            models.LeaveBalance.teacher_id == teacher_id,
            models.LeaveBalance.leave_type_id == leave_type.id,
            models.LeaveBalance.academic_year == academic_year,
        )
        .first()
    )
    if balance:
        return balance

    balance = models.LeaveBalance(
        teacher_id=teacher_id, leave_type_id=leave_type.id,
        academic_year=academic_year,
        entitled_days=leave_type.annual_quota or 0, used_days=0,
    )
    db.add(balance)
    db.flush()
    return balance


def remaining_days(balance: models.LeaveBalance) -> float:
    return round((balance.entitled_days or 0) - (balance.used_days or 0), 2)


def overlapping_requests(
    db: Session, teacher_id: int, from_date: date, to_date: date, exclude_id: int | None = None
) -> list[models.LeaveRequest]:
    """Live requests for this teacher that overlap the given range.

    Only Requested and Approved count -- a rejected or cancelled application
    is not a reason to refuse a new one for the same dates.
    """
    query = db.query(models.LeaveRequest).filter(
        models.LeaveRequest.teacher_id == teacher_id,
        models.LeaveRequest.status.in_(["Requested", "Approved"]),
        models.LeaveRequest.from_date <= to_date,
        models.LeaveRequest.to_date >= from_date,
    )
    if exclude_id:
        query = query.filter(models.LeaveRequest.id != exclude_id)
    return query.all()


def approve(db: Session, request: models.LeaveRequest, decided_by: str, note: str | None = None) -> dict:
    """Approve leave: deduct the balance and raise cover for the classes missed."""
    if request.status == "Approved":
        raise LeaveError("This request is already approved.")

    leave_type = (
        db.query(models.LeaveType)
        .filter(models.LeaveType.id == request.leave_type_id)
        .first()
    )
    if not leave_type:
        raise LeaveError("The leave type no longer exists.")

    balance = get_or_create_balance(db, request.teacher_id, leave_type, request.academic_year)

    # Unpaid leave has no entitlement to exhaust, so it is allowed past zero.
    # Everything else is refused rather than quietly going negative.
    if not leave_type.allow_negative_balance:
        if remaining_days(balance) < request.days:
            raise LeaveError(
                f"Only {remaining_days(balance)} day(s) of {leave_type.name} remain; "
                f"this request is for {request.days}."
            )

    balance.used_days = round((balance.used_days or 0) + request.days, 2)

    request.status = "Approved"
    request.decided_by = decided_by
    request.decided_at = _now()
    request.decision_note = note

    covers = raise_cover_for_leave(db, request)
    db.commit()

    return {"days_deducted": request.days, "remaining": remaining_days(balance), "covers_raised": covers}


def cancel(db: Session, request: models.LeaveRequest, decided_by: str, note: str | None = None) -> dict:
    """Cancel leave, returning the days and dropping any unfilled cover.

    Cover already assigned to a substitute is left alone: someone has been told
    they are teaching that period, and silently un-telling them is worse than
    an extra row for a human to clear.
    """
    was_approved = request.status == "Approved"

    restored = 0.0
    if was_approved:
        balance = (
            db.query(models.LeaveBalance)
            .filter(
                models.LeaveBalance.teacher_id == request.teacher_id,
                models.LeaveBalance.leave_type_id == request.leave_type_id,
                models.LeaveBalance.academic_year == request.academic_year,
            )
            .first()
        )
        if balance:
            balance.used_days = max(round((balance.used_days or 0) - request.days, 2), 0)
            restored = request.days

    dropped = (
        db.query(models.SubstitutionAssignment)
        .filter(
            models.SubstitutionAssignment.leave_request_id == request.id,
            models.SubstitutionAssignment.status == "Unassigned",
        )
        .delete(synchronize_session=False)
    )

    request.status = "Cancelled"
    request.decided_by = decided_by
    request.decided_at = _now()
    request.decision_note = note
    db.commit()

    return {"days_restored": restored, "unassigned_covers_removed": dropped}


def _now():
    from datetime import datetime
    return datetime.utcnow()


# ---------------------------------------------------------------------------
# Cover
# ---------------------------------------------------------------------------


def raise_cover_for_leave(db: Session, request: models.LeaveRequest) -> int:
    """Create a cover slot for every class the absent teacher would have taught.

    Reads the timetable for each working day in the range. Idempotent: a slot
    that already exists for that date, teacher and period is left as-is, so
    re-approving cannot duplicate the hole or wipe an assignment already made.
    """
    created = 0
    for cover_date in working_dates(db, request.from_date, request.to_date):
        day_name = WEEKDAY_NAMES[cover_date.weekday()]
        entries = (
            db.query(models.TimetableEntry)
            .filter(
                models.TimetableEntry.teacher_id == request.teacher_id,
                models.TimetableEntry.day_of_week == day_name,
            )
            .all()
        )
        for entry in entries:
            exists = (
                db.query(models.SubstitutionAssignment)
                .filter(
                    models.SubstitutionAssignment.cover_date == cover_date,
                    models.SubstitutionAssignment.absent_teacher_id == request.teacher_id,
                    models.SubstitutionAssignment.period_no == entry.period_no,
                )
                .first()
            )
            if exists:
                continue

            db.add(models.SubstitutionAssignment(
                cover_date=cover_date,
                timetable_entry_id=entry.id,
                leave_request_id=request.id,
                absent_teacher_id=request.teacher_id,
                period_no=entry.period_no,
                class_name=entry.class_name_snapshot,
                section=entry.section_snapshot,
                subject=entry.subject,
                room=entry.room,
                status="Unassigned",
            ))
            created += 1

    db.flush()
    return created


def teacher_is_on_leave(db: Session, teacher_id: int, on_date: date) -> bool:
    return (
        db.query(models.LeaveRequest)
        .filter(
            models.LeaveRequest.teacher_id == teacher_id,
            models.LeaveRequest.status == "Approved",
            models.LeaveRequest.from_date <= on_date,
            models.LeaveRequest.to_date >= on_date,
        )
        .first()
        is not None
    )


def teacher_is_busy(db: Session, teacher_id: int, on_date: date, period_no: int | None) -> str | None:
    """Why this teacher cannot take a period, or None if they can.

    Checks both halves of "free": not timetabled for that period themselves,
    and not already covering it for somebody else. Missing either check
    produces a substitute standing in two classrooms at once, which is the
    whole failure this feature exists to prevent.
    """
    if period_no is None:
        return None

    day_name = WEEKDAY_NAMES[on_date.weekday()]

    own_class = (
        db.query(models.TimetableEntry)
        .filter(
            models.TimetableEntry.teacher_id == teacher_id,
            models.TimetableEntry.day_of_week == day_name,
            models.TimetableEntry.period_no == period_no,
        )
        .first()
    )
    if own_class:
        label = " ".join(filter(None, [own_class.class_name_snapshot, own_class.section_snapshot]))
        return f"already teaching {label or 'a class'} in period {period_no}"

    already_covering = (
        db.query(models.SubstitutionAssignment)
        .filter(
            models.SubstitutionAssignment.substitute_teacher_id == teacher_id,
            models.SubstitutionAssignment.cover_date == on_date,
            models.SubstitutionAssignment.period_no == period_no,
            models.SubstitutionAssignment.status == "Assigned",
        )
        .first()
    )
    if already_covering:
        return f"already covering another class in period {period_no}"

    return None


def available_substitutes(db: Session, cover: models.SubstitutionAssignment) -> list[dict]:
    """Teachers who could take this slot, and why the others cannot.

    Returns everyone rather than only the free ones, with a reason attached,
    because a head of school filling a gap at 8am wants to see that the obvious
    candidate is unavailable, not have them silently missing from the list.
    """
    teachers = db.query(models.Teacher).all()
    out = []
    for teacher in teachers:
        if teacher.id == cover.absent_teacher_id:
            continue

        reason = None
        if teacher_is_on_leave(db, teacher.id, cover.cover_date):
            reason = "on leave that day"
        else:
            reason = teacher_is_busy(db, teacher.id, cover.cover_date, cover.period_no)

        out.append({
            "teacher_id": teacher.id,
            "name": teacher.name,
            "subject": teacher.subject,
            "available": reason is None,
            # A same-subject cover is worth more than a warm body, so surface
            # it for sorting rather than deciding silently.
            "teaches_this_subject": bool(
                cover.subject and teacher.subject
                and teacher.subject.strip().lower() == cover.subject.strip().lower()
            ),
            "unavailable_reason": reason,
        })

    out.sort(key=lambda t: (not t["available"], not t["teaches_this_subject"], t["name"] or ""))
    return out


def assign_substitute(
    db: Session, cover: models.SubstitutionAssignment, teacher_id: int, assigned_by: str
) -> models.SubstitutionAssignment:
    """Put a teacher on a cover slot, refusing anything that double-books them."""
    teacher = db.query(models.Teacher).filter(models.Teacher.id == teacher_id).first()
    if not teacher:
        raise LeaveError("Teacher not found.")
    if teacher_id == cover.absent_teacher_id:
        raise LeaveError("The absent teacher cannot cover their own class.")
    if teacher_is_on_leave(db, teacher_id, cover.cover_date):
        raise LeaveError(f"{teacher.name} is on leave that day.")

    conflict = teacher_is_busy(db, teacher_id, cover.cover_date, cover.period_no)
    if conflict:
        raise LeaveError(f"{teacher.name} is {conflict}.")

    cover.substitute_teacher_id = teacher_id
    cover.status = "Assigned"
    cover.assigned_by = assigned_by
    cover.assigned_at = _now()
    db.commit()
    db.refresh(cover)
    return cover
