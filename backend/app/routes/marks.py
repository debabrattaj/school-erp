from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Mark, Student, Exam, SchoolSettings, User
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

    if mark.subject not in VALID_SUBJECTS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid subject. Allowed: {', '.join(VALID_SUBJECTS)}"
        )

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

    existing_mark = db.query(Mark).filter(
        Mark.student_id == mark.student_id,
        Mark.exam_id == mark.exam_id,
        Mark.subject == mark.subject
    ).first()

    if existing_mark:
        raise HTTPException(
            status_code=400,
            detail="Marks already added for this student, exam and subject"
        )

    grade = calculate_grade(
        mark.marks_obtained,
        mark.total_marks,
        db
    )

    new_mark = Mark(
        student_id=mark.student_id,
        exam_id=mark.exam_id,
        subject=mark.subject,
        marks_obtained=mark.marks_obtained,
        total_marks=mark.total_marks,
        grade=grade,
        remarks=mark.remarks
    )

    db.add(new_mark)
    db.commit()
    db.refresh(new_mark)

    return new_mark


@router.get("/", response_model=list[MarkResponse])
def get_marks(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Teacher"])
    )
):
    marks = db.query(Mark).order_by(
        Mark.id.desc()
    ).all()

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

    if "subject" in update_data and update_data["subject"]:
        if update_data["subject"] not in VALID_SUBJECTS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid subject. Allowed: {', '.join(VALID_SUBJECTS)}"
            )

    for key, value in update_data.items():
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