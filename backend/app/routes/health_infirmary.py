from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import HealthInfirmaryVisit, Student, User
from app.schemas import HealthInfirmaryVisitCreate, HealthInfirmaryVisitResponse
from app.security import require_roles

router = APIRouter(prefix="/health-infirmary", tags=["Health Infirmary"])


def get_or_404(db: Session, model, record_id: int, label: str):
    record = db.query(model).filter(model.id == record_id).first()

    if not record:
        raise HTTPException(status_code=404, detail=f"{label} not found")

    return record


def get_student_name(student: Student):
    name = (
        getattr(student, "student_name", None)
        or f"{student.first_name or ''} {student.last_name or ''}".strip()
    )
    return name or f"Student ID: {student.id}"


def serialize_visit(visit: HealthInfirmaryVisit, db: Session):
    student = db.query(Student).filter(Student.id == visit.student_id).first()

    return {
        "id": visit.id,
        "student_id": visit.student_id,
        "visit_date": visit.visit_date,
        "visit_time": visit.visit_time,
        "symptoms": visit.symptoms,
        "diagnosis": visit.diagnosis,
        "treatment": visit.treatment,
        "medicine_given": visit.medicine_given,
        "attended_by": visit.attended_by,
        "referred_to_hospital": visit.referred_to_hospital,
        "follow_up_date": visit.follow_up_date,
        "status": visit.status,
        "remarks": visit.remarks,
        "student_name": get_student_name(student) if student else "-",
        "admission_no": student.admission_no if student else None,
        "class_name": student.class_name if student else None,
        "section": student.section if student else None,
    }


@router.get("/visits/", response_model=list[HealthInfirmaryVisitResponse])
def get_visits(
    status: str | None = None,
    student_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher"])),
):
    query = db.query(HealthInfirmaryVisit)

    if status:
        query = query.filter(HealthInfirmaryVisit.status == status)

    if student_id:
        query = query.filter(HealthInfirmaryVisit.student_id == student_id)

    visits = query.order_by(HealthInfirmaryVisit.id.desc()).all()
    return [serialize_visit(visit, db) for visit in visits]


@router.post("/visits/", response_model=HealthInfirmaryVisitResponse)
def create_visit(
    payload: HealthInfirmaryVisitCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher"])),
):
    get_or_404(db, Student, payload.student_id, "Student")

    if not payload.symptoms.strip():
        raise HTTPException(status_code=400, detail="Symptoms are required")

    visit = HealthInfirmaryVisit(**payload.model_dump())
    db.add(visit)
    db.commit()
    db.refresh(visit)
    return serialize_visit(visit, db)


@router.put("/visits/{visit_id}", response_model=HealthInfirmaryVisitResponse)
def update_visit(
    visit_id: int,
    payload: HealthInfirmaryVisitCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher"])),
):
    visit = get_or_404(db, HealthInfirmaryVisit, visit_id, "Health visit")
    get_or_404(db, Student, payload.student_id, "Student")

    if not payload.symptoms.strip():
        raise HTTPException(status_code=400, detail="Symptoms are required")

    for key, value in payload.model_dump().items():
        setattr(visit, key, value)

    db.commit()
    db.refresh(visit)
    return serialize_visit(visit, db)


@router.delete("/visits/{visit_id}")
def delete_visit(
    visit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    visit = get_or_404(db, HealthInfirmaryVisit, visit_id, "Health visit")
    db.delete(visit)
    db.commit()
    return {"message": "Health visit deleted successfully"}
