from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.models import User
from app.promotion_scheduling import validate_promotion_schedule
from app.security import require_roles

router = APIRouter(
    prefix="/academic-years",
    tags=["Academic Years"],
)

MANAGE_ROLES = ["Admin", "Principal"]
VIEW_ROLES = ["Admin", "Principal", "Accounts", "Teacher"]

VALID_STATUSES = ["Upcoming", "Active", "Closed"]


def get_year_or_404(db: Session, year_id: int) -> models.AcademicYear:
    year = (
        db.query(models.AcademicYear)
        .filter(models.AcademicYear.id == year_id)
        .first()
    )
    if not year:
        raise HTTPException(status_code=404, detail="Academic year not found")
    return year


def validate_auto_promote_fields(db: Session, enabled, auto_promote_date, to_year, exclude_year_id):
    try:
        validate_promotion_schedule(bool(enabled), auto_promote_date, to_year)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if enabled and to_year:
        query = db.query(models.AcademicYear).filter(models.AcademicYear.name == to_year)
        if exclude_year_id is not None:
            query = query.filter(models.AcademicYear.id != exclude_year_id)
        if not query.first():
            raise HTTPException(
                status_code=400,
                detail=f"auto_promote_to_year '{to_year}' is not a known academic year",
            )


def sync_master_data(db: Session, name: str):
    """Keep MasterData AcademicYear entries in sync so existing
    validate_academic_year checks across the app keep working."""
    exists = (
        db.query(models.MasterData)
        .filter(
            models.MasterData.category == "AcademicYear",
            models.MasterData.value == name,
        )
        .first()
    )
    if exists:
        if not exists.is_active:
            exists.is_active = True
        return

    db.add(
        models.MasterData(
            category="AcademicYear",
            value=name,
            is_active=True,
        )
    )


@router.get("/", response_model=list[schemas.AcademicYearResponse])
def list_academic_years(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(VIEW_ROLES)),
):
    return (
        db.query(models.AcademicYear)
        .order_by(models.AcademicYear.name.desc())
        .all()
    )


@router.get("/promotion-runs", response_model=list[schemas.PromotionGenerationRunResponse])
def list_promotion_runs(
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(VIEW_ROLES)),
):
    return (
        db.query(models.PromotionGenerationRun)
        .order_by(models.PromotionGenerationRun.id.desc())
        .limit(min(limit, 200))
        .all()
    )


@router.get("/current", response_model=schemas.AcademicYearResponse)
def get_current_academic_year(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(VIEW_ROLES)),
):
    year = (
        db.query(models.AcademicYear)
        .filter(models.AcademicYear.is_current == True)  # noqa: E712
        .first()
    )
    if not year:
        raise HTTPException(
            status_code=404,
            detail="No current academic year is set",
        )
    return year


@router.post("/", response_model=schemas.AcademicYearResponse)
def create_academic_year(
    payload: schemas.AcademicYearCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGE_ROLES)),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name is required")

    duplicate = (
        db.query(models.AcademicYear)
        .filter(models.AcademicYear.name == name)
        .first()
    )
    if duplicate:
        raise HTTPException(
            status_code=400,
            detail="Academic year with this name already exists",
        )

    if payload.start_date and payload.end_date and payload.end_date <= payload.start_date:
        raise HTTPException(
            status_code=400,
            detail="End date must be after start date",
        )

    validate_auto_promote_fields(
        db, payload.auto_promote_enabled, payload.auto_promote_date,
        payload.auto_promote_to_year, exclude_year_id=None,
    )

    year = models.AcademicYear(
        name=name,
        start_date=payload.start_date,
        end_date=payload.end_date,
        remarks=payload.remarks,
        status="Upcoming",
        is_current=False,
        auto_promote_enabled=bool(payload.auto_promote_enabled),
        auto_promote_date=payload.auto_promote_date,
        auto_promote_to_year=payload.auto_promote_to_year,
        auto_promote_carry_forward_fees=bool(payload.auto_promote_carry_forward_fees),
    )
    db.add(year)
    sync_master_data(db, name)
    db.commit()
    db.refresh(year)
    return year


@router.put("/{year_id}", response_model=schemas.AcademicYearResponse)
def update_academic_year(
    year_id: int,
    payload: schemas.AcademicYearUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGE_ROLES)),
):
    year = get_year_or_404(db, year_id)

    if year.status == "Closed":
        raise HTTPException(
            status_code=400,
            detail="Closed academic years cannot be edited",
        )

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        duplicate = (
            db.query(models.AcademicYear)
            .filter(
                models.AcademicYear.name == name,
                models.AcademicYear.id != year_id,
            )
            .first()
        )
        if duplicate:
            raise HTTPException(
                status_code=400,
                detail="Academic year with this name already exists",
            )
        year.name = name
        sync_master_data(db, name)

    if payload.start_date is not None:
        year.start_date = payload.start_date
    if payload.end_date is not None:
        year.end_date = payload.end_date
    if payload.remarks is not None:
        year.remarks = payload.remarks

    new_enabled = payload.auto_promote_enabled if payload.auto_promote_enabled is not None else year.auto_promote_enabled
    new_date = payload.auto_promote_date if payload.auto_promote_date is not None else year.auto_promote_date
    new_to_year = payload.auto_promote_to_year if payload.auto_promote_to_year is not None else year.auto_promote_to_year
    validate_auto_promote_fields(db, new_enabled, new_date, new_to_year, exclude_year_id=year_id)

    if payload.auto_promote_enabled is not None:
        year.auto_promote_enabled = payload.auto_promote_enabled
        if not payload.auto_promote_enabled:
            year.auto_promoted_at = None  # re-enabling later should fire again
    if payload.auto_promote_date is not None:
        if year.auto_promote_date != payload.auto_promote_date:
            year.auto_promoted_at = None  # a changed date should fire again
        year.auto_promote_date = payload.auto_promote_date
    if payload.auto_promote_to_year is not None:
        year.auto_promote_to_year = payload.auto_promote_to_year
    if payload.auto_promote_carry_forward_fees is not None:
        year.auto_promote_carry_forward_fees = payload.auto_promote_carry_forward_fees

    if year.start_date and year.end_date and year.end_date <= year.start_date:
        raise HTTPException(
            status_code=400,
            detail="End date must be after start date",
        )

    year.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(year)
    return year


@router.post("/{year_id}/set-current", response_model=schemas.AcademicYearResponse)
def set_current_academic_year(
    year_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGE_ROLES)),
):
    year = get_year_or_404(db, year_id)

    if year.status == "Closed":
        raise HTTPException(
            status_code=400,
            detail="A closed academic year cannot be set as current",
        )

    db.query(models.AcademicYear).filter(
        models.AcademicYear.id != year_id
    ).update({"is_current": False})

    # Any other Active year steps back to Upcoming only if it was never closed
    db.query(models.AcademicYear).filter(
        models.AcademicYear.id != year_id,
        models.AcademicYear.status == "Active",
    ).update({"status": "Upcoming"})

    year.is_current = True
    year.status = "Active"
    year.updated_at = datetime.utcnow()

    # Keep the single settings.academic_year string in sync for legacy screens
    settings = db.query(models.SchoolSettings).first()
    if settings:
        settings.academic_year = year.name

    db.commit()
    db.refresh(year)
    return year


@router.post("/{year_id}/close", response_model=schemas.AcademicYearResponse)
def close_academic_year(
    year_id: int,
    force: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGE_ROLES)),
):
    year = get_year_or_404(db, year_id)

    if year.status == "Closed":
        raise HTTPException(status_code=400, detail="Academic year is already closed")

    pending = (
        db.query(models.StudentEnrollment)
        .filter(
            models.StudentEnrollment.academic_year == year.name,
            models.StudentEnrollment.enrollment_status == "Active",
        )
        .count()
    )

    if pending and not force:
        raise HTTPException(
            status_code=400,
            detail=(
                f"{pending} active enrollment(s) still exist for {year.name}. "
                "Run Year-End Processing first, or pass force=true to close anyway."
            ),
        )

    year.status = "Closed"
    year.is_current = False
    year.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(year)
    return year


@router.delete("/{year_id}")
def delete_academic_year(
    year_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    year = get_year_or_404(db, year_id)

    in_use = (
        db.query(models.StudentEnrollment)
        .filter(models.StudentEnrollment.academic_year == year.name)
        .count()
    )
    if in_use:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete: enrollments exist for this academic year",
        )

    db.delete(year)
    db.commit()
    return {"message": "Academic year deleted"}
