from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CommunicationLog, CommunicationTemplate, User
from app.schemas import (
    CommunicationLogCreate,
    CommunicationLogResponse,
    CommunicationTemplateCreate,
    CommunicationTemplateResponse,
)
from app.security import require_roles
from app.mailer import send_email
from app.whatsapp import send_whatsapp

router = APIRouter(prefix="/communications", tags=["Communications"])

VALID_CHANNELS = ["WhatsApp", "SMS", "Email", "In App"]
VALID_TEMPLATE_STATUSES = ["Active", "Inactive", "Draft"]
VALID_LOG_STATUSES = ["Queued", "Sent", "Failed"]


def get_or_404(db: Session, model, record_id: int, label: str):
    record = db.query(model).filter(model.id == record_id).first()

    if not record:
        raise HTTPException(status_code=404, detail=f"{label} not found")

    return record


def commit_or_400(db: Session, message: str):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=message)


def validate_template(payload: CommunicationTemplateCreate):
    if not payload.template_name.strip():
        raise HTTPException(status_code=400, detail="Template name is required")

    if payload.channel and payload.channel not in VALID_CHANNELS:
        raise HTTPException(status_code=400, detail="Invalid communication channel")

    if not payload.category.strip():
        raise HTTPException(status_code=400, detail="Category is required")

    if not payload.body.strip():
        raise HTTPException(status_code=400, detail="Template body is required")

    if payload.status and payload.status not in VALID_TEMPLATE_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid template status")


def validate_log(payload: CommunicationLogCreate, db: Session):
    if payload.template_id:
        get_or_404(db, CommunicationTemplate, payload.template_id, "Communication template")

    if payload.channel and payload.channel not in VALID_CHANNELS:
        raise HTTPException(status_code=400, detail="Invalid communication channel")

    if not payload.category.strip():
        raise HTTPException(status_code=400, detail="Category is required")

    if not payload.recipient_name.strip():
        raise HTTPException(status_code=400, detail="Recipient name is required")

    if not payload.message_body.strip():
        raise HTTPException(status_code=400, detail="Message body is required")

    if payload.status and payload.status not in VALID_LOG_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid message status")


def email_subject_for(log: CommunicationLog, db: Session) -> str:
    """Pick a subject line for an Email-channel message: the linked template's
    subject if set, else the message category, else a generic fallback."""
    if log.template_id:
        template = (
            db.query(CommunicationTemplate)
            .filter(CommunicationTemplate.id == log.template_id)
            .first()
        )
        if template and template.subject and template.subject.strip():
            return template.subject.strip()
    if log.category and log.category.strip():
        return log.category.strip()
    return "Message from your school"


def _mark_sent(log: CommunicationLog) -> None:
    log.status = "Sent"
    log.sent_at = datetime.utcnow()
    log.error_message = None


def _mark_failed(log: CommunicationLog, reason: str) -> None:
    log.status = "Failed"
    log.error_message = reason
    log.sent_at = None


def deliver_email(log: CommunicationLog, db: Session) -> None:
    if not log.recipient_email or not log.recipient_email.strip():
        _mark_failed(log, "No recipient email address")
        return

    subject = email_subject_for(log, db)
    if send_email(log.recipient_email.strip(), subject, log.message_body):
        _mark_sent(log)
    else:
        _mark_failed(log, "Email delivery failed")


def deliver_whatsapp(log: CommunicationLog) -> None:
    """Deliver a WhatsApp/SMS-channel message via WhatsApp."""
    if not log.recipient_phone or not log.recipient_phone.strip():
        _mark_failed(log, "No recipient phone number")
        return

    if send_whatsapp(log.recipient_phone.strip(), log.message_body):
        _mark_sent(log)
    else:
        _mark_failed(log, "WhatsApp delivery failed")


def deliver_message(log: CommunicationLog, db: Session) -> None:
    """Route a message to its channel's transport, updating status in place.
    The caller commits. SMS is sent over WhatsApp; In App needs no transport.
    """
    if log.channel == "Email":
        deliver_email(log, db)
    elif log.channel in ("WhatsApp", "SMS"):
        deliver_whatsapp(log)
    else:  # In App
        _mark_sent(log)


def serialize_log(log: CommunicationLog, db: Session):
    template = None

    if log.template_id:
        template = (
            db.query(CommunicationTemplate)
            .filter(CommunicationTemplate.id == log.template_id)
            .first()
        )

    return {
        "id": log.id,
        "template_id": log.template_id,
        "template_name": template.template_name if template else None,
        "channel": log.channel,
        "category": log.category,
        "recipient_name": log.recipient_name,
        "recipient_phone": log.recipient_phone,
        "recipient_email": log.recipient_email,
        "message_body": log.message_body,
        "related_module": log.related_module,
        "related_record_id": log.related_record_id,
        "status": log.status,
        "sent_at": log.sent_at,
        "error_message": log.error_message,
        "created_at": log.created_at,
        "updated_at": log.updated_at,
    }


@router.get("/templates/", response_model=list[CommunicationTemplateResponse])
def get_templates(
    category: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher", "Accounts"])),
):
    query = db.query(CommunicationTemplate)

    if category:
        query = query.filter(CommunicationTemplate.category == category)

    if status:
        query = query.filter(CommunicationTemplate.status == status)

    return query.order_by(CommunicationTemplate.id.desc()).all()


@router.post("/templates/", response_model=CommunicationTemplateResponse)
def create_template(
    payload: CommunicationTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    validate_template(payload)
    template = CommunicationTemplate(**payload.model_dump())

    db.add(template)
    commit_or_400(db, "Template name already exists")
    db.refresh(template)
    return template


@router.put("/templates/{template_id}", response_model=CommunicationTemplateResponse)
def update_template(
    template_id: int,
    payload: CommunicationTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    template = get_or_404(db, CommunicationTemplate, template_id, "Communication template")
    validate_template(payload)

    for key, value in payload.model_dump().items():
        setattr(template, key, value)

    commit_or_400(db, "Template name already exists")
    db.refresh(template)
    return template


@router.delete("/templates/{template_id}")
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    template = get_or_404(db, CommunicationTemplate, template_id, "Communication template")
    db.delete(template)
    db.commit()
    return {"message": "Communication template deleted successfully"}


@router.get("/logs/", response_model=list[CommunicationLogResponse])
def get_logs(
    category: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher", "Accounts"])),
):
    query = db.query(CommunicationLog)

    if category:
        query = query.filter(CommunicationLog.category == category)

    if status:
        query = query.filter(CommunicationLog.status == status)

    logs = query.order_by(CommunicationLog.id.desc()).all()
    return [serialize_log(log, db) for log in logs]


@router.post("/logs/", response_model=CommunicationLogResponse)
def create_log(
    payload: CommunicationLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher", "Accounts"])),
):
    validate_log(payload, db)
    data = payload.model_dump()

    if data.get("status") == "Sent":
        data["sent_at"] = datetime.utcnow()

    log = CommunicationLog(**data)
    db.add(log)
    db.flush()

    # Actually deliver the message and let the result drive the status.
    # Email -> SMTP, WhatsApp/SMS -> WhatsApp, In App -> recorded as sent.
    deliver_message(log, db)

    db.commit()
    db.refresh(log)
    return serialize_log(log, db)


@router.post("/logs/{log_id}/send", response_model=CommunicationLogResponse)
def send_log(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher", "Accounts"])),
):
    """Send (or retry) a message through its channel's transport."""
    log = get_or_404(db, CommunicationLog, log_id, "Communication log")
    deliver_message(log, db)
    db.commit()
    db.refresh(log)
    return serialize_log(log, db)


@router.put("/logs/{log_id}/status", response_model=CommunicationLogResponse)
def update_log_status(
    log_id: int,
    status: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    if status not in VALID_LOG_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid message status")

    log = get_or_404(db, CommunicationLog, log_id, "Communication log")
    log.status = status
    log.sent_at = datetime.utcnow() if status == "Sent" else log.sent_at
    db.commit()
    db.refresh(log)
    return serialize_log(log, db)
