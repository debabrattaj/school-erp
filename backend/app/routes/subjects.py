from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import ValidationError
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.csv_import import csv_template_response, read_csv_upload
from app.database import get_db
from app.security import require_roles
from app import models, schemas

router = APIRouter(
    tags=["Subjects"]
)

BULK_IMPORT_COLUMNS = ["subject_code", "subject_name", "subject_type", "is_active"]


def commit_or_400(db: Session, message: str):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=message)


def get_or_404(db: Session, model, record_id: int, label: str):
    record = db.query(model).filter(model.id == record_id).first()

    if not record:
        raise HTTPException(status_code=404, detail=f"{label} not found")

    return record


def validate_class(db: Session, class_id: int):
    return get_or_404(db, models.SchoolClass, class_id, "Class")


def validate_subject(db: Session, subject_id: int):
    return get_or_404(db, models.SubjectMaster, subject_id, "Subject")


def validate_teacher(db: Session, teacher_id: int):
    return get_or_404(db, models.Teacher, teacher_id, "Teacher")


# ======================================================
# Subject Master
# ======================================================

@router.get("/subjects/", response_model=list[schemas.SubjectResponse])
def get_subjects(db: Session = Depends(get_db)):
    return (
        db.query(models.SubjectMaster)
        .order_by(models.SubjectMaster.subject_name.asc())
        .all()
    )


@router.get("/subjects/bulk-import-template")
def bulk_import_subjects_template(
    current_user: models.User = Depends(require_roles(["Admin", "Principal"]))
):
    return csv_template_response(
        BULK_IMPORT_COLUMNS,
        {
            "subject_code": "PHY101",
            "subject_name": "Physics",
            "subject_type": "Scholastic",
            "is_active": "true",
        },
        "subjects_import_template.csv",
    )


@router.post("/subjects/bulk-import")
def bulk_import_subjects(
    file: UploadFile = File(...),
    dry_run: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(["Admin", "Principal"])),
):
    rows, unknown_columns = read_csv_upload(file, BULK_IMPORT_COLUMNS)

    seen_codes = set()
    errors = []
    to_create = []

    for row_index, cleaned in rows:
        subject_code = cleaned.get("subject_code")
        if not subject_code:
            errors.append({"row": row_index, "error": "subject_code is required"})
            continue
        if not cleaned.get("subject_name"):
            errors.append({"row": row_index, "error": "subject_name is required"})
            continue

        if cleaned.get("is_active") is not None:
            cleaned["is_active"] = cleaned["is_active"].strip().lower() in ("true", "1", "yes")

        if subject_code in seen_codes:
            errors.append({"row": row_index, "error": f"Duplicate subject_code in file: {subject_code}"})
            continue
        if db.query(models.SubjectMaster).filter(models.SubjectMaster.subject_code == subject_code).first():
            errors.append({"row": row_index, "error": f"subject_code already exists: {subject_code}"})
            continue

        try:
            validated = schemas.SubjectCreate(**cleaned)
        except ValidationError as exc:
            errors.append({"row": row_index, "error": exc.errors()[0]["msg"]})
            continue

        seen_codes.add(subject_code)
        to_create.append(validated)

    created_count = 0
    if not dry_run:
        for validated in to_create:
            db.add(models.SubjectMaster(**validated.model_dump()))
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


@router.get("/subjects/{subject_id}", response_model=schemas.SubjectResponse)
def get_subject(
    subject_id: int,
    db: Session = Depends(get_db)
):
    return validate_subject(db, subject_id)


@router.post("/subjects/", response_model=schemas.SubjectResponse)
def create_subject(
    payload: schemas.SubjectCreate,
    db: Session = Depends(get_db)
):
    subject = models.SubjectMaster(**payload.model_dump())

    db.add(subject)
    commit_or_400(db, "Subject code already exists")

    db.refresh(subject)
    return subject


@router.put("/subjects/{subject_id}", response_model=schemas.SubjectResponse)
def update_subject(
    subject_id: int,
    payload: schemas.SubjectCreate,
    db: Session = Depends(get_db)
):
    subject = validate_subject(db, subject_id)

    for key, value in payload.model_dump().items():
        setattr(subject, key, value)

    commit_or_400(db, "Subject code already exists")

    db.refresh(subject)
    return subject


@router.delete("/subjects/{subject_id}")
def delete_subject(
    subject_id: int,
    db: Session = Depends(get_db)
):
    subject = validate_subject(db, subject_id)

    db.delete(subject)
    db.commit()

    return {"message": "Subject deleted successfully"}


# ======================================================
# Class Subject Mapping
# ======================================================

@router.get(
    "/class-subjects/",
    response_model=list[schemas.ClassSubjectResponse]
)
def get_class_subjects(
    class_id: int | None = None,
    academic_year: str | None = None,
    subject_id: int | None = None,
    subject_name: str | None = None,
    teacher_id: int | None = None,
    active_only: bool = False,
    db: Session = Depends(get_db)
):
    query = db.query(models.ClassSubject)

    if class_id:
        query = query.filter(models.ClassSubject.class_id == class_id)

    if academic_year:
        query = query.filter(models.ClassSubject.academic_year == academic_year)

    if subject_id:
        query = query.filter(models.ClassSubject.subject_id == subject_id)

    if subject_name:
        query = query.filter(models.ClassSubject.subject_name == subject_name)

    if teacher_id:
        query = query.filter(models.ClassSubject.teacher_id == teacher_id)

    if active_only:
        query = query.filter(models.ClassSubject.is_active == True)

    return query.order_by(models.ClassSubject.id.desc()).all()


def normalize_class_subject_payload(db: Session, payload: schemas.ClassSubjectCreate):
    data = payload.model_dump()

    if data.get("subject_id"):
        subject = validate_subject(db, data["subject_id"])
        data["subject_name"] = subject.subject_name

    if not data.get("subject_name"):
        raise HTTPException(status_code=400, detail="Subject is required")

    data["subject_name"] = data["subject_name"].strip()
    data["academic_year"] = (data.get("academic_year") or "2026-27").strip()

    return data

@router.get(
    "/class-subjects/{class_subject_id}",
    response_model=schemas.ClassSubjectResponse
)
def get_class_subject(
    class_subject_id: int,
    db: Session = Depends(get_db)
):
    return get_or_404(
        db,
        models.ClassSubject,
        class_subject_id,
        "Class subject mapping"
    )


@router.post(
    "/class-subjects/",
    response_model=schemas.ClassSubjectResponse
)
def create_class_subject(
    payload: schemas.ClassSubjectCreate,
    db: Session = Depends(get_db)
):
    validate_class(db, payload.class_id)

    if payload.teacher_id:
        validate_teacher(db, payload.teacher_id)

    data = normalize_class_subject_payload(db, payload)
    mapping = models.ClassSubject(**data)

    db.add(mapping)
    commit_or_400(
        db,
        "This subject is already mapped to this class"
    )

    db.refresh(mapping)
    return mapping

@router.put(
    "/class-subjects/{class_subject_id}",
    response_model=schemas.ClassSubjectResponse
)
def update_class_subject(
    class_subject_id: int,
    payload: schemas.ClassSubjectCreate,
    db: Session = Depends(get_db)
):
    mapping = get_or_404(
        db,
        models.ClassSubject,
        class_subject_id,
        "Class subject mapping"
    )

    validate_class(db, payload.class_id)

    if payload.teacher_id:
        validate_teacher(db, payload.teacher_id)

    data = normalize_class_subject_payload(db, payload)

    for key, value in data.items():
        setattr(mapping, key, value)

    commit_or_400(
        db,
        "This subject is already mapped to this class"
    )

    db.refresh(mapping)
    return mapping


@router.delete("/class-subjects/{class_subject_id}")
def delete_class_subject(
    class_subject_id: int,
    db: Session = Depends(get_db)
):
    mapping = get_or_404(
        db,
        models.ClassSubject,
        class_subject_id,
        "Class subject mapping"
    )

    # The syllabus and lesson plans hang off this mapping. SQLite does not act
    # on their ON DELETE CASCADE unless foreign keys are enforced, so sweep
    # them explicitly -- row ids get reused, and an orphaned unit would
    # reappear under whichever mapping next takes this id.
    from app import syllabus as syllabus_logic

    removed = syllabus_logic.delete_syllabus_for(db, class_subject_id)

    db.delete(mapping)
    db.commit()

    return {"message": "Class subject mapping deleted successfully", **removed}


# ======================================================
# Class Exam Mapping
# ======================================================

@router.get(
    "/class-exam-mappings/",
    response_model=list[schemas.ClassExamMappingResponse]
)
def get_class_exam_mappings(
    class_id: int | None = None,
    exam_id: int | None = None,
    academic_year: str | None = None,
    active_only: bool = False,
    db: Session = Depends(get_db)
):
    query = db.query(models.ClassExamMapping)

    if class_id:
        query = query.filter(models.ClassExamMapping.class_id == class_id)

    if exam_id:
        query = query.filter(models.ClassExamMapping.exam_id == exam_id)

    if academic_year:
        query = query.filter(models.ClassExamMapping.academic_year == academic_year)

    if active_only:
        query = query.filter(models.ClassExamMapping.is_active == True)

    return query.order_by(models.ClassExamMapping.id.desc()).all()


@router.post(
    "/class-exam-mappings/",
    response_model=schemas.ClassExamMappingResponse
)
def create_class_exam_mapping(
    payload: schemas.ClassExamMappingCreate,
    db: Session = Depends(get_db)
):
    validate_class(db, payload.class_id)
    get_or_404(db, models.Exam, payload.exam_id, "Exam")

    mapping = models.ClassExamMapping(**payload.model_dump())

    db.add(mapping)
    commit_or_400(
        db,
        "This exam is already mapped to this class for this academic year"
    )

    db.refresh(mapping)
    return mapping


@router.put(
    "/class-exam-mappings/{mapping_id}",
    response_model=schemas.ClassExamMappingResponse
)
def update_class_exam_mapping(
    mapping_id: int,
    payload: schemas.ClassExamMappingCreate,
    db: Session = Depends(get_db)
):
    mapping = get_or_404(
        db,
        models.ClassExamMapping,
        mapping_id,
        "Class exam mapping"
    )

    validate_class(db, payload.class_id)
    get_or_404(db, models.Exam, payload.exam_id, "Exam")

    for key, value in payload.model_dump().items():
        setattr(mapping, key, value)

    commit_or_400(
        db,
        "This exam is already mapped to this class for this academic year"
    )

    db.refresh(mapping)
    return mapping


@router.delete("/class-exam-mappings/{mapping_id}")
def delete_class_exam_mapping(
    mapping_id: int,
    db: Session = Depends(get_db)
):
    mapping = get_or_404(
        db,
        models.ClassExamMapping,
        mapping_id,
        "Class exam mapping"
    )

    db.delete(mapping)
    db.commit()

    return {"message": "Class exam mapping deleted successfully"}
