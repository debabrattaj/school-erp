"""Supervised projects and practical assessments within the current tenant."""
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.exc import StaleDataError

from app import models
from app.database import get_db
from app.security import require_roles
from app.tenant import require_feature

router = APIRouter(
    prefix="/academic-activities", tags=["Academic Projects & Practicals"],
    dependencies=[Depends(require_feature("academic_activities"))],
)
staff_access = require_roles(["Admin", "Principal", "Teacher"])
ActivityType = Literal["Capstone Project", "Research Dissertation", "Engineering Practical", "Pharmacy Practical"]
ActivityStatus = Literal["Planned", "In Progress", "Submitted", "Completed"]


class ActivityInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, allow_inf_nan=False)
    student_id: int = Field(gt=0)
    academic_year: str = Field(min_length=1, max_length=30)
    semester: str = Field(min_length=1, max_length=50)
    activity_type: ActivityType
    title: str = Field(min_length=1, max_length=200)
    programme: str = Field(min_length=1, max_length=120)
    course_code: str | None = Field(default=None, max_length=50)
    supervisor: str = Field(min_length=1, max_length=120)
    laboratory: str | None = Field(default=None, max_length=120)
    due_date: date | None = None
    status: ActivityStatus = "Planned"
    progress: int = Field(default=0, ge=0, le=100)
    score: float | None = Field(default=None, ge=0)
    max_score: float = Field(default=100, gt=0, le=10000)
    objective: str | None = Field(default=None, max_length=5000)
    feedback: str | None = Field(default=None, max_length=5000)

    @model_validator(mode="after")
    def validate_assessment(self):
        if self.score is not None and self.score > self.max_score:
            raise ValueError("Score cannot exceed maximum marks")
        if self.status == "Completed" and (self.progress != 100 or self.score is None):
            raise ValueError("Completed activities require 100% progress and an assessment score")
        return self


class ActivityUpdate(ActivityInput):
    version: int = Field(gt=0)


class ActivityResponse(ActivityInput):
    id: int
    student_name: str
    version: int
    created_at: datetime
    updated_at: datetime


def response(row, student):
    return {
        **{column.name: getattr(row, column.name) for column in row.__table__.columns},
        "student_name": f"{student.first_name} {student.last_name or ''}".strip(),
    }


def find_student(db, student_id):
    student = db.get(models.Student, student_id)
    if student is None:
        raise HTTPException(404, "Student not found")
    return student


def commit_activity(db):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This student already has an activity with that title, type, year and semester")
    except StaleDataError:
        db.rollback()
        raise HTTPException(409, "This activity changed. Reload it before saving again")


@router.get("", response_model=list[ActivityResponse])
def list_activities(db: Session = Depends(get_db), user=Depends(staff_access)):
    rows = db.query(models.AcademicActivity, models.Student).join(
        models.Student, models.Student.id == models.AcademicActivity.student_id
    ).order_by(models.AcademicActivity.updated_at.desc()).all()
    return [response(row, student) for row, student in rows]


@router.get("/student-options")
def student_options(db: Session = Depends(get_db), user=Depends(staff_access)):
    students = db.query(models.Student.id, models.Student.first_name, models.Student.last_name, models.Student.admission_no).order_by(models.Student.first_name).all()
    return [dict(student._mapping) for student in students]


@router.post("", response_model=ActivityResponse, status_code=201)
def create_activity(payload: ActivityInput, db: Session = Depends(get_db), user=Depends(staff_access)):
    student = find_student(db, payload.student_id)
    row = models.AcademicActivity(**payload.model_dump())
    db.add(row)
    commit_activity(db)
    db.refresh(row)
    return response(row, student)


@router.put("/{activity_id}", response_model=ActivityResponse)
def update_activity(activity_id: int, payload: ActivityUpdate, db: Session = Depends(get_db), user=Depends(staff_access)):
    row = db.get(models.AcademicActivity, activity_id)
    if row is None:
        raise HTTPException(404, "Activity not found")
    if row.version != payload.version:
        raise HTTPException(409, "This activity changed. Reload it before saving again")
    student = find_student(db, payload.student_id)
    for key, value in payload.model_dump(exclude={"version"}).items():
        setattr(row, key, value)
    commit_activity(db)
    db.refresh(row)
    return response(row, student)


@router.delete("/{activity_id}")
def delete_activity(activity_id: int, db: Session = Depends(get_db), user=Depends(require_roles(["Admin", "Principal"]))):
    row = db.get(models.AcademicActivity, activity_id)
    if row is None:
        raise HTTPException(404, "Activity not found")
    db.delete(row)
    commit_activity(db)
    return {"message": "Activity deleted"}
