import csv
import io

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Student, User
from app.schemas import StudentCreate, StudentUpdate, StudentResponse
from app.security import require_roles

router = APIRouter(
    prefix="/students",
    tags=["Student Information System"]
)

BULK_IMPORT_COLUMNS = [
    "admission_no",
    "first_name",
    "last_name",
    "gender",
    "dob",
    "class_name",
    "section",
    "roll_no",
    "admission_date",
    "student_status",
    "father_name",
    "mother_name",
    "guardian_name",
    "guardian_phone",
    "guardian_email",
    "nationality",
    "blood_group",
]


VALID_STATUSES = [
    "Active",
    "Graduated",
    "Transferred",
    "Suspended",
    "Alumni"
]

VALID_GENDERS = [
    "Male",
    "Female",
    "Other"
]


@router.post("/", response_model=StudentResponse)
def create_student(
    student: StudentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"]))
):
    existing_student = db.query(Student).filter(
        Student.admission_no == student.admission_no
    ).first()

    if existing_student:
        raise HTTPException(
            status_code=400,
            detail="Student with this admission number already exists"
        )

    if student.student_status and student.student_status not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Invalid student status"
        )

    if student.gender and student.gender not in VALID_GENDERS:
        raise HTTPException(
            status_code=400,
            detail="Invalid gender"
        )

    new_student = Student(**student.model_dump())

    db.add(new_student)
    db.commit()
    db.refresh(new_student)

    return new_student


@router.get("/bulk-import-template")
def bulk_import_template(
    current_user: User = Depends(require_roles(["Admin", "Principal"]))
):
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=BULK_IMPORT_COLUMNS)
    writer.writeheader()
    writer.writerow({
        "admission_no": "ADM2026101",
        "first_name": "Jane",
        "last_name": "Doe",
        "gender": "Female",
        "dob": "2012-05-14",
        "class_name": "8",
        "section": "A",
        "roll_no": "21",
        "admission_date": "2026-04-01",
        "student_status": "Active",
        "father_name": "John Doe",
        "mother_name": "Mary Doe",
        "guardian_name": "John Doe",
        "guardian_phone": "9876543210",
        "guardian_email": "john.doe@example.com",
        "nationality": "Indian",
        "blood_group": "O+",
    })
    return StreamingResponse(
        io.BytesIO(buf.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=students_import_template.csv"},
    )


@router.post("/bulk-import")
def bulk_import_students(
    file: UploadFile = File(...),
    dry_run: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a .csv file")

    raw = file.file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV file is empty or missing a header row")

    unknown_columns = [c for c in reader.fieldnames if c not in BULK_IMPORT_COLUMNS]

    seen_admission_nos = set()
    errors = []
    to_create = []
    row_index = 1

    for row_index, row in enumerate(reader, start=2):  # header is row 1
        cleaned = {k: (v.strip() if isinstance(v, str) else v) for k, v in row.items() if k in BULK_IMPORT_COLUMNS}
        cleaned = {k: (v if v else None) for k, v in cleaned.items()}

        admission_no = cleaned.get("admission_no")
        if not admission_no:
            errors.append({"row": row_index, "error": "admission_no is required"})
            continue
        if not cleaned.get("first_name"):
            errors.append({"row": row_index, "error": "first_name is required"})
            continue

        if admission_no in seen_admission_nos:
            errors.append({"row": row_index, "error": f"Duplicate admission_no in file: {admission_no}"})
            continue
        existing = db.query(Student).filter(Student.admission_no == admission_no).first()
        if existing:
            errors.append({"row": row_index, "error": f"admission_no already exists: {admission_no}"})
            continue

        if cleaned.get("student_status") and cleaned["student_status"] not in VALID_STATUSES:
            errors.append({"row": row_index, "error": f"Invalid student_status: {cleaned['student_status']}"})
            continue
        if cleaned.get("gender") and cleaned["gender"] not in VALID_GENDERS:
            errors.append({"row": row_index, "error": f"Invalid gender: {cleaned['gender']}"})
            continue

        try:
            validated = StudentCreate(**cleaned)
        except ValidationError as exc:
            errors.append({"row": row_index, "error": exc.errors()[0]["msg"]})
            continue

        seen_admission_nos.add(admission_no)
        to_create.append(validated)

    created_count = 0
    if not dry_run:
        for validated in to_create:
            db.add(Student(**validated.model_dump()))
        if to_create:
            db.commit()
        created_count = len(to_create)

    return {
        "total_rows": row_index - 1,
        "created": created_count if not dry_run else 0,
        "valid_rows": len(to_create),
        "errors": errors,
        "dry_run": dry_run,
        "unknown_columns": unknown_columns,
    }


@router.get("/", response_model=list[StudentResponse])
def get_students(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Teacher", "Accounts"])
    )
):
    students = db.query(Student).order_by(Student.id.desc()).all()
    return students


@router.get("/{student_id}", response_model=StudentResponse)
def get_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Teacher", "Accounts"])
    )
):
    student = db.query(Student).filter(Student.id == student_id).first()

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found"
        )

    return student


@router.put("/{student_id}", response_model=StudentResponse)
def update_student(
    student_id: int,
    student_data: StudentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"]))
):
    student = db.query(Student).filter(Student.id == student_id).first()

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found"
        )

    update_data = student_data.model_dump(exclude_unset=True)

    if "admission_no" in update_data and update_data["admission_no"]:
        existing_student = db.query(Student).filter(
            Student.admission_no == update_data["admission_no"],
            Student.id != student_id
        ).first()

        if existing_student:
            raise HTTPException(
                status_code=400,
                detail="Another student with this admission number already exists"
            )

    if "student_status" in update_data and update_data["student_status"]:
        if update_data["student_status"] not in VALID_STATUSES:
            raise HTTPException(
                status_code=400,
                detail="Invalid student status"
            )

    if "gender" in update_data and update_data["gender"]:
        if update_data["gender"] not in VALID_GENDERS:
            raise HTTPException(
                status_code=400,
                detail="Invalid gender"
            )

    for key, value in update_data.items():
        setattr(student, key, value)

    db.commit()
    db.refresh(student)

    return student


@router.delete("/{student_id}")
def delete_student(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"]))
):
    student = db.query(Student).filter(Student.id == student_id).first()

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found"
        )

    db.delete(student)
    db.commit()

    return {
        "message": "Student deleted successfully"
    }