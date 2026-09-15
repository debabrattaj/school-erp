"""Tenant-local correction history and server-side teacher record scope."""
import json
from sqlalchemy import event, inspect, or_, func
from sqlalchemy.orm import Session, with_loader_criteria
from fastapi import HTTPException
from app import models

HISTORY_TABLES = {
    "students", "attendance", "marks", "fees", "timetable_entries", "transport_assignments",
    "assignment_submissions", "admission_documents", "compliance_tasks", "payment_cases",
    "result_releases", "operational_snapshots", "attendance_registers", "student_enrollments",
}


def encode(value):
    return json.dumps(value, default=str, sort_keys=True, ensure_ascii=False)


def values(obj):
    return {c.key: getattr(obj, c.key) for c in inspect(obj).mapper.column_attrs}


def configure_session(db, user):
    db.info.pop("teacher_scope", None)
    db.info["actor"] = user.email
    db.info["user_role"] = user.role
    if user.role != "Teacher":
        return
    teacher_ids = [t.id for t in db.query(models.Teacher).filter(
        func.lower(models.Teacher.email) == user.email.lower()).all()]
    class_ids = {c.id for c in db.query(models.SchoolClass).filter(
        models.SchoolClass.class_teacher_id.in_(teacher_ids)).all()}
    class_ids.update(t.class_id for t in db.query(models.Teacher).filter(
        models.Teacher.id.in_(teacher_ids)).all() if t.class_id)
    class_ids.update(c.class_id for c in db.query(models.ClassSubject).filter(
        models.ClassSubject.teacher_id.in_(teacher_ids), models.ClassSubject.is_active.is_(True)).all())
    class_ids.update(t.class_id for t in db.query(models.TimetableEntry).filter(
        models.TimetableEntry.teacher_id.in_(teacher_ids)).all() if t.class_id)
    classes = db.query(models.SchoolClass).filter(models.SchoolClass.id.in_(class_ids)).all()
    match = [models.Student.class_id.in_(class_ids)]
    for c in classes:
        match.append((models.Student.class_id.is_(None)) &
                     (models.Student.class_name == c.class_name) & (models.Student.section == c.section))
    student_ids = [s.id for s in db.query(models.Student).filter(or_(*match)).all()]
    db.info["teacher_scope"] = {"classes": tuple(class_ids), "students": tuple(student_ids),
                                "labels": tuple((c.class_name, c.section) for c in classes)}


@event.listens_for(Session, "do_orm_execute")
def scope_reads(state):
    scope = state.session.info.get("teacher_scope")
    if not scope or not state.is_select:
        return
    filters = [(models.Student, models.Student.id.in_(scope["students"])),
               (models.SchoolClass, models.SchoolClass.id.in_(scope["classes"]))]
    for cls in (models.Attendance, models.Mark, models.Fee, models.StudentEnrollment,
                models.AssignmentSubmission, models.ResultRelease):
        filters.append((cls, cls.student_id.in_(scope["students"])))
    for cls in (models.ClassSubject, models.TimetableEntry, models.AttendanceRegister):
        filters.append((cls, cls.class_id.in_(scope["classes"])))
    for cls in (models.Exam, models.Assignment):
        filters.append((cls, or_(*[(cls.class_name == name) &
                                  (or_(cls.section == section, cls.section.is_(None), cls.section == ""))
                                  for name, section in scope["labels"]], False)))
    for cls, criterion in filters:
        state.statement = state.statement.options(with_loader_criteria(cls, criterion, include_aliases=True))


@event.listens_for(Session, "before_flush")
def check_and_record(session, flush_context, instances):
    actor = session.info.get("actor")
    scope = session.info.get("teacher_scope")
    pending = []
    for obj in list(session.new) + list(session.dirty) + list(session.deleted):
        if scope and isinstance(obj, (models.Exam, models.Assignment)):
            if not any(obj.class_name == name and (not obj.section or obj.section == section)
                       for name, section in scope["labels"]):
                raise HTTPException(403, "This class is not assigned to you.")
        table = getattr(obj, "__table__", None)
        if table is None or table.name not in HISTORY_TABLES:
            continue
        if obj in session.dirty and not session.is_modified(obj, include_collections=False):
            continue
        if scope:
            if isinstance(obj, models.Student):
                if obj.id not in scope["students"] or (obj.class_id and obj.class_id not in scope["classes"]):
                    raise HTTPException(403, "This student is outside your assigned classes.")
            elif hasattr(obj, "student_id") and obj.student_id not in scope["students"]:
                raise HTTPException(403, "This student is outside your assigned classes.")
            if hasattr(obj, "class_id") and obj.class_id and obj.class_id not in scope["classes"]:
                raise HTTPException(403, "This class is not assigned to you.")
        if not actor:
            continue
        before = None
        if obj not in session.new:
            row = session.connection().execute(table.select().where(table.c.id == obj.id)).mappings().first()
            before = dict(row) if row else None
        action = "Deleted" if obj in session.deleted else "Created" if obj in session.new else "Updated"
        if isinstance(obj, models.Attendance) and action != "Created":
            slots = {(obj.class_id, obj.attendance_date, obj.period_no)}
            if before:
                slots.add((before["class_id"], before["attendance_date"], before["period_no"]))
            for class_id, day, period in slots:
                register = session.query(models.AttendanceRegister).filter(
                    models.AttendanceRegister.class_id == class_id,
                    models.AttendanceRegister.attendance_date == day,
                    models.AttendanceRegister.period_no == period).first()
                if register and register.status != "Needs review":
                    pending.append((register, "attendance_registers", values(register), "Updated"))
                    register.status = "Needs review"
        pending.append((obj, table.name, before, action))
    session.info.setdefault("pending_revisions", []).extend(pending)


@event.listens_for(Session, "after_flush_postexec")
def finish_revisions(session, flush_context):
    for obj, entity, before, action in session.info.pop("pending_revisions", []):
        session.add(models.RecordRevision(
            entity=entity, entity_id=obj.id, action=action,
            before_json=encode(before) if before is not None else None,
            after_json=encode(values(obj)) if action != "Deleted" else None,
            actor=session.info["actor"], reason=session.info.get("change_reason")))


@event.listens_for(Session, "after_rollback")
def clear_revisions(session):
    session.info.pop("pending_revisions", None)
