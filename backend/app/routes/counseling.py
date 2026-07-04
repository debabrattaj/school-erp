from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import CounselingCase, Student, User
from app.schemas import CounselingCaseCreate, CounselingCaseResponse
from app.security import require_roles

router = APIRouter(prefix="/counseling", tags=["Counseling & Wellbeing"])

VALID_CONCERNS = [
    "Academic Stress",
    "Behavior",
    "Emotional Wellbeing",
    "Peer Relationship",
    "Attendance Concern",
    "Safeguarding",
    "Career Guidance",
    "Other",
]
VALID_RISK_LEVELS = ["Low", "Medium", "High", "Critical"]
VALID_CONFIDENTIALITY = ["Standard", "Restricted", "Sensitive"]
VALID_STATUSES = ["Open", "In Progress", "Monitoring", "Closed", "Escalated"]


def get_or_404(db: Session, model, record_id: int, label: str):
    record = db.query(model).filter(model.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return record


def commit_or_400(db: Session, message: str):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=message)


def next_case_no(db: Session):
    latest = db.query(CounselingCase).order_by(CounselingCase.id.desc()).first()
    next_number = (latest.id + 1) if latest else 1
    return f"CNS-{next_number:04d}"


def get_student_name(student: Student):
    name = f"{student.first_name or ''} {student.last_name or ''}".strip()
    return name or f"Student ID: {student.id}"


def validate_payload(payload: CounselingCaseCreate, db: Session):
    get_or_404(db, Student, payload.student_id, "Student")

    if payload.concern_type not in VALID_CONCERNS:
        raise HTTPException(status_code=400, detail="Invalid concern type")

    if payload.risk_level and payload.risk_level not in VALID_RISK_LEVELS:
        raise HTTPException(status_code=400, detail="Invalid risk level")

    if payload.confidentiality_level and payload.confidentiality_level not in VALID_CONFIDENTIALITY:
        raise HTTPException(status_code=400, detail="Invalid confidentiality level")

    if payload.status and payload.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid counseling status")


def serialize_case(case: CounselingCase, db: Session):
    student = db.query(Student).filter(Student.id == case.student_id).first()

    return {
        "id": case.id,
        "case_no": case.case_no,
        "student_id": case.student_id,
        "concern_type": case.concern_type,
        "risk_level": case.risk_level,
        "reported_by": case.reported_by,
        "counselor": case.counselor,
        "session_date": case.session_date,
        "next_follow_up_date": case.next_follow_up_date,
        "guardian_contacted": case.guardian_contacted,
        "action_plan": case.action_plan,
        "confidentiality_level": case.confidentiality_level,
        "status": case.status,
        "outcome": case.outcome,
        "remarks": case.remarks,
        "student_name": get_student_name(student) if student else "-",
        "admission_no": student.admission_no if student else None,
        "class_name": student.class_name if student else None,
        "section": student.section if student else None,
        "guardian_name": student.guardian_name if student else None,
        "guardian_phone": student.guardian_phone if student else None,
        "created_at": case.created_at,
        "updated_at": case.updated_at,
    }


@router.get("/", response_model=list[CounselingCaseResponse])
def get_cases(
    status: str | None = None,
    risk_level: str | None = None,
    concern_type: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher"])),
):
    query = db.query(CounselingCase)

    if status:
        query = query.filter(CounselingCase.status == status)
    if risk_level:
        query = query.filter(CounselingCase.risk_level == risk_level)
    if concern_type:
        query = query.filter(CounselingCase.concern_type == concern_type)

    cases = query.order_by(CounselingCase.id.desc()).all()
    return [serialize_case(case, db) for case in cases]


@router.post("/", response_model=CounselingCaseResponse)
def create_case(
    payload: CounselingCaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher"])),
):
    validate_payload(payload, db)
    data = payload.model_dump()
    data["case_no"] = data["case_no"].strip() or next_case_no(db)
    case = CounselingCase(**data)
    db.add(case)
    commit_or_400(db, "Case number already exists")
    db.refresh(case)
    return serialize_case(case, db)


@router.put("/{case_id}", response_model=CounselingCaseResponse)
def update_case(
    case_id: int,
    payload: CounselingCaseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher"])),
):
    case = get_or_404(db, CounselingCase, case_id, "Counseling case")
    validate_payload(payload, db)
    data = payload.model_dump()
    data["case_no"] = data["case_no"].strip() or case.case_no

    for key, value in data.items():
        setattr(case, key, value)

    commit_or_400(db, "Case number already exists")
    db.refresh(case)
    return serialize_case(case, db)


@router.delete("/{case_id}")
def delete_case(
    case_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    case = get_or_404(db, CounselingCase, case_id, "Counseling case")
    db.delete(case)
    db.commit()
    return {"message": "Counseling case deleted successfully"}
