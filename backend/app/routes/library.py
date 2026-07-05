from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import LibraryBook, LibraryIssue, Student, User
from app.schemas import LibraryBookCreate, LibraryBookResponse, LibraryIssueCreate, LibraryIssueResponse
from app.security import require_roles

router = APIRouter(prefix="/library", tags=["Library"])


def get_or_404(db: Session, model, record_id: int, label: str):
    record = db.query(model).filter(model.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return record


def student_name(student: Student):
    name = getattr(student, "student_name", None) or f"{student.first_name or ''} {student.last_name or ''}".strip()
    return name or f"Student ID: {student.id}"


def serialize_issue(issue: LibraryIssue, db: Session):
    book = db.query(LibraryBook).filter(LibraryBook.id == issue.book_id).first()
    student = db.query(Student).filter(Student.id == issue.student_id).first()
    return {
        "id": issue.id,
        "book_id": issue.book_id,
        "student_id": issue.student_id,
        "issue_date": issue.issue_date,
        "due_date": issue.due_date,
        "return_date": issue.return_date,
        "status": issue.status,
        "fine_amount": issue.fine_amount,
        "remarks": issue.remarks,
        "book_title": book.title if book else "-",
        "accession_no": book.accession_no if book else None,
        "student_name": student_name(student) if student else "-",
        "admission_no": student.admission_no if student else None,
        "class_name": student.class_name if student else None,
        "section": student.section if student else None,
    }


@router.get("/books/", response_model=list[LibraryBookResponse])
def get_books(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher"])),
):
    return db.query(LibraryBook).order_by(LibraryBook.title.asc()).all()


@router.post("/books/", response_model=LibraryBookResponse)
def create_book(
    payload: LibraryBookCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    if payload.total_copies < 0 or payload.available_copies < 0:
        raise HTTPException(status_code=400, detail="Copies cannot be negative")

    book = LibraryBook(**payload.model_dump())
    db.add(book)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Accession number already exists")
    db.refresh(book)
    return book


@router.put("/books/{book_id}", response_model=LibraryBookResponse)
def update_book(
    book_id: int,
    payload: LibraryBookCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    book = get_or_404(db, LibraryBook, book_id, "Book")
    for key, value in payload.model_dump().items():
        setattr(book, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Accession number already exists")
    db.refresh(book)
    return book


@router.delete("/books/{book_id}")
def delete_book(
    book_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    book = get_or_404(db, LibraryBook, book_id, "Book")
    db.delete(book)
    db.commit()
    return {"message": "Book deleted successfully"}


@router.get("/issues/", response_model=list[LibraryIssueResponse])
def get_issues(
    status: str | None = None,
    student_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher"])),
):
    query = db.query(LibraryIssue)
    if status:
        query = query.filter(LibraryIssue.status == status)
    if student_id:
        query = query.filter(LibraryIssue.student_id == student_id)
    issues = query.order_by(LibraryIssue.id.desc()).all()
    return [serialize_issue(issue, db) for issue in issues]


@router.post("/issues/", response_model=LibraryIssueResponse)
def create_issue(
    payload: LibraryIssueCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher"])),
):
    book = get_or_404(db, LibraryBook, payload.book_id, "Book")
    get_or_404(db, Student, payload.student_id, "Student")

    if payload.status == "Issued" and book.available_copies <= 0:
        raise HTTPException(status_code=400, detail="No available copies for this book")

    issue = LibraryIssue(**payload.model_dump())
    if payload.status == "Issued":
        book.available_copies -= 1
    db.add(issue)
    db.commit()
    db.refresh(issue)
    return serialize_issue(issue, db)


@router.put("/issues/{issue_id}", response_model=LibraryIssueResponse)
def update_issue(
    issue_id: int,
    payload: LibraryIssueCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher"])),
):
    issue = get_or_404(db, LibraryIssue, issue_id, "Book issue")
    book = get_or_404(db, LibraryBook, payload.book_id, "Book")
    get_or_404(db, Student, payload.student_id, "Student")

    if issue.status == "Issued" and payload.status != "Issued":
        book.available_copies += 1
    elif issue.status != "Issued" and payload.status == "Issued":
        if book.available_copies <= 0:
            raise HTTPException(status_code=400, detail="No available copies for this book")
        book.available_copies -= 1

    for key, value in payload.model_dump().items():
        setattr(issue, key, value)

    db.commit()
    db.refresh(issue)
    return serialize_issue(issue, db)


@router.delete("/issues/{issue_id}")
def delete_issue(
    issue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    issue = get_or_404(db, LibraryIssue, issue_id, "Book issue")
    book = db.query(LibraryBook).filter(LibraryBook.id == issue.book_id).first()
    if book and issue.status == "Issued":
        book.available_copies += 1
    db.delete(issue)
    db.commit()
    return {"message": "Book issue deleted successfully"}
