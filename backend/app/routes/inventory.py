from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import ValidationError
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import inventory_kits
from app.csv_import import csv_export_response, csv_template_response, read_csv_upload
from app.database import get_db
from app.models import InventoryItem, InventoryKit, InventoryKitItem, InventoryTransaction, Student, Teacher, User
from app.schemas import (
    InventoryBulkIssueRequest,
    InventoryBulkIssueResponse,
    InventoryBulkIssueResult,
    InventoryItemCreate,
    InventoryItemResponse,
    InventoryKitCreate,
    InventoryKitItemCreate,
    InventoryKitItemResponse,
    InventoryKitResponse,
    InventoryKitUpdate,
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

def get_or_404(db: Session, model, record_id: int, label: str):
    record = db.query(model).filter(model.id == record_id).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return record


def student_name(student: Student):
    name = getattr(student, "student_name", None) or f"{student.first_name or ''} {student.last_name or ''}".strip()
    return name or f"Student ID: {student.id}"


def apply_stock(item: InventoryItem, transaction_type: str, quantity: float, direction: int = 1):
    """Route-facing wrapper: same math as inventory_kits.apply_stock, raising
    HTTPException instead of InventoryError since every caller here is a
    route handler."""
    try:
        inventory_kits.apply_stock(item, transaction_type, quantity, direction)
    except inventory_kits.InventoryError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


def serialize_transaction(record: InventoryTransaction, db: Session):
    item = db.query(InventoryItem).filter(InventoryItem.id == record.item_id).first()
    student = None
    if record.issued_to_student_id:
        student = db.query(Student).filter(Student.id == record.issued_to_student_id).first()
    teacher = None
    if record.issued_to_teacher_id:
        teacher = db.query(Teacher).filter(Teacher.id == record.issued_to_teacher_id).first()

    return {
        "id": record.id,
        "item_id": record.item_id,
        "transaction_date": record.transaction_date,
        "transaction_type": record.transaction_type,
        "quantity": record.quantity,
        "issued_to_student_id": record.issued_to_student_id,
        "issued_to_staff": record.issued_to_staff,
        "issued_to_teacher_id": record.issued_to_teacher_id,
        "kit_id": record.kit_id,
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
        "teacher_name": teacher.name if teacher else None,
    }


@router.get("/items/", response_model=list[InventoryItemResponse])
def get_items(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts", "Teacher"])),
):
    return db.query(InventoryItem).order_by(InventoryItem.item_name.asc()).all()


@router.get("/items/by-barcode/{barcode}", response_model=InventoryItemResponse)
def get_item_by_barcode(
    barcode: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts", "Teacher"])),
):
    item = db.query(InventoryItem).filter(InventoryItem.barcode == barcode).first()
    if not item:
        raise HTTPException(status_code=404, detail=f"No item with barcode '{barcode}'")
    return item


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
        raise HTTPException(status_code=400, detail="Item code or barcode already exists")
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
        raise HTTPException(status_code=400, detail="Item code or barcode already exists")
    db.refresh(item)
    return item


@router.delete("/items/{item_id}")
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    item = get_or_404(db, InventoryItem, item_id, "Inventory item")

    # item_id cascades on InventoryTransaction, so deleting an item used to
    # silently take its whole history with it -- including the record of who
    # paid for a lost-item replacement. Refuse instead, matching how a
    # concession scheme or leave type that has been used cannot be deleted.
    if db.query(InventoryTransaction).filter(InventoryTransaction.item_id == item_id).first():
        raise HTTPException(
            status_code=400,
            detail="This item has transaction history and cannot be deleted. Mark it Inactive instead.",
        )
    if db.query(InventoryKitItem).filter(InventoryKitItem.item_id == item_id).first():
        raise HTTPException(
            status_code=400,
            detail="This item is part of a kit. Remove it from the kit first.",
        )

    db.delete(item)
    db.commit()
    return {"message": "Inventory item deleted successfully"}


def serialize_kit(kit: InventoryKit, db: Session) -> dict:
    rows = (
        db.query(InventoryKitItem, InventoryItem)
        .join(InventoryItem, InventoryItem.id == InventoryKitItem.item_id)
        .filter(InventoryKitItem.kit_id == kit.id)
        .order_by(InventoryKitItem.id)
        .all()
    )
    return {
        "id": kit.id, "name": kit.name, "applies_to": kit.applies_to,
        "is_active": kit.is_active, "remarks": kit.remarks,
        "items": [
            {
                "id": kit_item.id, "item_id": item.id, "item_name": item.item_name,
                "unit": item.unit, "quantity": kit_item.quantity,
            }
            for kit_item, item in rows
        ],
    }


# ---------------- Kits ----------------


@router.get("/kits", response_model=list[InventoryKitResponse])
@router.get("/kits/", response_model=list[InventoryKitResponse], include_in_schema=False)
def list_kits(
    applies_to: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts", "Teacher"])),
):
    query = db.query(InventoryKit)
    if applies_to:
        query = query.filter(InventoryKit.applies_to == applies_to)
    kits = query.order_by(InventoryKit.name).all()
    return [serialize_kit(k, db) for k in kits]


@router.post("/kits", response_model=InventoryKitResponse)
@router.post("/kits/", response_model=InventoryKitResponse, include_in_schema=False)
def create_kit(
    payload: InventoryKitCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts"])),
):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Kit name is required.")
    if payload.applies_to not in inventory_kits.APPLIES_TO:
        raise HTTPException(
            status_code=400,
            detail=f"applies_to must be one of: {', '.join(inventory_kits.APPLIES_TO)}.",
        )

    kit = InventoryKit(
        name=payload.name.strip(), applies_to=payload.applies_to,
        is_active=payload.is_active, remarks=payload.remarks,
    )
    db.add(kit)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="A kit with this name already exists.")
    db.refresh(kit)
    return serialize_kit(kit, db)


@router.put("/kits/{kit_id}", response_model=InventoryKitResponse)
def update_kit(
    kit_id: int,
    payload: InventoryKitUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts"])),
):
    kit = get_or_404(db, InventoryKit, kit_id, "Inventory kit")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(kit, key, value)
    db.commit()
    db.refresh(kit)
    return serialize_kit(kit, db)


@router.delete("/kits/{kit_id}")
def delete_kit(
    kit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    kit = get_or_404(db, InventoryKit, kit_id, "Inventory kit")
    if db.query(InventoryTransaction).filter(InventoryTransaction.kit_id == kit_id).first():
        raise HTTPException(
            status_code=400,
            detail="This kit has already been issued and cannot be deleted. Mark it Inactive instead.",
        )
    db.delete(kit)
    db.commit()
    return {"message": "Kit deleted successfully"}


@router.post("/kits/{kit_id}/items", response_model=InventoryKitResponse)
def add_kit_item(
    kit_id: int,
    payload: InventoryKitItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts"])),
):
    kit = get_or_404(db, InventoryKit, kit_id, "Inventory kit")
    get_or_404(db, InventoryItem, payload.item_id, "Inventory item")
    if payload.quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero.")

    db.add(InventoryKitItem(kit_id=kit.id, item_id=payload.item_id, quantity=payload.quantity))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="This item is already in the kit.")
    return serialize_kit(kit, db)


@router.delete("/kits/{kit_id}/items/{item_id}", response_model=InventoryKitResponse)
def remove_kit_item(
    kit_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts"])),
):
    kit = get_or_404(db, InventoryKit, kit_id, "Inventory kit")
    row = (
        db.query(InventoryKitItem)
        .filter(InventoryKitItem.kit_id == kit_id, InventoryKitItem.item_id == item_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="That item is not in this kit.")
    db.delete(row)
    db.commit()
    return serialize_kit(kit, db)


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
    if payload.issued_to_teacher_id:
        get_or_404(db, Teacher, payload.issued_to_teacher_id, "Teacher")

    try:
        inventory_kits.validate_purchase_is_student_only(
            payload.transaction_type, payload.issued_to_student_id,
            payload.issued_to_teacher_id, payload.issued_to_staff,
        )
    except inventory_kits.InventoryError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    apply_stock(item, payload.transaction_type, payload.quantity)

    data = payload.model_dump()
    unit_cost = data.get("unit_cost")
    if unit_cost is None and payload.transaction_type in inventory_kits.IN_TYPES:
        unit_cost = item.unit_price or 0
    data["unit_cost"] = unit_cost
    data["total_cost"] = (unit_cost or 0) * payload.quantity if unit_cost else None

    if payload.transaction_type == "Purchase":
        # Same fallback reasoning as unit_cost above: an unpriced purchase
        # must still be billed at the item's own selling price, not silently
        # recorded as free.
        unit_price = payload.unit_price if payload.unit_price is not None else (item.unit_price or 0)
        data["unit_price"] = unit_price
        data["amount"] = unit_price * payload.quantity

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
    """Issue a saved kit, or an ad-hoc list of items, to students and/or staff.

    A bulk run is entitlement only -- it always records "Issue", never a
    purchase. A student buying a lost-item replacement is recorded
    individually through POST /transactions/, where it can be tied to one
    payment.
    """
    student_ids = list(dict.fromkeys(payload.student_ids or []))
    teacher_ids = list(dict.fromkeys(payload.teacher_ids or []))
    if not student_ids and not teacher_ids:
        raise HTTPException(status_code=400, detail="Select at least one student or staff member.")

    if student_ids:
        found = {s.id for s in db.query(Student.id).filter(Student.id.in_(student_ids)).all()}
        missing = [sid for sid in student_ids if sid not in found]
        if missing:
            raise HTTPException(status_code=404, detail=f"Student(s) not found: {missing}")
    if teacher_ids:
        found = {t.id for t in db.query(Teacher.id).filter(Teacher.id.in_(teacher_ids)).all()}
        missing = [tid for tid in teacher_ids if tid not in found]
        if missing:
            raise HTTPException(status_code=404, detail=f"Staff member(s) not found: {missing}")

    kit = None
    if payload.kit_id:
        kit = get_or_404(db, InventoryKit, payload.kit_id, "Inventory kit")
        if not kit.is_active:
            raise HTTPException(status_code=400, detail=f"'{kit.name}' is inactive.")
    elif not payload.items:
        raise HTTPException(status_code=400, detail="Select a kit or at least one item to issue.")

    ad_hoc = [(entry.item_id, entry.quantity_per_student) for entry in (payload.items or [])]

    try:
        rows = inventory_kits.bulk_issue_kit(
            db, kit=kit, ad_hoc_items=ad_hoc,
            student_ids=student_ids, teacher_ids=teacher_ids,
            transaction_date=payload.transaction_date, cycle=payload.cycle,
            academic_year=payload.academic_year,
            reference_no=payload.reference_no, remarks=payload.remarks,
        )
    except inventory_kits.InventoryError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))

    db.commit()
    results = [InventoryBulkIssueResult(**row) for row in rows]
    total_issued = sum(r.issued_count for r in results)
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


# ---------------- CSV export ----------------

ITEM_EXPORT_COLUMNS = [
    "item_name", "item_code", "barcode", "category", "unit", "quantity_available",
    "reorder_level", "unit_price", "location", "status", "remarks",
]

TRANSACTION_EXPORT_COLUMNS = [
    "transaction_date", "item_code", "item_name", "transaction_type", "quantity",
    "student_name", "admission_no", "teacher_name", "issued_to_staff",
    "cycle", "academic_year", "unit_cost", "total_cost", "unit_price", "amount",
    "payment_status", "reference_no", "remarks",
]


@router.get("/items/export")
def export_items(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts"])),
):
    items = db.query(InventoryItem).order_by(InventoryItem.item_name.asc()).all()
    rows = [
        {
            "item_name": i.item_name, "item_code": i.item_code, "barcode": i.barcode,
            "category": i.category, "unit": i.unit, "quantity_available": i.quantity_available,
            "reorder_level": i.reorder_level, "unit_price": i.unit_price,
            "location": i.location, "status": i.status, "remarks": i.remarks,
        }
        for i in items
    ]
    return csv_export_response(ITEM_EXPORT_COLUMNS, rows, "inventory_items_export.csv")


@router.get("/transactions/export")
def export_transactions(
    item_id: int | None = None,
    transaction_type: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts"])),
):
    query = db.query(InventoryTransaction)
    if item_id:
        query = query.filter(InventoryTransaction.item_id == item_id)
    if transaction_type:
        query = query.filter(InventoryTransaction.transaction_type == transaction_type)
    records = query.order_by(InventoryTransaction.id.desc()).all()
    rows = [serialize_transaction(record, db) for record in records]
    return csv_export_response(TRANSACTION_EXPORT_COLUMNS, rows, "inventory_transactions_export.csv")


# ---------------- Reports ----------------


@router.get("/reports/low-stock")
def report_low_stock(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts", "Teacher"])),
):
    items = (
        db.query(InventoryItem)
        .filter(InventoryItem.quantity_available <= InventoryItem.reorder_level, InventoryItem.status == "Active")
        .order_by(InventoryItem.item_name)
        .all()
    )
    return [
        {
            "id": i.id, "item_name": i.item_name, "item_code": i.item_code, "category": i.category,
            "quantity_available": i.quantity_available, "reorder_level": i.reorder_level,
            "shortfall": max((i.reorder_level or 0) - (i.quantity_available or 0), 0),
            "location": i.location,
        }
        for i in items
    ]


@router.get("/reports/cost-summary")
def report_cost_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts", "Teacher"])),
):
    purchase_revenue = db.query(func.coalesce(func.sum(InventoryTransaction.amount), 0)).filter(
        InventoryTransaction.transaction_type == "Purchase"
    ).scalar() or 0
    purchase_unpaid = db.query(func.coalesce(func.sum(InventoryTransaction.amount), 0)).filter(
        InventoryTransaction.transaction_type == "Purchase", InventoryTransaction.payment_status == "Unpaid"
    ).scalar() or 0
    stock_in_cost = db.query(func.coalesce(func.sum(InventoryTransaction.total_cost), 0)).filter(
        InventoryTransaction.transaction_type == "Stock In"
    ).scalar() or 0
    issued_value = db.query(func.coalesce(func.sum(InventoryTransaction.total_cost), 0)).filter(
        InventoryTransaction.transaction_type == "Issue"
    ).scalar() or 0
    current_stock_value = db.query(
        func.coalesce(func.sum(InventoryItem.quantity_available * func.coalesce(InventoryItem.unit_price, 0)), 0)
    ).scalar() or 0

    return {
        "purchase_revenue": round(purchase_revenue, 2),
        "purchase_unpaid": round(purchase_unpaid, 2),
        "stock_in_cost": round(stock_in_cost, 2),
        "issued_value": round(issued_value, 2),
        "current_stock_value": round(current_stock_value, 2),
    }


@router.get("/reports/kit-coverage")
def report_kit_coverage(
    cycle: str | None = None,
    academic_year: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts", "Teacher"])),
):
    """Per active kit: how many distinct recipients have been issued at
    least one of its items (in the given cycle/year, if filtered) versus the
    school's whole audience for that kit -- every student for a Student kit,
    every staff member for a Staff kit."""
    kits = db.query(InventoryKit).filter(InventoryKit.is_active == True).order_by(InventoryKit.name).all()  # noqa: E712
    total_students = db.query(Student).count()
    total_staff = db.query(Teacher).count()

    rows = []
    for kit in kits:
        query = db.query(
            InventoryTransaction.issued_to_student_id, InventoryTransaction.issued_to_teacher_id
        ).filter(
            InventoryTransaction.kit_id == kit.id,
            InventoryTransaction.transaction_type == "Issue",
        )
        if cycle:
            query = query.filter(InventoryTransaction.cycle == cycle)
        if academic_year:
            query = query.filter(InventoryTransaction.academic_year == academic_year)

        recipients = set()
        for student_id, teacher_id in query.all():
            if student_id:
                recipients.add(("student", student_id))
            if teacher_id:
                recipients.add(("teacher", teacher_id))

        eligible = total_students if kit.applies_to == "Student" else total_staff
        rows.append({
            "kit_id": kit.id, "kit_name": kit.name, "applies_to": kit.applies_to,
            "issued_count": len(recipients), "eligible_count": eligible,
            "coverage_percent": round(len(recipients) * 100.0 / eligible, 1) if eligible else None,
        })

    return rows
