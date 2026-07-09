import difflib
import re
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app import models
from app.models import User
from app.notifications import find_class_teacher
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
#
# Scored, word-boundary matching (no AI): each intent lists single-word
# keywords (weight 1, typo-tolerant via difflib) and multi-word phrases
# (weight 2, exact substring). The highest-scoring intent wins; ties go
# to the intent listed first. This fixes the old first-substring-wins
# behavior where e.g. "contact" matched inside unrelated words.

INTENTS = [
    (
        "greeting",
        {"hello", "hi", "hii", "hey", "namaste"},
        ["good morning", "good afternoon", "good evening"],
    ),
    (
        "help",
        {"help", "options", "menu"},
        ["what can you"],
    ),
    (
        "school",
        {"phone", "address", "principal", "email", "website"},
        ["school name", "school contact", "contact details", "contact number"],
    ),
    (
        "year",
        {"session"},
        ["academic year", "current year", "which year"],
    ),
    (
        "timetable",
        {"timetable", "periods", "schedule"},
        ["time table", "period today"],
    ),
    (
        "exams_upcoming",
        {"datesheet", "upcoming"},
        ["next exam", "exam date", "exam schedule", "when is the exam", "date sheet"],
    ),
    (
        "class_teacher",
        {"teacher"},
        ["class teacher", "who teaches"],
    ),
    (
        "transport",
        {"bus", "transport", "route", "pickup"},
        ["bus route", "pickup point"],
    ),
    (
        "library",
        {"library", "book", "books", "borrowed"},
        ["books issued", "library books"],
    ),
    (
        "attendance",
        {"attendance", "present", "absent", "leave", "late"},
        [],
    ),
    (
        "fees",
        {"fee", "fees", "due", "dues", "pending", "payment", "balance", "paid", "receipt"},
        [],
    ),
    (
        "marks",
        {"mark", "marks", "result", "results", "grade", "exam", "score", "percentage"},
        ["report card"],
    ),
    (
        "summary",
        {"class", "section", "roll", "profile", "detail", "details"},
        ["which class"],
    ),
    (
        "history",
        {"history", "promotion", "promoted"},
        ["previous year", "previous years", "last year"],
    ),
]

# Single-word keywords eligible for typo correction ("attandance", "fess", ...).
_ALL_KEYWORDS = sorted({kw for _, words, _ in INTENTS for kw in words})


def _tokenize(message: str) -> list[str]:
    return re.findall(r"[a-z]+", message.lower())


def detect_intent(message: str) -> str | None:
    text = message.lower()
    tokens = _tokenize(message)

    # Map obvious typos onto known keywords (deterministic, stdlib only).
    # Short tokens are excluded: at cutoff 0.8 they produce false positives
    # (e.g. "the" -> "hey").
    corrected = set(tokens)
    for token in tokens:
        if len(token) >= 4 and token not in _ALL_KEYWORDS:
            close = difflib.get_close_matches(token, _ALL_KEYWORDS, n=1, cutoff=0.8)
            if close:
                corrected.add(close[0])

    best_intent, best_score = None, 0
    for intent, words, phrases in INTENTS:
        score = sum(2 for phrase in phrases if phrase in text)
        score += sum(1 for word in words if word in corrected)
        if score > best_score:
            best_intent, best_score = intent, score
    return best_intent


HELP_TEXT = (
    "I can help you with:\n"
    "• Attendance — \"What is the attendance?\" (also \"this month\" / \"this week\")\n"
    "• Fees — \"How much fee is pending?\"\n"
    "• Marks — \"Show exam results\"\n"
    "• Upcoming exams — \"When is the next exam?\"\n"
    "• Timetable — \"What is the timetable today?\"\n"
    "• Class details — \"Which class and section?\"\n"
    "• Class teacher — \"Who is the class teacher?\"\n"
    "• Transport — \"Which bus route?\"\n"
    "• Library — \"Which books are issued?\"\n"
    "• Academic history — \"Show previous years\"\n"
    "• School info — \"School contact details\""
)

QUICK_SUGGESTIONS = ["Attendance", "Fees pending", "Exam results", "Class details", "Help"]

# Once a student is in context, suggest the student-scoped questions.
STUDENT_SUGGESTIONS = ["Attendance", "Fees pending", "Exam results", "Timetable", "Next exam"]


# ---------------- student resolution ----------------


def find_student_by_text(db: Session, message: str, allowed_ids: list[int] | None):
    """Try to find a student mentioned by name or admission number in the message.
    If allowed_ids is not None, only search within those (parent scope)."""
    text = message.lower()
    tokens = set(_tokenize(message))

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

    # full-name match first ("anaya rao"), then whole-word first-name match
    # (the old substring match found "asha" inside unrelated words)
    candidates = query.limit(500).all()
    for student in candidates:
        first = (student.first_name or "").lower()
        last = (student.last_name or "").lower()
        if first and last and f"{first} {last}" in text:
            return student
    for student in candidates:
        first = (student.first_name or "").lower()
        if first and first in tokens:
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


def _attendance_period(message: str):
    """Parse a date range from the question. Returns (start, end, label) or
    (None, None, "") for all-time."""
    text = message.lower()
    today = date.today()
    if "today" in text:
        return today, today, "today"
    if "this week" in text:
        start = today - timedelta(days=today.weekday())
        return start, today, "this week"
    if "this month" in text:
        return today.replace(day=1), today, "this month"
    if "last month" in text:
        first_this = today.replace(day=1)
        last_prev = first_this - timedelta(days=1)
        return last_prev.replace(day=1), last_prev, "last month"
    return None, None, ""


def answer_attendance(db: Session, student: models.Student, message: str = ""):
    start, end, label = _attendance_period(message)
    query = db.query(models.Attendance).filter(
        models.Attendance.student_id == student.id
    )
    if start:
        query = query.filter(
            models.Attendance.attendance_date >= start,
            models.Attendance.attendance_date <= end,
        )
    records = query.all()
    scope = f" {label}" if label else ""
    if not records:
        return f"No attendance has been recorded for {student_label(student)}{scope}."

    counts = {"Present": 0, "Absent": 0, "Late": 0, "Half Day": 0}
    for record in records:
        if record.status in counts:
            counts[record.status] += 1
    total = len(records)
    attended = counts["Present"] + counts["Late"] + counts["Half Day"] * 0.5
    percentage = round((attended / total) * 100, 1)

    return (
        f"{student_label(student)}'s attendance{scope}: {percentage}% "
        f"({counts['Present']} present, {counts['Absent']} absent, "
        f"{counts['Late']} late, {counts['Half Day']} half-day, out of {total} days)."
    )


def answer_fees(db: Session, student: models.Student, message: str = ""):
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


def answer_marks(db: Session, student: models.Student, message: str = ""):
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


def answer_summary(db: Session, student: models.Student, message: str = ""):
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


def answer_history(db: Session, student: models.Student, message: str = ""):
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


def answer_timetable(db: Session, student: models.Student, message: str = ""):
    """Today's (or tomorrow's) periods for the student's class."""
    target = date.today()
    label = "today"
    if "tomorrow" in message.lower():
        target = target + timedelta(days=1)
        label = "tomorrow"
    day_name = target.strftime("%A")

    query = db.query(models.TimetableEntry)
    if student.class_id:
        query = query.filter(models.TimetableEntry.class_id == student.class_id)
    elif student.class_name:
        query = query.filter(
            models.TimetableEntry.class_name_snapshot == student.class_name,
            models.TimetableEntry.section_snapshot == (student.section or ""),
        )
    else:
        return f"No class is set for {student_label(student)}, so I can't look up a timetable."

    entries = (
        query.filter(models.TimetableEntry.day_of_week.in_([day_name, "*"]))
        .order_by(models.TimetableEntry.period_no.asc())
        .all()
    )
    if not entries:
        return (
            f"No timetable is set for {student_label(student)}'s class "
            f"for {label} ({day_name})."
        )

    lines = []
    for entry in entries:
        time_part = ""
        if entry.start_time and entry.end_time:
            time_part = f" ({entry.start_time}–{entry.end_time})"
        if entry.entry_type != "period":
            lines.append(f"{entry.label or entry.entry_type.title()}{time_part}")
            continue
        teacher_part = f", {entry.teacher_name_snapshot}" if entry.teacher_name_snapshot else ""
        lines.append(f"{entry.subject or '-'}{time_part}{teacher_part}")
    return (
        f"Timetable for {student_label(student)} {label} ({day_name}):\n• "
        + "\n• ".join(lines)
    )


def answer_exams_upcoming(db: Session, student: models.Student, message: str = ""):
    query = db.query(models.Exam).filter(models.Exam.exam_date >= date.today())
    if student.class_name:
        query = query.filter(models.Exam.class_name == student.class_name)
        if student.section:
            query = query.filter(models.Exam.section == student.section)
    exams = query.order_by(models.Exam.exam_date.asc()).limit(5).all()
    if not exams:
        return f"No upcoming exams are scheduled for {student_label(student)}'s class."
    lines = [
        f"{exam.exam_name} — {exam.exam_date.strftime('%d %b %Y')}"
        for exam in exams
    ]
    return f"Upcoming exams for {student_label(student)}:\n• " + "\n• ".join(lines)


def answer_class_teacher(db: Session, student: models.Student, message: str = ""):
    teacher = find_class_teacher(db, student)
    if not teacher:
        return (
            f"No class teacher is assigned for {student_label(student)}'s class yet. "
            "Please contact the school office."
        )
    return f"The class teacher for {student_label(student)}'s class is {teacher.name}."


def answer_transport(db: Session, student: models.Student, message: str = ""):
    if not (student.transport_route or student.pickup_point):
        return f"No transport route is set for {student_label(student)}."
    parts = []
    if student.transport_route:
        parts.append(f"Route: {student.transport_route}")
    if student.pickup_point:
        parts.append(f"Pickup point: {student.pickup_point}")
    return f"Transport for {student_label(student)} — " + ", ".join(parts) + "."


def answer_library(db: Session, student: models.Student, message: str = ""):
    issues = (
        db.query(models.LibraryIssue, models.LibraryBook)
        .join(models.LibraryBook, models.LibraryBook.id == models.LibraryIssue.book_id)
        .filter(
            models.LibraryIssue.student_id == student.id,
            models.LibraryIssue.return_date.is_(None),
        )
        .order_by(models.LibraryIssue.issue_date.desc())
        .limit(6)
        .all()
    )
    if not issues:
        return f"{student_label(student)} has no library books issued at the moment."
    lines = []
    for issue, book in issues:
        due_part = f", due {issue.due_date.strftime('%d %b %Y')}" if issue.due_date else ""
        fine_part = f", fine {issue.fine_amount:g}" if (issue.fine_amount or 0) > 0 else ""
        lines.append(f"{book.title}{due_part}{fine_part}")
    return f"Library books issued to {student_label(student)}:\n• " + "\n• ".join(lines)


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
    "timetable": answer_timetable,
    "exams_upcoming": answer_exams_upcoming,
    "class_teacher": answer_class_teacher,
    "transport": answer_transport,
    "library": answer_library,
}


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
        "reply": handler(db, student, message),
        "student_id": student.id,
        "student_name": student_label(student),
        "suggestions": STUDENT_SUGGESTIONS,
    }
