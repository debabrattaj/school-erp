from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.exam_scheduling import validate_offset_days
from app.models import AcademicYear, Exam, ExamGenerationRun, ExamTemplate, User
from app.schemas import (
    ExamTemplateCreate,
    ExamTemplateUpdate,
    ExamTemplateResponse,
    ExamGenerationRunResponse,
    SeedExamTemplatesRequest,
    SeedExamTemplatesResponse,
)
from app.security import require_roles

router = APIRouter(prefix="/exam-templates", tags=["Assessments & Exams"])

MANAGE_ROLES = ["Admin", "Principal"]
VIEW_ROLES = ["Admin", "Principal", "Teacher"]


def get_template_or_404(db: Session, template_id: int) -> ExamTemplate:
    template = db.query(ExamTemplate).filter(ExamTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="Exam template not found")
    return template


@router.post("/", response_model=ExamTemplateResponse)
def create_exam_template(
    payload: ExamTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGE_ROLES)),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")

    try:
        validate_offset_days(payload.offset_days)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    duplicate = db.query(ExamTemplate).filter(ExamTemplate.name == name).first()
    if duplicate:
        raise HTTPException(status_code=400, detail="An exam template with this name already exists")

    template = ExamTemplate(
        name=name,
        exam_type=payload.exam_type,
        offset_days=payload.offset_days,
        is_active=payload.is_active if payload.is_active is not None else True,
        remarks=payload.remarks,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.get("/", response_model=list[ExamTemplateResponse])
def list_exam_templates(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(VIEW_ROLES)),
):
    return db.query(ExamTemplate).order_by(ExamTemplate.offset_days.asc()).all()


@router.get("/generation-runs", response_model=list[ExamGenerationRunResponse])
def list_exam_generation_runs(
    exam_template_id: int | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(VIEW_ROLES)),
):
    query = db.query(ExamGenerationRun)
    if exam_template_id is not None:
        query = query.filter(ExamGenerationRun.exam_template_id == exam_template_id)
    return query.order_by(ExamGenerationRun.id.desc()).limit(min(limit, 200)).all()


@router.put("/{template_id}", response_model=ExamTemplateResponse)
def update_exam_template(
    template_id: int,
    payload: ExamTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGE_ROLES)),
):
    template = get_template_or_404(db, template_id)
    update_data = payload.model_dump(exclude_unset=True)

    if "name" in update_data:
        name = (update_data["name"] or "").strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        duplicate = (
            db.query(ExamTemplate)
            .filter(ExamTemplate.name == name, ExamTemplate.id != template_id)
            .first()
        )
        if duplicate:
            raise HTTPException(status_code=400, detail="An exam template with this name already exists")
        update_data["name"] = name

    if "offset_days" in update_data:
        try:
            validate_offset_days(update_data["offset_days"])
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    for key, value in update_data.items():
        setattr(template, key, value)

    db.commit()
    db.refresh(template)
    return template


@router.delete("/{template_id}")
def delete_exam_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    template = get_template_or_404(db, template_id)
    db.delete(template)
    db.commit()
    return {"message": "Exam template deleted"}


@router.post("/seed-from-year", response_model=SeedExamTemplatesResponse)
def seed_templates_from_year(
    payload: SeedExamTemplatesRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGE_ROLES)),
):
    """Bootstrap the recurring exam calendar from a year that already
    happened: copy each of that year's exams into an Exam Template, with
    offset_days computed from the year's own start_date. Lets a school with
    exam history skip typing the calendar in from scratch."""
    year = (
        db.query(AcademicYear)
        .filter(AcademicYear.name == payload.academic_year)
        .first()
    )
    if not year:
        raise HTTPException(status_code=404, detail="Academic year not found")
    if not year.start_date:
        raise HTTPException(
            status_code=400,
            detail=f"{year.name} has no start date set, so exam offsets can't be computed",
        )

    exams = db.query(Exam).filter(Exam.academic_year == payload.academic_year).all()

    created_names = []
    skipped_count = 0
    for exam in exams:
        existing = db.query(ExamTemplate).filter(ExamTemplate.name == exam.exam_name).first()
        if existing:
            skipped_count += 1
            continue

        offset_days = (exam.exam_date - year.start_date).days
        if offset_days < 0:
            skipped_count += 1
            continue

        template = ExamTemplate(
            name=exam.exam_name,
            exam_type=exam.exam_type,
            offset_days=offset_days,
            is_active=True,
            remarks=f"Seeded from {year.name}'s exam calendar",
        )
        db.add(template)
        created_names.append(exam.exam_name)

    db.commit()

    return SeedExamTemplatesResponse(
        created_count=len(created_names),
        skipped_count=skipped_count,
        created_names=created_names,
    )
