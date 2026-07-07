from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.models import User
from app.security import require_roles

router = APIRouter(prefix="/admission-workflow-stages", tags=["Admission Workflow"])

DEFAULT_STAGES = [
    ("Inquiry", 1, False),
    ("Contacted", 2, False),
    ("Visit Scheduled", 3, False),
    ("Assessment", 4, False),
    ("Offered", 5, False),
    ("Enrolled", 6, True),
    ("Lost", 7, True),
]


def ensure_default_stages(db: Session):
    if db.query(models.AdmissionWorkflowStage).count() > 0:
        return
    for name, order, terminal in DEFAULT_STAGES:
        db.add(models.AdmissionWorkflowStage(name=name, sort_order=order, is_terminal=terminal))
    db.commit()


@router.get("/", response_model=list[schemas.AdmissionWorkflowStageResponse])
def list_stages(db: Session = Depends(get_db)):
    ensure_default_stages(db)
    return (
        db.query(models.AdmissionWorkflowStage)
        .order_by(models.AdmissionWorkflowStage.sort_order, models.AdmissionWorkflowStage.id)
        .all()
    )


@router.post("/", response_model=schemas.AdmissionWorkflowStageResponse)
def create_stage(
    payload: schemas.AdmissionWorkflowStageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    ensure_default_stages(db)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Stage name is required")

    max_order = db.query(models.AdmissionWorkflowStage).count()
    stage = models.AdmissionWorkflowStage(
        name=name,
        sort_order=payload.sort_order if payload.sort_order is not None else max_order + 1,
        is_terminal=bool(payload.is_terminal),
    )
    db.add(stage)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="A stage with this name already exists")
    db.refresh(stage)
    return stage


@router.put("/{stage_id}", response_model=schemas.AdmissionWorkflowStageResponse)
def update_stage(
    stage_id: int,
    payload: schemas.AdmissionWorkflowStageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    stage = db.query(models.AdmissionWorkflowStage).filter(
        models.AdmissionWorkflowStage.id == stage_id
    ).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")

    old_name = stage.name
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        new_name = data["name"].strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Stage name is required")
        stage.name = new_name
    if "sort_order" in data and data["sort_order"] is not None:
        stage.sort_order = data["sort_order"]
    if "is_terminal" in data and data["is_terminal"] is not None:
        stage.is_terminal = data["is_terminal"]

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="A stage with this name already exists")
    db.refresh(stage)

    if stage.name != old_name:
        db.query(models.AdmissionInquiry).filter(
            models.AdmissionInquiry.stage == old_name
        ).update({"stage": stage.name})
        db.commit()

    return stage


@router.delete("/{stage_id}")
def delete_stage(
    stage_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    stage = db.query(models.AdmissionWorkflowStage).filter(
        models.AdmissionWorkflowStage.id == stage_id
    ).first()
    if not stage:
        raise HTTPException(status_code=404, detail="Stage not found")

    in_use = db.query(models.AdmissionInquiry).filter(
        models.AdmissionInquiry.stage == stage.name
    ).count()
    if in_use:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete: {in_use} inquiry(ies) are currently in this stage",
        )

    db.delete(stage)
    db.commit()
    return {"message": "Stage deleted successfully"}
