from collections import defaultdict
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AccountTransaction, Fee, InventoryItem, InventoryTransaction, Student, User
from app.schemas import (
    AccountingSummaryResponse,
    AccountTransactionCreate,
    AccountTransactionResponse,
    AccountTransactionUpdate,
    LedgerEntry,
)
from app.security import require_roles

router = APIRouter(prefix="/accounting", tags=["Accounting"])

VIEW_ROLES = ["Admin", "Principal", "Accounts"]
MANAGE_ROLES = ["Admin", "Accounts"]

INVENTORY_PURCHASE_TYPES = {"Stock In"}


def student_name(student: Student | None) -> str:
    if not student:
        return "-"
    name = getattr(student, "student_name", None) or f"{student.first_name or ''} {student.last_name or ''}".strip()
    return name or f"Student ID: {student.id}"


def in_range(value: date | None, start: date | None, end: date | None) -> bool:
    if value is None:
        return False
    if start and value < start:
        return False
    if end and value > end:
        return False
    return True


def fee_income_query(db: Session, start: date | None, end: date | None):
    query = db.query(Fee).filter(Fee.paid_amount > 0, Fee.payment_date.isnot(None))
    if start:
        query = query.filter(Fee.payment_date >= start)
    if end:
        query = query.filter(Fee.payment_date <= end)
    return query


def inventory_expense_query(db: Session, start: date | None, end: date | None):
    query = db.query(InventoryTransaction).filter(
        InventoryTransaction.transaction_type.in_(INVENTORY_PURCHASE_TYPES),
        InventoryTransaction.total_cost.isnot(None),
    )
    if start:
        query = query.filter(InventoryTransaction.transaction_date >= start)
    if end:
        query = query.filter(InventoryTransaction.transaction_date <= end)
    return query


def manual_entries_query(db: Session, start: date | None, end: date | None):
    query = db.query(AccountTransaction)
    if start:
        query = query.filter(AccountTransaction.entry_date >= start)
    if end:
        query = query.filter(AccountTransaction.entry_date <= end)
    return query


@router.get("/summary", response_model=AccountingSummaryResponse)
def get_summary(
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(VIEW_ROLES)),
):
    fee_income = sum(fee.paid_amount or 0 for fee in fee_income_query(db, start_date, end_date))
    inventory_expense = sum(
        record.total_cost or 0 for record in inventory_expense_query(db, start_date, end_date)
    )

    manual_entries = manual_entries_query(db, start_date, end_date).all()
    other_income = sum(entry.amount for entry in manual_entries if entry.entry_type == "Income")
    other_expense = sum(entry.amount for entry in manual_entries if entry.entry_type == "Expense")

    monthly = defaultdict(lambda: {"income": 0.0, "expense": 0.0})

    for fee in fee_income_query(db, start_date, end_date):
        key = fee.payment_date.strftime("%Y-%m")
        monthly[key]["income"] += fee.paid_amount or 0

    for record in inventory_expense_query(db, start_date, end_date):
        key = record.transaction_date.strftime("%Y-%m")
        monthly[key]["expense"] += record.total_cost or 0

    for entry in manual_entries:
        key = entry.entry_date.strftime("%Y-%m")
        if entry.entry_type == "Income":
            monthly[key]["income"] += entry.amount
        else:
            monthly[key]["expense"] += entry.amount

    monthly_list = [
        {"month": key, "income": value["income"], "expense": value["expense"]}
        for key, value in sorted(monthly.items())
    ]

    total_income = fee_income + other_income
    total_expense = inventory_expense + other_expense

    return {
        "fee_income": fee_income,
        "inventory_expense": inventory_expense,
        "other_income": other_income,
        "other_expense": other_expense,
        "total_income": total_income,
        "total_expense": total_expense,
        "net_balance": total_income - total_expense,
        "monthly": monthly_list,
    }


@router.get("/ledger", response_model=list[LedgerEntry])
def get_ledger(
    start_date: date | None = None,
    end_date: date | None = None,
    entry_type: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(VIEW_ROLES)),
):
    entries: list[dict] = []

    for fee in fee_income_query(db, start_date, end_date):
        student = db.query(Student).filter(Student.id == fee.student_id).first()
        entries.append(
            {
                "date": fee.payment_date,
                "entry_type": "Income",
                "category": "Fee Collection",
                "description": f"{fee.fee_type} - {student_name(student)}",
                "amount": fee.paid_amount or 0,
                "source": "fees",
                "reference_no": fee.receipt_no,
            }
        )

    for record in inventory_expense_query(db, start_date, end_date):
        item = db.query(InventoryItem).filter(InventoryItem.id == record.item_id).first()
        entries.append(
            {
                "date": record.transaction_date,
                "entry_type": "Expense",
                "category": "Inventory Purchase",
                "description": item.item_name if item else "Inventory purchase",
                "amount": record.total_cost or 0,
                "source": "inventory",
                "reference_no": record.reference_no,
            }
        )

    for entry in manual_entries_query(db, start_date, end_date):
        entries.append(
            {
                "date": entry.entry_date,
                "entry_type": entry.entry_type,
                "category": entry.category,
                "description": entry.description or entry.category,
                "amount": entry.amount,
                "source": "manual",
                "reference_no": entry.reference_no,
            }
        )

    if entry_type:
        entries = [entry for entry in entries if entry["entry_type"] == entry_type]

    entries.sort(key=lambda entry: entry["date"], reverse=True)

    return entries


@router.get("/entries/", response_model=list[AccountTransactionResponse])
def get_entries(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(VIEW_ROLES)),
):
    return db.query(AccountTransaction).order_by(AccountTransaction.entry_date.desc()).all()


@router.post("/entries/", response_model=AccountTransactionResponse)
def create_entry(
    payload: AccountTransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGE_ROLES)),
):
    if payload.entry_type not in {"Income", "Expense"}:
        raise HTTPException(status_code=400, detail="entry_type must be Income or Expense")

    entry = AccountTransaction(**payload.model_dump())
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.put("/entries/{entry_id}", response_model=AccountTransactionResponse)
def update_entry(
    entry_id: int,
    payload: AccountTransactionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGE_ROLES)),
):
    entry = db.query(AccountTransaction).filter(AccountTransaction.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Ledger entry not found")

    if payload.entry_type and payload.entry_type not in {"Income", "Expense"}:
        raise HTTPException(status_code=400, detail="entry_type must be Income or Expense")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(entry, key, value)

    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/entries/{entry_id}")
def delete_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    entry = db.query(AccountTransaction).filter(AccountTransaction.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Ledger entry not found")

    db.delete(entry)
    db.commit()
    return {"message": "Ledger entry deleted successfully"}
