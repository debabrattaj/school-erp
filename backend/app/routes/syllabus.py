"""Syllabus tracking and lesson plans.

Everything hangs off a ClassSubject, which already carries the class, the
subject, the academic year and the teacher -- so nothing here restates them
and nothing can disagree with the timetable.
"""

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import models
from app import syllabus as syllabus_logic
from app.database import get_db
from app.models import User
from app.security import require_roles

router = APIRouter(prefix="/syllabus", tags=["Syllabus & Lesson Plans"])

TEACHING_STAFF = ["Admin", "Principal", "Teacher"]
REVIEWERS = ["Admin", "Principal"]


# ---------------- payloads ----------------


class UnitCreate(BaseModel):
    class_subject_id: int
    title: str
    sequence_no: int | None = None
    description: str | None = None
    planned_periods: int | None = None
    planned_start: date | None = None
    planned_end: date | None = None


class UnitUpdate(BaseModel):
    title: str | None = None
    sequence_no: int | None = None
    description: str | None = None
    planned_periods: int | None = None
    planned_start: date | None = None
    planned_end: date | None = None
    status: str | None = None


class TopicCreate(BaseModel):
    title: str
    sequence_no: int | None = None
    description: str | None = None
    planned_periods: int = 1


class TopicMark(BaseModel):
    status: str
    on_date: date | None = None
    periods_taken: int | None = None
    notes: str | None = None


class CloneRequest(BaseModel):
    source_class_subject_id: int
    target_class_subject_id: int


class LessonPlanCreate(BaseModel):
    class_subject_id: int
    plan_date: date
    title: str
    teacher_id: int | None = None
    topic_id: int | None = None
    period_no: int | None = None
    objectives: str | None = None
    teaching_method: str | None = None
    resources: str | None = None
    homework: str | None = None


class LessonDeliver(BaseModel):
    note: str | None = None
    complete_topic: bool = False
    periods_taken: int | None = None


class Review(BaseModel):
    review_status: str
    note: str | None = None


# ---------------- responses ----------------


def _topic_response(t: models.SyllabusTopic) -> dict:
    return {
        "id": t.id, "unit_id": t.unit_id, "sequence_no": t.sequence_no,
        "title": t.title, "description": t.description,
        "planned_periods": t.planned_periods, "status": t.status,
        "completed_on": t.completed_on, "completed_by": t.completed_by,
        "periods_taken": t.periods_taken, "notes": t.notes,
    }


def _unit_response(u: models.SyllabusUnit, topics: list[models.SyllabusTopic] | None = None) -> dict:
    topics = topics if topics is not None else []
    body = {
        "id": u.id, "class_subject_id": u.class_subject_id,
        "sequence_no": u.sequence_no, "title": u.title,
        "description": u.description, "planned_periods": u.planned_periods,
        "planned_start": u.planned_start, "planned_end": u.planned_end,
        "status": u.status,
        "topics": [_topic_response(t) for t in topics],
    }
    body["progress"] = syllabus_logic.unit_progress(u, topics)
    return body


def _plan_response(p: models.LessonPlan, extras: dict | None = None) -> dict:
    extras = extras or {}
    return {
        "id": p.id, "class_subject_id": p.class_subject_id,
        "teacher_id": p.teacher_id, "teacher": extras.get(("teacher", p.teacher_id)),
        "topic_id": p.topic_id, "topic": extras.get(("topic", p.topic_id)),
        "plan_date": p.plan_date, "period_no": p.period_no,
        "title": p.title, "objectives": p.objectives,
        "teaching_method": p.teaching_method, "resources": p.resources,
        "homework": p.homework, "status": p.status,
        "delivered_at": p.delivered_at, "delivery_note": p.delivery_note,
        "review_status": p.review_status, "reviewed_by": p.reviewed_by,
        "reviewed_at": p.reviewed_at, "review_note": p.review_note,
        "created_by": p.created_by,
    }


def _class_subject(db: Session, class_subject_id: int) -> models.ClassSubject:
    row = (
        db.query(models.ClassSubject)
        .filter(models.ClassSubject.id == class_subject_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Class subject not found")
    return row


def _next_sequence(db: Session, model, filter_column, filter_value) -> int:
    rows = db.query(model.sequence_no).filter(filter_column == filter_value).all()
    return max([r[0] or 0 for r in rows], default=0) + 1


# ---------------- units ----------------


@router.get("/units")
def list_units(
    class_subject_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(TEACHING_STAFF)),
):
    _class_subject(db, class_subject_id)
    units = syllabus_logic.units_for(db, class_subject_id)
    grouped = syllabus_logic.topics_by_unit(db, [u.id for u in units])
    return [_unit_response(u, grouped.get(u.id, [])) for u in units]


@router.post("/units")
def create_unit(
    payload: UnitCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(TEACHING_STAFF)),
):
    _class_subject(db, payload.class_subject_id)
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="A unit title is required.")
    if payload.planned_start and payload.planned_end and payload.planned_end < payload.planned_start:
        raise HTTPException(status_code=400, detail="A unit cannot end before it starts.")

    unit = models.SyllabusUnit(
        class_subject_id=payload.class_subject_id,
        sequence_no=payload.sequence_no or _next_sequence(
            db, models.SyllabusUnit, models.SyllabusUnit.class_subject_id, payload.class_subject_id
        ),
        title=payload.title.strip(), description=payload.description,
        planned_periods=payload.planned_periods,
        planned_start=payload.planned_start, planned_end=payload.planned_end,
        status="Pending",
    )
    db.add(unit)
    db.commit()
    db.refresh(unit)
    return _unit_response(unit, [])


def _get_unit(db: Session, unit_id: int) -> models.SyllabusUnit:
    unit = db.query(models.SyllabusUnit).filter(models.SyllabusUnit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=404, detail="Syllabus unit not found")
    return unit


@router.put("/units/{unit_id}")
def update_unit(
    unit_id: int,
    payload: UnitUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(TEACHING_STAFF)),
):
    unit = _get_unit(db, unit_id)
    data = payload.model_dump(exclude_unset=True)

    if "status" in data and data["status"] not in syllabus_logic.UNIT_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Status must be one of: {', '.join(syllabus_logic.UNIT_STATUSES)}.",
        )
    for field, value in data.items():
        setattr(unit, field, value)

    if unit.planned_start and unit.planned_end and unit.planned_end < unit.planned_start:
        raise HTTPException(status_code=400, detail="A unit cannot end before it starts.")

    # A hand-set status only sticks on a unit with no topics; otherwise the
    # topics are the truth and the status is derived from them.
    syllabus_logic.recompute_unit_status(db, unit)
    db.commit()
    db.refresh(unit)

    topics = syllabus_logic.topics_by_unit(db, [unit.id]).get(unit.id, [])
    return _unit_response(unit, topics)


@router.delete("/units/{unit_id}")
def delete_unit(
    unit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(REVIEWERS)),
):
    unit = _get_unit(db, unit_id)
    if syllabus_logic.unit_has_progress(db, unit):
        raise HTTPException(
            status_code=400,
            detail="This unit has been taught from — deleting it would erase the record of what was covered.",
        )
    syllabus_logic.delete_unit(db, unit)
    return {"deleted": unit_id}


# ---------------- topics ----------------


@router.post("/units/{unit_id}/topics")
def add_topic(
    unit_id: int,
    payload: TopicCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(TEACHING_STAFF)),
):
    unit = _get_unit(db, unit_id)
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="A topic title is required.")
    if payload.planned_periods < 1:
        raise HTTPException(status_code=400, detail="A topic must be planned for at least one period.")

    topic = models.SyllabusTopic(
        unit_id=unit.id,
        sequence_no=payload.sequence_no or _next_sequence(
            db, models.SyllabusTopic, models.SyllabusTopic.unit_id, unit.id
        ),
        title=payload.title.strip(), description=payload.description,
        planned_periods=payload.planned_periods, status="Pending",
    )
    db.add(topic)
    syllabus_logic.recompute_unit_status(db, unit)
    db.commit()
    db.refresh(topic)
    return _topic_response(topic)


def _get_topic(db: Session, topic_id: int) -> models.SyllabusTopic:
    topic = db.query(models.SyllabusTopic).filter(models.SyllabusTopic.id == topic_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Syllabus topic not found")
    return topic


@router.post("/topics/{topic_id}/mark")
def mark_topic(
    topic_id: int,
    payload: TopicMark,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(TEACHING_STAFF)),
):
    """Move a topic along. Completing stamps who taught it and when."""
    topic = _get_topic(db, topic_id)
    if payload.on_date and payload.on_date > date.today():
        raise HTTPException(
            status_code=400,
            detail="A topic cannot be recorded as taught on a future date.",
        )
    try:
        topic = syllabus_logic.mark_topic(
            db, topic, payload.status, by=current_user.email,
            on_date=payload.on_date, periods_taken=payload.periods_taken,
            notes=payload.notes,
        )
    except syllabus_logic.SyllabusError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _topic_response(topic)


@router.delete("/topics/{topic_id}")
def delete_topic(
    topic_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(REVIEWERS)),
):
    topic = _get_topic(db, topic_id)
    if topic.status == "Completed":
        raise HTTPException(
            status_code=400,
            detail="This topic has been taught — deleting it would erase the record.",
        )
    syllabus_logic.delete_topic(db, topic)
    return {"deleted": topic_id}


# ---------------- coverage ----------------


@router.get("/coverage")
def coverage(
    class_subject_id: int,
    as_of: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(TEACHING_STAFF)),
):
    """How much of one subject's syllabus is taught, and whether that is on time."""
    class_subject = _class_subject(db, class_subject_id)
    body = syllabus_logic.subject_coverage(db, class_subject_id, as_of)
    body["subject_name"] = class_subject.subject_name
    body["academic_year"] = class_subject.academic_year
    body["expected_percent"] = syllabus_logic.expected_percent(
        db, class_subject.academic_year, as_of
    )
    return body


@router.get("/behind")
def behind(
    academic_year: str | None = None,
    as_of: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(TEACHING_STAFF)),
):
    """Every class-subject with a unit past its planned end and unfinished,
    worst first."""
    return syllabus_logic.behind_schedule(db, academic_year, as_of)


@router.post("/clone")
def clone(
    payload: CloneRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(TEACHING_STAFF)),
):
    """Copy a syllabus onto another class-subject, with progress reset."""
    _class_subject(db, payload.source_class_subject_id)
    _class_subject(db, payload.target_class_subject_id)
    try:
        copied = syllabus_logic.clone_syllabus(
            db, payload.source_class_subject_id, payload.target_class_subject_id
        )
    except syllabus_logic.SyllabusError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"units_copied": copied}


# ---------------- lesson plans ----------------


def _plan_extras(db: Session) -> dict:
    extras = {}
    for t in db.query(models.Teacher).all():
        extras[("teacher", t.id)] = t.name
    for t in db.query(models.SyllabusTopic).all():
        extras[("topic", t.id)] = t.title
    return extras


@router.get("/lesson-plans")
def list_plans(
    class_subject_id: int | None = None,
    teacher_id: int | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    status: str | None = None,
    review_status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(TEACHING_STAFF)),
):
    query = db.query(models.LessonPlan)
    if class_subject_id:
        query = query.filter(models.LessonPlan.class_subject_id == class_subject_id)
    if teacher_id:
        query = query.filter(models.LessonPlan.teacher_id == teacher_id)
    if from_date:
        query = query.filter(models.LessonPlan.plan_date >= from_date)
    if to_date:
        query = query.filter(models.LessonPlan.plan_date <= to_date)
    if status:
        query = query.filter(models.LessonPlan.status == status)
    if review_status:
        query = query.filter(models.LessonPlan.review_status == review_status)

    rows = query.order_by(models.LessonPlan.plan_date, models.LessonPlan.period_no).all()
    extras = _plan_extras(db)
    return [_plan_response(p, extras) for p in rows]


@router.post("/lesson-plans")
def create_plan(
    payload: LessonPlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(TEACHING_STAFF)),
):
    class_subject = _class_subject(db, payload.class_subject_id)
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="A lesson title is required.")

    if payload.topic_id:
        topic = _get_topic(db, payload.topic_id)
        unit = _get_unit(db, topic.unit_id)
        # A lesson pointing at another class's syllabus would quietly credit
        # coverage to the wrong class.
        if unit.class_subject_id != payload.class_subject_id:
            raise HTTPException(
                status_code=400,
                detail="That topic belongs to a different class subject's syllabus.",
            )

    teacher_id = payload.teacher_id or class_subject.teacher_id
    if teacher_id and not db.query(models.Teacher).filter(models.Teacher.id == teacher_id).first():
        raise HTTPException(status_code=404, detail="Teacher not found")

    plan = models.LessonPlan(
        class_subject_id=payload.class_subject_id,
        teacher_id=teacher_id, topic_id=payload.topic_id,
        plan_date=payload.plan_date, period_no=payload.period_no,
        title=payload.title.strip(), objectives=payload.objectives,
        teaching_method=payload.teaching_method, resources=payload.resources,
        homework=payload.homework, status="Planned", review_status="Pending",
        created_by=current_user.email,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return _plan_response(plan, _plan_extras(db))


def _get_plan(db: Session, plan_id: int) -> models.LessonPlan:
    plan = db.query(models.LessonPlan).filter(models.LessonPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Lesson plan not found")
    return plan


@router.post("/lesson-plans/{plan_id}/deliver")
def deliver_plan(
    plan_id: int,
    payload: LessonDeliver,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(TEACHING_STAFF)),
):
    """Record that the lesson happened, moving its topic on."""
    try:
        plan = syllabus_logic.deliver_lesson(
            db, _get_plan(db, plan_id), by=current_user.email, note=payload.note,
            complete_topic=payload.complete_topic, periods_taken=payload.periods_taken,
        )
    except syllabus_logic.SyllabusError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _plan_response(plan, _plan_extras(db))


@router.post("/lesson-plans/{plan_id}/defer")
def defer_plan(
    plan_id: int,
    payload: LessonDeliver,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(TEACHING_STAFF)),
):
    """The lesson did not happen. Recorded rather than deleted, because a
    week of deferred lessons is the signal a syllabus is slipping."""
    plan = _get_plan(db, plan_id)
    if plan.status == "Delivered":
        raise HTTPException(status_code=400, detail="This lesson was already delivered.")
    plan.status = "Deferred"
    plan.delivery_note = payload.note
    db.commit()
    db.refresh(plan)
    return _plan_response(plan, _plan_extras(db))


@router.post("/lesson-plans/{plan_id}/review")
def review_plan(
    plan_id: int,
    payload: Review,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(REVIEWERS)),
):
    if payload.review_status not in syllabus_logic.REVIEW_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Review status must be one of: {', '.join(syllabus_logic.REVIEW_STATUSES)}.",
        )
    plan = _get_plan(db, plan_id)
    plan.review_status = payload.review_status
    plan.reviewed_by = current_user.email
    plan.reviewed_at = datetime.utcnow()
    plan.review_note = payload.note
    db.commit()
    db.refresh(plan)
    return _plan_response(plan, _plan_extras(db))


@router.delete("/lesson-plans/{plan_id}")
def delete_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(TEACHING_STAFF)),
):
    plan = _get_plan(db, plan_id)
    if plan.status == "Delivered":
        raise HTTPException(
            status_code=400,
            detail="This lesson was delivered — cancel it instead of deleting the record.",
        )
    db.delete(plan)
    db.commit()
    return {"deleted": plan_id}
