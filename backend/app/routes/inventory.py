from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import InventoryItem, InventoryTransaction, Student, User
from app.schemas import (
    InventoryItemCreate,
    InventoryItemResponse,
    InventoryTransactionCreate,
    InventoryTransactionResponse,
)
from app.security import require_roles

router = APIRouter(prefix="/inventory", tags=["Inventory"])

OUT_TYPES = {"Stock Out", "Issue"}
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
        "remarks": record.remarks,
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
    record = InventoryTransaction(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return serialize_transaction(record, db)


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
