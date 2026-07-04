from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ComplianceTask, User
from app.schemas import ComplianceTaskCreate, ComplianceTaskResponse
from app.security import require_roles

router = APIRouter(prefix="/compliance", tags=["Compliance & Accreditation"])

VALID_BODIES = ["IB", "Cambridge", "CBSE", "ICSE", "State", "Local Authority", "Internal", "Other"]
VALID_RISK_LEVELS = ["Low", "Medium", "High", "Critical"]
VALID_STATUSES = ["Open", "In Progress", "Evidence Ready", "Reviewed", "Completed", "Deferred"]


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


def next_task_code(db: Session):
    latest = db.query(ComplianceTask).order_by(ComplianceTask.id.desc()).first()
    next_number = (latest.id + 1) if latest else 1
    return f"CMP-{next_number:04d}"


def validate_payload(payload: ComplianceTaskCreate):
    if payload.accreditation_body not in VALID_BODIES:
        raise HTTPException(status_code=400, detail="Invalid accreditation body")

    if not payload.standard_area.strip():
        raise HTTPException(status_code=400, detail="Standard area is required")

    if not payload.requirement.strip():
        raise HTTPException(status_code=400, detail="Requirement is required")

    if payload.risk_level and payload.risk_level not in VALID_RISK_LEVELS:
        raise HTTPException(status_code=400, detail="Invalid risk level")

    if payload.status and payload.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid compliance status")


@router.get("/", response_model=list[ComplianceTaskResponse])
def get_tasks(
    accreditation_body: str | None = None,
    status: str | None = None,
    risk_level: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    query = db.query(ComplianceTask)

    if accreditation_body:
        query = query.filter(ComplianceTask.accreditation_body == accreditation_body)
    if status:
        query = query.filter(ComplianceTask.status == status)
    if risk_level:
        query = query.filter(ComplianceTask.risk_level == risk_level)

    return query.order_by(ComplianceTask.id.desc()).all()


@router.post("/", response_model=ComplianceTaskResponse)
def create_task(
    payload: ComplianceTaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    validate_payload(payload)
    data = payload.model_dump()
    data["task_code"] = data["task_code"].strip() or next_task_code(db)
    task = ComplianceTask(**data)
    db.add(task)
    commit_or_400(db, "Compliance task code already exists")
    db.refresh(task)
    return task


@router.put("/{task_id}", response_model=ComplianceTaskResponse)
def update_task(
    task_id: int,
    payload: ComplianceTaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    task = get_or_404(db, ComplianceTask, task_id, "Compliance task")
    validate_payload(payload)
    data = payload.model_dump()
    data["task_code"] = data["task_code"].strip() or task.task_code

    for key, value in data.items():
        setattr(task, key, value)

    commit_or_400(db, "Compliance task code already exists")
    db.refresh(task)
    return task


@router.delete("/{task_id}")
def delete_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    task = get_or_404(db, ComplianceTask, task_id, "Compliance task")
    db.delete(task)
    db.commit()
    return {"message": "Compliance task deleted successfully"}
