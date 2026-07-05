from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.models import User
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

    year = models.AcademicYear(
        name=name,
        start_date=payload.start_date,
        end_date=payload.end_date,
        remarks=payload.remarks,
        status="Upcoming",
        is_current=False,
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
