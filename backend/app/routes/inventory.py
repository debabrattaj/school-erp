from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.csv_import import csv_template_response, read_csv_upload
from app.database import get_db
from app.models import InventoryItem, InventoryTransaction, Student, User
from app.schemas import (
    InventoryBulkIssueRequest,
    InventoryBulkIssueResponse,
    InventoryBulkIssueResult,
    InventoryItemCreate,
    InventoryItemResponse,
    InventoryTransactionCreate,
    InventoryTransactionResponse,
)
from app.security import require_roles

router = APIRouter(prefix="/inventory", tags=["Inventory"])

ITEM_BULK_IMPORT_COLUMNS = [
    "item_name",
    "item_code",
    "category",
    "unit",
    "quantity_available",
    "reorder_level",
    "unit_price",
    "location",
    "remarks",
]

OUT_TYPES = {"Stock Out", "Issue", "Purchase"}
IN_TYPES = {"Stock In", "Return"}


def get_or_404(db: Session, model, record_id: int, label: str):
    record = db.query(model).filter(model.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return record


def student_name(student: Student):
    name = getattr(student, "student_name", None) or f"{student.first_name or ''} {student.last_name or ''}".strip()
    return name or f"Student ID: {student.id}"


def apply_stock(item: InventoryItem, transaction_type: str, quantity: float, direction: int = 1):
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")

    if transaction_type in IN_TYPES:
        item.quantity_available += quantity * direction
    elif transaction_type in OUT_TYPES:
        next_quantity = item.quantity_available - (quantity * direction)
        if next_quantity < 0:
            raise HTTPException(status_code=400, detail="Not enough stock available")
        item.quantity_available = next_quantity
    elif transaction_type == "Adjustment":
        item.quantity_available += quantity * direction


def serialize_transaction(record: InventoryTransaction, db: Session):
    item = db.query(InventoryItem).filter(InventoryItem.id == record.item_id).first()
    student = None
    if record.issued_to_student_id:
        student = db.query(Student).filter(Student.id == record.issued_to_student_id).first()

    return {
        "id": record.id,
        "item_id": record.item_id,
        "transaction_date": record.transaction_date,
        "transaction_type": record.transaction_type,
        "quantity": record.quantity,
        "issued_to_student_id": record.issued_to_student_id,
        "issued_to_staff": record.issued_to_staff,
        "reference_no": record.reference_no,
        "unit_cost": record.unit_cost,
        "total_cost": record.total_cost,
        "remarks": record.remarks,
        "cycle": record.cycle,
        "academic_year": record.academic_year,
        "unit_price": record.unit_price,
        "amount": record.amount,
        "payment_status": record.payment_status,
        "item_name": item.item_name if item else "-",
        "item_code": item.item_code if item else None,
        "student_name": student_name(student) if student else None,
        "admission_no": student.admission_no if student else None,
        "class_name": student.class_name if student else None,
        "section": student.section if student else None,
    }


@router.get("/items/", response_model=list[InventoryItemResponse])
def get_items(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts", "Teacher"])),
):
    return db.query(InventoryItem).order_by(InventoryItem.item_name.asc()).all()


@router.post("/items/", response_model=InventoryItemResponse)
def create_item(
    payload: InventoryItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts"])),
):
    item = InventoryItem(**payload.model_dump())
    db.add(item)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Item code already exists")
    db.refresh(item)
    return item


@router.get("/items/bulk-import-template")
def bulk_import_items_template(
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts"])),
):
    return csv_template_response(
        ITEM_BULK_IMPORT_COLUMNS,
        {
            "item_name": "A4 Paper Ream",
            "item_code": "STA-001",
            "category": "Stationery",
            "unit": "pcs",
            "quantity_available": "50",
            "reorder_level": "10",
            "unit_price": "250",
            "location": "Store Room 1",
            "remarks": "",
        },
        "inventory_items_import_template.csv",
    )


@router.post("/items/bulk-import")
def bulk_import_items(
    file: UploadFile = File(...),
    dry_run: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts"])),
):
    rows, unknown_columns = read_csv_upload(file, ITEM_BULK_IMPORT_COLUMNS)

    seen_codes = set()
    errors = []
    to_create = []

    for row_index, cleaned in rows:
        item_name = cleaned.get("item_name")
        if not item_name:
            errors.append({"row": row_index, "error": "item_name is required"})
            continue

        item_code = cleaned.get("item_code")
        if item_code:
            if item_code in seen_codes:
                errors.append({"row": row_index, "error": f"Duplicate item_code in file: {item_code}"})
                continue
            if db.query(InventoryItem).filter(InventoryItem.item_code == item_code).first():
                errors.append({"row": row_index, "error": f"Item code already exists: {item_code}"})
                continue

        try:
            validated = InventoryItemCreate(
                item_name=item_name,
                item_code=item_code,
                category=cleaned.get("category"),
                unit=cleaned.get("unit") or "pcs",
                quantity_available=float(cleaned["quantity_available"]) if cleaned.get("quantity_available") else 0,
                reorder_level=float(cleaned["reorder_level"]) if cleaned.get("reorder_level") else 0,
                unit_price=float(cleaned["unit_price"]) if cleaned.get("unit_price") else 0,
                location=cleaned.get("location"),
                remarks=cleaned.get("remarks"),
            )
        except (ValidationError, ValueError) as exc:
            message = exc.errors()[0]["msg"] if isinstance(exc, ValidationError) else "quantity_available, reorder_level and unit_price must be numbers"
            errors.append({"row": row_index, "error": message})
            continue

        if item_code:
            seen_codes.add(item_code)
        to_create.append(validated)

    created_count = 0
    if not dry_run:
        for validated in to_create:
            db.add(InventoryItem(**validated.model_dump()))
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


@router.put("/items/{item_id}", response_model=InventoryItemResponse)
def update_item(
    item_id: int,
    payload: InventoryItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts"])),
):
    item = get_or_404(db, InventoryItem, item_id, "Inventory item")
    for key, value in payload.model_dump().items():
        setattr(item, key, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="Item code already exists")
    db.refresh(item)
    return item


@router.delete("/items/{item_id}")
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    item = get_or_404(db, InventoryItem, item_id, "Inventory item")
    db.delete(item)
    db.commit()
    return {"message": "Inventory item deleted successfully"}


@router.get("/transactions/", response_model=list[InventoryTransactionResponse])
def get_transactions(
    item_id: int | None = None,
    transaction_type: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts", "Teacher"])),
):
    query = db.query(InventoryTransaction)
    if item_id:
        query = query.filter(InventoryTransaction.item_id == item_id)
    if transaction_type:
        query = query.filter(InventoryTransaction.transaction_type == transaction_type)
    records = query.order_by(InventoryTransaction.id.desc()).all()
    return [serialize_transaction(record, db) for record in records]


@router.post("/transactions/", response_model=InventoryTransactionResponse)
def create_transaction(
    payload: InventoryTransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts", "Teacher"])),
):
    item = get_or_404(db, InventoryItem, payload.item_id, "Inventory item")
    if payload.issued_to_student_id:
        get_or_404(db, Student, payload.issued_to_student_id, "Student")

    apply_stock(item, payload.transaction_type, payload.quantity)

    data = payload.model_dump()
    unit_cost = data.get("unit_cost")
    if unit_cost is None and payload.transaction_type in IN_TYPES:
        unit_cost = item.unit_price or 0
    data["unit_cost"] = unit_cost
    data["total_cost"] = (unit_cost or 0) * payload.quantity if unit_cost else None

    if payload.transaction_type == "Purchase" and payload.unit_price:
        data["amount"] = payload.unit_price * payload.quantity

    record = InventoryTransaction(**data)
    db.add(record)
    db.commit()
    db.refresh(record)
    return serialize_transaction(record, db)


@router.post("/bulk-issue", response_model=InventoryBulkIssueResponse)
def bulk_issue(
    payload: InventoryBulkIssueRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts"])),
):
    if not payload.student_ids:
        raise HTTPException(status_code=400, detail="Select at least one student")
    if not payload.items:
        raise HTTPException(status_code=400, detail="Select at least one item to issue")

    student_ids = list(dict.fromkeys(payload.student_ids))
    students = db.query(Student).filter(Student.id.in_(student_ids)).all()
    found_ids = {s.id for s in students}
    missing = [sid for sid in student_ids if sid not in found_ids]
    if missing:
        raise HTTPException(status_code=404, detail=f"Student(s) not found: {missing}")

    results = []
    total_issued = 0

    for entry in payload.items:
        item = get_or_404(db, InventoryItem, entry.item_id, "Inventory item")

        already_issued_ids = {
            row[0]
            for row in db.query(InventoryTransaction.issued_to_student_id)
            .filter(
                InventoryTransaction.item_id == entry.item_id,
                InventoryTransaction.transaction_type == "Issue",
                InventoryTransaction.cycle == payload.cycle,
                InventoryTransaction.academic_year == payload.academic_year,
                InventoryTransaction.issued_to_student_id.in_(student_ids),
            )
            .all()
        }

        pending_ids = [sid for sid in student_ids if sid not in already_issued_ids]
        skipped_duplicate_count = len(student_ids) - len(pending_ids)

        required_quantity = entry.quantity_per_student * len(pending_ids)
        if pending_ids and item.quantity_available < required_quantity:
            results.append(
                InventoryBulkIssueResult(
                    item_id=item.id,
                    item_name=item.item_name,
                    issued_count=0,
                    skipped_duplicate_count=skipped_duplicate_count,
                    skipped_insufficient_stock=True,
                )
            )
            continue

        for student_id in pending_ids:
            apply_stock(item, "Issue", entry.quantity_per_student)
            record = InventoryTransaction(
                item_id=entry.item_id,
                transaction_date=payload.transaction_date,
                transaction_type="Issue",
                quantity=entry.quantity_per_student,
                issued_to_student_id=student_id,
                reference_no=payload.reference_no,
                remarks=payload.remarks,
                cycle=payload.cycle,
                academic_year=payload.academic_year,
            )
            db.add(record)

        total_issued += len(pending_ids)
        results.append(
            InventoryBulkIssueResult(
                item_id=item.id,
                item_name=item.item_name,
                issued_count=len(pending_ids),
                skipped_duplicate_count=skipped_duplicate_count,
                skipped_insufficient_stock=False,
            )
        )

    db.commit()
    return InventoryBulkIssueResponse(results=results, total_issued=total_issued)


@router.delete("/transactions/{transaction_id}")
def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    record = get_or_404(db, InventoryTransaction, transaction_id, "Inventory transaction")
    item = db.query(InventoryItem).filter(InventoryItem.id == record.item_id).first()
    if item:
        apply_stock(item, record.transaction_type, record.quantity, direction=-1)
    db.delete(record)
    db.commit()
    return {"message": "Inventory transaction deleted successfully"}
