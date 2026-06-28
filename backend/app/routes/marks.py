from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    ClassExamMapping,
    ClassSubject,
    Exam,
    Mark,
    SchoolSettings,
    Student,
    User,
)
from app.schemas import MarkCreate, MarkUpdate, MarkResponse
from app.security import require_roles

router = APIRouter(
    prefix="/marks",
    tags=["Assessments & Results"]
)


VALID_SUBJECTS = [
    "English",
    "Mathematics",
    "Science",
    "Social Science",
    "Hindi",
    "Computer Science",
    "Physics",
    "Chemistry",
    "Biology",
    "Accountancy",
    "Economics",
    "Business Studies",
    "Physical Education",
    "Art",
    "Music",
    "Other"
]


def get_school_settings(db: Session):
    settings = db.query(SchoolSettings).first()

    if not settings:
        settings = SchoolSettings(
            school_name="International School",
            pass_percentage=40,
            grade_rules="A+:90-100,A:80-89,B:70-79,C:60-69,D:40-59,F:0-39"
        )

        db.add(settings)
        db.commit()
        db.refresh(settings)

    return settings


def calculate_grade(
    marks_obtained: float,
    total_marks: float,
    db: Session
):
    percentage = (marks_obtained / total_marks) * 100

    settings = get_school_settings(db)

    grade_rules = settings.grade_rules or (
        "A+:90-100,A:80-89,B:70-79,C:60-69,D:40-59,F:0-39"
    )

    for rule in grade_rules.split(","):
        try:
            grade, score_range = rule.split(":")
            min_score, max_score = score_range.split("-")

            min_score = float(min_score)
            max_score = float(max_score)

            if min_score <= percentage <= max_score:
                return grade.strip()

        except ValueError:
            continue

    pass_percentage = settings.pass_percentage or 40

    if percentage < pass_percentage:
        return "F"

    return "Pass"


def find_student_class_id(student: Student):
    if student.class_id:
        return student.class_id

    return None


def normalize_mark_payload(db: Session, mark_data):
    data = mark_data.model_dump(exclude_unset=True)

    if data.get("class_subject_id"):
        class_subject = db.query(ClassSubject).filter(
            ClassSubject.id == data["class_subject_id"]
        ).first()

        if not class_subject:
            raise HTTPException(
                status_code=404,
                detail="Class subject mapping not found"
            )

        data["subject_name"] = data.get("subject_name") or class_subject.subject_name
        data["subject"] = data.get("subject") or class_subject.subject_name
        data["academic_year"] = (
            data.get("academic_year") or class_subject.academic_year
        )

    subject_name = data.get("subject_name") or data.get("subject")

    if subject_name:
        data["subject_name"] = subject_name
        data["subject"] = subject_name

    data["max_marks"] = data.get("max_marks") or data.get("total_marks") or 100
    data["total_marks"] = data.get("total_marks") or data["max_marks"]

    return data


def validate_exam_mapping(db: Session, student: Student, data: dict):
    class_id = find_student_class_id(student)
    academic_year = data.get("academic_year")

    if not class_id or not academic_year:
        return

    mapping = db.query(ClassExamMapping).filter(
        ClassExamMapping.class_id == class_id,
        ClassExamMapping.exam_id == data["exam_id"],
        ClassExamMapping.academic_year == academic_year,
        ClassExamMapping.is_active == True,
    ).first()

    if not mapping:
        raise HTTPException(
            status_code=400,
            detail="Exam is not mapped to this student's class for the academic year"
        )


@router.post("/", response_model=MarkResponse)
def create_mark(
    mark: MarkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Teacher"])
    )
):
    student = db.query(Student).filter(
        Student.id == mark.student_id
    ).first()

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found"
        )

    exam = db.query(Exam).filter(
        Exam.id == mark.exam_id
    ).first()

    if not exam:
        raise HTTPException(
            status_code=404,
            detail="Exam not found"
        )

    data = normalize_mark_payload(db, mark)

    if not data.get("subject_name"):
        raise HTTPException(status_code=400, detail="Subject is required")

    if data["total_marks"] <= 0:
        raise HTTPException(
            status_code=400,
            detail="Total marks must be greater than 0"
        )

    if data["marks_obtained"] < 0:
        raise HTTPException(
            status_code=400,
            detail="Marks obtained cannot be negative"
        )

    if data["marks_obtained"] > data["total_marks"]:
        raise HTTPException(
            status_code=400,
            detail="Marks obtained cannot be greater than total marks"
        )

    validate_exam_mapping(db, student, data)

    existing_mark = db.query(Mark).filter(
        Mark.student_id == data["student_id"],
        Mark.exam_id == data["exam_id"],
        Mark.subject_name == data["subject_name"],
        Mark.academic_year == data.get("academic_year")
    ).first()

    if existing_mark:
        raise HTTPException(
            status_code=400,
            detail="Marks already added for this student, exam and subject"
        )

    grade = calculate_grade(
        data["marks_obtained"],
        data["total_marks"],
        db
    )

    new_mark = Mark(
        student_id=data["student_id"],
        exam_id=data["exam_id"],
        class_subject_id=data.get("class_subject_id"),
        subject_name=data["subject_name"],
        academic_year=data.get("academic_year"),
        subject=data["subject_name"],
        marks_obtained=data["marks_obtained"],
        max_marks=data["max_marks"],
        total_marks=data["total_marks"],
        grade=grade,
        remarks=data.get("remarks")
    )

    db.add(new_mark)
    db.commit()
    db.refresh(new_mark)

    return new_mark


@router.get("/", response_model=list[MarkResponse])
def get_marks(
    student_id: int | None = None,
    exam_id: int | None = None,
    academic_year: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Teacher"])
    )
):
    query = db.query(Mark)

    if student_id:
        query = query.filter(Mark.student_id == student_id)

    if exam_id:
        query = query.filter(Mark.exam_id == exam_id)

    if academic_year:
        query = query.filter(Mark.academic_year == academic_year)

    marks = query.order_by(Mark.id.desc()).all()

    return marks


@router.get("/student/{student_id}", response_model=list[MarkResponse])
def get_student_marks(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Teacher"])
    )
):
    student = db.query(Student).filter(
        Student.id == student_id
    ).first()

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found"
        )

    marks = db.query(Mark).filter(
        Mark.student_id == student_id
    ).order_by(Mark.id.desc()).all()

    return marks


@router.get("/exam/{exam_id}", response_model=list[MarkResponse])
def get_exam_marks(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Teacher"])
    )
):
    exam = db.query(Exam).filter(
        Exam.id == exam_id
    ).first()

    if not exam:
        raise HTTPException(
            status_code=404,
            detail="Exam not found"
        )

    marks = db.query(Mark).filter(
        Mark.exam_id == exam_id
    ).order_by(Mark.id.desc()).all()

    return marks


@router.get("/metadata/subjects")
def get_subjects(
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Teacher"])
    )
):
    return {
        "subjects": VALID_SUBJECTS
    }


@router.get("/{mark_id}", response_model=MarkResponse)
def get_mark(
    mark_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Teacher"])
    )
):
    mark = db.query(Mark).filter(
        Mark.id == mark_id
    ).first()

    if not mark:
        raise HTTPException(
            status_code=404,
            detail="Mark record not found"
        )

    return mark


@router.put("/{mark_id}", response_model=MarkResponse)
def update_mark(
    mark_id: int,
    mark_data: MarkUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Teacher"])
    )
):
    mark = db.query(Mark).filter(
        Mark.id == mark_id
    ).first()

    if not mark:
        raise HTTPException(
            status_code=404,
            detail="Mark record not found"
        )

    update_data = mark_data.model_dump(
        exclude_unset=True
    )

    merged_data = {
        "student_id": mark.student_id,
        "exam_id": mark.exam_id,
        "class_subject_id": mark.class_subject_id,
        "subject_name": mark.subject_name,
        "academic_year": mark.academic_year,
        "subject": mark.subject,
        "marks_obtained": mark.marks_obtained,
        "max_marks": mark.max_marks,
        "total_marks": mark.total_marks,
        "grade": mark.grade,
        "remarks": mark.remarks,
    }
    merged_data.update(update_data)
    merged_data = normalize_mark_payload(
        db,
        MarkCreate(**merged_data)
    )

    student = db.query(Student).filter(
        Student.id == merged_data["student_id"]
    ).first()

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    exam = db.query(Exam).filter(
        Exam.id == merged_data["exam_id"]
    ).first()

    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    validate_exam_mapping(db, student, merged_data)

    for key, value in merged_data.items():
        setattr(mark, key, value)

    if mark.total_marks <= 0:
        raise HTTPException(
            status_code=400,
            detail="Total marks must be greater than 0"
        )

    if mark.marks_obtained < 0:
        raise HTTPException(
            status_code=400,
            detail="Marks obtained cannot be negative"
        )

    if mark.marks_obtained > mark.total_marks:
        raise HTTPException(
            status_code=400,
            detail="Marks obtained cannot be greater than total marks"
        )

    mark.grade = calculate_grade(
        mark.marks_obtained,
        mark.total_marks,
        db
    )

    db.commit()
    db.refresh(mark)

    return mark


@router.delete("/{mark_id}")
def delete_mark(
    mark_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin"])
    )
):
    mark = db.query(Mark).filter(
        Mark.id == mark_id
    ).first()

    if not mark:
        raise HTTPException(
            status_code=404,
            detail="Mark record not found"
        )

    db.delete(mark)
    db.commit()

    return {
        "message": "Mark record deleted successfully"
    }
