import os
import re

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app import models
from app.models import User
from app.security import require_roles
from app.routes.portal import get_linked_student_ids

router = APIRouter(
    prefix="/chatbot",
    tags=["Assistant"],
)

ALL_ROLES = ["Admin", "Principal", "Accounts", "Teacher", "Parent", "Student"]
STAFF_ROLES = {"Admin", "Principal", "Accounts", "Teacher"}


class ChatRequest(BaseModel):
    message: str
    student_id: int | None = None  # set when the user picks a child chip


# ---------------- intent matching ----------------

INTENTS = [
    ("greeting", ["hello", "hi ", "hii", "hey", "good morning", "good afternoon", "good evening", "namaste"]),
    ("help", ["help", "what can you", "options", "menu"]),
    ("school", ["school name", "school contact", "contact", "phone", "address", "principal", "email", "website"]),
    ("year", ["academic year", "current year", "which year", "session"]),
    ("attendance", ["attendance", "present", "absent", "leave", "late"]),
    ("fees", ["fee", "due", "pending", "payment", "balance", "paid", "receipt"]),
    ("marks", ["mark", "result", "grade", "exam", "score", "percentage", "report card"]),
    ("summary", ["class", "section", "roll", "teacher", "profile", "detail"]),
    ("history", ["history", "previous year", "last year", "promotion", "promoted"]),
]


def detect_intent(message: str) -> str | None:
    text = f" {message.lower().strip()} "
    for intent, keywords in INTENTS:
        for keyword in keywords:
            if keyword in text:
                return intent
    return None


HELP_TEXT = (
    "I can help you with:\n"
    "• Attendance — \"What is the attendance?\"\n"
    "• Fees — \"How much fee is pending?\"\n"
    "• Marks — \"Show exam results\"\n"
    "• Class details — \"Which class and section?\"\n"
    "• Academic history — \"Show previous years\"\n"
    "• School info — \"School contact details\""
)

QUICK_SUGGESTIONS = ["Attendance", "Fees pending", "Exam results", "Class details", "Help"]


# ---------------- student resolution ----------------


def find_student_by_text(db: Session, message: str, allowed_ids: list[int] | None):
    """Try to find a student mentioned by name or admission number in the message.
    If allowed_ids is not None, only search within those (parent scope)."""
    text = message.lower()

    query = db.query(models.Student)
    if allowed_ids is not None:
        if not allowed_ids:
            return None
        query = query.filter(models.Student.id.in_(allowed_ids))

    # admission number match (e.g. ADM2026010)
    adm = re.search(r"[a-z]{2,4}\d{4,}", text)
    if adm:
        student = query.filter(
            models.Student.admission_no.ilike(f"%{adm.group(0)}%")
        ).first()
        if student:
            return student

    # first-name match
    for student in query.limit(500).all():
        first = (student.first_name or "").lower()
        if first and first in text:
            return student
    return None


def resolve_student(db: Session, user: User, payload: ChatRequest):
    """Returns (student, clarification_response_or_None)."""
    is_staff = user.role in STAFF_ROLES
    allowed_ids = None if is_staff else get_linked_student_ids(db, user)

    # explicit pick from a chip
    if payload.student_id:
        if is_staff or payload.student_id in (allowed_ids or []):
            student = (
                db.query(models.Student)
                .filter(models.Student.id == payload.student_id)
                .first()
            )
            if student:
                return student, None

    # name/admission-no mentioned in the message
    student = find_student_by_text(db, payload.message, allowed_ids)
    if student:
        return student, None

    if is_staff:
        return None, {
            "reply": "Which student? Mention a name or admission number, e.g. \"attendance of Anaya\" or \"fees for ADM2026010\".",
            "suggestions": QUICK_SUGGESTIONS,
        }

    # parent/student: use links
    if not allowed_ids:
        return None, {
            "reply": "No student is linked to your account yet. Please contact the school office to set up portal access.",
            "suggestions": ["Help"],
        }

    if len(allowed_ids) == 1:
        student = (
            db.query(models.Student)
            .filter(models.Student.id == allowed_ids[0])
            .first()
        )
        return student, None

    children = (
        db.query(models.Student)
        .filter(models.Student.id.in_(allowed_ids))
        .all()
    )
    return None, {
        "reply": "Which child would you like to ask about?",
        "children": [
            {
                "id": child.id,
                "name": " ".join(filter(None, [child.first_name, child.last_name])),
            }
            for child in children
        ],
        "suggestions": [],
    }


# ---------------- intent handlers ----------------


def student_label(student: models.Student) -> str:
    return " ".join(filter(None, [student.first_name, student.last_name]))


def answer_attendance(db: Session, student: models.Student):
    records = (
        db.query(models.Attendance)
        .filter(models.Attendance.student_id == student.id)
        .all()
    )
    if not records:
        return f"No attendance has been recorded for {student_label(student)} yet."

    counts = {"Present": 0, "Absent": 0, "Late": 0, "Half Day": 0}
    for record in records:
        if record.status in counts:
            counts[record.status] += 1
    total = len(records)
    attended = counts["Present"] + counts["Late"] + counts["Half Day"] * 0.5
    percentage = round((attended / total) * 100, 1)

    return (
        f"{student_label(student)}'s attendance: {percentage}% "
        f"({counts['Present']} present, {counts['Absent']} absent, "
        f"{counts['Late']} late, {counts['Half Day']} half-day, out of {total} days)."
    )


def answer_fees(db: Session, student: models.Student):
    fees = (
        db.query(models.Fee)
        .filter(models.Fee.student_id == student.id)
        .all()
    )
    if not fees:
        return f"No fee records found for {student_label(student)}."

    total = sum((fee.total_amount or 0) for fee in fees)
    paid = sum((fee.paid_amount or 0) for fee in fees)
    due = sum((fee.due_amount or 0) for fee in fees)

    settings = db.query(models.SchoolSettings).first()
    currency = settings.currency if settings and settings.currency else ""

    if due <= 0:
        return (
            f"All fees are fully paid for {student_label(student)} "
            f"(total {currency} {total:g})."
        )

    pending_types = [
        f"{fee.fee_type} ({fee.academic_year or '-'}): {currency} {fee.due_amount:g}"
        for fee in fees
        if (fee.due_amount or 0) > 0
    ]
    lines = "\n• ".join(pending_types[:6])
    return (
        f"Pending fees for {student_label(student)}: {currency} {due:g} "
        f"(paid {currency} {paid:g} of {currency} {total:g}).\n• {lines}"
    )


def answer_marks(db: Session, student: models.Student):
    marks = (
        db.query(models.Mark)
        .filter(models.Mark.student_id == student.id)
        .all()
    )
    if not marks:
        return f"No exam results recorded for {student_label(student)} yet."

    exams = {}
    for mark in marks:
        key = mark.exam_name_snapshot or f"Exam #{mark.exam_id}"
        group = exams.setdefault(key, {"obtained": 0, "max": 0})
        group["obtained"] += mark.marks_obtained or 0
        group["max"] += mark.max_marks or mark.total_marks or 100

    lines = []
    for exam_name, totals in list(exams.items())[:5]:
        pct = round((totals["obtained"] / totals["max"]) * 100, 1) if totals["max"] else 0
        lines.append(f"{exam_name}: {totals['obtained']:g}/{totals['max']:g} ({pct}%)")

    return f"Exam results for {student_label(student)}:\n• " + "\n• ".join(lines)


def answer_summary(db: Session, student: models.Student):
    parts = [f"{student_label(student)} (Admission No {student.admission_no})"]
    class_display = " - ".join(filter(None, [student.class_name, student.section]))
    if class_display:
        parts.append(f"Class {class_display}")
    if student.roll_no:
        parts.append(f"Roll No {student.roll_no}")
    if student.house:
        parts.append(f"{student.house} House")
    parts.append(f"Status: {student.student_status or 'Active'}")
    return ", ".join(parts) + "."


def answer_history(db: Session, student: models.Student):
    enrollments = (
        db.query(models.StudentEnrollment)
        .filter(models.StudentEnrollment.student_id == student.id)
        .order_by(models.StudentEnrollment.academic_year.desc())
        .all()
    )
    if not enrollments:
        return f"No academic history recorded for {student_label(student)} yet."

    lines = [
        f"{e.academic_year}: Class {' - '.join(filter(None, [e.class_name_snapshot, e.section_snapshot])) or '-'} ({e.promotion_status})"
        for e in enrollments[:6]
    ]
    return f"Academic history for {student_label(student)}:\n• " + "\n• ".join(lines)


def answer_year(db: Session):
    year = (
        db.query(models.AcademicYear)
        .filter(models.AcademicYear.is_current == True)  # noqa: E712
        .first()
    )
    if year:
        extra = ""
        if year.start_date and year.end_date:
            extra = f" ({year.start_date} to {year.end_date})"
        return f"The current academic year is {year.name}{extra}."
    settings = db.query(models.SchoolSettings).first()
    if settings and settings.academic_year:
        return f"The current academic year is {settings.academic_year}."
    return "No current academic year has been set yet."


def answer_school(db: Session):
    settings = db.query(models.SchoolSettings).first()
    if not settings:
        return "School information has not been configured yet."
    parts = [settings.school_name]
    if settings.principal_name:
        parts.append(f"Principal: {settings.principal_name}")
    if settings.phone:
        parts.append(f"Phone: {settings.phone}")
    if settings.email:
        parts.append(f"Email: {settings.email}")
    if settings.address:
        parts.append(f"Address: {settings.address}")
    return " | ".join(parts)


STUDENT_INTENTS = {
    "attendance": answer_attendance,
    "fees": answer_fees,
    "marks": answer_marks,
    "summary": answer_summary,
    "history": answer_history,
}


# ---------------- LLM upgrade path (stub) ----------------


def llm_fallback(message: str, user: User) -> str | None:
    """Upgrade path: when LLM_API_KEY is set in backend/.env, unmatched
    questions can be sent to an LLM here (e.g. the Anthropic API), with
    the same scoped data rules. Returns None while no key is configured,
    which falls back to the help menu."""
    if not os.getenv("LLM_API_KEY"):
        return None
    # Placeholder for future LLM integration.
    return None


# ---------------- main endpoint ----------------


@router.post("/ask")
def ask(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(ALL_ROLES)),
):
    message = (payload.message or "").strip()
    if not message:
        return {"reply": HELP_TEXT, "suggestions": QUICK_SUGGESTIONS}

    intent = detect_intent(message)

    if intent == "greeting":
        return {
            "reply": f"Hello {current_user.name.split()[0]}! How can I help you today?",
            "suggestions": QUICK_SUGGESTIONS,
        }

    if intent == "help" or intent is None:
        if intent is None:
            llm_reply = llm_fallback(message, current_user)
            if llm_reply:
                return {"reply": llm_reply, "suggestions": QUICK_SUGGESTIONS}
        return {"reply": HELP_TEXT, "suggestions": QUICK_SUGGESTIONS}

    if intent == "year":
        return {"reply": answer_year(db), "suggestions": QUICK_SUGGESTIONS}

    if intent == "school":
        return {"reply": answer_school(db), "suggestions": QUICK_SUGGESTIONS}

    # student-specific intents need a resolved student
    student, clarification = resolve_student(db, current_user, payload)
    if clarification:
        return clarification

    handler = STUDENT_INTENTS[intent]
    return {
        "reply": handler(db, student),
        "student_id": student.id,
        "suggestions": QUICK_SUGGESTIONS,
    }
