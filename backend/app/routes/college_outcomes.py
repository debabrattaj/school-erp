"""Semester results and placement-cell records for higher education."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.security import require_roles
from app.tenant import require_feature

router = APIRouter(prefix="/college-outcomes", tags=["College Outcomes"], dependencies=[Depends(require_feature("college_outcomes"))])
MANAGERS = ["Admin", "Principal", "Teacher"]
RESULT_STATUSES = {"Draft", "Published", "Withheld"}
RECRUITER_STATUSES = {"Active", "Inactive"}
OFFER_TYPES = {"Placement", "Internship", "Higher Studies", "Entrepreneurship"}
OFFER_STATUSES = {"Applied", "Shortlisted", "Offered", "Accepted", "Declined", "Not Selected"}

def student_name(db, student_id):
    student = db.query(models.Student).filter(models.Student.id == student_id).first()
    return f"{student.first_name} {student.last_name or ''}".strip() if student else "Unknown student"

def result_dict(row, db):
    return {**{c.name: getattr(row, c.name) for c in row.__table__.columns}, "student_name": student_name(db, row.student_id)}

def offer_dict(row, db):
    recruiter = db.query(models.PlacementRecruiter).filter(models.PlacementRecruiter.id == row.recruiter_id).first() if row.recruiter_id else None
    return {**{c.name: getattr(row, c.name) for c in row.__table__.columns}, "student_name": student_name(db, row.student_id), "recruiter_name": recruiter.company_name if recruiter else None}

def ensure_student(db, student_id):
    if not db.query(models.Student).filter(models.Student.id == student_id).first():
        raise HTTPException(404, "Student not found")

@router.get("/semester-results", response_model=list[schemas.SemesterResultResponse])
def list_results(student_id: int | None = None, academic_year: str | None = None, db: Session = Depends(get_db), current_user: models.User = Depends(require_roles(MANAGERS))):
    q = db.query(models.SemesterResult)
    if student_id: q = q.filter(models.SemesterResult.student_id == student_id)
    if academic_year: q = q.filter(models.SemesterResult.academic_year == academic_year)
    return [result_dict(row, db) for row in q.order_by(models.SemesterResult.academic_year.desc(), models.SemesterResult.semester.asc()).all()]

@router.post("/semester-results", response_model=schemas.SemesterResultResponse)
def create_result(payload: schemas.SemesterResultBase, db: Session = Depends(get_db), current_user: models.User = Depends(require_roles(MANAGERS))):
    data = payload.model_dump()
    if data["result_status"] not in RESULT_STATUSES: raise HTTPException(400, "Invalid result status")
    if data["credits_earned"] is not None and data["credits_registered"] is not None and data["credits_earned"] > data["credits_registered"]: raise HTTPException(400, "Earned credits cannot exceed registered credits")
    ensure_student(db, data["student_id"])
    row = models.SemesterResult(**data); db.add(row)
    try: db.commit()
    except IntegrityError:
        db.rollback(); raise HTTPException(400, "A result already exists for this student and semester")
    db.refresh(row); return result_dict(row, db)

@router.put("/semester-results/{row_id}", response_model=schemas.SemesterResultResponse)
def update_result(row_id: int, payload: schemas.SemesterResultBase, db: Session = Depends(get_db), current_user: models.User = Depends(require_roles(MANAGERS))):
    row = db.get(models.SemesterResult, row_id)
    if not row: raise HTTPException(404, "Semester result not found")
    data = payload.model_dump()
    if data["result_status"] not in RESULT_STATUSES: raise HTTPException(400, "Invalid result status")
    if data["credits_earned"] is not None and data["credits_registered"] is not None and data["credits_earned"] > data["credits_registered"]: raise HTTPException(400, "Earned credits cannot exceed registered credits")
    ensure_student(db, data["student_id"])
    for key, value in data.items(): setattr(row, key, value)
    db.commit(); db.refresh(row); return result_dict(row, db)

@router.delete("/semester-results/{row_id}")
def delete_result(row_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_roles(["Admin", "Principal"]))):
    row = db.get(models.SemesterResult, row_id)
    if not row: raise HTTPException(404, "Semester result not found")
    db.delete(row); db.commit(); return {"message": "Semester result deleted"}

@router.get("/recruiters", response_model=list[schemas.PlacementRecruiterResponse])
def list_recruiters(db: Session = Depends(get_db), current_user: models.User = Depends(require_roles(MANAGERS))):
    return db.query(models.PlacementRecruiter).order_by(models.PlacementRecruiter.company_name).all()

@router.post("/recruiters", response_model=schemas.PlacementRecruiterResponse)
def create_recruiter(payload: schemas.PlacementRecruiterBase, db: Session = Depends(get_db), current_user: models.User = Depends(require_roles(MANAGERS))):
    if payload.status not in RECRUITER_STATUSES: raise HTTPException(400, "Invalid recruiter status")
    row = models.PlacementRecruiter(**payload.model_dump()); db.add(row)
    try: db.commit()
    except IntegrityError:
        db.rollback(); raise HTTPException(400, "Recruiter already exists")
    db.refresh(row); return row

@router.put("/recruiters/{row_id}", response_model=schemas.PlacementRecruiterResponse)
def update_recruiter(row_id: int, payload: schemas.PlacementRecruiterBase, db: Session = Depends(get_db), current_user: models.User = Depends(require_roles(MANAGERS))):
    row = db.get(models.PlacementRecruiter, row_id)
    if not row: raise HTTPException(404, "Recruiter not found")
    if payload.status not in RECRUITER_STATUSES: raise HTTPException(400, "Invalid recruiter status")
    for key, value in payload.model_dump().items(): setattr(row, key, value)
    db.commit(); db.refresh(row); return row

@router.delete("/recruiters/{row_id}")
def delete_recruiter(row_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_roles(["Admin", "Principal"]))):
    row = db.get(models.PlacementRecruiter, row_id)
    if not row: raise HTTPException(404, "Recruiter not found")
    db.delete(row); db.commit(); return {"message": "Recruiter deleted"}

@router.get("/offers", response_model=list[schemas.PlacementOfferResponse])
def list_offers(status: str | None = None, db: Session = Depends(get_db), current_user: models.User = Depends(require_roles(MANAGERS))):
    q = db.query(models.PlacementOffer)
    if status: q = q.filter(models.PlacementOffer.status == status)
    return [offer_dict(row, db) for row in q.order_by(models.PlacementOffer.drive_date.desc()).all()]

@router.post("/offers", response_model=schemas.PlacementOfferResponse)
def create_offer(payload: schemas.PlacementOfferBase, db: Session = Depends(get_db), current_user: models.User = Depends(require_roles(MANAGERS))):
    data = payload.model_dump()
    if data["offer_type"] not in OFFER_TYPES or data["status"] not in OFFER_STATUSES: raise HTTPException(400, "Invalid offer type or status")
    ensure_student(db, data["student_id"])
    if data["recruiter_id"] and not db.get(models.PlacementRecruiter, data["recruiter_id"]): raise HTTPException(404, "Recruiter not found")
    row = models.PlacementOffer(**data); db.add(row); db.commit(); db.refresh(row); return offer_dict(row, db)

@router.put("/offers/{row_id}", response_model=schemas.PlacementOfferResponse)
def update_offer(row_id: int, payload: schemas.PlacementOfferBase, db: Session = Depends(get_db), current_user: models.User = Depends(require_roles(MANAGERS))):
    row = db.get(models.PlacementOffer, row_id)
    if not row: raise HTTPException(404, "Placement outcome not found")
    data = payload.model_dump()
    if data["offer_type"] not in OFFER_TYPES or data["status"] not in OFFER_STATUSES: raise HTTPException(400, "Invalid offer type or status")
    ensure_student(db, data["student_id"])
    if data["recruiter_id"] and not db.get(models.PlacementRecruiter, data["recruiter_id"]): raise HTTPException(404, "Recruiter not found")
    for key, value in data.items(): setattr(row, key, value)
    db.commit(); db.refresh(row); return offer_dict(row, db)

@router.delete("/offers/{row_id}")
def delete_offer(row_id: int, db: Session = Depends(get_db), current_user: models.User = Depends(require_roles(["Admin", "Principal"]))):
    row = db.get(models.PlacementOffer, row_id)
    if not row: raise HTTPException(404, "Placement outcome not found")
    db.delete(row); db.commit(); return {"message": "Placement outcome deleted"}
