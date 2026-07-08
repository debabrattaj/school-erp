from collections import defaultdict
from datetime import date
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
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


def build_ledger_entries(db: Session, start_date: date | None, end_date: date | None) -> list[dict]:
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

    return entries


@router.get("/ledger", response_model=list[LedgerEntry])
def get_ledger(
    start_date: date | None = None,
    end_date: date | None = None,
    entry_type: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(VIEW_ROLES)),
):
    entries = build_ledger_entries(db, start_date, end_date)

    if entry_type:
        entries = [entry for entry in entries if entry["entry_type"] == entry_type]

    entries.sort(key=lambda entry: entry["date"], reverse=True)

    return entries


# ---------------- Tally export ----------------
#
# Tally's import format is double-entry, but these vouchers are generated
# from the simple cash-book ledger so nobody has to write debits/credits
# by hand: Income -> Receipt voucher (Dr Cash / Cr category ledger),
# Expense -> Payment voucher (Dr category ledger / Cr Cash). Sign
# convention: ISDEEMEDPOSITIVE=Yes marks the debit leg and its AMOUNT is
# negative; the credit leg is positive.

CASH_LEDGER = "Cash"  # built into every Tally company


def _tally_ledger_master(name: str, parent: str) -> str:
    return (
        '<TALLYMESSAGE xmlns:UDF="TallyUDF">'
        f'<LEDGER NAME="{escape(name)}" ACTION="Create">'
        f"<NAME>{escape(name)}</NAME>"
        f"<PARENT>{escape(parent)}</PARENT>"
        "</LEDGER>"
        "</TALLYMESSAGE>"
    )


def _tally_voucher(entry: dict) -> str:
    is_income = entry["entry_type"] == "Income"
    vch_type = "Receipt" if is_income else "Payment"
    amount = round(float(entry["amount"]), 2)
    category = entry["category"]

    narration = entry["description"] or category
    if entry.get("reference_no"):
        narration = f"{narration} (Ref: {entry['reference_no']})"

    # Receipt: Dr Cash / Cr category. Payment: Dr category / Cr Cash.
    debit_ledger = CASH_LEDGER if is_income else category
    credit_ledger = category if is_income else CASH_LEDGER

    return (
        '<TALLYMESSAGE xmlns:UDF="TallyUDF">'
        f'<VOUCHER VCHTYPE="{vch_type}" ACTION="Create">'
        f"<DATE>{entry['date'].strftime('%Y%m%d')}</DATE>"
        f"<VOUCHERTYPENAME>{vch_type}</VOUCHERTYPENAME>"
        f"<NARRATION>{escape(narration)}</NARRATION>"
        "<ALLLEDGERENTRIES.LIST>"
        f"<LEDGERNAME>{escape(debit_ledger)}</LEDGERNAME>"
        "<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>"
        f"<AMOUNT>-{amount:.2f}</AMOUNT>"
        "</ALLLEDGERENTRIES.LIST>"
        "<ALLLEDGERENTRIES.LIST>"
        f"<LEDGERNAME>{escape(credit_ledger)}</LEDGERNAME>"
        "<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>"
        f"<AMOUNT>{amount:.2f}</AMOUNT>"
        "</ALLLEDGERENTRIES.LIST>"
        "</VOUCHER>"
        "</TALLYMESSAGE>"
    )


@router.get("/export/tally")
def export_tally_xml(
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(VIEW_ROLES)),
):
    entries = [
        entry
        for entry in build_ledger_entries(db, start_date, end_date)
        if float(entry["amount"] or 0) > 0
    ]
    if not entries:
        raise HTTPException(status_code=404, detail="No ledger entries in the selected period to export")

    entries.sort(key=lambda entry: entry["date"])

    # Emit each category as a ledger master first so the import never fails
    # on a missing ledger; Tally skips masters that already exist. Cash is
    # built-in and needs no master.
    income_categories = sorted({e["category"] for e in entries if e["entry_type"] == "Income"})
    expense_categories = sorted({e["category"] for e in entries if e["entry_type"] == "Expense"})

    messages: list[str] = []
    for name in income_categories:
        messages.append(_tally_ledger_master(name, "Indirect Incomes"))
    for name in expense_categories:
        messages.append(_tally_ledger_master(name, "Indirect Expenses"))
    for entry in entries:
        messages.append(_tally_voucher(entry))

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<ENVELOPE>"
        "<HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>"
        "<BODY><IMPORTDATA>"
        "<REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC>"
        f"<REQUESTDATA>{''.join(messages)}</REQUESTDATA>"
        "</IMPORTDATA></BODY>"
        "</ENVELOPE>"
    )

    first = entries[0]["date"].isoformat()
    last = entries[-1]["date"].isoformat()
    filename = f"tally-vouchers-{first}-to-{last}.xml"

    return Response(
        content=xml,
        media_type="application/xml",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


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
