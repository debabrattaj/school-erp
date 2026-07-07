from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.routes.admission_workflow import ensure_default_stages

router = APIRouter(prefix="/admissions", tags=["Admissions"])


def validate_stage(db: Session, stage: str | None):
    if not stage:
        return
    ensure_default_stages(db)
    exists = db.query(models.AdmissionWorkflowStage).filter(
        models.AdmissionWorkflowStage.name == stage
    ).first()
    if not exists:
        raise HTTPException(status_code=400, detail=f"Unknown admission stage: {stage}")


def get_inquiry_or_404(db: Session, inquiry_id: int):
    inquiry = (
        db.query(models.AdmissionInquiry)
        .filter(models.AdmissionInquiry.id == inquiry_id)
        .first()
    )

    if not inquiry:
        raise HTTPException(status_code=404, detail="Admission inquiry not found")

    return inquiry


def commit_or_400(db: Session, message: str):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=message)


def next_inquiry_no(db: Session):
    latest = (
        db.query(models.AdmissionInquiry)
        .order_by(models.AdmissionInquiry.id.desc())
        .first()
    )
    next_number = (latest.id + 1) if latest else 1
    return f"ADM-INQ-{next_number:04d}"


def next_student_admission_no(db: Session):
    latest_student = (
        db.query(models.Student)
        .order_by(models.Student.id.desc())
        .first()
    )

    next_number = ((latest_student.id if latest_student else 0) + 1)
    return f"ADM2026{next_number:03d}"


@router.get("/", response_model=list[schemas.AdmissionInquiryResponse])
def get_admission_inquiries(
    stage: str | None = None,
    academic_year: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.AdmissionInquiry)

    if stage:
        query = query.filter(models.AdmissionInquiry.stage == stage)

    if academic_year:
        query = query.filter(models.AdmissionInquiry.academic_year == academic_year)

    return query.order_by(models.AdmissionInquiry.id.desc()).all()


@router.get("/next-admission-no")
def get_next_student_admission_no(db: Session = Depends(get_db)):
    return {"admission_no": next_student_admission_no(db)}


@router.get("/{inquiry_id}", response_model=schemas.AdmissionInquiryResponse)
def get_admission_inquiry(inquiry_id: int, db: Session = Depends(get_db)):
    return get_inquiry_or_404(db, inquiry_id)


@router.post("/", response_model=schemas.AdmissionInquiryResponse)
def create_admission_inquiry(
    payload: schemas.AdmissionInquiryCreate,
    db: Session = Depends(get_db),
):
    data = payload.model_dump()
    data["inquiry_no"] = data["inquiry_no"].strip() or next_inquiry_no(db)
    validate_stage(db, data.get("stage"))
    inquiry = models.AdmissionInquiry(**data)

    db.add(inquiry)
    commit_or_400(db, "Admission inquiry number already exists")
    db.refresh(inquiry)
    return inquiry


@router.put("/{inquiry_id}", response_model=schemas.AdmissionInquiryResponse)
def update_admission_inquiry(
    inquiry_id: int,
    payload: schemas.AdmissionInquiryUpdate,
    db: Session = Depends(get_db),
):
    inquiry = get_inquiry_or_404(db, inquiry_id)
    data = payload.model_dump()
    data["inquiry_no"] = data["inquiry_no"].strip() or inquiry.inquiry_no
    validate_stage(db, data.get("stage"))

    for key, value in data.items():
        setattr(inquiry, key, value)

    commit_or_400(db, "Admission inquiry number already exists")
    db.refresh(inquiry)
    return inquiry


@router.get(
    "/{inquiry_id}/follow-ups",
    response_model=list[schemas.AdmissionFollowUpResponse],
)
def get_admission_follow_ups(inquiry_id: int, db: Session = Depends(get_db)):
    get_inquiry_or_404(db, inquiry_id)
    return (
        db.query(models.AdmissionFollowUp)
        .filter(models.AdmissionFollowUp.inquiry_id == inquiry_id)
        .order_by(models.AdmissionFollowUp.activity_date.desc(), models.AdmissionFollowUp.id.desc())
        .all()
    )


@router.post(
    "/{inquiry_id}/follow-ups",
    response_model=schemas.AdmissionFollowUpResponse,
)
def create_admission_follow_up(
    inquiry_id: int,
    payload: schemas.AdmissionFollowUpCreate,
    db: Session = Depends(get_db),
):
    inquiry = get_inquiry_or_404(db, inquiry_id)
    data = payload.model_dump()
    data["inquiry_id"] = inquiry_id

    if not data.get("notes", "").strip():
        raise HTTPException(status_code=400, detail="Follow-up notes are required")

    follow_up = models.AdmissionFollowUp(**data)
    db.add(follow_up)

    inquiry.follow_up_date = data.get("next_follow_up_date")
    inquiry.assigned_to = data.get("owner") or inquiry.assigned_to
    if data.get("next_action"):
        inquiry.notes = (
            f"Next action: {data['next_action']}\n\n{inquiry.notes or ''}"
        ).strip()

    db.commit()
    db.refresh(follow_up)
    return follow_up


@router.post("/{inquiry_id}/convert", response_model=schemas.StudentResponse)
def convert_admission_to_student(
    inquiry_id: int,
    payload: schemas.AdmissionConvertToStudentRequest,
    db: Session = Depends(get_db),
):
    inquiry = get_inquiry_or_404(db, inquiry_id)

    if inquiry.converted_student_id:
        raise HTTPException(status_code=400, detail="Inquiry is already converted")

    if not payload.first_name.strip():
        raise HTTPException(status_code=400, detail="First name is required")

    admission_no = (payload.admission_no or "").strip() or next_student_admission_no(db)

    existing_student = (
        db.query(models.Student)
        .filter(models.Student.admission_no == admission_no)
        .first()
    )
    if existing_student:
        raise HTTPException(
            status_code=400,
            detail="Student with this admission number already exists",
        )

    student = models.Student(
        admission_no=admission_no,
        first_name=payload.first_name.strip(),
        last_name=(payload.last_name or "").strip() or None,
        class_name=payload.class_name or inquiry.grade_applying,
        section=payload.section,
        admission_date=payload.admission_date,
        student_status=payload.student_status or "Active",
        guardian_name=payload.guardian_name or inquiry.guardian_name,
        guardian_phone=payload.guardian_phone or inquiry.guardian_phone,
        guardian_email=payload.guardian_email or inquiry.guardian_email,
    )

    db.add(student)
    db.flush()

    inquiry.converted_student_id = student.id
    inquiry.stage = "Enrolled"

    db.commit()
    db.refresh(student)
    return student


@router.delete("/{inquiry_id}")
def delete_admission_inquiry(inquiry_id: int, db: Session = Depends(get_db)):
    inquiry = get_inquiry_or_404(db, inquiry_id)

    db.delete(inquiry)
    db.commit()

    return {"message": "Admission inquiry deleted successfully"}
