from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SchoolSettings, User
from app.schemas import SchoolSettingsUpdate, SchoolSettingsResponse
from app.security import require_roles

router = APIRouter(prefix="/settings", tags=["School Settings"])


def create_default_settings(db: Session):
    settings = SchoolSettings(
        school_name="KIIT International School",
        tagline="Nurturing Global Citizens",
        institution_type="International School",
        board_affiliation="CBSE / Cambridge",
        school_code="KIITIS-BBSR",
        website="https://kiitis.ac.in",
        campus_name="Main Campus",
        campus_city="Bhubaneswar",
        campus_state="Odisha",
        campus_country="India",
        address="Bhubaneswar, Odisha",
        phone="",
        email="",
        principal_name="",
        academic_year="2026 - 2027",
        default_sections="A,B,C",
        houses="Red,Blue,Green,Yellow",
        working_days="Monday-Saturday",
        currency="INR",
        receipt_prefix="KIITIS-REC",
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