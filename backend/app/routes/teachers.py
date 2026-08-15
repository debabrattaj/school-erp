from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import ValidationError
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.csv_import import csv_template_response, read_csv_upload
from app.database import get_db
from app.security import require_roles
from app import models, schemas

router = APIRouter(
    prefix="/teachers",
    tags=["Teachers"]
)

BULK_IMPORT_COLUMNS = [
    "employee_no",
    "name",
    "email",
    "phone",
    "gender",
    "department",
    "subject",
    "assigned_class",
    "qualification",
    "joining_date",
    "employment_type",
    "salary_grade",
    "address",
]


def get_teacher_display_name(teacher: models.Teacher):
    name = teacher.name or ""

    if teacher.employee_no:
        return f"{teacher.employee_no} - {name}"

    return name or f"Teacher ID: {teacher.id}"


def validate_class_exists(db: Session, class_id: int):
    school_class = (
        db.query(models.SchoolClass)
        .filter(models.SchoolClass.id == class_id)
        .first()
    )

    if not school_class:
        raise HTTPException(status_code=404, detail="Selected class not found")

    return school_class


def sync_class_teacher_from_teacher(db: Session, db_teacher: models.Teacher):
    """
    Sync rule:
    - If teacher is marked as class teacher and class_id is selected,
      update that class with this teacher.
    - If another teacher was assigned to that class, remove old assignment.
    - If teacher is unchecked as class teacher, remove class assignment.
    """

    old_classes = (
        db.query(models.SchoolClass)
        .filter(models.SchoolClass.class_teacher_id == db_teacher.id)
        .all()
    )

    for old_class in old_classes:
        if old_class.id != db_teacher.class_id:
            old_class.class_teacher_id = None
            old_class.class_teacher = None

    if db_teacher.is_class_teacher and db_teacher.class_id:
        school_class = validate_class_exists(db, db_teacher.class_id)

        if (
            school_class.class_teacher_id
            and school_class.class_teacher_id != db_teacher.id
        ):
            old_teacher = (
                db.query(models.Teacher)
                .filter(models.Teacher.id == school_class.class_teacher_id)
                .first()
            )

            if old_teacher:
                old_teacher.is_class_teacher = False
                old_teacher.class_id = None

        school_class.class_teacher_id = db_teacher.id
        school_class.class_teacher = get_teacher_display_name(db_teacher)

    else:
        db_teacher.is_class_teacher = False
        db_teacher.class_id = None


@router.get("/bulk-import-template")
def bulk_import_template(
    current_user: models.User = Depends(require_roles(["Admin", "Principal"]))
):
    return csv_template_response(
        BULK_IMPORT_COLUMNS,
        {
            "employee_no": "EMP2026101",
            "name": "Priya Sharma",
            "email": "priya.sharma@example.com",
            "phone": "9876543210",
            "gender": "Female",
            "department": "Science",
            "subject": "Physics",
            "assigned_class": "10-A",
            "qualification": "M.Sc, B.Ed",
            "joining_date": "2026-06-01",
            "employment_type": "Full Time",
            "salary_grade": "Grade 3",
            "address": "12 Park Street, Bhubaneswar",
        },
        "teachers_import_template.csv",
    )


@router.post("/bulk-import")
def bulk_import_teachers(
    file: UploadFile = File(...),
    dry_run: bool = False,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_roles(["Admin", "Principal"])),
):
    rows, unknown_columns = read_csv_upload(file, BULK_IMPORT_COLUMNS)

    seen_employee_nos = set()
    seen_emails = set()
    errors = []
    to_create = []

    for row_index, cleaned in rows:
        employee_no = cleaned.get("employee_no")
        if not employee_no:
            errors.append({"row": row_index, "error": "employee_no is required"})
            continue
        if not cleaned.get("name"):
            errors.append({"row": row_index, "error": "name is required"})
            continue

        if employee_no in seen_employee_nos:
            errors.append({"row": row_index, "error": f"Duplicate employee_no in file: {employee_no}"})
            continue
        if db.query(models.Teacher).filter(models.Teacher.employee_no == employee_no).first():
            errors.append({"row": row_index, "error": f"employee_no already exists: {employee_no}"})
            continue

        email = cleaned.get("email")
        if email:
            if email in seen_emails:
                errors.append({"row": row_index, "error": f"Duplicate email in file: {email}"})
                continue
            if db.query(models.Teacher).filter(models.Teacher.email == email).first():
                errors.append({"row": row_index, "error": f"email already exists: {email}"})
                continue

        try:
            validated = schemas.TeacherCreate(**cleaned)
        except ValidationError as exc:
            errors.append({"row": row_index, "error": exc.errors()[0]["msg"]})
            continue

        seen_employee_nos.add(employee_no)
        if email:
            seen_emails.add(email)
        to_create.append(validated)

    created_count = 0
    if not dry_run:
        for validated in to_create:
            db.add(models.Teacher(**validated.model_dump()))
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


@router.get("/", response_model=list[schemas.TeacherResponse])
def get_teachers(db: Session = Depends(get_db)):
    return (
        db.query(models.Teacher)
        .order_by(models.Teacher.id.desc())
        .all()
    )


@router.get("/{teacher_id}", response_model=schemas.TeacherResponse)
def get_teacher(
    teacher_id: int,
    db: Session = Depends(get_db)
):
    teacher = (
        db.query(models.Teacher)
        .filter(models.Teacher.id == teacher_id)
        .first()
    )

    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    return teacher


@router.post("/", response_model=schemas.TeacherResponse)
def create_teacher(
    payload: schemas.TeacherCreate,
    db: Session = Depends(get_db)
):
    existing_teacher = (
        db.query(models.Teacher)
        .filter(models.Teacher.employee_no == payload.employee_no)
        .first()
    )

    if existing_teacher:
        raise HTTPException(
            status_code=400,
            detail="Teacher with this Employee No already exists"
        )

    data = payload.model_dump()

    if not data.get("is_class_teacher"):
        data["class_id"] = None

    if data.get("is_class_teacher") and data.get("class_id"):
        validate_class_exists(db, data["class_id"])

    db_teacher = models.Teacher(**data)

    db.add(db_teacher)

    try:
        db.flush()
        sync_class_teacher_from_teacher(db, db_teacher)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Duplicate or invalid teacher data"
        )

    db.refresh(db_teacher)
    return db_teacher


@router.put("/{teacher_id}", response_model=schemas.TeacherResponse)
def update_teacher(
    teacher_id: int,
    payload: schemas.TeacherCreate,
    db: Session = Depends(get_db)
):
    db_teacher = (
        db.query(models.Teacher)
        .filter(models.Teacher.id == teacher_id)
        .first()
    )

    if not db_teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    duplicate_teacher = (
        db.query(models.Teacher)
        .filter(
            models.Teacher.employee_no == payload.employee_no,
            models.Teacher.id != teacher_id
        )
        .first()
    )

    if duplicate_teacher:
        raise HTTPException(
            status_code=400,
            detail="Teacher with this Employee No already exists"
        )

    data = payload.model_dump()

    if not data.get("is_class_teacher"):
        data["class_id"] = None

    if data.get("is_class_teacher") and data.get("class_id"):
        validate_class_exists(db, data["class_id"])

    for key, value in data.items():
        setattr(db_teacher, key, value)

    try:
        sync_class_teacher_from_teacher(db, db_teacher)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Duplicate or invalid teacher data"
        )

    db.refresh(db_teacher)
    return db_teacher


@router.delete("/{teacher_id}")
def delete_teacher(
    teacher_id: int,
    db: Session = Depends(get_db)
):
    db_teacher = (
        db.query(models.Teacher)
        .filter(models.Teacher.id == teacher_id)
        .first()
    )

    if not db_teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")

    assigned_classes = (
        db.query(models.SchoolClass)
        .filter(models.SchoolClass.class_teacher_id == teacher_id)
        .all()
    )

    for school_class in assigned_classes:
        school_class.class_teacher_id = None
        school_class.class_teacher = None

    db.delete(db_teacher)
    db.commit()

    return {"message": "Teacher deleted successfully"}