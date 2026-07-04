from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AdmissionAssessment, AdmissionInquiry, User
from app.schemas import AdmissionAssessmentCreate, AdmissionAssessmentResponse
from app.security import require_roles

router = APIRouter(
    prefix="/admission-assessments",
    tags=["Admission Assessments"],
)

VALID_TYPES = [
    "Entrance Test",
    "Student Interview",
    "Parent Interview",
    "Portfolio Review",
    "Language Assessment",
    "Counselor Meeting",
]

VALID_MODES = ["On Campus", "Online", "Hybrid", "Phone"]
VALID_STATUSES = ["Scheduled", "Completed", "Rescheduled", "Cancelled", "No Show"]
VALID_OUTCOMES = ["Pending", "Recommended", "Waitlisted", "Not Recommended", "Offer Sent"]


def get_or_404(db: Session, model, record_id: int, label: str):
    record = db.query(model).filter(model.id == record_id).first()

    if not record:
        raise HTTPException(status_code=404, detail=f"{label} not found")

    return record


def validate_payload(payload: AdmissionAssessmentCreate, db: Session):
    get_or_404(db, AdmissionInquiry, payload.inquiry_id, "Admission inquiry")

    if payload.assessment_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail="Invalid assessment type")

    if payload.mode and payload.mode not in VALID_MODES:
        raise HTTPException(status_code=400, detail="Invalid assessment mode")

    if payload.status and payload.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid assessment status")

    if payload.outcome and payload.outcome not in VALID_OUTCOMES:
        raise HTTPException(status_code=400, detail="Invalid assessment outcome")

    if payload.score is not None and (payload.score < 0 or payload.score > 100):
        raise HTTPException(status_code=400, detail="Score must be between 0 and 100")


def serialize_assessment(assessment: AdmissionAssessment, db: Session):
    inquiry = (
        db.query(AdmissionInquiry)
        .filter(AdmissionInquiry.id == assessment.inquiry_id)
        .first()
    )

    return {
        "id": assessment.id,
        "inquiry_id": assessment.inquiry_id,
        "assessment_type": assessment.assessment_type,
        "scheduled_date": assessment.scheduled_date,
        "scheduled_time": assessment.scheduled_time,
        "mode": assessment.mode,
        "panel_members": assessment.panel_members,
        "location": assessment.location,
        "status": assessment.status,
        "score": assessment.score,
        "outcome": assessment.outcome,
        "next_follow_up_date": assessment.next_follow_up_date,
        "remarks": assessment.remarks,
        "created_at": assessment.created_at,
        "updated_at": assessment.updated_at,
        "inquiry_no": inquiry.inquiry_no if inquiry else None,
        "student_name": inquiry.student_name if inquiry else None,
        "grade_applying": inquiry.grade_applying if inquiry else None,
        "guardian_name": inquiry.guardian_name if inquiry else None,
        "guardian_phone": inquiry.guardian_phone if inquiry else None,
        "admission_stage": inquiry.stage if inquiry else None,
    }


@router.get("/", response_model=list[AdmissionAssessmentResponse])
def get_admission_assessments(
    inquiry_id: int | None = None,
    status: str | None = None,
    outcome: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher"])),
):
    query = db.query(AdmissionAssessment)

    if inquiry_id:
        query = query.filter(AdmissionAssessment.inquiry_id == inquiry_id)

    if status:
        query = query.filter(AdmissionAssessment.status == status)

    if outcome:
        query = query.filter(AdmissionAssessment.outcome == outcome)

    assessments = query.order_by(AdmissionAssessment.id.desc()).all()
    return [serialize_assessment(assessment, db) for assessment in assessments]


@router.get("/{assessment_id}", response_model=AdmissionAssessmentResponse)
def get_admission_assessment(
    assessment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher"])),
):
    assessment = get_or_404(db, AdmissionAssessment, assessment_id, "Admission assessment")
    return serialize_assessment(assessment, db)


@router.post("/", response_model=AdmissionAssessmentResponse)
def create_admission_assessment(
    payload: AdmissionAssessmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    validate_payload(payload, db)

    assessment = AdmissionAssessment(**payload.model_dump())
    db.add(assessment)
    db.commit()
    db.refresh(assessment)
    return serialize_assessment(assessment, db)


@router.put("/{assessment_id}", response_model=AdmissionAssessmentResponse)
def update_admission_assessment(
    assessment_id: int,
    payload: AdmissionAssessmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    assessment = get_or_404(db, AdmissionAssessment, assessment_id, "Admission assessment")
    validate_payload(payload, db)

    for key, value in payload.model_dump().items():
        setattr(assessment, key, value)

    db.commit()
    db.refresh(assessment)
    return serialize_assessment(assessment, db)


@router.delete("/{assessment_id}")
def delete_admission_assessment(
    assessment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    assessment = get_or_404(db, AdmissionAssessment, assessment_id, "Admission assessment")
    db.delete(assessment)
    db.commit()
    return {"message": "Admission assessment deleted successfully"}
