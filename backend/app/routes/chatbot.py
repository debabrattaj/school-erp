import difflib
import os
import re

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import ai_assistant
from app import chatbot_data as data
from app.database import get_db
from app import models
from app.models import User
from app.security import require_roles
from app.routes.portal import get_linked_student_ids

router = APIRouter(
    prefix="/chatbot",
    tags=["Assistant"],
)

# --- AI engine (Claude) ---
# When ANTHROPIC_API_KEY is set, every message is handled by the tool-calling
# agent in app.ai_assistant: Claude reads the conversation, decides which
# data tools to call, and writes the whole reply itself -- no keyword list
# involved. Leave the key unset to keep the assistant on the deterministic
# keyword-matching engine below, which needs no external API at all. Nothing
# else has to change when a key is added later -- the AI path activates
# automatically on the next request.
_ANTHROPIC_API_KEY = (os.environ.get("ANTHROPIC_API_KEY") or "").strip()
_anthropic_client = None
if _ANTHROPIC_API_KEY:
    import anthropic

    _anthropic_client = anthropic.Anthropic()

ALL_ROLES = ["Admin", "Principal", "Accounts", "Teacher", "Parent", "Student"]
STAFF_ROLES = {"Admin", "Principal", "Accounts", "Teacher"}

# How many prior turns to replay to the model as context. Bounded so a very
# long-running conversation doesn't grow the request without limit.
_MAX_HISTORY_TURNS = 20


class ChatHistoryTurn(BaseModel):
    role: str  # "user" | "assistant"
    text: str


class ChatRequest(BaseModel):
    message: str
    student_id: int | None = None  # set when the user picks a child chip
    history: list[ChatHistoryTurn] = []


# ---------------- keyword-matching engine (no AI required) ----------------
#
# Scored, word-boundary matching: each intent lists single-word keywords
# (weight 1, typo-tolerant via difflib) and multi-word phrases (weight 2,
# exact substring). The highest-scoring intent wins; ties go to the intent
# listed first.

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


def detect_intent(message: str) -> str | None:
    text = message.lower()
    tokens = data.tokenize(message)

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
    student = data.find_student_by_text(db, payload.message, allowed_ids)
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


STUDENT_INTENTS = {
    "attendance": data.answer_attendance,
    "fees": data.answer_fees,
    "marks": data.answer_marks,
    "summary": data.answer_summary,
    "history": data.answer_history,
    "timetable": data.answer_timetable,
    "exams_upcoming": data.answer_exams_upcoming,
    "class_teacher": data.answer_class_teacher,
    "transport": data.answer_transport,
    "library": data.answer_library,
}


def ask_rule_based(db: Session, current_user: User, payload: ChatRequest, message: str) -> dict:
    intent = detect_intent(message)

    if intent == "greeting":
        return {
            "reply": f"Hello {current_user.name.split()[0]}! How can I help you today?",
            "suggestions": QUICK_SUGGESTIONS,
        }

    if intent == "help" or intent is None:
        return {"reply": HELP_TEXT, "suggestions": QUICK_SUGGESTIONS}

    if intent == "year":
        return {"reply": data.answer_year(db), "suggestions": QUICK_SUGGESTIONS}

    if intent == "school":
        return {"reply": data.answer_school(db), "suggestions": QUICK_SUGGESTIONS}

    # student-specific intents need a resolved student
    student, clarification = resolve_student(db, current_user, payload)
    if clarification:
        return clarification

    handler = STUDENT_INTENTS[intent]
    return {
        "reply": handler(db, student, message),
        "student_id": student.id,
        "student_name": data.student_label(student),
        "suggestions": STUDENT_SUGGESTIONS,
    }


# ---------------- AI engine (Claude tool-use) ----------------


def ask_ai(db: Session, current_user: User, payload: ChatRequest, message: str) -> dict:
    is_staff = current_user.role in STAFF_ROLES
    allowed_ids = None if is_staff else get_linked_student_ids(db, current_user)

    ctx = ai_assistant.ToolContext(db=db, user=current_user, allowed_ids=allowed_ids)
    ai_assistant.resolve_active_student(ctx, payload.student_id)

    history_messages = [
        {"role": "assistant" if turn.role == "assistant" else "user", "content": turn.text}
        for turn in payload.history[-_MAX_HISTORY_TURNS:]
        if turn.text and turn.text.strip()
    ]
    history_messages.append({"role": "user", "content": message})

    system_prompt = ai_assistant.build_system_prompt(current_user, is_staff)

    try:
        reply = ai_assistant.run_agent(_anthropic_client, system_prompt, history_messages, ctx)
    except Exception:
        # The API call itself failed (bad key, network, rate limit, ...) --
        # degrade to the deterministic engine for this one request instead
        # of surfacing an error to the user.
        return ask_rule_based(db, current_user, payload, message)

    result = {
        "reply": reply,
        "suggestions": STUDENT_SUGGESTIONS if ctx.active_student else QUICK_SUGGESTIONS,
    }
    if ctx.active_student:
        result["student_id"] = ctx.active_student.id
        result["student_name"] = data.student_label(ctx.active_student)
    return result


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

    if _anthropic_client is not None:
        return ask_ai(db, current_user, payload, message)

    return ask_rule_based(db, current_user, payload, message)
