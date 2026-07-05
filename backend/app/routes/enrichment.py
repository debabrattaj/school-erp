from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import EnrichmentActivity, User
from app.schemas import EnrichmentActivityCreate, EnrichmentActivityResponse
from app.security import require_roles

router = APIRouter(prefix="/enrichment", tags=["Activities & Enrichment"])

VALID_TYPES = ["Club", "Sport", "Competition", "Trip", "Service Learning", "CAS", "Workshop", "Event"]
VALID_STATUSES = ["Planned", "Open", "Full", "Completed", "Cancelled"]


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


def next_activity_code(db: Session):
    latest = db.query(EnrichmentActivity).order_by(EnrichmentActivity.id.desc()).first()
    next_number = (latest.id + 1) if latest else 1
    return f"ACT-{next_number:04d}"


def validate_payload(payload: EnrichmentActivityCreate):
    if not payload.activity_name.strip():
        raise HTTPException(status_code=400, detail="Activity name is required")

    if payload.activity_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail="Invalid activity type")

    if payload.status and payload.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid activity status")

    if payload.capacity is not None and payload.capacity < 0:
        raise HTTPException(status_code=400, detail="Capacity cannot be negative")

    if payload.enrolled_count is not None and payload.enrolled_count < 0:
        raise HTTPException(status_code=400, detail="Enrolled count cannot be negative")

    if payload.fee_amount is not None and payload.fee_amount < 0:
        raise HTTPException(status_code=400, detail="Fee amount cannot be negative")


@router.get("/", response_model=list[EnrichmentActivityResponse])
def get_activities(
    activity_type: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher", "Accounts"])),
):
    query = db.query(EnrichmentActivity)

    if activity_type:
        query = query.filter(EnrichmentActivity.activity_type == activity_type)

    if status:
        query = query.filter(EnrichmentActivity.status == status)

    return query.order_by(EnrichmentActivity.id.desc()).all()


@router.post("/", response_model=EnrichmentActivityResponse)
def create_activity(
    payload: EnrichmentActivityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher"])),
):
    validate_payload(payload)
    data = payload.model_dump()
    data["activity_code"] = data["activity_code"].strip() or next_activity_code(db)
    activity = EnrichmentActivity(**data)
    db.add(activity)
    commit_or_400(db, "Activity code already exists")
    db.refresh(activity)
    return activity


@router.put("/{activity_id}", response_model=EnrichmentActivityResponse)
def update_activity(
    activity_id: int,
    payload: EnrichmentActivityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher"])),
):
    activity = get_or_404(db, EnrichmentActivity, activity_id, "Activity")
    validate_payload(payload)
    data = payload.model_dump()
    data["activity_code"] = data["activity_code"].strip() or activity.activity_code

    for key, value in data.items():
        setattr(activity, key, value)

    commit_or_400(db, "Activity code already exists")
    db.refresh(activity)
    return activity


@router.delete("/{activity_id}")
def delete_activity(
    activity_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    activity = get_or_404(db, EnrichmentActivity, activity_id, "Activity")
    db.delete(activity)
    db.commit()
    return {"message": "Activity deleted successfully"}
