"""Syllabus tracking and lesson plans.

The document is the easy part. The output worth having is the answer to
"which classes are behind, and by how much" -- so coverage is computed from
what has actually been taught, weighted by how long each topic was meant to
take, rather than typed in as a percentage by whoever is furthest behind.

Kept out of the route module so the arithmetic and the ordering rules can be
tested without HTTP.
"""

from datetime import date, datetime

from sqlalchemy.orm import Session

from app import models

UNIT_STATUSES = ("Pending", "In Progress", "Completed")
TOPIC_STATUSES = ("Pending", "In Progress", "Completed")
LESSON_STATUSES = ("Planned", "Delivered", "Deferred", "Cancelled")
REVIEW_STATUSES = ("Pending", "Approved", "Changes Requested")


class SyllabusError(Exception):
    """A syllabus problem worth showing a human."""


def _now() -> datetime:
    return datetime.utcnow()


# ---------------------------------------------------------------------------
# Coverage
# ---------------------------------------------------------------------------


def topic_weight(topic: models.SyllabusTopic) -> int:
    """How much a topic counts toward coverage.

    Zero or missing falls back to 1 rather than to nothing, so a syllabus
    entered without period estimates still produces a usable percentage
    instead of dividing by zero.
    """
    return topic.planned_periods if (topic.planned_periods or 0) > 0 else 1


def unit_progress(unit: models.SyllabusUnit, topics: list[models.SyllabusTopic]) -> dict:
    """Coverage of one unit, weighted by planned periods."""
    total_weight = sum(topic_weight(t) for t in topics)

    if not topics:
        # A unit nobody has broken into topics still has a status of its own.
        percent = 100.0 if unit.status == "Completed" else 0.0
        return {
            "total_topics": 0, "completed_topics": 0,
            "planned_periods": unit.planned_periods or 0,
            "periods_taken": 0, "percent": percent,
        }

    done_weight = sum(topic_weight(t) for t in topics if t.status == "Completed")
    return {
        "total_topics": len(topics),
        "completed_topics": sum(1 for t in topics if t.status == "Completed"),
        "planned_periods": unit.planned_periods or total_weight,
        "periods_taken": sum(t.periods_taken or 0 for t in topics),
        "percent": round(done_weight * 100.0 / total_weight, 1),
    }


def unit_weight(unit: models.SyllabusUnit, topics: list[models.SyllabusTopic]) -> int:
    """How much a unit counts toward the subject's overall coverage.

    A unit's own period estimate wins when it has one, because that is the
    school's plan; otherwise its topics add up to it. Never zero, so one
    unweighted unit cannot vanish from the total.
    """
    if (unit.planned_periods or 0) > 0:
        return unit.planned_periods
    return sum(topic_weight(t) for t in topics) or 1


def topics_by_unit(db: Session, unit_ids: list[int]) -> dict[int, list[models.SyllabusTopic]]:
    """All topics for a set of units, grouped -- one query rather than N."""
    grouped: dict[int, list[models.SyllabusTopic]] = {uid: [] for uid in unit_ids}
    if not unit_ids:
        return grouped
    rows = (
        db.query(models.SyllabusTopic)
        .filter(models.SyllabusTopic.unit_id.in_(unit_ids))
        .order_by(models.SyllabusTopic.sequence_no, models.SyllabusTopic.id)
        .all()
    )
    for topic in rows:
        grouped.setdefault(topic.unit_id, []).append(topic)
    return grouped


def units_for(db: Session, class_subject_id: int) -> list[models.SyllabusUnit]:
    return (
        db.query(models.SyllabusUnit)
        .filter(models.SyllabusUnit.class_subject_id == class_subject_id)
        .order_by(models.SyllabusUnit.sequence_no, models.SyllabusUnit.id)
        .all()
    )


def subject_coverage(db: Session, class_subject_id: int, as_of: date | None = None) -> dict:
    """Overall coverage of one subject in one class, and whether it is on time."""
    moment = as_of or date.today()
    units = units_for(db, class_subject_id)
    grouped = topics_by_unit(db, [u.id for u in units])

    weighted_total = 0
    weighted_done = 0.0
    overdue = []
    for unit in units:
        topics = grouped.get(unit.id, [])
        weight = unit_weight(unit, topics)
        progress = unit_progress(unit, topics)
        weighted_total += weight
        weighted_done += weight * progress["percent"] / 100.0

        if unit.planned_end and unit.planned_end < moment and unit.status != "Completed":
            overdue.append({
                "unit_id": unit.id, "title": unit.title,
                "planned_end": unit.planned_end,
                "days_late": (moment - unit.planned_end).days,
                "percent": progress["percent"],
            })

    percent = round(weighted_done * 100.0 / weighted_total, 1) if weighted_total else 0.0
    return {
        "class_subject_id": class_subject_id,
        "as_of": moment,
        "units": len(units),
        "units_completed": sum(1 for u in units if u.status == "Completed"),
        "percent_covered": percent,
        # A plan with no dates cannot be late, and saying so is more honest
        # than reporting "on track" as though it had been checked.
        "on_schedule": None if not any(u.planned_end for u in units) else not overdue,
        "overdue_units": overdue,
    }


def expected_percent(db: Session, academic_year: str | None, as_of: date | None = None) -> float | None:
    """How far through the year we are, for comparing coverage against.

    Returns None rather than a guess when the year has no dates on file --
    a made-up denominator would make every class look precisely on target.
    """
    if not academic_year:
        return None
    year = (
        db.query(models.AcademicYear)
        .filter(models.AcademicYear.name == academic_year)
        .first()
    )
    if not year or not year.start_date or not year.end_date:
        return None
    if year.end_date <= year.start_date:
        return None

    moment = as_of or date.today()
    if moment <= year.start_date:
        return 0.0
    if moment >= year.end_date:
        return 100.0
    elapsed = (moment - year.start_date).days
    total = (year.end_date - year.start_date).days
    return round(elapsed * 100.0 / total, 1)


# ---------------------------------------------------------------------------
# Marking progress
# ---------------------------------------------------------------------------


def recompute_unit_status(db: Session, unit: models.SyllabusUnit) -> str:
    """Derive a unit's status from its topics.

    Derived rather than set by hand: a unit whose topics are all taught but
    which still reads "In Progress" is precisely the drift this module
    exists to prevent. A unit with no topics keeps whatever it was given.
    """
    topics = (
        db.query(models.SyllabusTopic).filter(models.SyllabusTopic.unit_id == unit.id).all()
    )
    if not topics:
        return unit.status

    if all(t.status == "Completed" for t in topics):
        unit.status = "Completed"
    elif any(t.status in ("Completed", "In Progress") for t in topics):
        unit.status = "In Progress"
    else:
        unit.status = "Pending"
    return unit.status


def mark_topic(
    db: Session,
    topic: models.SyllabusTopic,
    status: str,
    by: str | None = None,
    on_date: date | None = None,
    periods_taken: int | None = None,
    notes: str | None = None,
) -> models.SyllabusTopic:
    """Move a topic along, keeping the record of when it was first taught."""
    if status not in TOPIC_STATUSES:
        raise SyllabusError(f"Status must be one of: {', '.join(TOPIC_STATUSES)}.")

    if status == "Completed":
        # Stamped once. Re-saving a completed topic must not rewrite the date
        # the class was actually taught into today.
        if topic.status != "Completed":
            topic.completed_on = on_date or date.today()
            topic.completed_by = by
        elif on_date:
            topic.completed_on = on_date
        if periods_taken is not None:
            topic.periods_taken = periods_taken
    else:
        # Reopening clears the stamp; leaving a completion date on a topic
        # that is no longer complete would be worse than having none.
        topic.completed_on = None
        topic.completed_by = None

    topic.status = status
    if notes is not None:
        topic.notes = notes

    unit = db.query(models.SyllabusUnit).filter(models.SyllabusUnit.id == topic.unit_id).first()
    if unit:
        recompute_unit_status(db, unit)

    db.commit()
    db.refresh(topic)
    return topic


def deliver_lesson(
    db: Session,
    plan: models.LessonPlan,
    by: str | None = None,
    note: str | None = None,
    complete_topic: bool = False,
    periods_taken: int | None = None,
) -> models.LessonPlan:
    """Record that a lesson happened, and move the syllabus on if it should.

    A lesson cannot be delivered in the future: "delivered" is a claim about
    the past, and letting a teacher tick next month's lessons off today would
    make coverage a plan rather than a record.
    """
    if plan.status == "Delivered":
        raise SyllabusError("This lesson is already marked delivered.")
    if plan.status == "Cancelled":
        raise SyllabusError("This lesson was cancelled.")
    if plan.plan_date > date.today():
        raise SyllabusError("A lesson dated in the future cannot be marked delivered yet.")

    plan.status = "Delivered"
    plan.delivered_at = _now()
    plan.delivery_note = note

    if plan.topic_id:
        topic = (
            db.query(models.SyllabusTopic)
            .filter(models.SyllabusTopic.id == plan.topic_id)
            .first()
        )
        if topic:
            # A delivered lesson always at least starts its topic; finishing it
            # is the teacher's call, because one topic often spans several
            # periods and auto-completing would over-report coverage.
            if complete_topic:
                mark_topic(db, topic, "Completed", by=by, on_date=plan.plan_date,
                           periods_taken=periods_taken)
            elif topic.status == "Pending":
                mark_topic(db, topic, "In Progress", by=by)

    db.commit()
    db.refresh(plan)
    return plan


# ---------------------------------------------------------------------------
# Reuse
# ---------------------------------------------------------------------------


def clone_syllabus(db: Session, source_id: int, target_id: int) -> int:
    """Copy a syllabus onto another class-subject, progress reset.

    Schools reuse last year's syllabus, and retyping forty topics is how the
    sequence numbers end up wrong. Progress is deliberately not copied:
    carrying last year's coverage over would claim work nobody has done.
    """
    if source_id == target_id:
        raise SyllabusError("Source and target are the same class subject.")

    if units_for(db, target_id):
        raise SyllabusError(
            "The target already has a syllabus. Clear it first — merging two "
            "syllabuses silently would double every unit."
        )

    source_units = units_for(db, source_id)
    if not source_units:
        raise SyllabusError("The source has no syllabus to copy.")

    grouped = topics_by_unit(db, [u.id for u in source_units])
    copied = 0
    for unit in source_units:
        new_unit = models.SyllabusUnit(
            class_subject_id=target_id,
            sequence_no=unit.sequence_no,
            title=unit.title,
            description=unit.description,
            planned_periods=unit.planned_periods,
            # Dates are not carried across: last year's calendar is not this
            # year's, and a copied deadline would report the new class as
            # months behind on its first day.
            planned_start=None,
            planned_end=None,
            status="Pending",
        )
        db.add(new_unit)
        db.flush()
        copied += 1

        for topic in grouped.get(unit.id, []):
            db.add(models.SyllabusTopic(
                unit_id=new_unit.id,
                sequence_no=topic.sequence_no,
                title=topic.title,
                description=topic.description,
                planned_periods=topic.planned_periods,
                status="Pending",
            ))

    db.commit()
    return copied


def unit_has_progress(db: Session, unit: models.SyllabusUnit) -> bool:
    """Whether anything has been taught out of this unit."""
    started = (
        db.query(models.SyllabusTopic)
        .filter(
            models.SyllabusTopic.unit_id == unit.id,
            models.SyllabusTopic.status.in_(["In Progress", "Completed"]),
        )
        .first()
    )
    return started is not None


def behind_schedule(db: Session, academic_year: str | None = None, as_of: date | None = None) -> list[dict]:
    """Every class-subject with a unit past its planned end and unfinished.

    The whole point of the module: one list a head of school can act on,
    rather than a coverage figure per class that somebody has to go and read.
    """
    moment = as_of or date.today()
    query = db.query(models.ClassSubject)
    if academic_year:
        query = query.filter(models.ClassSubject.academic_year == academic_year)

    out = []
    for class_subject in query.all():
        coverage = subject_coverage(db, class_subject.id, moment)
        if not coverage["overdue_units"]:
            continue
        out.append({
            "class_subject_id": class_subject.id,
            "class_id": class_subject.class_id,
            "subject_name": class_subject.subject_name,
            "academic_year": class_subject.academic_year,
            "teacher_id": class_subject.teacher_id,
            "percent_covered": coverage["percent_covered"],
            "expected_percent": expected_percent(db, class_subject.academic_year, moment),
            "overdue_units": coverage["overdue_units"],
            "worst_days_late": max(u["days_late"] for u in coverage["overdue_units"]),
        })

    out.sort(key=lambda r: r["worst_days_late"], reverse=True)
    return out


# ---------------------------------------------------------------------------
# Deleting
#
# SQLite does not act on ON DELETE CASCADE unless foreign-key enforcement is
# switched on, and this codebase uses explicit queries rather than ORM
# relationships, so nothing removes the children on its own. Orphans are not
# merely untidy here: SQLite reuses row ids, so a topic left behind by a
# deleted unit can silently re-attach itself to the next unit created and
# report coverage for a class that was never taught it.
# ---------------------------------------------------------------------------


def detach_lesson_plans(db: Session, topic_ids: list[int]) -> int:
    """Unlink lesson plans from topics about to disappear.

    The lessons themselves are kept -- they happened -- but a plan pointing at
    a deleted topic id would be re-pointed at whatever reuses that id.
    """
    if not topic_ids:
        return 0
    return (
        db.query(models.LessonPlan)
        .filter(models.LessonPlan.topic_id.in_(topic_ids))
        .update({models.LessonPlan.topic_id: None}, synchronize_session=False)
    )


def delete_unit(db: Session, unit: models.SyllabusUnit) -> None:
    """Remove a unit and everything that hangs off it."""
    topic_ids = [
        t.id for t in db.query(models.SyllabusTopic.id)
        .filter(models.SyllabusTopic.unit_id == unit.id).all()
    ]
    detach_lesson_plans(db, topic_ids)
    db.query(models.SyllabusTopic).filter(
        models.SyllabusTopic.unit_id == unit.id
    ).delete(synchronize_session=False)
    db.delete(unit)
    db.commit()


def delete_topic(db: Session, topic: models.SyllabusTopic) -> models.SyllabusUnit | None:
    """Remove a topic, unlinking any lessons that referenced it."""
    unit = db.query(models.SyllabusUnit).filter(models.SyllabusUnit.id == topic.unit_id).first()
    detach_lesson_plans(db, [topic.id])
    db.delete(topic)
    db.flush()
    if unit:
        recompute_unit_status(db, unit)
    db.commit()
    return unit


def delete_syllabus_for(db: Session, class_subject_id: int) -> dict:
    """Remove a whole syllabus and its lesson plans.

    Called when the class-subject mapping itself goes, which would otherwise
    leave units, topics and lesson plans pointing at nothing.
    """
    units = units_for(db, class_subject_id)
    topic_ids = [
        t.id for t in db.query(models.SyllabusTopic.id)
        .filter(models.SyllabusTopic.unit_id.in_([u.id for u in units] or [-1])).all()
    ]

    plans = (
        db.query(models.LessonPlan)
        .filter(models.LessonPlan.class_subject_id == class_subject_id)
        .delete(synchronize_session=False)
    )
    detach_lesson_plans(db, topic_ids)
    topics = db.query(models.SyllabusTopic).filter(
        models.SyllabusTopic.unit_id.in_([u.id for u in units] or [-1])
    ).delete(synchronize_session=False)
    db.query(models.SyllabusUnit).filter(
        models.SyllabusUnit.class_subject_id == class_subject_id
    ).delete(synchronize_session=False)

    return {"units": len(units), "topics": topics, "lesson_plans": plans}
