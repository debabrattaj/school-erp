from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database import get_db
from app import models, schemas

router = APIRouter(tags=["Marks"])


def calculate_grade(marks_obtained: float, max_marks: float):
    if not max_marks or max_marks <= 0:
        return ""

    percentage = (marks_obtained / max_marks) * 100

    if percentage >= 90:
        return "A+"
    if percentage >= 80:
        return "A"
    if percentage >= 70:
        return "B+"
    if percentage >= 60:
        return "B"
    if percentage >= 50:
        return "C"
    if percentage >= 40:
        return "D"

    return "F"


def normalize_payload(payload: schemas.MarkCreate):
    data = payload.model_dump()

    max_marks = data.get("max_marks") or data.get("total_marks") or 100
    marks_obtained = data.get("marks_obtained") or 0

    subject_name = data.get("subject_name") or data.get("subject") or ""

    data["max_marks"] = max_marks
    data["total_marks"] = max_marks
    data["subject_name"] = subject_name
    data["subject"] = subject_name

    if not data.get("grade"):
        data["grade"] = calculate_grade(marks_obtained, max_marks)

    return data


def validate_mark_payload(db: Session, data: dict):
    student = (
        db.query(models.Student)
        .filter(models.Student.id == data["student_id"])
        .first()
    )

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    exam = (
        db.query(models.Exam)
        .filter(models.Exam.id == data["exam_id"])
        .first()
    )

    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if data.get("class_subject_id"):
        class_subject = (
            db.query(models.ClassSubject)
            .filter(models.ClassSubject.id == data["class_subject_id"])
            .first()
        )

        if not class_subject:
            raise HTTPException(
                status_code=404,
                detail="Class subject mapping not found"
            )

        data["subject_name"] = data.get("subject_name") or class_subject.subject_name
        data["subject"] = data["subject_name"]

    if data["marks_obtained"] > data["max_marks"]:
        raise HTTPException(
            status_code=400,
            detail="Marks obtained cannot be greater than maximum marks"
        )

    if data["marks_obtained"] < 0 or data["max_marks"] <= 0:
        raise HTTPException(
            status_code=400,
            detail="Invalid marks value"
        )

    return data


@router.get("/marks/", response_model=list[schemas.MarkResponse])
def get_marks(db: Session = Depends(get_db)):
    return db.query(models.Mark).order_by(models.Mark.id.desc()).all()


@router.get("/marks/{mark_id}", response_model=schemas.MarkResponse)
def get_mark(mark_id: int, db: Session = Depends(get_db)):
    mark = db.query(models.Mark).filter(models.Mark.id == mark_id).first()

    if not mark:
        raise HTTPException(status_code=404, detail="Marks record not found")

    return mark


@router.post("/marks/", response_model=schemas.MarkResponse)
def create_mark(payload: schemas.MarkCreate, db: Session = Depends(get_db)):
    data = normalize_payload(payload)
    data = validate_mark_payload(db, data)

    duplicate = (
        db.query(models.Mark)
        .filter(
            models.Mark.student_id == data["student_id"],
            models.Mark.exam_id == data["exam_id"],
            models.Mark.subject_name == data["subject_name"],
        )
        .first()
    )

    if duplicate:
        raise HTTPException(
            status_code=400,
            detail="Marks already entered for this student, exam and subject"
        )

    mark = models.Mark(**data)

    db.add(mark)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Invalid marks data")

    db.refresh(mark)
    return mark


@router.put("/marks/{mark_id}", response_model=schemas.MarkResponse)
def update_mark(
    mark_id: int,
    payload: schemas.MarkCreate,
    db: Session = Depends(get_db)
):
    mark = db.query(models.Mark).filter(models.Mark.id == mark_id).first()

    if not mark:
        raise HTTPException(status_code=404, detail="Marks record not found")

    data = normalize_payload(payload)
    data = validate_mark_payload(db, data)

    duplicate = (
        db.query(models.Mark)
        .filter(
            models.Mark.student_id == data["student_id"],
            models.Mark.exam_id == data["exam_id"],
            models.Mark.subject_name == data["subject_name"],
            models.Mark.id != mark_id,
        )
        .first()
    )

    if duplicate:
        raise HTTPException(
            status_code=400,
            detail="Marks already entered for this student, exam and subject"
        )

    for key, value in data.items():
        setattr(mark, key, value)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Invalid marks data")

    db.refresh(mark)
    return mark


@router.delete("/marks/{mark_id}")
def delete_mark(mark_id: int, db: Session = Depends(get_db)):
    mark = db.query(models.Mark).filter(models.Mark.id == mark_id).first()

    if not mark:
        raise HTTPException(status_code=404, detail="Marks record not found")

    db.delete(mark)
    db.commit()

    return {"message": "Marks record deleted successfully"}
