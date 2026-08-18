import json
import random
from datetime import date, datetime, timedelta
from urllib.parse import quote, urlencode

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.models import User
from app.routes.fees import calculate_fee_status, generate_receipt_no, get_settings
from app.security import require_roles
from app.tenant import require_feature

router = APIRouter(
    prefix="/portal",
    tags=["Parent/Student Portal"],
)

PORTAL_ROLES = ["Parent", "Student", "Admin", "Principal"]
ADMIN_ROLES = ["Admin", "Principal"]


def get_linked_student_ids(db: Session, user: User) -> list[int]:
    links = (
        db.query(models.ParentStudentLink)
        .filter(models.ParentStudentLink.user_id == user.id)
        .all()
    )
    return [link.student_id for link in links]


def ensure_student_access(db: Session, user: User, student_id: int) -> models.Student:
    """Hard server-side check: Parent/Student users can only access students
    they are explicitly linked to. Admin/Principal can access any student."""
    student = (
        db.query(models.Student)
        .filter(models.Student.id == student_id)
        .first()
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    if user.role in ADMIN_ROLES:
        return student

    link = (
        db.query(models.ParentStudentLink)
        .filter(
            models.ParentStudentLink.user_id == user.id,
            models.ParentStudentLink.student_id == student_id,
        )
        .first()
    )
    if not link:
        raise HTTPException(
            status_code=403,
            detail="You do not have access to this student",
        )
    return student


def serialize_student_card(student: models.Student):
    return {
        "id": student.id,
        "admission_no": student.admission_no,
        "first_name": student.first_name,
        "last_name": student.last_name,
        "full_name": " ".join(filter(None, [student.first_name, student.last_name])),
        "class_name": student.class_name,
        "section": student.section,
        "roll_no": student.roll_no,
        "photo_url": student.photo_url,
        "student_status": student.student_status,
        "house": student.house,
    }


# ---------------- Portal data endpoints ----------------


@router.get("/children")
def list_my_children(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(PORTAL_ROLES)),
):
    student_ids = get_linked_student_ids(db, current_user)
    if not student_ids:
        return []

    students = (
        db.query(models.Student)
        .filter(models.Student.id.in_(student_ids))
        .all()
    )
    return [serialize_student_card(student) for student in students]


@router.get("/students/{student_id}/summary")
def portal_student_summary(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(PORTAL_ROLES)),
):
    student = ensure_student_access(db, current_user, student_id)

    current_year = (
        db.query(models.AcademicYear)
        .filter(models.AcademicYear.is_current == True)  # noqa: E712
        .first()
    )

    current_enrollment = None
    enrollment = None
    if current_year:
        enrollment = (
            db.query(models.StudentEnrollment)
            .filter(
                models.StudentEnrollment.student_id == student_id,
                models.StudentEnrollment.enrollment_status == "Active",
                models.StudentEnrollment.academic_year == current_year.name,
            )
            .first()
        )
    if not enrollment:
        enrollment = (
            db.query(models.StudentEnrollment)
            .filter(
                models.StudentEnrollment.student_id == student_id,
                models.StudentEnrollment.enrollment_status == "Active",
            )
            .order_by(models.StudentEnrollment.academic_year.desc())
            .first()
        )
    if enrollment:
        current_enrollment = {
            "academic_year": enrollment.academic_year,
            "class_name": enrollment.class_name_snapshot,
            "section": enrollment.section_snapshot,
            "roll_no": enrollment.roll_no,
        }
    elif student.class_name or student.section or student.roll_no:
        # No enrollment record yet (e.g. enrollments not synced for the year).
        # Fall back to the student's own current class/section/roll so the portal
        # shows real data instead of blanks.
        current_enrollment = {
            "academic_year": current_year.name if current_year else None,
            "class_name": student.class_name,
            "section": student.section,
            "roll_no": student.roll_no,
        }

    return {
        "student": serialize_student_card(student),
        "guardian": {
            "father_name": student.father_name,
            "mother_name": student.mother_name,
            "guardian_name": student.guardian_name,
        },
        "current_academic_year": current_year.name if current_year else None,
        "current_enrollment": current_enrollment,
    }


@router.get("/students/{student_id}/attendance")
def portal_student_attendance(
    student_id: int,
    academic_year: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(PORTAL_ROLES)),
):
    ensure_student_access(db, current_user, student_id)

    query = db.query(models.Attendance).filter(
        models.Attendance.student_id == student_id
    )
    if academic_year:
        query = query.filter(models.Attendance.academic_year == academic_year)

    records = query.order_by(models.Attendance.attendance_date.desc()).all()

    counts = {"Present": 0, "Absent": 0, "Late": 0, "Half Day": 0}
    for record in records:
        if record.status in counts:
            counts[record.status] += 1

    total = len(records)
    attended = counts["Present"] + counts["Late"] + counts["Half Day"] * 0.5
    percentage = round((attended / total) * 100, 1) if total else None

    return {
        "total_days": total,
        "counts": counts,
        "attendance_percentage": percentage,
        "records": [
            {
                "date": record.attendance_date,
                "status": record.status,
                "academic_year": record.academic_year,
                "remarks": record.remarks,
            }
            for record in records
        ],
    }


@router.get("/students/{student_id}/marks")
def portal_student_marks(
    student_id: int,
    academic_year: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(PORTAL_ROLES)),
):
    ensure_student_access(db, current_user, student_id)

    query = db.query(models.Mark).filter(models.Mark.student_id == student_id)
    if academic_year:
        query = query.filter(models.Mark.academic_year == academic_year)

    marks = query.all()

    exams = {}
    for mark in marks:
        exam_key = mark.exam_name_snapshot or f"Exam #{mark.exam_id}"
        group = exams.setdefault(
            exam_key,
            {
                "exam_name": exam_key,
                "academic_year": mark.academic_year,
                "subjects": [],
                "total_obtained": 0,
                "total_max": 0,
            },
        )
        max_marks = mark.max_marks or mark.total_marks or 100
        group["subjects"].append(
            {
                "subject": mark.subject_name or mark.subject or "-",
                "marks_obtained": mark.marks_obtained,
                "max_marks": max_marks,
                "grade": mark.grade,
            }
        )
        group["total_obtained"] += mark.marks_obtained or 0
        group["total_max"] += max_marks

    for group in exams.values():
        group["percentage"] = (
            round((group["total_obtained"] / group["total_max"]) * 100, 1)
            if group["total_max"]
            else None
        )

    return {"exams": list(exams.values())}


@router.get("/students/{student_id}/fees")
def portal_student_fees(
    student_id: int,
    academic_year: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(PORTAL_ROLES)),
):
    ensure_student_access(db, current_user, student_id)

    query = db.query(models.Fee).filter(models.Fee.student_id == student_id)
    if academic_year:
        query = query.filter(models.Fee.academic_year == academic_year)

    fees = query.all()

    total_amount = sum((fee.total_amount or 0) for fee in fees)
    total_paid = sum((fee.paid_amount or 0) for fee in fees)
    total_due = sum((fee.due_amount or 0) for fee in fees)

    return {
        "totals": {
            "total_amount": total_amount,
            "total_paid": total_paid,
            "total_due": total_due,
        },
        "fees": [
            {
                "id": fee.id,
                "fee_type": fee.fee_type,
                "academic_year": fee.academic_year,
                "total_amount": fee.total_amount,
                "paid_amount": fee.paid_amount,
                "due_amount": fee.due_amount,
                "payment_status": fee.payment_status,
                "payment_date": fee.payment_date,
                "receipt_no": fee.receipt_no,
                "remarks": fee.remarks,
            }
            for fee in fees
        ],
    }


class PortalUpiConfirmRequest(BaseModel):
    reference: str


@router.get("/payment/config")
def portal_payment_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(PORTAL_ROLES)),
):
    """Whether UPI payment is available, for the portal's own fee-payment UI."""
    settings = get_settings(db)
    upi_id = (settings.upi_id or "").strip()
    return {
        "enabled": bool(upi_id),
        "upi_id": upi_id,
        "payee_name": settings.school_name or "School",
        "currency": (settings.currency or "INR").upper(),
    }


@router.get("/students/{student_id}/fees/{fee_id}/payment/upi")
def portal_upi_payment_details(
    student_id: int,
    fee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(PORTAL_ROLES)),
):
    """UPI deep link (upi://pay) for a fee's outstanding balance. Parents/students
    may only fetch this for a fee that belongs to a student they are linked to."""
    ensure_student_access(db, current_user, student_id)

    settings = get_settings(db)
    upi_id = (settings.upi_id or "").strip()
    if not upi_id:
        raise HTTPException(
            status_code=400,
            detail="UPI payment is not configured. Please contact the school office.",
        )

    fee = (
        db.query(models.Fee)
        .filter(models.Fee.id == fee_id, models.Fee.student_id == student_id)
        .first()
    )
    if not fee:
        raise HTTPException(status_code=404, detail="Fee record not found")

    balance = max((fee.total_amount or 0) - (fee.paid_amount or 0), 0)
    if balance <= 0:
        raise HTTPException(status_code=400, detail="This fee has no outstanding balance.")

    payee_name = settings.school_name or "School"
    note = f"Fee #{fee.id} {fee.fee_type or ''}".strip()
    params = urlencode(
        {
            "pa": upi_id,
            "pn": payee_name,
            "am": f"{balance:.2f}",
            "cu": "INR",
            "tn": note[:80],
        },
        quote_via=quote,
    )

    return {
        "upi_id": upi_id,
        "payee_name": payee_name,
        "amount": round(balance, 2),
        "currency": "INR",
        "note": note[:80],
        "uri": f"upi://pay?{params}",
    }


@router.post("/students/{student_id}/fees/{fee_id}/payment/upi/confirm")
def portal_confirm_upi_payment(
    student_id: int,
    fee_id: int,
    payload: PortalUpiConfirmRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(PORTAL_ROLES)),
):
    """Record a completed UPI payment (with its UTR/reference) and settle the
    balance. Ownership-checked the same way as every other portal route."""
    ensure_student_access(db, current_user, student_id)

    reference = (payload.reference or "").strip()
    if not reference:
        raise HTTPException(
            status_code=400,
            detail="Enter the UPI transaction reference (UTR) to confirm the payment.",
        )

    fee = (
        db.query(models.Fee)
        .filter(models.Fee.id == fee_id, models.Fee.student_id == student_id)
        .first()
    )
    if not fee:
        raise HTTPException(status_code=404, detail="Fee record not found")

    balance = max((fee.total_amount or 0) - (fee.paid_amount or 0), 0)
    if balance <= 0:
        raise HTTPException(status_code=400, detail="This fee has no outstanding balance.")

    fee.paid_amount = fee.total_amount
    fee.payment_date = datetime.now().date()
    due_amount, payment_status = calculate_fee_status(fee.total_amount, fee.paid_amount)
    fee.due_amount = due_amount
    fee.payment_status = payment_status
    if not fee.receipt_no:
        fee.receipt_no = generate_receipt_no(db)

    upi_note = f"UPI Ref: {reference}"
    fee.remarks = f"{fee.remarks} | {upi_note}" if fee.remarks else upi_note

    db.commit()
    db.refresh(fee)
    return {
        "id": fee.id,
        "fee_type": fee.fee_type,
        "academic_year": fee.academic_year,
        "total_amount": fee.total_amount,
        "paid_amount": fee.paid_amount,
        "due_amount": fee.due_amount,
        "payment_status": fee.payment_status,
        "payment_date": fee.payment_date,
        "receipt_no": fee.receipt_no,
        "remarks": fee.remarks,
    }


@router.get("/students/{student_id}/enrollments")
def portal_student_enrollments(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(PORTAL_ROLES)),
):
    ensure_student_access(db, current_user, student_id)

    enrollments = (
        db.query(models.StudentEnrollment)
        .filter(models.StudentEnrollment.student_id == student_id)
        .order_by(models.StudentEnrollment.academic_year.desc())
        .all()
    )

    return [
        {
            "academic_year": enrollment.academic_year,
            "class_name": enrollment.class_name_snapshot,
            "section": enrollment.section_snapshot,
            "roll_no": enrollment.roll_no,
            "enrollment_status": enrollment.enrollment_status,
            "promotion_status": enrollment.promotion_status,
            "start_date": enrollment.start_date,
            "end_date": enrollment.end_date,
        }
        for enrollment in enrollments
    ]


VALID_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


@router.get("/students/{student_id}/timetable")
def portal_student_timetable(
    student_id: int,
    academic_year: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(PORTAL_ROLES)),
):
    student = ensure_student_access(db, current_user, student_id)

    query = db.query(models.TimetableEntry).filter(
        models.TimetableEntry.class_name_snapshot == student.class_name,
        models.TimetableEntry.section_snapshot == student.section,
    )
    if academic_year:
        query = query.filter(models.TimetableEntry.academic_year == academic_year)

    entries = query.all()
    entries.sort(
        key=lambda e: (
            VALID_DAYS.index(e.day_of_week) if e.day_of_week in VALID_DAYS else len(VALID_DAYS),
            e.period_no,
        )
    )

    return [
        {
            "day_of_week": entry.day_of_week,
            "period_no": entry.period_no,
            "entry_type": entry.entry_type,
            "label": entry.label,
            "start_time": entry.start_time,
            "end_time": entry.end_time,
            "subject": entry.subject,
            "teacher_name": entry.teacher_name_snapshot,
            "room": entry.room,
        }
        for entry in entries
    ]


@router.get("/students/{student_id}/homework")
def portal_student_homework(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(PORTAL_ROLES)),
):
    student = ensure_student_access(db, current_user, student_id)

    query = db.query(models.Assignment).filter(models.Assignment.class_name == student.class_name)
    if student.section:
        query = query.filter(
            (models.Assignment.section == student.section) | (models.Assignment.section.is_(None))
        )

    assignments = query.order_by(
        models.Assignment.due_date.desc().nullslast(), models.Assignment.id.desc()
    ).all()

    return [
        {
            "id": a.id,
            "subject": a.subject,
            "title": a.title,
            "description": a.description,
            "due_date": a.due_date,
            "attachment_url": a.attachment_url,
            "teacher_name": a.teacher_name_snapshot,
            "created_at": a.created_at,
        }
        for a in assignments
    ]


MESSAGE_ROLES = PORTAL_ROLES + ["Teacher"]


def ensure_message_access(db: Session, user: User, student_id: int) -> models.Student:
    """Same as ensure_student_access, but Teachers get staff-level access too
    (they're not linked to students via ParentStudentLink like guardians are).
    """
    if user.role == "Teacher":
        student = db.query(models.Student).filter(models.Student.id == student_id).first()
        if not student:
            raise HTTPException(status_code=404, detail="Student not found")
        return student
    return ensure_student_access(db, user, student_id)


@router.get("/students/{student_id}/messages", response_model=list[schemas.PortalMessageResponse])
def portal_list_messages(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MESSAGE_ROLES)),
):
    ensure_message_access(db, current_user, student_id)
    return (
        db.query(models.PortalMessage)
        .filter(models.PortalMessage.student_id == student_id)
        .order_by(models.PortalMessage.created_at.asc(), models.PortalMessage.id.asc())
        .all()
    )


@router.post("/students/{student_id}/messages", response_model=schemas.PortalMessageResponse)
def portal_send_message(
    student_id: int,
    payload: schemas.PortalMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MESSAGE_ROLES)),
):
    ensure_message_access(db, current_user, student_id)

    body = (payload.body or "").strip()
    if not body:
        raise HTTPException(status_code=400, detail="Message body is required")

    message = models.PortalMessage(
        student_id=student_id,
        sender_user_id=current_user.id,
        sender_name=current_user.name,
        sender_role=current_user.role,
        is_staff=current_user.role in ("Admin", "Principal", "Teacher"),
        body=body,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


# ---------------- Online tests ----------------

# Online Tests is sold separately. The portal router is shared with every
# other portal endpoint, so the entitlement check is attached per route
# here rather than to the router as a whole (see routes/online_tests.py).
ONLINE_TEST_GATE = [Depends(require_feature("online_tests"))]


def _online_test_is_open(test: models.OnlineTest) -> bool:
    if test.status != "Published":
        return False
    now = datetime.utcnow()
    if test.starts_at and now < test.starts_at:
        return False
    if test.ends_at and now > test.ends_at:
        return False
    return True


# Slack allowed past a deadline before a submission is treated as late. The
# browser auto-submits the instant its countdown hits zero, so the request still
# has to survive network latency and any clock skew between client and server.
SUBMIT_GRACE_SECONDS = 60


def _attempt_deadline(test: models.OnlineTest, attempt: models.OnlineTestAttempt):
    """When this attempt stops accepting answers, or None if it never does.

    Two independent limits apply and the earlier one wins: the per-attempt
    duration (counted from when the student first opened the test) and the
    test's own ends_at window.
    """
    deadline = None
    if test.duration_minutes and attempt.started_at:
        deadline = attempt.started_at + timedelta(minutes=test.duration_minutes)
    if test.ends_at and (deadline is None or test.ends_at < deadline):
        deadline = test.ends_at
    return deadline


def _expiry_reason(test: models.OnlineTest, attempt: models.OnlineTestAttempt) -> str:
    """Which of the two limits closed the attempt, for the teacher's benefit."""
    if test.duration_minutes and attempt.started_at:
        duration_deadline = attempt.started_at + timedelta(minutes=test.duration_minutes)
        if test.ends_at and test.ends_at < duration_deadline:
            return "window_closed"
        return "time_expired"
    return "window_closed"


def _shuffled_for_attempt(items: list, attempt_id: int, salt: int = 0) -> list:
    """Deterministically reorder items for one attempt.

    Seeded from the attempt id so a student who reloads mid-test sees the same
    order they started with, while two students sitting the same test get
    different orders. Never call this with the attempt id alone for both the
    question list and the option lists -- pass a per-question salt so the two
    orderings don't correlate.
    """
    ordered = list(items)
    random.Random(f"{attempt_id}:{salt}").shuffle(ordered)
    return ordered


def _question_public(
    question: models.OnlineTestQuestion,
    reveal_answer: bool = False,
    shuffle_options_for_attempt: int | None = None,
):
    options = json.loads(question.options) if question.options else None
    if options and shuffle_options_for_attempt is not None:
        options = _shuffled_for_attempt(options, shuffle_options_for_attempt, salt=question.id)
    data = {
        "id": question.id,
        "question_type": question.question_type,
        "question_text": question.question_text,
        "options": options,
        "marks": question.marks,
        "sort_order": question.sort_order,
    }
    if reveal_answer:
        data["correct_option"] = question.correct_option
    return data


def _grade_attempt(
    db: Session,
    test_id: int,
    attempt: models.OnlineTestAttempt,
    reason: str | None = None,
    submitted_at: datetime | None = None,
):
    """Close and score an attempt from the answers already persisted for it.

    Grading always reads the saved OnlineTestAnswer rows rather than a request
    payload, so an attempt that times out is scored on the work the student had
    actually saved — not zeroed for never having pressed Submit.
    """
    questions = (
        db.query(models.OnlineTestQuestion)
        .filter(models.OnlineTestQuestion.test_id == test_id)
        .all()
    )
    saved = {
        a.question_id: a
        for a in db.query(models.OnlineTestAnswer)
        .filter(models.OnlineTestAnswer.attempt_id == attempt.id)
        .all()
    }

    total_score = 0.0
    max_score = 0.0
    for question in questions:
        max_score += question.marks or 0
        answer = saved.get(question.id)
        selected = answer.selected_option if answer else None
        is_correct = selected is not None and selected == question.correct_option
        marks_awarded = (question.marks or 0) if is_correct else 0
        total_score += marks_awarded

        if answer:
            answer.is_correct = is_correct
            answer.marks_awarded = marks_awarded
        else:
            db.add(models.OnlineTestAnswer(
                attempt_id=attempt.id,
                question_id=question.id,
                selected_option=None,
                is_correct=False,
                marks_awarded=0,
            ))

    attempt.status = "Submitted"
    attempt.submitted_at = submitted_at or datetime.utcnow()
    attempt.score = total_score
    attempt.max_score = max_score
    attempt.auto_submitted_reason = reason

    db.commit()
    db.refresh(attempt)
    return attempt


def _expire_attempt_if_due(db: Session, test: models.OnlineTest, attempt: models.OnlineTestAttempt):
    """Close an in-progress attempt that has run past its deadline.

    Called whenever an attempt is loaded, so a student who leaves a test open
    and comes back later finds it closed at the deadline rather than resumable.
    """
    if attempt.status == "Submitted":
        return attempt
    deadline = _attempt_deadline(test, attempt)
    if deadline and datetime.utcnow() > deadline + timedelta(seconds=SUBMIT_GRACE_SECONDS):
        return _grade_attempt(
            db,
            test.id,
            attempt,
            reason=_expiry_reason(test, attempt),
            submitted_at=deadline,
        )
    return attempt


@router.get("/students/{student_id}/online-tests", dependencies=ONLINE_TEST_GATE)
def portal_list_online_tests(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(PORTAL_ROLES)),
):
    student = ensure_student_access(db, current_user, student_id)

    query = db.query(models.OnlineTest).filter(
        models.OnlineTest.class_name == student.class_name,
        models.OnlineTest.status.in_(["Published", "Closed"]),
    )
    if student.section:
        query = query.filter(
            (models.OnlineTest.section == student.section) | (models.OnlineTest.section.is_(None))
        )
    tests = query.order_by(models.OnlineTest.id.desc()).all()

    attempts = {
        a.test_id: a
        for a in db.query(models.OnlineTestAttempt).filter(
            models.OnlineTestAttempt.student_id == student_id,
            models.OnlineTestAttempt.test_id.in_([t.id for t in tests]),
        ).all()
    } if tests else {}

    results = []
    for test in tests:
        questions = db.query(models.OnlineTestQuestion).filter(
            models.OnlineTestQuestion.test_id == test.id
        ).all()
        attempt = attempts.get(test.id)
        results.append({
            "id": test.id,
            "subject": test.subject,
            "title": test.title,
            "description": test.description,
            "duration_minutes": test.duration_minutes,
            "starts_at": test.starts_at,
            "ends_at": test.ends_at,
            "total_marks": sum(q.marks or 0 for q in questions),
            "question_count": len(questions),
            "is_open": _online_test_is_open(test),
            "attempt_status": attempt.status if attempt else None,
            "score": attempt.score if attempt else None,
            "max_score": attempt.max_score if attempt else None,
        })
    return results


@router.get("/students/{student_id}/online-tests/{test_id}", dependencies=ONLINE_TEST_GATE)
def portal_get_online_test(
    student_id: int,
    test_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(PORTAL_ROLES)),
):
    student = ensure_student_access(db, current_user, student_id)

    test = db.query(models.OnlineTest).filter(models.OnlineTest.id == test_id).first()
    if not test or test.class_name != student.class_name or test.status not in ("Published", "Closed"):
        raise HTTPException(status_code=404, detail="Test not found")
    if test.section and test.section != student.section:
        raise HTTPException(status_code=404, detail="Test not found")

    attempt = (
        db.query(models.OnlineTestAttempt)
        .filter(models.OnlineTestAttempt.test_id == test_id, models.OnlineTestAttempt.student_id == student_id)
        .first()
    )

    if not attempt:
        if current_user.role != "Student":
            raise HTTPException(status_code=403, detail="Only the student can start this test")
        if not _online_test_is_open(test):
            raise HTTPException(status_code=400, detail="This test is not currently open")

        questions = db.query(models.OnlineTestQuestion).filter(
            models.OnlineTestQuestion.test_id == test_id
        ).order_by(models.OnlineTestQuestion.sort_order).all()
        if not questions:
            raise HTTPException(status_code=400, detail="This test has no questions yet")

        attempt = models.OnlineTestAttempt(test_id=test_id, student_id=student_id, status="In Progress")
        db.add(attempt)
        db.commit()
        db.refresh(attempt)

    # An attempt left open past its deadline is closed here rather than resumed.
    attempt = _expire_attempt_if_due(db, test, attempt)

    questions = db.query(models.OnlineTestQuestion).filter(
        models.OnlineTestQuestion.test_id == test_id
    ).order_by(models.OnlineTestQuestion.sort_order).all()

    submitted = attempt.status == "Submitted"

    # Answers are saved as the student goes, so they're read back for an
    # in-progress attempt too -- reloading mid-test restores the selections.
    answers_by_question = {
        answer.question_id: answer
        for answer in db.query(models.OnlineTestAnswer)
        .filter(models.OnlineTestAnswer.attempt_id == attempt.id)
        .all()
    }

    # Shuffling is a review aid once the test is over, not an anti-copying
    # measure, so the original order comes back after submission.
    if test.shuffle_questions and not submitted:
        questions = _shuffled_for_attempt(questions, attempt.id)
    shuffle_options_for = attempt.id if (test.shuffle_options and not submitted) else None

    return {
        "test": {
            "id": test.id,
            "title": test.title,
            "subject": test.subject,
            "description": test.description,
            "duration_minutes": test.duration_minutes,
            "ends_at": test.ends_at,
        },
        "attempt": {
            "id": attempt.id,
            "status": attempt.status,
            "started_at": attempt.started_at,
            "submitted_at": attempt.submitted_at,
            "score": attempt.score,
            "max_score": attempt.max_score,
            "auto_submitted_reason": attempt.auto_submitted_reason,
            "deadline": _attempt_deadline(test, attempt),
        },
        "questions": [
            {
                **_question_public(
                    q,
                    reveal_answer=submitted,
                    shuffle_options_for_attempt=shuffle_options_for,
                ),
                "selected_option": answers_by_question[q.id].selected_option if q.id in answers_by_question else None,
                "is_correct": answers_by_question[q.id].is_correct if q.id in answers_by_question else None,
            }
            for q in questions
        ],
    }


@router.post("/students/{student_id}/online-tests/{test_id}/answer", dependencies=ONLINE_TEST_GATE)
def portal_save_online_test_answer(
    student_id: int,
    test_id: int,
    payload: schemas.OnlineTestAnswerSubmit,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(PORTAL_ROLES)),
):
    """Save a single answer mid-attempt, before the student submits.

    Without this the server holds nothing until Submit arrives, so enforcing the
    timer would mean scoring a timed-out student on an empty answer sheet.
    """
    ensure_student_access(db, current_user, student_id)
    if current_user.role != "Student":
        raise HTTPException(status_code=403, detail="Only the student can answer this test")

    test = db.query(models.OnlineTest).filter(models.OnlineTest.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    attempt = (
        db.query(models.OnlineTestAttempt)
        .filter(models.OnlineTestAttempt.test_id == test_id, models.OnlineTestAttempt.student_id == student_id)
        .first()
    )
    if not attempt:
        raise HTTPException(status_code=404, detail="No attempt found for this test — open it first")

    attempt = _expire_attempt_if_due(db, test, attempt)
    if attempt.status == "Submitted":
        raise HTTPException(status_code=400, detail="This test is no longer open for answers")

    question = (
        db.query(models.OnlineTestQuestion)
        .filter(
            models.OnlineTestQuestion.id == payload.question_id,
            models.OnlineTestQuestion.test_id == test_id,
        )
        .first()
    )
    if not question:
        raise HTTPException(status_code=404, detail="Question not found on this test")

    answer = (
        db.query(models.OnlineTestAnswer)
        .filter(
            models.OnlineTestAnswer.attempt_id == attempt.id,
            models.OnlineTestAnswer.question_id == question.id,
        )
        .first()
    )
    if answer:
        answer.selected_option = payload.selected_option
    else:
        # Left ungraded on purpose -- grading happens once, at _grade_attempt.
        db.add(models.OnlineTestAnswer(
            attempt_id=attempt.id,
            question_id=question.id,
            selected_option=payload.selected_option,
            is_correct=None,
            marks_awarded=0,
        ))

    db.commit()
    return {"saved": True, "question_id": question.id}


@router.post("/students/{student_id}/online-tests/{test_id}/submit", dependencies=ONLINE_TEST_GATE)
def portal_submit_online_test(
    student_id: int,
    test_id: int,
    payload: schemas.OnlineTestSubmitRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(PORTAL_ROLES)),
):
    ensure_student_access(db, current_user, student_id)
    if current_user.role != "Student":
        raise HTTPException(status_code=403, detail="Only the student can submit this test")

    attempt = (
        db.query(models.OnlineTestAttempt)
        .filter(models.OnlineTestAttempt.test_id == test_id, models.OnlineTestAttempt.student_id == student_id)
        .first()
    )
    if not attempt:
        raise HTTPException(status_code=404, detail="No attempt found for this test — open it first")
    if attempt.status == "Submitted":
        raise HTTPException(status_code=400, detail="This test has already been submitted")

    test = db.query(models.OnlineTest).filter(models.OnlineTest.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")

    # Past the deadline the payload is refused outright -- otherwise the timer
    # is only ever a client-side suggestion. The attempt is still scored, on
    # whatever the student had saved before time ran out.
    deadline = _attempt_deadline(test, attempt)
    if deadline and datetime.utcnow() > deadline + timedelta(seconds=SUBMIT_GRACE_SECONDS):
        attempt = _grade_attempt(
            db,
            test_id,
            attempt,
            reason=_expiry_reason(test, attempt),
            submitted_at=deadline,
        )
        return {
            "id": attempt.id,
            "status": attempt.status,
            "score": attempt.score,
            "max_score": attempt.max_score,
            "auto_submitted_reason": attempt.auto_submitted_reason,
        }

    valid_question_ids = {
        q.id
        for q in db.query(models.OnlineTestQuestion.id)
        .filter(models.OnlineTestQuestion.test_id == test_id)
        .all()
    }
    saved = {
        a.question_id: a
        for a in db.query(models.OnlineTestAnswer)
        .filter(models.OnlineTestAnswer.attempt_id == attempt.id)
        .all()
    }
    for submitted_answer in payload.answers:
        if submitted_answer.question_id not in valid_question_ids:
            continue
        answer = saved.get(submitted_answer.question_id)
        if answer:
            answer.selected_option = submitted_answer.selected_option
        else:
            db.add(models.OnlineTestAnswer(
                attempt_id=attempt.id,
                question_id=submitted_answer.question_id,
                selected_option=submitted_answer.selected_option,
                is_correct=None,
                marks_awarded=0,
            ))
    db.flush()

    attempt = _grade_attempt(db, test_id, attempt)
    return {
        "id": attempt.id,
        "status": attempt.status,
        "score": attempt.score,
        "max_score": attempt.max_score,
        "auto_submitted_reason": attempt.auto_submitted_reason,
    }


# ---------------- Admin: manage portal links ----------------


@router.get("/links", response_model=list[schemas.PortalLinkResponse])
def list_portal_links(
    user_id: int | None = None,
    student_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(ADMIN_ROLES)),
):
    query = db.query(models.ParentStudentLink)
    if user_id:
        query = query.filter(models.ParentStudentLink.user_id == user_id)
    if student_id:
        query = query.filter(models.ParentStudentLink.student_id == student_id)

    results = []
    for link in query.all():
        user = db.query(models.User).filter(models.User.id == link.user_id).first()
        student = (
            db.query(models.Student)
            .filter(models.Student.id == link.student_id)
            .first()
        )
        results.append(
            {
                "id": link.id,
                "user_id": link.user_id,
                "student_id": link.student_id,
                "relationship": link.relationship,
                "user_name": user.name if user else None,
                "user_email": user.email if user else None,
                "user_role": user.role if user else None,
                "student_name": " ".join(
                    filter(None, [student.first_name, student.last_name])
                )
                if student
                else None,
                "admission_no": student.admission_no if student else None,
            }
        )
    return results


@router.post("/links", response_model=schemas.PortalLinkResponse)
def create_portal_link(
    payload: schemas.PortalLinkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(ADMIN_ROLES)),
):
    user = db.query(models.User).filter(models.User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role not in ("Parent", "Student"):
        raise HTTPException(
            status_code=400,
            detail="Links can only be created for users with the Parent or Student role",
        )

    student = (
        db.query(models.Student)
        .filter(models.Student.id == payload.student_id)
        .first()
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    duplicate = (
        db.query(models.ParentStudentLink)
        .filter(
            models.ParentStudentLink.user_id == payload.user_id,
            models.ParentStudentLink.student_id == payload.student_id,
        )
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="This link already exists")

    if user.role == "Student":
        existing = (
            db.query(models.ParentStudentLink)
            .filter(models.ParentStudentLink.user_id == payload.user_id)
            .count()
        )
        if existing:
            raise HTTPException(
                status_code=400,
                detail="A Student account can only be linked to one student record",
            )

    link = models.ParentStudentLink(
        user_id=payload.user_id,
        student_id=payload.student_id,
        relationship=payload.relationship
        or ("Self" if user.role == "Student" else None),
    )
    db.add(link)
    db.commit()
    db.refresh(link)

    return {
        "id": link.id,
        "user_id": link.user_id,
        "student_id": link.student_id,
        "relationship": link.relationship,
        "user_name": user.name,
        "user_email": user.email,
        "user_role": user.role,
        "student_name": " ".join(
            filter(None, [student.first_name, student.last_name])
        ),
        "admission_no": student.admission_no,
    }


@router.delete("/links/{link_id}")
def delete_portal_link(
    link_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(ADMIN_ROLES)),
):
    link = (
        db.query(models.ParentStudentLink)
        .filter(models.ParentStudentLink.id == link_id)
        .first()
    )
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    db.delete(link)
    db.commit()
    return {"message": "Portal link removed"}


# ---------------------------------------------------------------------------
# Where is my child's bus
#
# Lives here rather than in the tracking router because this is the one
# tracking view a parent may see, and ensure_student_access is the guard that
# already decides which children a parent may look at. Duplicating that check
# somewhere else is how a parent ends up able to follow another family's bus.
# ---------------------------------------------------------------------------


@router.get("/students/{student_id}/bus")
def student_bus(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(PORTAL_ROLES)),
):
    """The bus this student is assigned to, where it is, and its next stop."""
    from app import tracking as tracking_logic

    ensure_student_access(db, current_user, student_id)

    assignment = (
        db.query(models.TransportAssignment)
        .filter(
            models.TransportAssignment.student_id == student_id,
            models.TransportAssignment.status == "Active",
        )
        .first()
    )
    if not assignment:
        return {"assigned": False, "reason": "This student does not use school transport."}

    vehicle = (
        db.query(models.TransportVehicle)
        .filter(models.TransportVehicle.id == assignment.vehicle_id)
        .first()
    )
    route = (
        db.query(models.TransportRoute)
        .filter(models.TransportRoute.id == assignment.route_id)
        .first()
    )
    stop = (
        db.query(models.TransportStop)
        .filter(models.TransportStop.id == assignment.stop_id)
        .first()
    )

    body = {
        "assigned": True,
        "route": route.route_name if route else None,
        "stop": stop.stop_name if stop else None,
        "vehicle_no": vehicle.vehicle_no if vehicle else None,
        # Deliberately not the driver's personal mobile: the school's own
        # record already holds it for staff, and publishing it to every parent
        # on the route is a different decision from showing a bus on a map.
        "attendant_name": vehicle.attendant_name if vehicle else None,
    }

    if not vehicle:
        return {**body, "position": None,
                "reason": "No vehicle is assigned to this route yet."}

    body["position"] = tracking_logic.position_report(db, vehicle)
    if stop:
        body["eta"] = tracking_logic.eta_to_stop(db, vehicle.id, stop)

    trip = tracking_logic.current_trip(db, vehicle.id, date.today())
    body["trip"] = (
        {"id": trip.id, "direction": trip.direction, "started_at": trip.started_at}
        if trip else None
    )
    return body
