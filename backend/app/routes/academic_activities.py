"""Supervised projects and practical assessments within the current tenant."""
from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator
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


def commit_activity(db, duplicate_message="This student already has an activity with that title, type, year and semester"):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, duplicate_message)
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
    row = db.query(models.AcademicActivity).filter_by(id=activity_id).with_for_update().first()
    if row is None:
        raise HTTPException(404, "Activity not found")
    if row.version != payload.version:
        raise HTTPException(409, "This activity changed. Reload it before saving again")
    if payload.status == "Completed" and db.query(models.AcademicMilestone).filter(
        models.AcademicMilestone.activity_id == activity_id,
        models.AcademicMilestone.status != "Approved",
    ).first():
        raise HTTPException(400, "Approve all milestones before completing this activity")
    student = find_student(db, payload.student_id)
    for key, value in payload.model_dump(exclude={"version"}).items():
        setattr(row, key, value)
    commit_activity(db)
    db.refresh(row)
    return response(row, student)


@router.delete("/{activity_id}")
def delete_activity(activity_id: int, db: Session = Depends(get_db), user=Depends(require_roles(["Admin", "Principal"]))):
    row = db.query(models.AcademicActivity).filter_by(id=activity_id).with_for_update().first()
    if row is None:
        raise HTTPException(404, "Activity not found")
    db.query(models.AcademicMilestone).filter_by(activity_id=activity_id).delete(synchronize_session=False)
    db.delete(row)
    commit_activity(db)
    return {"message": "Activity deleted"}


class MilestoneInput(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=200)
    due_date: date | None = None
    status: Literal["Pending", "Submitted", "Changes Requested", "Approved"] = "Pending"
    feedback: str | None = Field(default=None, max_length=5000)
    evidence_url: str | None = Field(default=None, max_length=2000)

    @field_validator("evidence_url")
    @classmethod
    def validate_evidence_url(cls, value):
        return str(HttpUrl(value)) if value else None


class MilestoneUpdate(MilestoneInput):
    version: int = Field(gt=0)


class MilestoneResponse(MilestoneInput):
    model_config = ConfigDict(from_attributes=True)
    id: int
    activity_id: int
    version: int
    reviewed_by: str | None
    reviewed_at: datetime | None


def record_review(row, user):
    if row.status in {"Approved", "Changes Requested"}:
        row.reviewed_by = user.name or user.email
        row.reviewed_at = datetime.utcnow()
    else:
        row.reviewed_by = None
        row.reviewed_at = None


def editable_activity(db, activity_id):
    activity = db.query(models.AcademicActivity).filter_by(id=activity_id).with_for_update().first()
    if activity is None:
        raise HTTPException(404, "Activity not found")
    if activity.status == "Completed":
        raise HTTPException(409, "Reopen the activity before changing its milestones")
    return activity


@router.get("/{activity_id}/milestones", response_model=list[MilestoneResponse])
def list_milestones(activity_id: int, db: Session = Depends(get_db), user=Depends(staff_access)):
    if db.get(models.AcademicActivity, activity_id) is None:
        raise HTTPException(404, "Activity not found")
    return db.query(models.AcademicMilestone).filter_by(activity_id=activity_id).order_by(models.AcademicMilestone.id).all()


@router.post("/{activity_id}/milestones", response_model=MilestoneResponse, status_code=201)
def create_milestone(activity_id: int, payload: MilestoneInput, db: Session = Depends(get_db), user=Depends(staff_access)):
    editable_activity(db, activity_id)
    row = models.AcademicMilestone(activity_id=activity_id, **payload.model_dump())
    record_review(row, user)
    db.add(row)
    commit_activity(db, "A milestone with this title already exists in this activity")
    db.refresh(row)
    return row


@router.put("/{activity_id}/milestones/{milestone_id}", response_model=MilestoneResponse)
def update_milestone(activity_id: int, milestone_id: int, payload: MilestoneUpdate, db: Session = Depends(get_db), user=Depends(staff_access)):
    editable_activity(db, activity_id)
    row = db.query(models.AcademicMilestone).filter_by(id=milestone_id, activity_id=activity_id).first()
    if row is None:
        raise HTTPException(404, "Milestone not found")
    if row.version != payload.version:
        raise HTTPException(409, "This milestone changed. Reload it before saving again")
    for key, value in payload.model_dump(exclude={"version"}).items():
        setattr(row, key, value)
    record_review(row, user)
    commit_activity(db, "A milestone with this title already exists in this activity")
    db.refresh(row)
    return row


@router.delete("/{activity_id}/milestones/{milestone_id}")
def delete_milestone(activity_id: int, milestone_id: int, db: Session = Depends(get_db), user=Depends(require_roles(["Admin", "Principal"]))):
    editable_activity(db, activity_id)
    row = db.query(models.AcademicMilestone).filter_by(id=milestone_id, activity_id=activity_id).first()
    if row is None:
        raise HTTPException(404, "Milestone not found")
    db.delete(row)
    commit_activity(db)
    return {"message": "Milestone deleted"}
