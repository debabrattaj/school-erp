"""Event-driven notifications to staff.

Notifications are written as CommunicationLog rows and delivered through
the Communications module's channel router, so every message (and any
delivery failure) is visible on the Communications page. With no
SMTP/Twilio configured the transports run in log-only mode, so this is
safe in dev and becomes real mail/SMS once the env vars are set.

Helpers here must never raise — a failed notification must not break the
operation (e.g. student admission) that triggered it.
"""

import logging

from sqlalchemy.orm import Session

from app.models import CommunicationLog, SchoolClass, Student, Teacher

logger = logging.getLogger(__name__)


def find_class_teacher(db: Session, student: Student) -> Teacher | None:
    """Resolve the class teacher for a student's class, trying the
    strongest link first:

    1. a Teacher flagged is_class_teacher whose class_id matches the
       student's class_id;
    2. the same, after resolving class_id from the student's
       class_name + section;
    3. the class row's free-text class_teacher name matched against the
       Teacher list.
    """
    class_id = student.class_id
    school_class = None

    if not class_id and student.class_name:
        query = db.query(SchoolClass).filter(SchoolClass.class_name == student.class_name)
        if student.section:
            query = query.filter(SchoolClass.section == student.section)
        school_class = query.first()
        class_id = school_class.id if school_class else None

    if class_id:
        teacher = (
            db.query(Teacher)
            .filter(Teacher.class_id == class_id, Teacher.is_class_teacher.is_(True))
            .first()
        )
        if teacher:
            return teacher
        if school_class is None:
            school_class = db.query(SchoolClass).filter(SchoolClass.id == class_id).first()

    if school_class and school_class.class_teacher:
        return (
            db.query(Teacher)
            .filter(Teacher.name == school_class.class_teacher.strip())
            .first()
        )

    return None


def notify_class_teacher_new_student(db: Session, student: Student) -> None:
    """Email + SMS the class teacher that a student joined their class.

    Silently does nothing when the class has no resolvable teacher or the
    teacher has no contact details; never raises.
    """
    try:
        teacher = find_class_teacher(db, student)
        if not teacher or not (teacher.email or teacher.phone):
            logger.info(
                "New-student notification skipped for student %s: no reachable class teacher",
                student.id,
            )
            return

        student_name = f"{student.first_name} {student.last_name or ''}".strip()
        class_label = "-".join(part for part in [student.class_name, student.section] if part)
        body = (
            f"New student admitted to your class: {student_name} "
            f"(Admission No {student.admission_no}"
            f"{', Class ' + class_label if class_label else ''})."
        )

        logs = []
        if teacher.email:
            logs.append(
                CommunicationLog(
                    channel="Email",
                    category="Student Admission",
                    recipient_name=teacher.name,
                    recipient_email=teacher.email,
                    recipient_phone=teacher.phone,
                    message_body=body,
                    related_module="students",
                    related_record_id=student.id,
                )
            )
        if teacher.phone:
            logs.append(
                CommunicationLog(
                    channel="SMS",
                    category="Student Admission",
                    recipient_name=teacher.name,
                    recipient_phone=teacher.phone,
                    recipient_email=teacher.email,
                    message_body=body,
                    related_module="students",
                    related_record_id=student.id,
                )
            )

        # Imported here to keep module import order simple (routes import
        # this module's sibling utilities; no cycle either way today).
        from app.routes.communications import deliver_message

        for log in logs:
            db.add(log)
            deliver_message(log, db)

        db.commit()
    except Exception:  # noqa: BLE001 - notification must never break admission
        logger.exception("Failed to notify class teacher about student %s", student.id)
        db.rollback()
