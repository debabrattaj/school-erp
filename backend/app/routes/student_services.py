from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Student, StudentServiceTicket, User
from app.schemas import StudentServiceTicketCreate, StudentServiceTicketResponse
from app.security import require_roles

router = APIRouter(prefix="/student-services", tags=["Student Services"])

VALID_ROLES = ["Parent", "Student", "Guardian", "Staff", "Other"]
VALID_CATEGORIES = [
    "General Request",
    "Counseling",
    "Documents",
    "Transport",
    "Hostel",
    "Fees",
    "Academics",
    "Facilities",
    "Complaint",
]
VALID_PRIORITIES = ["Low", "Medium", "High", "Urgent"]
VALID_STATUSES = ["Open", "In Progress", "Waiting", "Resolved", "Closed"]


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


def next_ticket_no(db: Session):
    latest = (
        db.query(StudentServiceTicket)
        .order_by(StudentServiceTicket.id.desc())
        .first()
    )
    next_number = (latest.id + 1) if latest else 1
    return f"SVC-{next_number:04d}"


def get_student_name(student: Student):
    name = f"{student.first_name or ''} {student.last_name or ''}".strip()
    return name or f"Student ID: {student.id}"


def validate_payload(payload: StudentServiceTicketCreate, db: Session):
    if payload.student_id:
        get_or_404(db, Student, payload.student_id, "Student")

    if not payload.requester_name.strip():
        raise HTTPException(status_code=400, detail="Requester name is required")

    if payload.requester_role and payload.requester_role not in VALID_ROLES:
        raise HTTPException(status_code=400, detail="Invalid requester role")

    if payload.category not in VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid service category")

    if payload.priority and payload.priority not in VALID_PRIORITIES:
        raise HTTPException(status_code=400, detail="Invalid priority")

    if not payload.subject.strip():
        raise HTTPException(status_code=400, detail="Subject is required")

    if not payload.description.strip():
        raise HTTPException(status_code=400, detail="Description is required")

    if payload.status and payload.status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid ticket status")


def serialize_ticket(ticket: StudentServiceTicket, db: Session):
    student = None

    if ticket.student_id:
        student = db.query(Student).filter(Student.id == ticket.student_id).first()

    return {
        "id": ticket.id,
        "ticket_no": ticket.ticket_no,
        "student_id": ticket.student_id,
        "requester_name": ticket.requester_name,
        "requester_role": ticket.requester_role,
        "contact_phone": ticket.contact_phone,
        "contact_email": ticket.contact_email,
        "category": ticket.category,
        "priority": ticket.priority,
        "subject": ticket.subject,
        "description": ticket.description,
        "assigned_to": ticket.assigned_to,
        "due_date": ticket.due_date,
        "status": ticket.status,
        "resolution": ticket.resolution,
        "closed_date": ticket.closed_date,
        "remarks": ticket.remarks,
        "created_at": ticket.created_at,
        "updated_at": ticket.updated_at,
        "student_name": get_student_name(student) if student else None,
        "admission_no": student.admission_no if student else None,
        "class_name": student.class_name if student else None,
        "section": student.section if student else None,
    }


@router.get("/", response_model=list[StudentServiceTicketResponse])
def get_service_tickets(
    status: str | None = None,
    category: str | None = None,
    priority: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher", "Accounts"])),
):
    query = db.query(StudentServiceTicket)

    if status:
        query = query.filter(StudentServiceTicket.status == status)

    if category:
        query = query.filter(StudentServiceTicket.category == category)

    if priority:
        query = query.filter(StudentServiceTicket.priority == priority)

    tickets = query.order_by(StudentServiceTicket.id.desc()).all()
    return [serialize_ticket(ticket, db) for ticket in tickets]


@router.get("/{ticket_id}", response_model=StudentServiceTicketResponse)
def get_service_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher", "Accounts"])),
):
    ticket = get_or_404(db, StudentServiceTicket, ticket_id, "Service ticket")
    return serialize_ticket(ticket, db)


@router.post("/", response_model=StudentServiceTicketResponse)
def create_service_ticket(
    payload: StudentServiceTicketCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher", "Accounts"])),
):
    validate_payload(payload, db)
    data = payload.model_dump()
    data["ticket_no"] = data["ticket_no"].strip() or next_ticket_no(db)
    ticket = StudentServiceTicket(**data)

    db.add(ticket)
    commit_or_400(db, "Ticket number already exists")
    db.refresh(ticket)
    return serialize_ticket(ticket, db)


@router.put("/{ticket_id}", response_model=StudentServiceTicketResponse)
def update_service_ticket(
    ticket_id: int,
    payload: StudentServiceTicketCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher", "Accounts"])),
):
    ticket = get_or_404(db, StudentServiceTicket, ticket_id, "Service ticket")
    validate_payload(payload, db)
    data = payload.model_dump()
    data["ticket_no"] = data["ticket_no"].strip() or ticket.ticket_no

    for key, value in data.items():
        setattr(ticket, key, value)

    commit_or_400(db, "Ticket number already exists")
    db.refresh(ticket)
    return serialize_ticket(ticket, db)


@router.delete("/{ticket_id}")
def delete_service_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    ticket = get_or_404(db, StudentServiceTicket, ticket_id, "Service ticket")
    db.delete(ticket)
    db.commit()
    return {"message": "Service ticket deleted successfully"}
