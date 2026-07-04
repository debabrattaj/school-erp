from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import InternationalDocument, Student, User
from app.schemas import InternationalDocumentCreate, InternationalDocumentResponse
from app.security import require_roles

router = APIRouter(
    prefix="/international-documents",
    tags=["International Documents"],
)


VALID_STATUSES = [
    "Pending",
    "Submitted",
    "Verified",
    "Rejected",
    "Expired",
]


def get_or_404(db: Session, model, record_id: int, label: str):
    record = db.query(model).filter(model.id == record_id).first()

    if not record:
        raise HTTPException(status_code=404, detail=f"{label} not found")

    return record


def get_student_name(student: Student):
    name = f"{student.first_name or ''} {student.last_name or ''}".strip()
    return name or f"Student ID: {student.id}"


def serialize_document(document: InternationalDocument, db: Session):
    student = db.query(Student).filter(Student.id == document.student_id).first()

    return {
        "id": document.id,
        "student_id": document.student_id,
        "document_type": document.document_type,
        "document_no": document.document_no,
        "issue_date": document.issue_date,
        "expiry_date": document.expiry_date,
        "issuing_country": document.issuing_country,
        "status": document.status,
        "file_url": document.file_url,
        "verified_by": document.verified_by,
        "verified_date": document.verified_date,
        "remarks": document.remarks,
        "created_at": document.created_at,
        "updated_at": document.updated_at,
        "student_name": get_student_name(student) if student else "-",
        "admission_no": student.admission_no if student else None,
        "class_name": student.class_name if student else None,
        "section": student.section if student else None,
    }


def validate_payload(payload: InternationalDocumentCreate):
    if not payload.document_type.strip():
        raise HTTPException(status_code=400, detail="Document type is required")

    if payload.status and payload.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid document status")


@router.get("/", response_model=list[InternationalDocumentResponse])
def get_international_documents(
    student_id: int | None = None,
    status: str | None = None,
    document_type: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher"])),
):
    query = db.query(InternationalDocument)

    if student_id:
        query = query.filter(InternationalDocument.student_id == student_id)

    if status:
        query = query.filter(InternationalDocument.status == status)

    if document_type:
        query = query.filter(InternationalDocument.document_type == document_type)

    documents = query.order_by(InternationalDocument.id.desc()).all()
    return [serialize_document(document, db) for document in documents]


@router.get("/{document_id}", response_model=InternationalDocumentResponse)
def get_international_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher"])),
):
    document = get_or_404(db, InternationalDocument, document_id, "International document")
    return serialize_document(document, db)


@router.post("/", response_model=InternationalDocumentResponse)
def create_international_document(
    payload: InternationalDocumentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    get_or_404(db, Student, payload.student_id, "Student")
    validate_payload(payload)

    document = InternationalDocument(**payload.model_dump())
    db.add(document)
    db.commit()
    db.refresh(document)
    return serialize_document(document, db)


@router.put("/{document_id}", response_model=InternationalDocumentResponse)
def update_international_document(
    document_id: int,
    payload: InternationalDocumentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    document = get_or_404(db, InternationalDocument, document_id, "International document")
    get_or_404(db, Student, payload.student_id, "Student")
    validate_payload(payload)

    for key, value in payload.model_dump().items():
        setattr(document, key, value)

    db.commit()
    db.refresh(document)
    return serialize_document(document, db)


@router.delete("/{document_id}")
def delete_international_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    document = get_or_404(db, InternationalDocument, document_id, "International document")
    db.delete(document)
    db.commit()
    return {"message": "International document deleted successfully"}
