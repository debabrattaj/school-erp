from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Exam, SchoolSettings, User
from app.schemas import ExamCreate, ExamUpdate, ExamResponse
from app.security import require_roles

router = APIRouter(
    prefix="/exams",
    tags=["Assessments & Exams"]
)


VALID_EXAM_NAMES = [
    "Unit Test",
    "Mid Term Exam",
    "Final Term Exam",
    "Assessment",
    "Practical Exam",
    "Internal Assessment",
    "Board Exam",
    "Other"
]


def get_default_academic_year(db: Session):
    settings = db.query(SchoolSettings).first()

    if not settings:
        return None

    return settings.academic_year


@router.post("/", response_model=ExamResponse)
def create_exam(
    exam: ExamCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal"])
    )
):
    academic_year = exam.academic_year or get_default_academic_year(db)
    class_name = exam.class_name or ""
    section = exam.section or ""
    exam_date = exam.exam_date or date.today()

    existing_exam = db.query(Exam).filter(
        Exam.exam_name == exam.exam_name
    ).first()

    if existing_exam:
        raise HTTPException(
            status_code=400,
            detail="Exam master already exists with this name"
        )

    new_exam = Exam(
        exam_name=exam.exam_name,
        exam_type=exam.exam_type,
        class_name=class_name,
        section=section,
        exam_date=exam_date,
        academic_year=academic_year,
        remarks=exam.remarks
    )

    db.add(new_exam)
    db.commit()
    db.refresh(new_exam)

    return new_exam


@router.get("/", response_model=list[ExamResponse])
def get_exams(
    academic_year: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Teacher"])
    )
):
    query = db.query(Exam)

    if academic_year:
        query = query.filter(Exam.academic_year == academic_year)

    exams = query.order_by(
        Exam.exam_date.desc(),
        Exam.id.desc()
    ).all()

    return exams


@router.get("/metadata/exam-names")
def get_exam_names(
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Teacher"])
    )
):
    return {
        "exam_names": VALID_EXAM_NAMES
    }


@router.get("/{exam_id}", response_model=ExamResponse)
def get_exam(
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

    return exam


@router.put("/{exam_id}", response_model=ExamResponse)
def update_exam(
    exam_id: int,
    exam_data: ExamUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal"])
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

    update_data = exam_data.model_dump(
        exclude_unset=True
    )

    if "exam_name" in update_data and update_data["exam_name"]:
        duplicate = db.query(Exam).filter(
            Exam.exam_name == update_data["exam_name"],
            Exam.id != exam_id,
        ).first()

        if duplicate:
            raise HTTPException(
                status_code=400,
                detail="Another exam master already exists with this name"
            )

    if "class_name" in update_data and update_data["class_name"] is None:
        update_data["class_name"] = ""

    if "section" in update_data and update_data["section"] is None:
        update_data["section"] = ""

    if "exam_date" in update_data and update_data["exam_date"] is None:
        update_data["exam_date"] = exam.exam_date or date.today()

    for key, value in update_data.items():
        setattr(exam, key, value)

    db.commit()
    db.refresh(exam)

    return exam


@router.delete("/{exam_id}")
def delete_exam(
    exam_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin"])
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

    db.delete(exam)
    db.commit()

    return {
        "message": "Exam deleted successfully"
    }
