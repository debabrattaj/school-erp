from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.csv_import import csv_template_response, read_csv_upload
from app.database import get_db
from app.models import LibraryBook, LibraryIssue, Student, User
from app.schemas import LibraryBookCreate, LibraryBookResponse, LibraryIssueCreate, LibraryIssueResponse
from app.security import require_roles

router = APIRouter(prefix="/library", tags=["Library"])

BOOK_BULK_IMPORT_COLUMNS = [
    "accession_no",
    "title",
    "author",
    "category",
    "publisher",
    "isbn",
    "total_copies",
    "shelf_no",
    "remarks",
]


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


@router.get("/books/bulk-import-template")
def bulk_import_books_template(
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    return csv_template_response(
        BOOK_BULK_IMPORT_COLUMNS,
        {
            "accession_no": "ACC-1001",
            "title": "Wings of Fire",
            "author": "A.P.J. Abdul Kalam",
            "category": "Biography",
            "publisher": "Universities Press",
            "isbn": "9788173711466",
            "total_copies": "3",
            "shelf_no": "B-12",
            "remarks": "",
        },
        "library_books_import_template.csv",
    )


@router.post("/books/bulk-import")
def bulk_import_books(
    file: UploadFile = File(...),
    dry_run: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    rows, unknown_columns = read_csv_upload(file, BOOK_BULK_IMPORT_COLUMNS)

    seen = set()
    errors = []
    to_create = []

    for row_index, cleaned in rows:
        accession_no = cleaned.get("accession_no")
        if not accession_no:
            errors.append({"row": row_index, "error": "accession_no is required"})
            continue
        if not cleaned.get("title"):
            errors.append({"row": row_index, "error": "title is required"})
            continue

        if accession_no in seen:
            errors.append({"row": row_index, "error": f"Duplicate accession_no in file: {accession_no}"})
            continue
        if db.query(LibraryBook).filter(LibraryBook.accession_no == accession_no).first():
            errors.append({"row": row_index, "error": f"Accession number already exists: {accession_no}"})
            continue

        try:
            total_copies = int(cleaned["total_copies"]) if cleaned.get("total_copies") else 1
        except ValueError:
            errors.append({"row": row_index, "error": "total_copies must be a whole number"})
            continue

        try:
            validated = LibraryBookCreate(
                accession_no=accession_no,
                title=cleaned["title"],
                author=cleaned.get("author"),
                category=cleaned.get("category"),
                publisher=cleaned.get("publisher"),
                isbn=cleaned.get("isbn"),
                total_copies=total_copies,
                available_copies=total_copies,
                shelf_no=cleaned.get("shelf_no"),
                remarks=cleaned.get("remarks"),
            )
        except ValidationError as exc:
            errors.append({"row": row_index, "error": exc.errors()[0]["msg"]})
            continue

        if validated.total_copies < 0:
            errors.append({"row": row_index, "error": "Copies cannot be negative"})
            continue

        seen.add(accession_no)
        to_create.append(validated)

    created_count = 0
    if not dry_run:
        for validated in to_create:
            db.add(LibraryBook(**validated.model_dump()))
        if to_create:
            db.commit()
        created_count = len(to_create)

    return {
        "total_rows": rows[-1][0] - 1 if rows else 0,
        "created": created_count if not dry_run else 0,
        "valid_rows": len(to_create),
        "errors": errors,
        "dry_run": dry_run,
        "unknown_columns": unknown_columns,
    }


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
