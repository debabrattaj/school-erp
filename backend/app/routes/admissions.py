from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.csv_import import csv_template_response, read_csv_upload
from app.database import get_db
from app.models import User
from app.notifications import notify_admission_inquiry_received
from app.rate_limit import check_login_allowed, login_keys, record_login_failure
from app.routes.admission_workflow import ensure_default_stages
from app.security import require_roles
from app.tenant import get_account, get_school_session_factory

router = APIRouter(prefix="/admissions", tags=["Admissions"])

# The two /public/* routes are deliberately excluded -- a prospective parent
# has no login yet. Everything else here touches guardian PII, so it needs
# the same gate the sibling admission-workflow/assessment routes already have.
MANAGERS = ["Admin", "Principal"]

INQUIRY_BULK_IMPORT_COLUMNS = [
    "inquiry_no",
    "student_name",
    "grade_applying",
    "academic_year",
    "guardian_name",
    "guardian_phone",
    "guardian_email",
    "source",
    "notes",
]

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
    return f"ADM{date.today().year}{next_number:03d}"


def find_duplicate(db: Session, phone: str | None, email: str | None, exclude_id: int | None = None):
    """The most likely existing inquiry this one duplicates, or None.

    A soft signal, not a hard rule: a phone number gets reused across
    siblings and a household easily inquires about the same child twice a
    year, so this warns a human rather than blocking or auto-merging.
    Excludes inquiries already converted to a student or otherwise closed
    out (Enrolled/Lost) -- a stale, resolved record isn't a duplicate worth
    flagging.
    """
    phone = (phone or "").strip()
    email = (email or "").strip()
    if not phone and not email:
        return None

    query = db.query(models.AdmissionInquiry).filter(
        models.AdmissionInquiry.converted_student_id.is_(None),
        models.AdmissionInquiry.stage.notin_(["Enrolled", "Lost"]),
    )
    if exclude_id:
        query = query.filter(models.AdmissionInquiry.id != exclude_id)

    candidates = query.order_by(models.AdmissionInquiry.id.desc()).all()

    if phone:
        match = next((c for c in candidates if c.guardian_phone and c.guardian_phone.strip() == phone), None)
        if match:
            return match, "phone"
    if email:
        match = next(
            (c for c in candidates if c.guardian_email and c.guardian_email.strip().lower() == email.lower()),
            None,
        )
        if match:
            return match, "email"
    return None


@router.get("/check-duplicate", response_model=list[schemas.AdmissionDuplicateCandidate])
def check_duplicate_inquiry(
    phone: str | None = None,
    email: str | None = None,
    exclude_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """Live duplicate check for the create-inquiry form -- called on
    phone/email blur, before a submission exists to flag after the fact."""
    found = find_duplicate(db, phone, email, exclude_id)
    if not found:
        return []
    match, matched_on = found
    return [
        schemas.AdmissionDuplicateCandidate(
            id=match.id,
            inquiry_no=match.inquiry_no,
            student_name=match.student_name,
            guardian_name=match.guardian_name,
            stage=match.stage,
            matched_on=matched_on,
            created_at=match.created_at,
        )
    ]


@router.get("/", response_model=list[schemas.AdmissionInquiryResponse])
def get_admission_inquiries(
    stage: str | None = None,
    academic_year: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    query = db.query(models.AdmissionInquiry)

    if stage:
        query = query.filter(models.AdmissionInquiry.stage == stage)

    if academic_year:
        query = query.filter(models.AdmissionInquiry.academic_year == academic_year)

    return query.order_by(models.AdmissionInquiry.id.desc()).all()


@router.get("/next-admission-no")
def get_next_student_admission_no(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    return {"admission_no": next_student_admission_no(db)}


@router.get("/bulk-import-template")
def bulk_import_inquiries_template(
    current_user: User = Depends(require_roles(MANAGERS)),
):
    return csv_template_response(
        INQUIRY_BULK_IMPORT_COLUMNS,
        {
            "inquiry_no": "",
            "student_name": "Aarav Sharma",
            "grade_applying": "Grade 5",
            "academic_year": "2026-27",
            "guardian_name": "Rohan Sharma",
            "guardian_phone": "9876543210",
            "guardian_email": "rohan.sharma@example.com",
            "source": "Website",
            "notes": "",
        },
        "admission_inquiries_import_template.csv",
    )


@router.post("/bulk-import")
def bulk_import_inquiries(
    file: UploadFile = File(...),
    dry_run: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    rows, unknown_columns = read_csv_upload(file, INQUIRY_BULK_IMPORT_COLUMNS)

    seen_numbers = set()
    errors = []
    to_create = []

    for row_index, cleaned in rows:
        if not cleaned.get("student_name"):
            errors.append({"row": row_index, "error": "student_name is required"})
            continue
        if not cleaned.get("grade_applying"):
            errors.append({"row": row_index, "error": "grade_applying is required"})
            continue
        if not cleaned.get("academic_year"):
            errors.append({"row": row_index, "error": "academic_year is required"})
            continue
        if not cleaned.get("guardian_name"):
            errors.append({"row": row_index, "error": "guardian_name is required"})
            continue
        if not cleaned.get("guardian_phone"):
            errors.append({"row": row_index, "error": "guardian_phone is required"})
            continue

        inquiry_no = cleaned.get("inquiry_no")
        if inquiry_no:
            if inquiry_no in seen_numbers:
                errors.append({"row": row_index, "error": f"Duplicate inquiry_no in file: {inquiry_no}"})
                continue
            if db.query(models.AdmissionInquiry).filter(models.AdmissionInquiry.inquiry_no == inquiry_no).first():
                errors.append({"row": row_index, "error": f"Inquiry number already exists: {inquiry_no}"})
                continue

        try:
            validated = schemas.AdmissionInquiryCreate(
                inquiry_no=inquiry_no or "",
                student_name=cleaned["student_name"],
                grade_applying=cleaned["grade_applying"],
                academic_year=cleaned["academic_year"],
                guardian_name=cleaned["guardian_name"],
                guardian_phone=cleaned["guardian_phone"],
                guardian_email=cleaned.get("guardian_email"),
                source=cleaned.get("source") or "Website",
                notes=cleaned.get("notes"),
            )
        except ValidationError as exc:
            errors.append({"row": row_index, "error": exc.errors()[0]["msg"]})
            continue

        if inquiry_no:
            seen_numbers.add(inquiry_no)
        to_create.append(validated)

    created_count = 0
    if not dry_run:
        for validated in to_create:
            data = validated.model_dump()
            data["inquiry_no"] = data["inquiry_no"].strip() or next_inquiry_no(db)
            found = find_duplicate(db, data.get("guardian_phone"), data.get("guardian_email"))
            data["possible_duplicate_of_id"] = found[0].id if found else None
            inquiry = models.AdmissionInquiry(**data)
            db.add(inquiry)
            db.flush()
            db.add(models.AdmissionStageHistory(
                inquiry_id=inquiry.id, from_stage=None, to_stage="Inquiry",
                changed_by=current_user.email,
            ))
        if to_create:
            db.commit()
        created_count = len(to_create)

    return {
        "total_rows": rows[-1][0] - 1 if rows else 0,
        "created": created_count if not dry_run else 0,
        "valid_rows": len(to_create),
        "errors": errors,
        "dry_run": dry_run,
        "unknown_columns": unknown_columns,
    }


@router.get("/{inquiry_id}", response_model=schemas.AdmissionInquiryResponse)
def get_admission_inquiry(
    inquiry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    return get_inquiry_or_404(db, inquiry_id)


@router.post("/", response_model=schemas.AdmissionInquiryResponse)
def create_admission_inquiry(
    payload: schemas.AdmissionInquiryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    data = payload.model_dump()
    data["inquiry_no"] = data["inquiry_no"].strip() or next_inquiry_no(db)
    validate_stage(db, data.get("stage"))

    found = find_duplicate(db, data.get("guardian_phone"), data.get("guardian_email"))
    data["possible_duplicate_of_id"] = found[0].id if found else None

    inquiry = models.AdmissionInquiry(**data)

    db.add(inquiry)
    commit_or_400(db, "Admission inquiry number already exists")
    db.refresh(inquiry)

    db.add(models.AdmissionStageHistory(
        inquiry_id=inquiry.id, from_stage=None, to_stage=inquiry.stage or "Inquiry",
        changed_by=current_user.email,
    ))
    db.commit()

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
        guardian_phone = payload.guardian_phone.strip()
        guardian_email = (payload.guardian_email or "").strip() or None
        found = find_duplicate(db, guardian_phone, guardian_email)

        inquiry = models.AdmissionInquiry(
            inquiry_no=next_inquiry_no(db),
            student_name=payload.student_name.strip(),
            grade_applying=payload.grade_applying.strip(),
            academic_year=payload.academic_year.strip(),
            guardian_name=payload.guardian_name.strip(),
            guardian_phone=guardian_phone,
            guardian_email=guardian_email,
            notes=(payload.notes or "").strip() or None,
            source="Website",
            stage="Inquiry",
            # Flagged for staff to see in the CRM, not acted on here -- a
            # false positive must never block a real parent's submission.
            possible_duplicate_of_id=found[0].id if found else None,
        )
        db.add(inquiry)
        commit_or_400(db, "Please try again in a moment.")
        db.refresh(inquiry)

        db.add(models.AdmissionStageHistory(inquiry_id=inquiry.id, from_stage=None, to_stage="Inquiry"))
        db.commit()

        settings = db.query(models.SchoolSettings).first()
        school_name = (settings.school_name if settings else None) or account.get("school_name") or "School"
        notify_admission_inquiry_received(db, inquiry, school_name)

        return schemas.PublicAdmissionInquiryResponse(
            inquiry_no=inquiry.inquiry_no, message=PUBLIC_INQUIRY_SUCCESS_MESSAGE
        )
    finally:
        db.close()


def record_stage_change(
    db: Session, inquiry: models.AdmissionInquiry, old_stage: str | None, new_stage: str, changed_by: str | None
):
    """Log the transition and stamp out the new stage's default checklist.

    A no-op on a same-stage save (e.g. editing notes without moving the
    card), so re-saving an inquiry never re-creates its stage's tasks.
    """
    if old_stage == new_stage:
        return

    db.add(models.AdmissionStageHistory(
        inquiry_id=inquiry.id, from_stage=old_stage, to_stage=new_stage, changed_by=changed_by,
    ))

    templates = (
        db.query(models.AdmissionStageTaskTemplate)
        .filter(
            models.AdmissionStageTaskTemplate.stage == new_stage,
            models.AdmissionStageTaskTemplate.is_active == True,  # noqa: E712
        )
        .all()
    )
    today = date.today()
    for template in templates:
        db.add(models.AdmissionTask(
            inquiry_id=inquiry.id,
            stage=new_stage,
            title=template.title,
            description=template.description,
            due_date=today + timedelta(days=template.due_in_days or 0),
            source_template_id=template.id,
            status="Pending",
        ))


@router.put("/{inquiry_id}", response_model=schemas.AdmissionInquiryResponse)
def update_admission_inquiry(
    inquiry_id: int,
    payload: schemas.AdmissionInquiryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    inquiry = get_inquiry_or_404(db, inquiry_id)
    data = payload.model_dump()
    data["inquiry_no"] = data["inquiry_no"].strip() or inquiry.inquiry_no
    validate_stage(db, data.get("stage"))

    old_stage = inquiry.stage
    new_stage = data.get("stage") or old_stage

    for key, value in data.items():
        setattr(inquiry, key, value)

    commit_or_400(db, "Admission inquiry number already exists")
    db.refresh(inquiry)

    if new_stage != old_stage:
        record_stage_change(db, inquiry, old_stage, new_stage, current_user.email)
        db.commit()

    return inquiry


@router.get(
    "/{inquiry_id}/follow-ups",
    response_model=list[schemas.AdmissionFollowUpResponse],
)
def get_admission_follow_ups(
    inquiry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
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
    current_user: User = Depends(require_roles(MANAGERS)),
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


def _task_response(task: models.AdmissionTask, inquiry=None, assigned_to_user_name: str | None = None) -> dict:
    return {
        "id": task.id, "inquiry_id": task.inquiry_id, "stage": task.stage,
        "title": task.title, "description": task.description, "due_date": task.due_date,
        "assigned_to_user_id": task.assigned_to_user_id, "status": task.status,
        "completed_at": task.completed_at, "completed_by": task.completed_by,
        "source_template_id": task.source_template_id, "created_at": task.created_at,
        "inquiry_no": inquiry.inquiry_no if inquiry else None,
        "student_name": inquiry.student_name if inquiry else None,
        "assigned_to_user_name": assigned_to_user_name,
    }


def _hydrate_tasks(db: Session, tasks: list[models.AdmissionTask], inquiry: models.AdmissionInquiry | None = None):
    """Attach inquiry/assignee names to a batch of tasks in two extra
    queries total, rather than one per task."""
    inquiries = {inquiry.id: inquiry} if inquiry else {
        i.id: i for i in db.query(models.AdmissionInquiry)
        .filter(models.AdmissionInquiry.id.in_({t.inquiry_id for t in tasks} or [-1]))
        .all()
    }
    users = {
        u.id: u for u in db.query(models.User)
        .filter(models.User.id.in_({t.assigned_to_user_id for t in tasks if t.assigned_to_user_id} or [-1]))
        .all()
    }
    return [
        _task_response(
            t,
            inquiries.get(t.inquiry_id),
            users[t.assigned_to_user_id].name if t.assigned_to_user_id in users else None,
        )
        for t in tasks
    ]


@router.get("/tasks/queue", response_model=list[schemas.AdmissionTaskResponse])
def admission_task_queue(
    status: str | None = "Pending",
    assigned_to_user_id: int | None = None,
    due_before: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """Every open task across every inquiry -- the "what do I do today"
    queue a single follow_up_date on the inquiry can't answer once there's
    more than one next action against a lead."""
    query = db.query(models.AdmissionTask)
    if status:
        query = query.filter(models.AdmissionTask.status == status)
    if assigned_to_user_id:
        query = query.filter(models.AdmissionTask.assigned_to_user_id == assigned_to_user_id)
    if due_before:
        query = query.filter(models.AdmissionTask.due_date <= due_before)

    tasks = query.order_by(models.AdmissionTask.due_date.is_(None), models.AdmissionTask.due_date).all()
    return _hydrate_tasks(db, tasks)


@router.get("/{inquiry_id}/tasks", response_model=list[schemas.AdmissionTaskResponse])
def get_admission_tasks(
    inquiry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    inquiry = get_inquiry_or_404(db, inquiry_id)
    tasks = (
        db.query(models.AdmissionTask)
        .filter(models.AdmissionTask.inquiry_id == inquiry_id)
        .order_by(models.AdmissionTask.status, models.AdmissionTask.due_date.is_(None), models.AdmissionTask.due_date)
        .all()
    )
    return _hydrate_tasks(db, tasks, inquiry)


@router.post("/{inquiry_id}/tasks", response_model=schemas.AdmissionTaskResponse)
def create_admission_task(
    inquiry_id: int,
    payload: schemas.AdmissionTaskCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    inquiry = get_inquiry_or_404(db, inquiry_id)
    title = payload.title.strip()
    if not title:
        raise HTTPException(status_code=400, detail="Task title is required")

    task = models.AdmissionTask(
        inquiry_id=inquiry_id,
        stage=payload.stage or inquiry.stage,
        title=title,
        description=payload.description,
        due_date=payload.due_date,
        assigned_to_user_id=payload.assigned_to_user_id,
        status="Pending",
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return _hydrate_tasks(db, [task], inquiry)[0]


@router.put("/tasks/{task_id}", response_model=schemas.AdmissionTaskResponse)
def update_admission_task(
    task_id: int,
    payload: schemas.AdmissionTaskUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    task = db.query(models.AdmissionTask).filter(models.AdmissionTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    data = payload.model_dump(exclude_unset=True)
    if "title" in data:
        if not (data["title"] or "").strip():
            raise HTTPException(status_code=400, detail="Task title is required")
        data["title"] = data["title"].strip()
    if "status" in data and data["status"] not in ("Pending", "Done", "Cancelled"):
        raise HTTPException(status_code=400, detail="Status must be one of: Pending, Done, Cancelled")

    was_done = task.status == "Done"
    for key, value in data.items():
        setattr(task, key, value)

    if task.status == "Done" and not was_done:
        task.completed_at = datetime.utcnow()
        task.completed_by = current_user.email
    elif task.status != "Done" and was_done:
        task.completed_at = None
        task.completed_by = None

    db.commit()
    db.refresh(task)
    return _hydrate_tasks(db, [task])[0]


@router.delete("/tasks/{task_id}")
def delete_admission_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    task = db.query(models.AdmissionTask).filter(models.AdmissionTask.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    db.delete(task)
    db.commit()
    return {"message": "Task deleted successfully"}


@router.get("/{inquiry_id}/stage-history", response_model=list[schemas.AdmissionStageHistoryResponse])
def get_admission_stage_history(
    inquiry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    get_inquiry_or_404(db, inquiry_id)
    return (
        db.query(models.AdmissionStageHistory)
        .filter(models.AdmissionStageHistory.inquiry_id == inquiry_id)
        .order_by(models.AdmissionStageHistory.changed_at)
        .all()
    )


@router.get("/{inquiry_id}/documents", response_model=list[schemas.AdmissionDocumentResponse])
def get_admission_documents(
    inquiry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    get_inquiry_or_404(db, inquiry_id)
    return (
        db.query(models.AdmissionDocument)
        .filter(models.AdmissionDocument.inquiry_id == inquiry_id)
        .order_by(models.AdmissionDocument.id.desc())
        .all()
    )


@router.post("/{inquiry_id}/documents", response_model=schemas.AdmissionDocumentResponse)
def add_admission_document(
    inquiry_id: int,
    payload: schemas.AdmissionDocumentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    get_inquiry_or_404(db, inquiry_id)
    if not payload.document_type.strip():
        raise HTTPException(status_code=400, detail="Document type is required")
    if not payload.file_url.strip():
        raise HTTPException(status_code=400, detail="file_url is required")

    document = models.AdmissionDocument(
        inquiry_id=inquiry_id,
        document_type=payload.document_type.strip(),
        file_name=payload.file_name,
        file_url=payload.file_url,
        uploaded_by=current_user.email,
        remarks=payload.remarks,
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@router.delete("/documents/{document_id}")
def delete_admission_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    document = (
        db.query(models.AdmissionDocument)
        .filter(models.AdmissionDocument.id == document_id)
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    db.delete(document)
    db.commit()
    return {"message": "Document deleted successfully"}


@router.post("/{inquiry_id}/convert", response_model=schemas.StudentResponse)
def convert_admission_to_student(
    inquiry_id: int,
    payload: schemas.AdmissionConvertToStudentRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
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

    old_stage = inquiry.stage
    inquiry.converted_student_id = student.id
    inquiry.stage = "Enrolled"

    db.commit()
    db.refresh(student)

    record_stage_change(db, inquiry, old_stage, "Enrolled", current_user.email)
    db.commit()

    return student


@router.delete("/{inquiry_id}")
def delete_admission_inquiry(
    inquiry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    inquiry = get_inquiry_or_404(db, inquiry_id)

    db.delete(inquiry)
    db.commit()

    return {"message": "Admission inquiry deleted successfully"}


# ---------------- Analytics ----------------


@router.get("/analytics/funnel")
def admission_funnel(
    academic_year: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """Where inquiries are right now, how many have ever reached each
    stage, and how long they typically sit there -- the shape of the
    pipeline, not just a snapshot of it.

    "Ever reached" and time-in-stage both come from AdmissionStageHistory,
    not the inquiry's current `stage` column, because a snapshot alone
    can't tell attrition from a stage merely being fast to pass through.
    """
    ensure_default_stages(db)
    stages = (
        db.query(models.AdmissionWorkflowStage)
        .order_by(models.AdmissionWorkflowStage.sort_order, models.AdmissionWorkflowStage.id)
        .all()
    )

    inquiry_query = db.query(models.AdmissionInquiry)
    if academic_year:
        inquiry_query = inquiry_query.filter(models.AdmissionInquiry.academic_year == academic_year)
    inquiries = inquiry_query.all()
    inquiry_ids = {i.id for i in inquiries}
    total = len(inquiries)

    current_counts: dict[str, int] = {}
    for inquiry in inquiries:
        current_counts[inquiry.stage] = current_counts.get(inquiry.stage, 0) + 1

    history = (
        db.query(models.AdmissionStageHistory)
        .filter(models.AdmissionStageHistory.inquiry_id.in_(inquiry_ids or [-1]))
        .order_by(models.AdmissionStageHistory.inquiry_id, models.AdmissionStageHistory.changed_at)
        .all()
    )

    ever_reached: dict[str, set[int]] = {}
    by_inquiry: dict[int, list] = {}
    for row in history:
        by_inquiry.setdefault(row.inquiry_id, []).append(row)
        ever_reached.setdefault(row.to_stage, set()).add(row.inquiry_id)

    # Time-in-stage only counts a stay that actually ended (there is a next
    # transition) -- an inquiry still sitting in a stage hasn't finished its
    # stay yet, and folding "still cooking" into an average would understate
    # every stage a lead hasn't yet left.
    dwell_days: dict[str, list[float]] = {}
    for rows in by_inquiry.values():
        for i in range(len(rows) - 1):
            delta_days = (rows[i + 1].changed_at - rows[i].changed_at).total_seconds() / 86400
            dwell_days.setdefault(rows[i].to_stage, []).append(delta_days)

    converted = sum(1 for i in inquiries if i.converted_student_id)

    stage_rows = []
    for stage in stages:
        reached = len(ever_reached.get(stage.name, set()))
        durations = dwell_days.get(stage.name, [])
        stage_rows.append({
            "stage": stage.name,
            "sort_order": stage.sort_order,
            "is_terminal": stage.is_terminal,
            "current_count": current_counts.get(stage.name, 0),
            "ever_reached": reached,
            "conversion_from_previous": None,
            "avg_days_in_stage": round(sum(durations) / len(durations), 1) if durations else None,
        })

    for i in range(1, len(stage_rows)):
        prev_reached = stage_rows[i - 1]["ever_reached"]
        stage_rows[i]["conversion_from_previous"] = (
            round(stage_rows[i]["ever_reached"] * 100.0 / prev_reached, 1) if prev_reached else None
        )

    return {
        "academic_year": academic_year,
        "total_inquiries": total,
        "converted": converted,
        "overall_conversion_rate": round(converted * 100.0 / total, 1) if total else None,
        "stages": stage_rows,
    }


@router.get("/analytics/sources")
def admission_sources(
    academic_year: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """Which lead source actually converts, not just which brings in the
    most inquiries -- the number that decides where to spend next term's
    outreach budget."""
    query = db.query(models.AdmissionInquiry)
    if academic_year:
        query = query.filter(models.AdmissionInquiry.academic_year == academic_year)
    inquiries = query.all()

    by_source: dict[str, dict] = {}
    for inquiry in inquiries:
        key = inquiry.source or "Unknown"
        row = by_source.setdefault(key, {"source": key, "inquiries": 0, "converted": 0})
        row["inquiries"] += 1
        if inquiry.converted_student_id:
            row["converted"] += 1

    results = sorted(by_source.values(), key=lambda r: r["inquiries"], reverse=True)
    for row in results:
        row["conversion_rate"] = round(row["converted"] * 100.0 / row["inquiries"], 1) if row["inquiries"] else None

    return results
