from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SchoolSettings, User
from app.schemas import SchoolSettingsUpdate, SchoolSettingsResponse
from app.security import require_roles

router = APIRouter(prefix="/settings", tags=["School Settings"])


def create_default_settings(db: Session):
    # Generic placeholders only — schools created through the platform
    # console get their real name/details seeded directly (see
    # app.routes.platform.create_school); this fallback only fires if a
    # tenant's settings row is somehow missing when Settings is first opened.
    settings = SchoolSettings(
        school_name="New School",
        academic_year="",
        default_sections="A,B,C",
        houses="Red,Blue,Green,Yellow",
        working_days="Monday-Saturday",
        currency="INR",
        receipt_prefix="REC",
        pass_percentage=40,
        grade_rules="A+:90-100,A:80-89,B:70-79,C:60-69,D:40-59,F:0-39"
    )

    db.add(settings)
    db.commit()
    db.refresh(settings)

    return settings


@router.get("/", response_model=SchoolSettingsResponse)
def get_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Accounts", "Teacher"])
    )
):
    settings = db.query(SchoolSettings).first()

    if not settings:
        settings = create_default_settings(db)

    return settings


@router.put("/", response_model=SchoolSettingsResponse)
def update_settings(
    settings_data: SchoolSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"]))
):
    settings = db.query(SchoolSettings).first()

    if not settings:
        settings = create_default_settings(db)

    update_data = settings_data.model_dump(exclude_unset=True)

    for key, value in update_data.items():
        setattr(settings, key, value)

    db.commit()
    db.refresh(settings)

    return settings