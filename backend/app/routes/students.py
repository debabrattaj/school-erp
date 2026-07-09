import csv
import io

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SchoolClass, Student, User
from app.notifications import notify_class_teacher_new_student
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


def next_roll_no(db: Session, class_id: int | None, class_name: str | None, section: str | None) -> str:
    """1 + the highest existing numeric roll_no among students in the same
    class/section, or "1" if the section is empty or has no numeric rolls.
    """
    query = db.query(Student)
    if class_id:
        query = query.filter(Student.class_id == class_id)
    elif class_name and section:
        query = query.filter(
            Student.class_name == class_name, Student.section == section
        )
    else:
        return "1"

    highest = 0
    for (existing_roll,) in query.with_entities(Student.roll_no).all():
        if existing_roll and existing_roll.strip().isdigit():
            highest = max(highest, int(existing_roll))

    return str(highest + 1)


def roll_no_taken(
    db: Session,
    class_id: int | None,
    class_name: str | None,
    section: str | None,
    roll_no: str,
    exclude_student_id: int | None = None,
) -> bool:
    """Whether another student in this class/section already has this roll_no."""
    query = db.query(Student).filter(Student.roll_no == roll_no)
    if class_id:
        query = query.filter(Student.class_id == class_id)
    elif class_name and section:
        query = query.filter(
            Student.class_name == class_name, Student.section == section
        )
    else:
        return False

    if exclude_student_id:
        query = query.filter(Student.id != exclude_student_id)

    return query.first() is not None


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

    student_data = student.model_dump()
    student_data.pop("roll_no_mode", None)

    if student.roll_no_mode == "manual":
        manual_roll = (student.roll_no or "").strip()
        if not manual_roll:
            raise HTTPException(
                status_code=400,
                detail="Roll No is required when entering it manually."
            )
        if roll_no_taken(db, student.class_id, student.class_name, student.section, manual_roll):
            raise HTTPException(
                status_code=400,
                detail=f"Roll No {manual_roll} is already used in this section."
            )
        student_data["roll_no"] = manual_roll
    else:
        # roll_no is server-assigned in auto mode: always the next number
        # in this class/section, regardless of what was submitted.
        student_data["roll_no"] = next_roll_no(
            db, student.class_id, student.class_name, student.section
        )

    new_student = Student(**student_data)

    db.add(new_student)
    db.commit()
    db.refresh(new_student)

    # Email + SMS the class teacher about the new admission. Best-effort:
    # a delivery problem never fails the admission itself, and the attempt
    # is recorded on the Communications page either way. Deliberately not
    # done for bulk imports, which would flood teachers one message per row.
    notify_class_teacher_new_student(db, new_student)

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

    class_lookup = {
        (c.class_name.strip().lower(), c.section.strip().lower()): c.id
        for c in db.query(SchoolClass).all()
    }

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

        class_name = cleaned.get("class_name")
        section = cleaned.get("section")
        if class_name:
            if not section:
                errors.append({"row": row_index, "error": "section is required when class_name is provided"})
                continue
            class_id = class_lookup.get((class_name.strip().lower(), section.strip().lower()))
            if class_id is None:
                errors.append({
                    "row": row_index,
                    "error": f"No matching class found for class_name={class_name!r}, section={section!r}",
                })
                continue
            cleaned["class_id"] = class_id

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


@router.get("/next-roll-no")
def get_next_roll_no(
    class_id: int | None = None,
    class_name: str | None = None,
    section: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Teacher", "Accounts"])
    ),
):
    """Preview the roll number a new student in this class/section would get."""
    return {"roll_no": next_roll_no(db, class_id, class_name, section)}


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

    roll_no_mode = update_data.pop("roll_no_mode", None)
    submitted_roll_no = update_data.pop("roll_no", None)

    if roll_no_mode:
        resolved_class_id = update_data.get("class_id", student.class_id)
        resolved_class_name = update_data.get("class_name", student.class_name)
        resolved_section = update_data.get("section", student.section)

        if roll_no_mode == "manual":
            manual_roll = (submitted_roll_no or student.roll_no or "").strip()
            if not manual_roll:
                raise HTTPException(
                    status_code=400,
                    detail="Roll No is required when entering it manually."
                )
            if roll_no_taken(
                db, resolved_class_id, resolved_class_name, resolved_section,
                manual_roll, exclude_student_id=student_id,
            ):
                raise HTTPException(
                    status_code=400,
                    detail=f"Roll No {manual_roll} is already used in this section."
                )
            update_data["roll_no"] = manual_roll
        else:
            update_data["roll_no"] = next_roll_no(
                db, resolved_class_id, resolved_class_name, resolved_section
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