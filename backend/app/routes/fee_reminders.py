"""Fee reminder rules and history.

The ladder is configuration; the sending is done by
run_fee_reminders.py on a schedule. A preview endpoint exists so a school can
see exactly who would be contacted before switching it on -- the first run of
a collections tool against real parents is not the place to discover a
misconfigured rung.
"""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import fee_reminders as reminder_logic
from app import models
from app.database import get_db
from app.models import User
from app.security import require_roles
from app.tenant import require_feature

router = APIRouter(prefix="/fee-reminders", tags=["Fee Reminders"])

MANAGERS = ["Admin", "Principal", "Accounts"]
READERS = ["Admin", "Principal", "Accounts", "Teacher"]

# Off unless the platform owner turns it on, like the other schedulers. A
# module that messages parents must not switch itself on.
REMINDER_GATE = [Depends(require_feature("fee_reminders"))]


class RuleCreate(BaseModel):
    name: str
    offset_days: int = 0
    channel: str = "Email"
    template_id: int | None = None
    min_due_amount: float = 0
    is_active: bool = True
    remarks: str | None = None


class RuleUpdate(BaseModel):
    name: str | None = None
    offset_days: int | None = None
    channel: str | None = None
    template_id: int | None = None
    min_due_amount: float | None = None
    is_active: bool | None = None
    remarks: str | None = None


def _rule_response(r: models.FeeReminderRule) -> dict:
    when = (
        f"{abs(r.offset_days)} day(s) before due" if r.offset_days < 0
        else "on the due date" if r.offset_days == 0
        else f"{r.offset_days} day(s) after due"
    )
    return {
        "id": r.id, "name": r.name, "offset_days": r.offset_days,
        "when": when, "channel": r.channel, "template_id": r.template_id,
        "min_due_amount": r.min_due_amount, "is_active": bool(r.is_active),
        "remarks": r.remarks,
    }


def _log_response(entry: models.FeeReminderLog, names: dict | None = None) -> dict:
    names = names or {}
    return {
        "id": entry.id, "fee_id": entry.fee_id, "rule_id": entry.rule_id,
        "student_id": entry.student_id, "student": names.get(entry.student_id),
        "status": entry.status, "skip_reason": entry.skip_reason,
        "error_message": entry.error_message,
        "outstanding_amount": entry.outstanding_amount,
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
            db.query(models.FeeReminderRule)
            .order_by(models.FeeReminderRule.offset_days, models.FeeReminderRule.id).all()]


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
    if payload.min_due_amount < 0:
        raise HTTPException(status_code=400, detail="Minimum due amount cannot be negative.")
    if payload.template_id and not db.query(models.CommunicationTemplate).filter(
        models.CommunicationTemplate.id == payload.template_id
    ).first():
        raise HTTPException(status_code=404, detail="Communication template not found")

    clash = (
        db.query(models.FeeReminderRule)
        .filter(
            models.FeeReminderRule.offset_days == payload.offset_days,
            models.FeeReminderRule.channel == payload.channel,
        )
        .first()
    )
    if clash:
        raise HTTPException(
            status_code=400,
            detail=f"'{clash.name}' already fires on that day through {payload.channel}. "
                   "Two rungs on the same day is a duplicate message, not a schedule.",
        )

    rule = models.FeeReminderRule(
        name=payload.name.strip(), offset_days=payload.offset_days,
        channel=payload.channel, template_id=payload.template_id,
        min_due_amount=payload.min_due_amount, is_active=payload.is_active,
        remarks=payload.remarks,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _rule_response(rule)


def _get_rule(db: Session, rule_id: int) -> models.FeeReminderRule:
    rule = db.query(models.FeeReminderRule).filter(models.FeeReminderRule.id == rule_id).first()
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
    """Deactivate rather than delete once a rung has fired.

    Deleting cascades its history away, and "which reminder did we send this
    family, and when" is exactly what gets asked when a payment is disputed.
    """
    rule = _get_rule(db, rule_id)
    fired = (
        db.query(models.FeeReminderLog)
        .filter(models.FeeReminderLog.rule_id == rule.id)
        .first()
    )
    if fired:
        raise HTTPException(
            status_code=400,
            detail="This rung has already been sent to parents — deactivate it instead, "
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
    """Exactly who would be contacted, without contacting anyone.

    Writes nothing. Worth running before the first real send, and after any
    change to the ladder.
    """
    return reminder_logic.run_reminders(db, as_of=as_of, dry_run=True, limit=limit)


@router.get("/history", dependencies=REMINDER_GATE)
def history(
    fee_id: int | None = None,
    student_id: int | None = None,
    status: str | None = None,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(READERS)),
):
    query = db.query(models.FeeReminderLog)
    if fee_id:
        query = query.filter(models.FeeReminderLog.fee_id == fee_id)
    if student_id:
        query = query.filter(models.FeeReminderLog.student_id == student_id)
    if status:
        query = query.filter(models.FeeReminderLog.status == status)

    rows = query.order_by(models.FeeReminderLog.id.desc()).limit(max(1, min(limit, 1000))).all()
    names = {
        s.id: " ".join(filter(None, [s.first_name, s.last_name]))
        for s in db.query(models.Student).all()
    }
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
