from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.notifications import notify_admission_inquiry_received
from app.rate_limit import check_login_allowed, login_keys, record_login_failure
from app.routes.admission_workflow import ensure_default_stages
from app.tenant import get_account, get_school_session_factory

router = APIRouter(prefix="/admissions", tags=["Admissions"])

PUBLIC_INQUIRY_SUCCESS_MESSAGE = (
    "Thank you! We've received your inquiry and our admissions team will be in touch soon."
)


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

    settings = db.query(models.SchoolSettings).first()
    notify_admission_inquiry_received(db, inquiry, (settings.school_name if settings else None) or "School")

    return inquiry


@router.get("/public/school-info", response_model=schemas.PublicSchoolInfoResponse)
def get_public_school_info(account_code: str = "default"):
    """Which school an /apply link belongs to, for the page to display.

    Lets the public admission form identify itself (name, tagline, logo)
    instead of showing generic branding — important since the same app is
    white-labeled per school. Returns 404 for an unknown/inactive account
    so the frontend can show "this link isn't valid" instead of silently
    falling back to the wrong school.
    """
    try:
        account = get_account(account_code)
    except HTTPException:
        raise HTTPException(status_code=404, detail="School not found")

    session_factory = get_school_session_factory(account["database_url"])
    db = session_factory()
    try:
        settings = db.query(models.SchoolSettings).first()
    finally:
        db.close()

    return schemas.PublicSchoolInfoResponse(
        school_name=(settings.school_name if settings else None) or account.get("school_name") or "School",
        tagline=settings.tagline if settings else None,
        logo_url=settings.logo_url if settings else None,
    )


@router.post("/public", response_model=schemas.PublicAdmissionInquiryResponse)
def submit_public_admission_inquiry(
    payload: schemas.PublicAdmissionInquiryCreate,
    request: Request,
):
    """Unauthenticated endpoint backing the public 'Apply Online' page.

    Resolves the tenant from `account_code` in the body (there is no login
    session yet to carry it), same pattern as /auth/forgot-password. Only
    accepts the safe subset of fields — stage, assigned_to, and
    converted_student_id are always server-assigned, never client-supplied.
    """
    keys = login_keys(
        request.client.host if request.client else None,
        payload.guardian_email,
    )
    retry_after = check_login_allowed(keys)
    if retry_after is not None:
        raise HTTPException(
            status_code=429,
            detail="Too many requests. Please try again later.",
            headers={"Retry-After": str(retry_after)},
        )
    record_login_failure(keys)

    # Honeypot: real users never see or fill this field. Pretend success so
    # bots don't learn to leave it blank, but skip the actual write.
    if (payload.website or "").strip():
        return schemas.PublicAdmissionInquiryResponse(
            inquiry_no="", message=PUBLIC_INQUIRY_SUCCESS_MESSAGE
        )

    required = {
        "Student name": payload.student_name,
        "Grade applying for": payload.grade_applying,
        "Academic year": payload.academic_year,
        "Guardian name": payload.guardian_name,
        "Guardian phone": payload.guardian_phone,
    }
    missing = [label for label, value in required.items() if not (value or "").strip()]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required field(s): {', '.join(missing)}")

    try:
        account = get_account(payload.account_code)
    except HTTPException:
        raise HTTPException(status_code=404, detail="School not found")

    session_factory = get_school_session_factory(account["database_url"])
    db = session_factory()
    try:
        inquiry = models.AdmissionInquiry(
            inquiry_no=next_inquiry_no(db),
            student_name=payload.student_name.strip(),
            grade_applying=payload.grade_applying.strip(),
            academic_year=payload.academic_year.strip(),
            guardian_name=payload.guardian_name.strip(),
            guardian_phone=payload.guardian_phone.strip(),
            guardian_email=(payload.guardian_email or "").strip() or None,
            notes=(payload.notes or "").strip() or None,
            source="Website",
            stage="Inquiry",
        )
        db.add(inquiry)
        commit_or_400(db, "Please try again in a moment.")
        db.refresh(inquiry)

        settings = db.query(models.SchoolSettings).first()
        school_name = (settings.school_name if settings else None) or account.get("school_name") or "School"
        notify_admission_inquiry_received(db, inquiry, school_name)

        return schemas.PublicAdmissionInquiryResponse(
            inquiry_no=inquiry.inquiry_no, message=PUBLIC_INQUIRY_SUCCESS_MESSAGE
        )
    finally:
        db.close()


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
