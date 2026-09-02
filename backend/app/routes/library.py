from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import ValidationError
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import library_reminders
from app.csv_import import csv_template_response, read_csv_upload
from app.database import get_db
from app.listing import apply_listing
from app.models import (
    LibraryBook,
    LibraryBookCopy,
    LibraryIssue,
    LibraryRenewal,
    LibraryReservation,
    LibrarySettings,
    Student,
    Teacher,
    User,
)
from app.schemas import (
    LibraryBookCopyCreate,
    LibraryBookCopyResponse,
    LibraryBookCopyUpdate,
    LibraryBookCreate,
    LibraryBookResponse,
    LibraryIssueCreate,
    LibraryIssueResponse,
    LibraryRenewalResponse,
    LibraryReservationCreate,
    LibraryReservationResponse,
    LibrarySettingsResponse,
    LibrarySettingsUpdate,
)
from app.security import require_roles

router = APIRouter(prefix="/library", tags=["Library"])

# Book/settings catalogue management stays Admin/Principal, matching the
# original module. Day-to-day desk work (issue, return, renew, reserve) also
# includes Teacher, since teachers commonly staff a school library.
MANAGERS = ["Admin", "Principal"]
DESK = ["Admin", "Principal", "Teacher"]

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

BORROWER_TYPES = ("Student", "Staff")
COPY_STATUSES = ("Available", "Issued", "Reserved", "Lost", "Damaged", "Retired")


def get_or_404(db: Session, model, record_id: int, label: str):
    record = db.query(model).filter(model.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return record


def student_name(student: Student):
    name = getattr(student, "student_name", None) or f"{student.first_name or ''} {student.last_name or ''}".strip()
    return name or f"Student ID: {student.id}"


def get_library_settings(db: Session) -> LibrarySettings:
    return library_reminders.get_settings(db)


# ---------------------------------------------------------------------------
# Reservation queue plumbing, shared by return/renew/reserve/issue
# ---------------------------------------------------------------------------


def _held_copy_for(db: Session, book_id: int) -> LibraryBookCopy | None:
    return (
        db.query(LibraryBookCopy)
        .filter(LibraryBookCopy.book_id == book_id, LibraryBookCopy.status == "Reserved")
        .first()
    )


def _next_waiting_reservation(db: Session, book_id: int) -> LibraryReservation | None:
    return (
        db.query(LibraryReservation)
        .filter(LibraryReservation.book_id == book_id, LibraryReservation.status == "Waiting")
        .order_by(LibraryReservation.queue_position, LibraryReservation.id)
        .first()
    )


def release_or_promote(db: Session, book: LibraryBook, settings: LibrarySettings,
                        held_copy: LibraryBookCopy | None):
    """A copy just became free (a return, a cancelled/expired hold). Either
    hand it straight to the next person waiting, or actually release it back
    to the shelf.

    In aggregate (no per-copy tracking) mode, "holding" a copy for a
    reservation means simply not incrementing available_copies -- so
    releasing it back means incrementing it now.
    """
    next_res = _next_waiting_reservation(db, book.id)
    if next_res:
        next_res.status = "Ready"
        next_res.ready_at = datetime.utcnow()
        next_res.expires_at = datetime.utcnow() + timedelta(days=settings.reservation_hold_days or 0)
        if held_copy:
            held_copy.status = "Reserved"
        return next_res

    if held_copy:
        held_copy.status = "Available"
    else:
        book.available_copies = (book.available_copies or 0) + 1
    return None


def sweep_expired_reservations(db: Session):
    """Ready holds nobody collected in time move on to the next in line."""
    now = datetime.utcnow()
    expired = (
        db.query(LibraryReservation)
        .filter(
            LibraryReservation.status == "Ready",
            LibraryReservation.expires_at.isnot(None),
            LibraryReservation.expires_at < now,
        )
        .all()
    )
    if not expired:
        return
    settings = get_library_settings(db)
    for reservation in expired:
        reservation.status = "Expired"
        book = db.query(LibraryBook).filter(LibraryBook.id == reservation.book_id).first()
        if not book:
            continue
        held_copy = _held_copy_for(db, reservation.book_id)
        release_or_promote(db, book, settings, held_copy)
    db.commit()


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------


def serialize_issue(issue: LibraryIssue, db: Session):
    book = db.query(LibraryBook).filter(LibraryBook.id == issue.book_id).first()
    student = db.query(Student).filter(Student.id == issue.student_id).first() if issue.student_id else None
    staff = db.query(Teacher).filter(Teacher.id == issue.staff_id).first() if issue.staff_id else None
    copy = db.query(LibraryBookCopy).filter(LibraryBookCopy.id == issue.copy_id).first() if issue.copy_id else None

    days_overdue = None
    if issue.status == "Issued" and issue.due_date:
        days_overdue = max((date.today() - issue.due_date).days, 0)

    return {
        "id": issue.id,
        "book_id": issue.book_id,
        "borrower_type": issue.borrower_type,
        "student_id": issue.student_id,
        "staff_id": issue.staff_id,
        "copy_id": issue.copy_id,
        "issue_date": issue.issue_date,
        "due_date": issue.due_date,
        "return_date": issue.return_date,
        "status": issue.status,
        "fine_amount": issue.fine_amount,
        "fine_paid": issue.fine_paid,
        "renewal_count": issue.renewal_count,
        "reservation_id": issue.reservation_id,
        "remarks": issue.remarks,
        "book_title": book.title if book else "-",
        "accession_no": book.accession_no if book else None,
        "student_name": student_name(student) if student else None,
        "admission_no": student.admission_no if student else None,
        "class_name": student.class_name if student else None,
        "section": student.section if student else None,
        "staff_name": staff.name if staff else None,
        "employee_no": staff.employee_no if staff else None,
        "copy_barcode": copy.barcode if copy else None,
        "days_overdue": days_overdue,
    }


def serialize_reservation(reservation: LibraryReservation, db: Session):
    book = db.query(LibraryBook).filter(LibraryBook.id == reservation.book_id).first()
    student = (
        db.query(Student).filter(Student.id == reservation.student_id).first()
        if reservation.student_id else None
    )
    staff = (
        db.query(Teacher).filter(Teacher.id == reservation.staff_id).first()
        if reservation.staff_id else None
    )
    return {
        "id": reservation.id,
        "book_id": reservation.book_id,
        "borrower_type": reservation.borrower_type,
        "student_id": reservation.student_id,
        "staff_id": reservation.staff_id,
        "status": reservation.status,
        "queue_position": reservation.queue_position,
        "reserved_at": reservation.reserved_at,
        "ready_at": reservation.ready_at,
        "expires_at": reservation.expires_at,
        "remarks": reservation.remarks,
        "book_title": book.title if book else "-",
        "accession_no": book.accession_no if book else None,
        "student_name": student_name(student) if student else None,
        "admission_no": student.admission_no if student else None,
        "staff_name": staff.name if staff else None,
    }


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------


@router.get("/settings", response_model=LibrarySettingsResponse)
def get_settings_endpoint(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(DESK)),
):
    return get_library_settings(db)


@router.put("/settings", response_model=LibrarySettingsResponse)
def update_settings_endpoint(
    payload: LibrarySettingsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    settings = get_library_settings(db)
    numeric_fields = (
        "loan_period_days", "loan_period_days_staff", "fine_per_day", "fine_grace_days",
        "max_books_student", "max_books_staff", "max_renewals", "reservation_hold_days",
    )
    for key, value in payload.model_dump(exclude_unset=True).items():
        if key in numeric_fields and value is not None and value < 0:
            raise HTTPException(status_code=400, detail=f"{key} cannot be negative")
        setattr(settings, key, value)
    db.commit()
    db.refresh(settings)
    return settings


# ---------------------------------------------------------------------------
# Books
# ---------------------------------------------------------------------------


@router.get("/books/", response_model=list[LibraryBookResponse])
def get_books(
    search: str | None = None,
    sort: str | None = None,
    order: str = "asc",
    limit: int | None = None,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(DESK)),
):
    return apply_listing(
        db.query(LibraryBook), LibraryBook,
        search=search, search_fields=("title", "accession_no", "author", "category"),
        sort=sort, order=order, limit=limit, offset=offset,
        default_order=[LibraryBook.title.asc()],
    ).all()


@router.post("/books/", response_model=LibraryBookResponse)
def create_book(
    payload: LibraryBookCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
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
    current_user: User = Depends(require_roles(MANAGERS)),
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
    current_user: User = Depends(require_roles(MANAGERS)),
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
    current_user: User = Depends(require_roles(MANAGERS)),
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


# ---------------------------------------------------------------------------
# Per-copy / barcode tracking (optional, additive on top of total_copies)
# ---------------------------------------------------------------------------


@router.get("/books/{book_id}/copies", response_model=list[LibraryBookCopyResponse])
def get_book_copies(
    book_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(DESK)),
):
    get_or_404(db, LibraryBook, book_id, "Book")
    return (
        db.query(LibraryBookCopy)
        .filter(LibraryBookCopy.book_id == book_id)
        .order_by(LibraryBookCopy.copy_no.asc())
        .all()
    )


def _next_copy_no(db: Session, book_id: int) -> int:
    return (
        db.query(func.coalesce(func.max(LibraryBookCopy.copy_no), 0))
        .filter(LibraryBookCopy.book_id == book_id)
        .scalar()
    ) + 1


@router.post("/books/{book_id}/copies", response_model=LibraryBookCopyResponse)
def add_book_copy(
    book_id: int,
    payload: LibraryBookCopyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    book = get_or_404(db, LibraryBook, book_id, "Book")
    copy_no = _next_copy_no(db, book_id)
    barcode = (payload.barcode or "").strip() or f"{book.accession_no}-{copy_no:02d}"
    copy = LibraryBookCopy(
        book_id=book_id, copy_no=copy_no, barcode=barcode,
        shelf_no=payload.shelf_no or book.shelf_no, remarks=payload.remarks,
    )
    db.add(copy)
    book.total_copies = (book.total_copies or 0) + 1
    book.available_copies = (book.available_copies or 0) + 1
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Barcode already exists: {barcode}")
    db.refresh(copy)
    return copy


@router.post("/books/{book_id}/copies/generate")
def generate_book_copies(
    book_id: int,
    count: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """Backfill barcoded copies for a book that has only ever been tracked by
    aggregate count -- one row per copy, auto-numbered off the accession
    number, up to `count` new copies."""
    if count <= 0:
        raise HTTPException(status_code=400, detail="count must be positive")
    book = get_or_404(db, LibraryBook, book_id, "Book")
    created = []
    next_no = _next_copy_no(db, book_id)
    for i in range(count):
        copy_no = next_no + i
        copy = LibraryBookCopy(
            book_id=book_id, copy_no=copy_no,
            barcode=f"{book.accession_no}-{copy_no:02d}", shelf_no=book.shelf_no,
        )
        db.add(copy)
        created.append(copy)
    book.total_copies = (book.total_copies or 0) + count
    book.available_copies = (book.available_copies or 0) + count
    db.commit()
    return {"created": len(created), "copies": [c.barcode for c in created]}


@router.put("/copies/{copy_id}", response_model=LibraryBookCopyResponse)
def update_book_copy(
    copy_id: int,
    payload: LibraryBookCopyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    copy = get_or_404(db, LibraryBookCopy, copy_id, "Book copy")
    data = payload.model_dump(exclude_unset=True)
    if "status" in data and data["status"] not in COPY_STATUSES:
        raise HTTPException(status_code=400, detail=f"Status must be one of: {', '.join(COPY_STATUSES)}")
    for key, value in data.items():
        setattr(copy, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Barcode already exists")
    db.refresh(copy)
    return copy


@router.delete("/copies/{copy_id}")
def delete_book_copy(
    copy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    copy = get_or_404(db, LibraryBookCopy, copy_id, "Book copy")
    if copy.status == "Issued":
        raise HTTPException(status_code=400, detail="Cannot delete a copy that is currently issued")
    book = db.query(LibraryBook).filter(LibraryBook.id == copy.book_id).first()
    if book:
        book.total_copies = max((book.total_copies or 0) - 1, 0)
        if copy.status == "Available":
            book.available_copies = max((book.available_copies or 0) - 1, 0)
    db.delete(copy)
    db.commit()
    return {"message": "Book copy deleted successfully"}


# ---------------------------------------------------------------------------
# Issues (issue / renew / return)
# ---------------------------------------------------------------------------


@router.get("/issues/", response_model=list[LibraryIssueResponse])
def get_issues(
    status: str | None = None,
    student_id: int | None = None,
    staff_id: int | None = None,
    search: str | None = None,
    sort: str | None = None,
    order: str = "asc",
    limit: int | None = None,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(DESK)),
):
    query = db.query(LibraryIssue)
    if status:
        query = query.filter(LibraryIssue.status == status)
    if student_id:
        query = query.filter(LibraryIssue.student_id == student_id)
    if staff_id:
        query = query.filter(LibraryIssue.staff_id == staff_id)
    issues = apply_listing(
        query, LibraryIssue,
        search=search, search_fields=("status",),
        sort=sort, order=order, limit=limit, offset=offset,
        default_order=[LibraryIssue.id.desc()],
    ).all()
    return [serialize_issue(issue, db) for issue in issues]


def _validate_borrower(db: Session, borrower_type: str, student_id: int | None, staff_id: int | None):
    if borrower_type not in BORROWER_TYPES:
        raise HTTPException(status_code=400, detail=f"borrower_type must be one of: {', '.join(BORROWER_TYPES)}")
    if borrower_type == "Student":
        if not student_id:
            raise HTTPException(status_code=400, detail="student_id is required for a student issue")
        get_or_404(db, Student, student_id, "Student")
    else:
        if not staff_id:
            raise HTTPException(status_code=400, detail="staff_id is required for a staff issue")
        get_or_404(db, Teacher, staff_id, "Staff member")


@router.post("/issues/", response_model=LibraryIssueResponse)
def create_issue(
    payload: LibraryIssueCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(DESK)),
):
    book = get_or_404(db, LibraryBook, payload.book_id, "Book")
    borrower_type = payload.borrower_type or "Student"
    _validate_borrower(db, borrower_type, payload.student_id, payload.staff_id)
    settings = get_library_settings(db)

    data = payload.model_dump()
    data["borrower_type"] = borrower_type
    data["student_id"] = payload.student_id if borrower_type == "Student" else None
    data["staff_id"] = payload.staff_id if borrower_type == "Staff" else None

    if not data.get("due_date"):
        loan_days = settings.loan_period_days if borrower_type == "Student" else settings.loan_period_days_staff
        data["due_date"] = payload.issue_date + timedelta(days=loan_days)

    reservation = None
    copy = None
    if payload.copy_id:
        copy = get_or_404(db, LibraryBookCopy, payload.copy_id, "Book copy")
        if copy.book_id != book.id:
            raise HTTPException(status_code=400, detail="That copy does not belong to this book")

    if payload.status == "Issued":
        max_books = settings.max_books_student if borrower_type == "Student" else settings.max_books_staff
        borrower_column = LibraryIssue.student_id if borrower_type == "Student" else LibraryIssue.staff_id
        borrower_id = data["student_id"] if borrower_type == "Student" else data["staff_id"]
        current_count = (
            db.query(LibraryIssue)
            .filter(LibraryIssue.status == "Issued", borrower_column == borrower_id)
            .count()
        )
        if current_count >= max_books:
            raise HTTPException(
                status_code=400,
                detail=f"Borrowing limit reached ({max_books} book(s) already issued).",
            )

        # If this borrower is next in line on a Ready hold for this book,
        # issuing to them fulfils it rather than pulling from general stock.
        reservation = (
            db.query(LibraryReservation)
            .filter(
                LibraryReservation.book_id == book.id,
                LibraryReservation.status == "Ready",
                LibraryReservation.student_id == data["student_id"],
                LibraryReservation.staff_id == data["staff_id"],
            )
            .first()
        )

        if reservation:
            reservation.status = "Fulfilled"
            held_copy = _held_copy_for(db, book.id)
            if held_copy:
                copy = copy or held_copy
        elif copy:
            if copy.status != "Available":
                raise HTTPException(status_code=400, detail=f"Copy {copy.barcode} is not available ({copy.status})")
        elif book.available_copies <= 0:
            raise HTTPException(status_code=400, detail="No available copies for this book")

        if copy:
            copy.status = "Issued"
        elif not reservation:
            book.available_copies = max((book.available_copies or 0) - 1, 0)

    data["copy_id"] = copy.id if copy else None
    data["reservation_id"] = reservation.id if reservation else None

    issue = LibraryIssue(**data)
    db.add(issue)
    db.commit()
    db.refresh(issue)
    return serialize_issue(issue, db)


@router.put("/issues/{issue_id}", response_model=LibraryIssueResponse)
def update_issue(
    issue_id: int,
    payload: LibraryIssueCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(DESK)),
):
    issue = get_or_404(db, LibraryIssue, issue_id, "Book issue")
    book = get_or_404(db, LibraryBook, payload.book_id, "Book")
    borrower_type = payload.borrower_type or issue.borrower_type or "Student"
    _validate_borrower(db, borrower_type, payload.student_id, payload.staff_id)
    settings = get_library_settings(db)

    copy = db.query(LibraryBookCopy).filter(LibraryBookCopy.id == issue.copy_id).first() if issue.copy_id else None
    was_issued = issue.status == "Issued"
    now_issued = payload.status == "Issued"

    if was_issued and not now_issued:
        # A return (or write-off as Lost/Damaged) frees the copy, unless
        # someone is waiting for it, in which case it goes straight to a
        # Ready hold instead of back onto the shelf.
        if payload.status == "Returned":
            release_or_promote(db, book, settings, copy)
        elif copy:
            copy.status = payload.status  # Lost / Damaged: the copy itself is gone
        # Lost/Damaged in aggregate mode: total_copies already reflects the
        # school's physical stock elsewhere, so available_copies is left
        # alone -- the book was never "available" while out.

        if payload.status == "Returned" and not payload.fine_amount:
            return_date = payload.return_date or date.today()
            payload = payload.model_copy(update={
                "fine_amount": library_reminders.current_fine(issue, settings, return_date),
            })
    elif not was_issued and now_issued:
        if book.available_copies <= 0 and not copy:
            raise HTTPException(status_code=400, detail="No available copies for this book")
        if copy:
            copy.status = "Issued"
        else:
            book.available_copies = max((book.available_copies or 0) - 1, 0)

    data = payload.model_dump()
    data["borrower_type"] = borrower_type
    data["student_id"] = payload.student_id if borrower_type == "Student" else None
    data["staff_id"] = payload.staff_id if borrower_type == "Staff" else None
    # copy_id/reservation_id are set by the issue/renew/return flows, not by
    # a raw edit of the record.
    data.pop("copy_id", None)

    for key, value in data.items():
        setattr(issue, key, value)

    db.commit()
    db.refresh(issue)
    return serialize_issue(issue, db)


@router.post("/issues/{issue_id}/renew", response_model=LibraryIssueResponse)
def renew_issue(
    issue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(DESK)),
):
    issue = get_or_404(db, LibraryIssue, issue_id, "Book issue")
    if issue.status != "Issued":
        raise HTTPException(status_code=400, detail="Only a currently issued book can be renewed")

    settings = get_library_settings(db)
    if issue.renewal_count >= settings.max_renewals:
        raise HTTPException(status_code=400, detail=f"Maximum renewals already used ({settings.max_renewals}).")

    if settings.block_renewal_if_reserved:
        queued = (
            db.query(LibraryReservation)
            .filter(
                LibraryReservation.book_id == issue.book_id,
                LibraryReservation.status.in_(["Waiting", "Ready"]),
            )
            .first()
        )
        if queued:
            raise HTTPException(
                status_code=400,
                detail="This book has another reader waiting and cannot be renewed.",
            )

    loan_days = settings.loan_period_days if issue.borrower_type == "Student" else settings.loan_period_days_staff
    base = issue.due_date if issue.due_date and issue.due_date >= date.today() else date.today()
    previous_due = issue.due_date
    new_due = base + timedelta(days=loan_days)

    issue.due_date = new_due
    issue.renewal_count = (issue.renewal_count or 0) + 1
    db.add(LibraryRenewal(issue_id=issue.id, previous_due_date=previous_due, new_due_date=new_due))
    db.commit()
    db.refresh(issue)
    return serialize_issue(issue, db)


@router.get("/issues/{issue_id}/renewals", response_model=list[LibraryRenewalResponse])
def get_issue_renewals(
    issue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(DESK)),
):
    get_or_404(db, LibraryIssue, issue_id, "Book issue")
    return (
        db.query(LibraryRenewal)
        .filter(LibraryRenewal.issue_id == issue_id)
        .order_by(LibraryRenewal.id.desc())
        .all()
    )


@router.delete("/issues/{issue_id}")
def delete_issue(
    issue_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    issue = get_or_404(db, LibraryIssue, issue_id, "Book issue")
    book = db.query(LibraryBook).filter(LibraryBook.id == issue.book_id).first()
    if book and issue.status == "Issued":
        settings = get_library_settings(db)
        copy = db.query(LibraryBookCopy).filter(LibraryBookCopy.id == issue.copy_id).first() if issue.copy_id else None
        release_or_promote(db, book, settings, copy)
    db.delete(issue)
    db.commit()
    return {"message": "Book issue deleted successfully"}


# ---------------------------------------------------------------------------
# Reservations
# ---------------------------------------------------------------------------


@router.get("/reservations/", response_model=list[LibraryReservationResponse])
def get_reservations(
    status: str | None = None,
    book_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(DESK)),
):
    sweep_expired_reservations(db)
    query = db.query(LibraryReservation)
    if status:
        query = query.filter(LibraryReservation.status == status)
    if book_id:
        query = query.filter(LibraryReservation.book_id == book_id)
    reservations = query.order_by(LibraryReservation.book_id, LibraryReservation.queue_position).all()
    return [serialize_reservation(r, db) for r in reservations]


@router.post("/reservations/", response_model=LibraryReservationResponse)
def create_reservation(
    payload: LibraryReservationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(DESK)),
):
    sweep_expired_reservations(db)
    book = get_or_404(db, LibraryBook, payload.book_id, "Book")
    borrower_type = payload.borrower_type or "Student"
    _validate_borrower(db, borrower_type, payload.student_id, payload.staff_id)
    student_id = payload.student_id if borrower_type == "Student" else None
    staff_id = payload.staff_id if borrower_type == "Staff" else None

    active_filter = [LibraryReservation.book_id == book.id, LibraryReservation.status.in_(["Waiting", "Ready"])]
    active_filter.append(
        LibraryReservation.student_id == student_id if borrower_type == "Student"
        else LibraryReservation.staff_id == staff_id
    )
    if db.query(LibraryReservation).filter(*active_filter).first():
        raise HTTPException(status_code=400, detail="This book is already reserved for that borrower")

    max_position = (
        db.query(func.coalesce(func.max(LibraryReservation.queue_position), 0))
        .filter(LibraryReservation.book_id == book.id, LibraryReservation.status.in_(["Waiting", "Ready"]))
        .scalar()
    )
    reservation = LibraryReservation(
        book_id=book.id, borrower_type=borrower_type, student_id=student_id, staff_id=staff_id,
        remarks=payload.remarks, queue_position=max_position + 1, status="Waiting",
    )
    db.add(reservation)
    db.commit()
    db.refresh(reservation)
    return serialize_reservation(reservation, db)


@router.post("/reservations/{reservation_id}/cancel", response_model=LibraryReservationResponse)
def cancel_reservation(
    reservation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(DESK)),
):
    reservation = get_or_404(db, LibraryReservation, reservation_id, "Reservation")
    if reservation.status in ("Fulfilled", "Cancelled", "Expired"):
        raise HTTPException(status_code=400, detail=f"Reservation is already {reservation.status}")

    was_ready = reservation.status == "Ready"
    reservation.status = "Cancelled"

    if was_ready:
        settings = get_library_settings(db)
        book = db.query(LibraryBook).filter(LibraryBook.id == reservation.book_id).first()
        held_copy = _held_copy_for(db, reservation.book_id)
        if book:
            release_or_promote(db, book, settings, held_copy)

    db.commit()
    db.refresh(reservation)
    return serialize_reservation(reservation, db)


@router.delete("/reservations/{reservation_id}")
def delete_reservation(
    reservation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    reservation = get_or_404(db, LibraryReservation, reservation_id, "Reservation")
    if reservation.status == "Ready":
        settings = get_library_settings(db)
        book = db.query(LibraryBook).filter(LibraryBook.id == reservation.book_id).first()
        held_copy = _held_copy_for(db, reservation.book_id)
        if book:
            release_or_promote(db, book, settings, held_copy)
    db.delete(reservation)
    db.commit()
    return {"message": "Reservation deleted successfully"}


# ---------------------------------------------------------------------------
# Reports
# ---------------------------------------------------------------------------


@router.get("/reports/overdue")
def report_overdue(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(DESK)),
):
    settings = get_library_settings(db)
    today = date.today()
    issues = (
        db.query(LibraryIssue)
        .filter(LibraryIssue.status == "Issued", LibraryIssue.due_date < today)
        .order_by(LibraryIssue.due_date)
        .all()
    )
    rows = []
    for issue in issues:
        row = serialize_issue(issue, db)
        row["estimated_fine"] = library_reminders.current_fine(issue, settings, today)
        rows.append(row)
    return rows


@router.get("/reports/top-borrowers")
def report_top_borrowers(
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(DESK)),
):
    students = {s.id: s for s in db.query(Student).all()}
    staff = {t.id: t for t in db.query(Teacher).all()}

    counts: dict[tuple[str, int], dict] = {}
    for issue in db.query(LibraryIssue).all():
        borrower_id = issue.student_id if issue.borrower_type == "Student" else issue.staff_id
        if not borrower_id:
            continue
        key = (issue.borrower_type, borrower_id)
        entry = counts.setdefault(key, {"issues": 0, "fine_total": 0.0, "currently_issued": 0})
        entry["issues"] += 1
        entry["fine_total"] += issue.fine_amount or 0
        if issue.status == "Issued":
            entry["currently_issued"] += 1

    rows = []
    for (borrower_type, borrower_id), entry in counts.items():
        if borrower_type == "Student":
            person = students.get(borrower_id)
            name = student_name(person) if person else f"Student ID: {borrower_id}"
            group = f"{person.class_name or '-'} {person.section or ''}".strip() if person else None
        else:
            person = staff.get(borrower_id)
            name = person.name if person else f"Staff ID: {borrower_id}"
            group = person.department if person else None
        rows.append({
            "borrower_type": borrower_type, "borrower_id": borrower_id,
            "name": name, "group": group, **entry,
        })

    rows.sort(key=lambda r: r["issues"], reverse=True)
    return rows[:max(1, min(limit, 200))]


@router.get("/reports/most-issued")
def report_most_issued(
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(DESK)),
):
    rows = (
        db.query(LibraryBook, func.count(LibraryIssue.id))
        .outerjoin(LibraryIssue, LibraryIssue.book_id == LibraryBook.id)
        .group_by(LibraryBook.id)
        .order_by(func.count(LibraryIssue.id).desc())
        .limit(max(1, min(limit, 200)))
        .all()
    )
    return [
        {
            "book_id": book.id, "title": book.title, "accession_no": book.accession_no,
            "author": book.author, "category": book.category, "issue_count": count,
        }
        for book, count in rows
    ]


@router.get("/reports/fines-summary")
def report_fines_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(DESK)),
):
    total_charged = db.query(func.coalesce(func.sum(LibraryIssue.fine_amount), 0)).scalar() or 0
    total_paid = (
        db.query(func.coalesce(func.sum(LibraryIssue.fine_amount), 0))
        .filter(LibraryIssue.fine_paid == True)  # noqa: E712
        .scalar()
    ) or 0
    outstanding_count = (
        db.query(LibraryIssue)
        .filter(LibraryIssue.fine_amount > 0, LibraryIssue.fine_paid == False)  # noqa: E712
        .count()
    )
    return {
        "total_charged": round(total_charged, 2),
        "total_paid": round(total_paid, 2),
        "total_outstanding": round(total_charged - total_paid, 2),
        "unpaid_fine_count": outstanding_count,
    }
