from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AlumniWithdrawalRecord, Student, User
from app.schemas import AlumniWithdrawalRecordCreate, AlumniWithdrawalRecordResponse
from app.security import require_roles

router = APIRouter(prefix="/alumni-withdrawals", tags=["Alumni & Withdrawals"])

VALID_TYPES = ["Withdrawal", "Transfer", "Alumni"]
VALID_CERTIFICATE_STATUSES = ["Pending", "In Progress", "Issued", "Rejected", "Not Required"]
VALID_STATUSES = ["Pending", "Approved", "Completed", "Rejected", "Archived"]


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


def next_record_no(db: Session):
    latest = (
        db.query(AlumniWithdrawalRecord)
        .order_by(AlumniWithdrawalRecord.id.desc())
        .first()
    )
    next_number = (latest.id + 1) if latest else 1
    return f"AW-{next_number:04d}"


def get_student_name(student: Student):
    name = f"{student.first_name or ''} {student.last_name or ''}".strip()
    return name or f"Student ID: {student.id}"


def hydrate_student_snapshot(data: dict, db: Session):
    if not data.get("student_id"):
        return data, None

    student = get_or_404(db, Student, data["student_id"], "Student")
    data["student_name"] = data["student_name"].strip() or get_student_name(student)
    data["admission_no"] = data["admission_no"] or student.admission_no
    data["last_class"] = data["last_class"] or " ".join(
        part for part in [student.class_name, student.section] if part
    )
    data["alumni_email"] = data["alumni_email"] or student.guardian_email
    data["alumni_phone"] = data["alumni_phone"] or student.guardian_phone
    return data, student


def validate_payload(payload: AlumniWithdrawalRecordCreate):
    if payload.record_type and payload.record_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail="Invalid record type")

    if not payload.student_name.strip() and not payload.student_id:
        raise HTTPException(status_code=400, detail="Student name is required")

    if not payload.reason.strip():
        raise HTTPException(status_code=400, detail="Reason is required")

    if payload.certificate_status and payload.certificate_status not in VALID_CERTIFICATE_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid certificate status")

    if payload.current_status and payload.current_status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid current status")


def serialize_record(record: AlumniWithdrawalRecord, db: Session):
    student = None
    if record.student_id:
        student = db.query(Student).filter(Student.id == record.student_id).first()

    return {
        "id": record.id,
        "record_no": record.record_no,
        "student_id": record.student_id,
        "student_name": record.student_name,
        "admission_no": record.admission_no,
        "last_class": record.last_class,
        "record_type": record.record_type,
        "request_date": record.request_date,
        "leaving_date": record.leaving_date,
        "reason": record.reason,
        "destination_school": record.destination_school,
        "destination_country": record.destination_country,
        "certificate_status": record.certificate_status,
        "alumni_email": record.alumni_email,
        "alumni_phone": record.alumni_phone,
        "current_status": record.current_status,
        "approved_by": record.approved_by,
        "approval_date": record.approval_date,
        "remarks": record.remarks,
        "section": student.section if student else None,
        "guardian_name": student.guardian_name if student else None,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }


@router.get("/", response_model=list[AlumniWithdrawalRecordResponse])
def get_records(
    record_type: str | None = None,
    current_status: str | None = None,
    certificate_status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher", "Accounts"])),
):
    query = db.query(AlumniWithdrawalRecord)

    if record_type:
        query = query.filter(AlumniWithdrawalRecord.record_type == record_type)

    if current_status:
        query = query.filter(AlumniWithdrawalRecord.current_status == current_status)

    if certificate_status:
        query = query.filter(AlumniWithdrawalRecord.certificate_status == certificate_status)

    records = query.order_by(AlumniWithdrawalRecord.id.desc()).all()
    return [serialize_record(record, db) for record in records]


@router.post("/", response_model=AlumniWithdrawalRecordResponse)
def create_record(
    payload: AlumniWithdrawalRecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    validate_payload(payload)
    data, _student = hydrate_student_snapshot(payload.model_dump(), db)
    data["record_no"] = data["record_no"].strip() or next_record_no(db)
    record = AlumniWithdrawalRecord(**data)
    db.add(record)
    commit_or_400(db, "Record number already exists")
    db.refresh(record)
    return serialize_record(record, db)


@router.put("/{record_id}", response_model=AlumniWithdrawalRecordResponse)
def update_record(
    record_id: int,
    payload: AlumniWithdrawalRecordCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    record = get_or_404(db, AlumniWithdrawalRecord, record_id, "Alumni withdrawal record")
    validate_payload(payload)
    data, _student = hydrate_student_snapshot(payload.model_dump(), db)
    data["record_no"] = data["record_no"].strip() or record.record_no

    for key, value in data.items():
        setattr(record, key, value)

    commit_or_400(db, "Record number already exists")
    db.refresh(record)
    return serialize_record(record, db)


@router.delete("/{record_id}")
def delete_record(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    record = get_or_404(db, AlumniWithdrawalRecord, record_id, "Alumni withdrawal record")
    db.delete(record)
    db.commit()
    return {"message": "Alumni withdrawal record deleted successfully"}
