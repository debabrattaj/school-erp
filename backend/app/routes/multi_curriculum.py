from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import MultiCurriculumPlan, SchoolClass, User
from app.schemas import MultiCurriculumPlanCreate, MultiCurriculumPlanResponse
from app.security import require_roles

router = APIRouter(prefix="/multi-curriculum", tags=["Multi Curriculum"])

VALID_TRACKS = [
    "IB PYP",
    "IB MYP",
    "IB DP",
    "Cambridge Primary",
    "Cambridge Lower Secondary",
    "IGCSE",
    "A-Level",
    "CBSE",
    "ICSE",
    "State Board",
    "Custom",
]

VALID_STATUSES = ["Draft", "Active", "Archived"]


def get_or_404(db: Session, model, record_id: int, label: str):
    record = db.query(model).filter(model.id == record_id).first()

    if not record:
        raise HTTPException(status_code=404, detail=f"{label} not found")

    return record


def validate_payload(payload: MultiCurriculumPlanCreate, db: Session):
    if not payload.program_name.strip():
        raise HTTPException(status_code=400, detail="Program name is required")

    if payload.curriculum_track not in VALID_TRACKS:
        raise HTTPException(status_code=400, detail="Invalid curriculum track")

    if not payload.grade_level.strip():
        raise HTTPException(status_code=400, detail="Grade level is required")

    if not payload.academic_year.strip():
        raise HTTPException(status_code=400, detail="Academic year is required")

    if payload.status and payload.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid curriculum status")

    if payload.class_id:
        get_or_404(db, SchoolClass, payload.class_id, "Class")


def serialize_plan(plan: MultiCurriculumPlan, db: Session):
    school_class = None

    if plan.class_id:
        school_class = db.query(SchoolClass).filter(SchoolClass.id == plan.class_id).first()

    class_name = school_class.class_name if school_class else None
    section = school_class.section if school_class else None
    class_display = " ".join([part for part in [class_name, section] if part])

    return {
        "id": plan.id,
        "program_name": plan.program_name,
        "curriculum_track": plan.curriculum_track,
        "grade_level": plan.grade_level,
        "academic_year": plan.academic_year,
        "class_id": plan.class_id,
        "subject_groups": plan.subject_groups,
        "assessment_model": plan.assessment_model,
        "coordinator": plan.coordinator,
        "status": plan.status,
        "remarks": plan.remarks,
        "created_at": plan.created_at,
        "updated_at": plan.updated_at,
        "class_name": class_name,
        "section": section,
        "class_display": class_display or None,
    }


@router.get("/", response_model=list[MultiCurriculumPlanResponse])
def get_curriculum_plans(
    curriculum_track: str | None = None,
    academic_year: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher"])),
):
    query = db.query(MultiCurriculumPlan)

    if curriculum_track:
        query = query.filter(MultiCurriculumPlan.curriculum_track == curriculum_track)

    if academic_year:
        query = query.filter(MultiCurriculumPlan.academic_year == academic_year)

    if status:
        query = query.filter(MultiCurriculumPlan.status == status)

    plans = query.order_by(MultiCurriculumPlan.id.desc()).all()
    return [serialize_plan(plan, db) for plan in plans]


@router.get("/{plan_id}", response_model=MultiCurriculumPlanResponse)
def get_curriculum_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher"])),
):
    plan = get_or_404(db, MultiCurriculumPlan, plan_id, "Curriculum plan")
    return serialize_plan(plan, db)


@router.post("/", response_model=MultiCurriculumPlanResponse)
def create_curriculum_plan(
    payload: MultiCurriculumPlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    validate_payload(payload, db)

    plan = MultiCurriculumPlan(**payload.model_dump())
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return serialize_plan(plan, db)


@router.put("/{plan_id}", response_model=MultiCurriculumPlanResponse)
def update_curriculum_plan(
    plan_id: int,
    payload: MultiCurriculumPlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    plan = get_or_404(db, MultiCurriculumPlan, plan_id, "Curriculum plan")
    validate_payload(payload, db)

    for key, value in payload.model_dump().items():
        setattr(plan, key, value)

    db.commit()
    db.refresh(plan)
    return serialize_plan(plan, db)


@router.delete("/{plan_id}")
def delete_curriculum_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    plan = get_or_404(db, MultiCurriculumPlan, plan_id, "Curriculum plan")
    db.delete(plan)
    db.commit()
    return {"message": "Curriculum plan deleted successfully"}
