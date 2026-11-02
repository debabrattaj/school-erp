"""Supervised, credit-bearing experience for college programmes.

The same workflow covers BTech internships/projects and pharmacy clinical,
hospital or industrial rotations.  It is intentionally lightweight: records
are created by staff, and hours/evaluation can be updated as evidence arrives.
"""
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.security import require_roles
from app.tenant import require_feature


router = APIRouter(
    prefix="/experiential-learning",
    tags=["Experiential Learning"],
    dependencies=[Depends(require_feature("experiential_learning"))],
)

MANAGERS = ["Admin", "Principal", "Teacher"]
EXPERIENCE_TYPES = {"Internship", "Project", "Industrial Training", "Clinical Rotation", "Hospital Training", "Research"}
STATUSES = {"Planned", "In Progress", "Completed", "On Hold", "Cancelled"}
VERIFICATION_STATUSES = {"Pending", "Verified", "Returned"}


def serialize(record: models.ExperientialLearning, db: Session) -> dict:
    student = db.query(models.Student).filter(models.Student.id == record.student_id).first()
    payload = {column.name: getattr(record, column.name) for column in record.__table__.columns}
    payload["student_name"] = (
        f"{student.first_name} {student.last_name or ''}".strip() if student else "Unknown student"
    )
    return payload


def validate(data: dict):
    if data.get("experience_type") and data["experience_type"] not in EXPERIENCE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid experience type")
    if data.get("status") and data["status"] not in STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    if (data.get("required_hours") is not None and data.get("completed_hours") is not None
            and data["completed_hours"] > data["required_hours"]):
        raise HTTPException(status_code=400, detail="Completed hours cannot exceed required hours")


@router.get("/", response_model=list[schemas.ExperientialLearningResponse])
def list_experiences(
    student_id: int | None = None,
    academic_year: str | None = None,
    status: str | None = None,
    experience_type: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(MANAGERS)),
):
    query = db.query(models.ExperientialLearning)
    if student_id:
        query = query.filter(models.ExperientialLearning.student_id == student_id)
    if academic_year:
        query = query.filter(models.ExperientialLearning.academic_year == academic_year)
    if status:
        query = query.filter(models.ExperientialLearning.status == status)
    if experience_type:
        query = query.filter(models.ExperientialLearning.experience_type == experience_type)
    return [serialize(row, db) for row in query.order_by(models.ExperientialLearning.start_date.desc()).all()]


@router.post("/", response_model=schemas.ExperientialLearningResponse)
def create_experience(
    payload: schemas.ExperientialLearningCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(MANAGERS)),
):
    data = payload.model_dump()
    validate(data)
    if not db.query(models.Student).filter(models.Student.id == data["student_id"]).first():
        raise HTTPException(status_code=404, detail="Student not found")
    record = models.ExperientialLearning(**data)
    db.add(record)
    db.commit()
    db.refresh(record)
    return serialize(record, db)


@router.put("/{record_id}", response_model=schemas.ExperientialLearningResponse)
def update_experience(
    record_id: int,
    payload: schemas.ExperientialLearningUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(MANAGERS)),
):
    record = db.query(models.ExperientialLearning).filter(models.ExperientialLearning.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Experience record not found")
    data = payload.model_dump(exclude_unset=True)
    validate({
        "experience_type": data.get("experience_type", record.experience_type),
        "status": data.get("status", record.status),
        "required_hours": data.get("required_hours", record.required_hours),
        "completed_hours": data.get("completed_hours", record.completed_hours),
    })
    for key, value in data.items():
        setattr(record, key, value)
    db.commit()
    db.refresh(record)
    return serialize(record, db)


@router.delete("/{record_id}")
def delete_experience(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(["Admin", "Principal"])),
):
    record = db.query(models.ExperientialLearning).filter(models.ExperientialLearning.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Experience record not found")
    db.delete(record)
    db.commit()
    return {"message": "Experience record deleted"}


@router.get("/{record_id}/logbook", response_model=list[schemas.ExperientialLogEntryResponse])
def list_logbook(record_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_roles(MANAGERS))):
    if not db.get(models.ExperientialLearning, record_id):
        raise HTTPException(status_code=404, detail="Experience record not found")
    return db.query(models.ExperientialLogEntry).filter(models.ExperientialLogEntry.experience_id == record_id).order_by(models.ExperientialLogEntry.log_date.desc()).all()


@router.post("/{record_id}/logbook", response_model=schemas.ExperientialLogEntryResponse)
def add_logbook_entry(record_id: int, payload: schemas.ExperientialLogEntryBase, db: Session = Depends(get_db), current_user: models.User = Depends(require_roles(MANAGERS))):
    record = db.get(models.ExperientialLearning, record_id)
    if not record:
        raise HTTPException(status_code=404, detail="Experience record not found")
    data = payload.model_dump()
    if data["verification_status"] not in VERIFICATION_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid verification status")
    if record.start_date and data["log_date"] < record.start_date or record.end_date and data["log_date"] > record.end_date:
        raise HTTPException(status_code=400, detail="Log date must be within the experience period")
    entry = models.ExperientialLogEntry(experience_id=record_id, **data)
    if entry.verification_status == "Verified": entry.verified_at = datetime.utcnow()
    db.add(entry); db.commit(); db.refresh(entry)
    return entry


@router.put("/{record_id}/logbook/{entry_id}", response_model=schemas.ExperientialLogEntryResponse)
def update_logbook_entry(record_id: int, entry_id: int, payload: schemas.ExperientialLogEntryBase, db: Session = Depends(get_db), current_user: models.User = Depends(require_roles(MANAGERS))):
    entry = db.get(models.ExperientialLogEntry, entry_id)
    if not entry or entry.experience_id != record_id:
        raise HTTPException(status_code=404, detail="Logbook entry not found")
    data = payload.model_dump()
    if data["verification_status"] not in VERIFICATION_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid verification status")
    for key, value in data.items(): setattr(entry, key, value)
    entry.verified_at = datetime.utcnow() if entry.verification_status == "Verified" else None
    db.commit(); db.refresh(entry); return entry


@router.delete("/{record_id}/logbook/{entry_id}")
def delete_logbook_entry(record_id: int, entry_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_roles(MANAGERS))):
    entry = db.get(models.ExperientialLogEntry, entry_id)
    if not entry or entry.experience_id != record_id:
        raise HTTPException(status_code=404, detail="Logbook entry not found")
    db.delete(entry); db.commit(); return {"message": "Logbook entry deleted"}
