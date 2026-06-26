from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Student, User
from app.schemas import StudentCreate, StudentUpdate, StudentResponse
from app.security import require_roles

router = APIRouter(
    prefix="/students",
    tags=["Student Information System"]
)


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