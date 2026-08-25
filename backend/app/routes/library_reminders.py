"""Overdue library book reminder rules and history.

Mirrors app.routes.fee_reminders: the ladder is configuration, sending is
done by run_library_reminders.py on a schedule, and a preview endpoint lets a
school see exactly who would be contacted before switching it on.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import library_reminders as reminder_logic
from app import models
from app.database import get_db
from app.models import User
from app.security import require_roles
from app.tenant import require_feature

router = APIRouter(prefix="/library-reminders", tags=["Library Reminders"])

MANAGERS = ["Admin", "Principal"]
READERS = ["Admin", "Principal", "Teacher"]

# Off unless the platform owner turns it on, like fee_reminders. A module
# that messages parents/staff must not switch itself on.
REMINDER_GATE = [Depends(require_feature("library_reminders"))]


class RuleCreate(BaseModel):
    name: str
    offset_days: int = 1
    channel: str = "Email"
    template_id: int | None = None
    is_active: bool = True
    remarks: str | None = None


class RuleUpdate(BaseModel):
    name: str | None = None
    offset_days: int | None = None
    channel: str | None = None
    template_id: int | None = None
    is_active: bool | None = None
    remarks: str | None = None


def _rule_response(r: models.LibraryReminderRule) -> dict:
    when = f"{r.offset_days} day(s) after due" if r.offset_days else "on the due date"
    return {
        "id": r.id, "name": r.name, "offset_days": r.offset_days,
        "when": when, "channel": r.channel, "template_id": r.template_id,
        "is_active": bool(r.is_active), "remarks": r.remarks,
    }


def _log_response(entry: models.LibraryReminderLog, names: dict | None = None) -> dict:
    names = names or {}
    borrower = names.get(("Student", entry.student_id)) or names.get(("Staff", entry.staff_id))
    return {
        "id": entry.id, "issue_id": entry.issue_id, "rule_id": entry.rule_id,
        "student_id": entry.student_id, "staff_id": entry.staff_id, "borrower": borrower,
        "status": entry.status, "skip_reason": entry.skip_reason,
        "error_message": entry.error_message,
        "fine_amount": entry.fine_amount,
        "recipient": entry.recipient, "offset_days": entry.offset_days,
        "communication_log_id": entry.communication_log_id,
        "sent_on": entry.sent_on, "sent_at": entry.sent_at,
    }


# ---------------- rules ----------------


@router.get("/rules", dependencies=REMINDER_GATE)
def list_rules(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(READERS)),
):
    return [_rule_response(r) for r in
            db.query(models.LibraryReminderRule)
            .order_by(models.LibraryReminderRule.offset_days, models.LibraryReminderRule.id).all()]


@router.post("/rules", dependencies=REMINDER_GATE)
def create_rule(
    payload: RuleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="A rule name is required.")
    if payload.channel not in reminder_logic.CHANNELS:
        raise HTTPException(
            status_code=400,
            detail=f"Channel must be one of: {', '.join(reminder_logic.CHANNELS)}.",
        )
    if payload.template_id and not db.query(models.CommunicationTemplate).filter(
        models.CommunicationTemplate.id == payload.template_id
    ).first():
        raise HTTPException(status_code=404, detail="Communication template not found")

    clash = (
        db.query(models.LibraryReminderRule)
        .filter(
            models.LibraryReminderRule.offset_days == payload.offset_days,
            models.LibraryReminderRule.channel == payload.channel,
        )
        .first()
    )
    if clash:
        raise HTTPException(
            status_code=400,
            detail=f"'{clash.name}' already fires on that day through {payload.channel}. "
                   "Two rungs on the same day is a duplicate message, not a schedule.",
        )

    rule = models.LibraryReminderRule(
        name=payload.name.strip(), offset_days=payload.offset_days,
        channel=payload.channel, template_id=payload.template_id,
        is_active=payload.is_active, remarks=payload.remarks,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _rule_response(rule)


def _get_rule(db: Session, rule_id: int) -> models.LibraryReminderRule:
    rule = db.query(models.LibraryReminderRule).filter(models.LibraryReminderRule.id == rule_id).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Reminder rule not found")
    return rule


@router.put("/rules/{rule_id}", dependencies=REMINDER_GATE)
def update_rule(
    rule_id: int,
    payload: RuleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    rule = _get_rule(db, rule_id)
    data = payload.model_dump(exclude_unset=True)
    if "channel" in data and data["channel"] not in reminder_logic.CHANNELS:
        raise HTTPException(
            status_code=400,
            detail=f"Channel must be one of: {', '.join(reminder_logic.CHANNELS)}.",
        )
    for field, value in data.items():
        setattr(rule, field, value)
    db.commit()
    db.refresh(rule)
    return _rule_response(rule)


@router.delete("/rules/{rule_id}", dependencies=REMINDER_GATE)
def delete_rule(
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """Deactivate rather than delete once a rung has fired -- same reasoning
    as fee reminders: "which reminder did we send this family" is exactly
    what gets asked when a fine is disputed."""
    rule = _get_rule(db, rule_id)
    fired = (
        db.query(models.LibraryReminderLog)
        .filter(models.LibraryReminderLog.rule_id == rule.id)
        .first()
    )
    if fired:
        raise HTTPException(
            status_code=400,
            detail="This rung has already been sent — deactivate it instead, "
                   "so the record of what was sent survives.",
        )
    db.delete(rule)
    db.commit()
    return {"deleted": rule_id}


# ---------------- preview and history ----------------


@router.get("/preview", dependencies=REMINDER_GATE)
def preview(
    as_of: date | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    return reminder_logic.run_reminders(db, as_of=as_of, dry_run=True, limit=limit)


@router.get("/history", dependencies=REMINDER_GATE)
def history(
    issue_id: int | None = None,
    student_id: int | None = None,
    staff_id: int | None = None,
    status: str | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(READERS)),
):
    query = db.query(models.LibraryReminderLog)
    if issue_id:
        query = query.filter(models.LibraryReminderLog.issue_id == issue_id)
    if student_id:
        query = query.filter(models.LibraryReminderLog.student_id == student_id)
    if staff_id:
        query = query.filter(models.LibraryReminderLog.staff_id == staff_id)
    if status:
        query = query.filter(models.LibraryReminderLog.status == status)

    rows = query.order_by(models.LibraryReminderLog.id.desc()).limit(max(1, min(limit, 1000))).all()
    names = {}
    for s in db.query(models.Student).all():
        names[("Student", s.id)] = " ".join(filter(None, [s.first_name, s.last_name]))
    for t in db.query(models.Teacher).all():
        names[("Staff", t.id)] = t.name
    return [_log_response(r, names) for r in rows]


@router.post("/run", dependencies=REMINDER_GATE)
def run_now(
    as_of: date | None = None,
    limit: int = reminder_logic.DEFAULT_BATCH_LIMIT,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    """Send the reminders that are due right now, rather than waiting for cron."""
    return reminder_logic.run_reminders(db, as_of=as_of, dry_run=False, limit=limit)
