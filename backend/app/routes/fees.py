import base64
import io
from datetime import datetime
from urllib.parse import quote, urlencode

import qrcode
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.listing import apply_listing
from app.models import Fee, ReceiptSequence, Student, SchoolSettings, User
from app import concessions
from app.notifications import notify_guardian_fee_added
from app.payment_links import verify_payment_link_token
from app.routes.fee_structures import resolve_class_structures
from app.schemas import (
    FeeCreate,
    FeeUpdate,
    FeeResponse,
    FeeBulkClassCreate,
    FeeBulkClassGroupResult,
    FeeBulkClassResponse,
)
from app.security import require_roles
from app.pdf import fee_receipt_pdf
from pydantic import BaseModel

router = APIRouter(
    prefix="/fees",
    tags=["Finance & Billing"]
)


VALID_FEE_TYPES = [
    "Admission Fee",
    "Tuition Fee",
    "Transport Fee",
    "Exam Fee",
    "Library Fee",
    "Hostel Fee",
    "Annual Fee",
    "Activity Fee",
    "Technology Fee",
    "Other"
]


def get_settings(db: Session):
    settings = db.query(SchoolSettings).first()

    if not settings:
        settings = SchoolSettings(
            school_name="International School",
            currency="INR",
            receipt_prefix="REC"
        )

        db.add(settings)
        db.commit()
        db.refresh(settings)

    return settings


def calculate_fee_status(
    total_amount: float,
    paid_amount: float,
    concession_amount: float = 0,
    late_fee_charged: float = 0,
):
    """Outstanding amount and status for a fee.

    concession_amount and late_fee_charged default to zero so call sites
    that predate concessions/late fees keep their exact previous behaviour;
    only callers holding a Fee row pass them. What a guardian owes is total
    minus any discount plus any fine, so a fee fully covered by a
    scholarship reads as Paid with nothing outstanding, and an overdue fee
    a school has started fining shows the real amount now due rather than
    just the original total.
    """
    payable = (total_amount or 0) - (concession_amount or 0) + (late_fee_charged or 0)
    payable = max(payable, 0)
    due_amount = round(payable - (paid_amount or 0), 2)

    if due_amount <= 0:
        return 0, "Paid"

    if paid_amount > 0:
        return due_amount, "Partial"

    return due_amount, "Unpaid"


def outstanding_balance(fee: Fee) -> float:
    """What's actually left to pay on a fee -- total minus any concession
    plus any late fee charged, minus what's already been paid. The UPI
    payment paths used to compute this as a bare total_amount - paid_amount,
    which quietly ignored both concessions and late fees; routed through
    calculate_fee_status here so a parent's UPI QR always asks for the real
    amount owed."""
    due_amount, _ = calculate_fee_status(
        fee.total_amount, fee.paid_amount, fee.concession_amount, fee.late_fee_charged
    )
    return due_amount


def validate_fee_amounts(fee_type: str, total_amount: float, paid_amount: float):
    if fee_type not in VALID_FEE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid fee type. Allowed: {', '.join(VALID_FEE_TYPES)}"
        )

    if total_amount < 0:
        raise HTTPException(
            status_code=400,
            detail="Total amount cannot be negative"
        )

    if paid_amount < 0:
        raise HTTPException(
            status_code=400,
            detail="Paid amount cannot be negative"
        )

    if paid_amount > total_amount:
        raise HTTPException(
            status_code=400,
            detail="Paid amount cannot be greater than total amount"
        )


def financial_year_label(on_date) -> str:
    """Indian school financial year, April to March: "2026-27" for any date
    from 1 Apr 2026 to 31 Mar 2027."""
    start_year = on_date.year if on_date.month >= 4 else on_date.year - 1
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def generate_receipt_no(db: Session):
    """Financial-year-scoped and tracked in its own ratcheting counter
    rather than a running COUNT(*) or MAX() over the fees table: counting
    every Fee row ever created meant the number reset with the calendar
    year (not the school's financial year), and deriving the next number
    from what's currently in the fees table -- via COUNT or MAX alike --
    means deleting the most-recently-numbered fee exposes the previous
    number again, so the very next receipt generated collides with the
    deleted one. A separate sequence row per financial year, incremented
    and never decremented, can't be rewound by a delete.
    """
    settings = get_settings(db)
    prefix = settings.receipt_prefix or "REC"
    fy = financial_year_label(datetime.now().date())

    sequence = (
        db.query(ReceiptSequence)
        .filter(ReceiptSequence.financial_year == fy)
        .first()
    )
    if not sequence:
        sequence = ReceiptSequence(financial_year=fy, last_number=0)
        db.add(sequence)

    sequence.last_number += 1
    db.flush()

    return f"{prefix}-{fy}-{str(sequence.last_number).zfill(5)}"


@router.post("/", response_model=FeeResponse)
def create_fee(
    fee: FeeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Accounts"])
    )
):
    student = db.query(Student).filter(
        Student.id == fee.student_id
    ).first()

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found"
        )

    validate_fee_amounts(fee.fee_type, fee.total_amount, fee.paid_amount)

    academic_year = fee.academic_year or get_settings(db).academic_year
    # Any approved concession the student holds is applied at creation, so a
    # scholarship does not depend on someone remembering to discount by hand.
    concession_amount = concessions.discount_for_fee(
        db, fee.student_id, fee.total_amount,
        fee_type=fee.fee_type, academic_year=academic_year,
    )

    due_amount, payment_status = calculate_fee_status(
        fee.total_amount,
        fee.paid_amount,
        concession_amount,
    )

    receipt_no = fee.receipt_no

    if not receipt_no and fee.paid_amount > 0:
        receipt_no = generate_receipt_no(db)

    new_fee = Fee(
        student_id=fee.student_id,
        fee_type=fee.fee_type,
        concession_amount=concession_amount,
        academic_year=academic_year,
        class_id=fee.class_id or student.class_id,
        class_name_snapshot=fee.class_name_snapshot or student.class_name,
        section_snapshot=fee.section_snapshot or student.section,
        total_amount=fee.total_amount,
        paid_amount=fee.paid_amount,
        due_amount=due_amount,
        payment_status=payment_status,
        payment_date=fee.payment_date,
        due_date=fee.due_date,
        receipt_no=receipt_no,
        remarks=fee.remarks
    )

    db.add(new_fee)
    db.commit()
    db.refresh(new_fee)

    settings = get_settings(db)
    notify_guardian_fee_added(db, new_fee, student, settings.school_name or "School")

    return new_fee


def assign_class_fee(
    db: Session,
    *,
    class_name: str,
    fee_type: str,
    academic_year: str | None = None,
    section: str | None = None,
    total_amount: float | None = None,
    paid_amount: float = 0,
    payment_date=None,
    due_date=None,
    remarks: str | None = None,
    billing_period: str | None = None,
    active_only: bool = False,
) -> FeeBulkClassResponse:
    """Bill every student in a class (optionally one section) for a fee type,
    resolving the amount from Fee Structures. Shared by the manual "Bulk
    Class" endpoint below and the scheduled auto-generation job.

    billing_period (e.g. "2026-08") marks fees as belonging to a specific
    auto-generated cycle and, when set, skips any student who already has a
    fee for this (fee_type, academic_year, billing_period) — so re-running
    the scheduler for a cycle it already processed never double-bills.
    active_only additionally restricts to students with student_status
    "Active" — used by the scheduler, left off for manual calls to keep
    existing behavior unchanged.
    """
    query = db.query(Student).filter(Student.class_name == class_name)

    if section:
        query = query.filter(Student.section == section)

    if active_only:
        query = query.filter(Student.student_status == "Active")

    students = query.all()

    if not students:
        raise HTTPException(
            status_code=404,
            detail="No students found for the selected class"
        )

    if fee_type not in VALID_FEE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid fee type. Allowed: {', '.join(VALID_FEE_TYPES)}"
        )

    academic_year = academic_year or get_settings(db).academic_year

    # A fee type's own Fee Structure already says who it applies to: a
    # residential-type-specific row (e.g. Hostel Fee -> Hosteller only)
    # bills just that group, while a "Both" row (or no structure at all,
    # using the manually-entered amount) bills everyone.
    structures = resolve_class_structures(db, academic_year, class_name, fee_type)

    batches = []  # (residential_type_filter_or_None, total_amount, due_date)

    if not structures:
        if not total_amount or total_amount <= 0:
            raise HTTPException(
                status_code=400,
                detail="Total Amount must be greater than 0, or configure a Fee Structure for this class and fee type."
            )
        batches.append((None, total_amount, due_date))
    elif set(structures.keys()) == {None}:
        structure = structures[None]
        batches.append((None, structure.amount, structure.due_date or due_date))
    else:
        both = structures.get(None)
        for residential_type in ("Hosteller", "Day Scholar"):
            structure = structures.get(residential_type) or both
            if structure:
                batches.append((residential_type, structure.amount, structure.due_date or due_date))

    for _, batch_total_amount, _ in batches:
        validate_fee_amounts(fee_type, batch_total_amount, paid_amount)

    already_billed_ids: set[int] = set()
    if billing_period:
        already_billed_ids = {
            row[0] for row in db.query(Fee.student_id).filter(
                Fee.fee_type == fee_type,
                Fee.academic_year == academic_year,
                Fee.billing_period == billing_period,
                Fee.student_id.in_([s.id for s in students]),
            ).all()
        }

    settings = get_settings(db)
    created = []
    groups = []

    for residential_type, batch_total_amount, batch_due_date in batches:
        batch_students = [
            student for student in students
            if (not residential_type or student.residential_type == residential_type)
            and student.id not in already_billed_ids
        ]

        if not batch_students:
            continue

        due_amount, payment_status = calculate_fee_status(batch_total_amount, paid_amount)

        for student in batch_students:
            receipt_no = generate_receipt_no(db) if paid_amount > 0 else None

            new_fee = Fee(
                student_id=student.id,
                fee_type=fee_type,
                academic_year=academic_year,
                class_id=student.class_id,
                class_name_snapshot=student.class_name,
                section_snapshot=student.section,
                total_amount=batch_total_amount,
                paid_amount=paid_amount,
                due_amount=due_amount,
                payment_status=payment_status,
                payment_date=payment_date,
                due_date=batch_due_date,
                receipt_no=receipt_no,
                remarks=remarks,
                billing_period=billing_period,
            )

            db.add(new_fee)
            created.append((new_fee, student))

            if paid_amount > 0:
                # Session has autoflush disabled, so generate_receipt_no()'s
                # count query won't see this row on the next iteration unless flushed.
                db.flush()

        groups.append(FeeBulkClassGroupResult(
            residential_type=residential_type,
            student_count=len(batch_students),
            amount=batch_total_amount,
        ))

    if not created:
        # A manual call with nothing to bill is a mistake worth surfacing.
        # A scheduled call finding everyone already billed for this cycle is
        # the expected steady state on a re-run, not an error.
        if billing_period is None:
            raise HTTPException(
                status_code=404,
                detail="No students in this class/section matched the resolved fee structure"
            )
        return FeeBulkClassResponse(
            created_count=0,
            class_name=class_name,
            section=section,
            groups=groups,
            skipped_count=len(already_billed_ids),
        )

    db.commit()

    for new_fee, student in created:
        db.refresh(new_fee)
        notify_guardian_fee_added(db, new_fee, student, settings.school_name or "School")

    return FeeBulkClassResponse(
        created_count=len(created),
        class_name=class_name,
        section=section,
        groups=groups,
        skipped_count=len(already_billed_ids),
    )


@router.post("/bulk-class", response_model=FeeBulkClassResponse)
def create_fee_for_class(
    payload: FeeBulkClassCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Accounts"])
    )
):
    return assign_class_fee(
        db,
        class_name=payload.class_name,
        section=payload.section,
        fee_type=payload.fee_type,
        academic_year=payload.academic_year,
        total_amount=payload.total_amount,
        paid_amount=payload.paid_amount,
        payment_date=payload.payment_date,
        due_date=payload.due_date,
        remarks=payload.remarks,
    )


@router.get("/", response_model=list[FeeResponse])
def get_fees(
    academic_year: str | None = None,
    search: str | None = None,
    sort: str | None = None,
    order: str = "asc",
    limit: int | None = None,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Accounts"])
    )
):
    query = db.query(Fee)

    if academic_year:
        query = query.filter(Fee.academic_year == academic_year)

    return apply_listing(
        query, Fee,
        search=search, search_fields=("fee_type", "receipt_no", "payment_status"),
        sort=sort, order=order, limit=limit, offset=offset,
        default_order=[Fee.id.desc()],
    ).all()


@router.get("/student/{student_id}", response_model=list[FeeResponse])
def get_student_fees(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Accounts"])
    )
):
    student = db.query(Student).filter(
        Student.id == student_id
    ).first()

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found"
        )

    return db.query(Fee).filter(
        Fee.student_id == student_id
    ).order_by(Fee.id.desc()).all()


@router.get("/{fee_id}", response_model=FeeResponse)
def get_fee(
    fee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Accounts"])
    )
):
    fee = db.query(Fee).filter(
        Fee.id == fee_id
    ).first()

    if not fee:
        raise HTTPException(
            status_code=404,
            detail="Fee record not found"
        )

    return fee


@router.put("/{fee_id}", response_model=FeeResponse)
def update_fee(
    fee_id: int,
    fee_data: FeeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Accounts"])
    )
):
    fee = db.query(Fee).filter(
        Fee.id == fee_id
    ).first()

    if not fee:
        raise HTTPException(
            status_code=404,
            detail="Fee record not found"
        )

    update_data = fee_data.model_dump(
        exclude_unset=True
    )

    _, original_status = calculate_fee_status(
        fee.total_amount, fee.paid_amount, fee.concession_amount, fee.late_fee_charged
    )

    if original_status == "Paid":
        raise HTTPException(
            status_code=400,
            detail="Fully paid fees cannot be edited"
        )

    locked_fields = [
        "fee_type", "academic_year", "total_amount",
        "due_date", "receipt_no", "remarks"
    ]
    for field in locked_fields:
        if field in update_data and update_data[field] != getattr(fee, field):
            raise HTTPException(
                status_code=400,
                detail="Only Payment Amount can be updated once a fee record has been created"
            )

    update_data["payment_date"] = datetime.now().date()

    if "fee_type" in update_data and update_data["fee_type"]:
        if update_data["fee_type"] not in VALID_FEE_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid fee type. Allowed: {', '.join(VALID_FEE_TYPES)}"
            )

    student = db.query(Student).filter(Student.id == fee.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    update_data["academic_year"] = (
        update_data.get("academic_year")
        or fee.academic_year
        or get_settings(db).academic_year
    )
    update_data["class_id"] = update_data.get("class_id") or fee.class_id or student.class_id
    update_data["class_name_snapshot"] = (
        update_data.get("class_name_snapshot")
        or fee.class_name_snapshot
        or student.class_name
    )
    update_data["section_snapshot"] = (
        update_data.get("section_snapshot")
        or fee.section_snapshot
        or student.section
    )

    for key, value in update_data.items():
        setattr(fee, key, value)

    if fee.total_amount < 0:
        raise HTTPException(
            status_code=400,
            detail="Total amount cannot be negative"
        )

    if fee.paid_amount < 0:
        raise HTTPException(
            status_code=400,
            detail="Paid amount cannot be negative"
        )

    if fee.paid_amount > fee.total_amount:
        raise HTTPException(
            status_code=400,
            detail="Paid amount cannot be greater than total amount"
        )

    due_amount, payment_status = calculate_fee_status(
        fee.total_amount,
        fee.paid_amount,
        fee.concession_amount,
        fee.late_fee_charged,
    )

    fee.due_amount = due_amount
    fee.payment_status = payment_status

    if not fee.receipt_no and fee.paid_amount > 0:
        fee.receipt_no = generate_receipt_no(db)

    db.commit()
    db.refresh(fee)

    return fee


class UpiConfirmRequest(BaseModel):
    reference: str


def _school_upi_id(settings) -> str:
    return (settings.upi_id or "").strip()


@router.get("/payment/config")
def payment_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Accounts", "Principal"])),
):
    """Whether UPI payment is available, and the school's UPI details."""
    settings = get_settings(db)
    upi_id = _school_upi_id(settings)
    return {
        "enabled": bool(upi_id),
        "upi_id": upi_id,
        "payee_name": settings.school_name or "School",
        "currency": (settings.currency or "INR").upper(),
    }


@router.get("/{fee_id}/payment/upi")
def upi_payment_details(
    fee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Accounts", "Principal"])),
):
    """UPI deep link (upi://pay) for a fee's outstanding balance."""
    settings = get_settings(db)
    upi_id = _school_upi_id(settings)
    if not upi_id:
        raise HTTPException(
            status_code=400,
            detail="UPI payment is not configured. Set the school's UPI ID in Settings.",
        )

    fee = db.query(Fee).filter(Fee.id == fee_id).first()
    if not fee:
        raise HTTPException(status_code=404, detail="Fee record not found")

    balance = outstanding_balance(fee)
    if balance <= 0:
        raise HTTPException(status_code=400, detail="This fee has no outstanding balance.")

    payee_name = settings.school_name or "School"
    note = f"Fee #{fee.id} {fee.fee_type or ''}".strip()
    params = urlencode(
        {
            "pa": upi_id,
            "pn": payee_name,
            "am": f"{balance:.2f}",
            "cu": "INR",
            "tn": note[:80],
        },
        quote_via=quote,
    )

    return {
        "upi_id": upi_id,
        "payee_name": payee_name,
        "amount": round(balance, 2),
        "currency": "INR",
        "note": note[:80],
        "uri": f"upi://pay?{params}",
    }


@router.post("/{fee_id}/payment/upi/confirm", response_model=FeeResponse)
def confirm_upi_payment(
    fee_id: int,
    payload: UpiConfirmRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Accounts", "Principal"])),
):
    """Record a completed UPI payment (with its UTR/reference) and settle the balance."""
    reference = (payload.reference or "").strip()
    if not reference:
        raise HTTPException(
            status_code=400,
            detail="Enter the UPI transaction reference (UTR) to confirm the payment.",
        )

    fee = db.query(Fee).filter(Fee.id == fee_id).first()
    if not fee:
        raise HTTPException(status_code=404, detail="Fee record not found")

    balance = outstanding_balance(fee)
    if balance <= 0:
        raise HTTPException(status_code=400, detail="This fee has no outstanding balance.")

    # Payment received: settle the balance, including any concession/late fee.
    fee.paid_amount = (fee.paid_amount or 0) + balance
    fee.payment_date = datetime.now().date()
    due_amount, payment_status = calculate_fee_status(
        fee.total_amount, fee.paid_amount, fee.concession_amount, fee.late_fee_charged
    )
    fee.due_amount = due_amount
    fee.payment_status = payment_status
    if not fee.receipt_no:
        fee.receipt_no = generate_receipt_no(db)

    upi_note = f"UPI Ref: {reference}"
    fee.remarks = f"{fee.remarks} | {upi_note}" if fee.remarks else upi_note

    db.commit()
    db.refresh(fee)
    return fee


def _payment_page(body: str, status_code: int = 200) -> HTMLResponse:
    return HTMLResponse(
        f"""<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Fee Payment</title>
</head>
<body style="font-family:system-ui,sans-serif;text-align:center;padding:32px 20px;
             max-width:420px;margin:0 auto;color:#1e293b;">
  {body}
</body>
</html>""",
        status_code=status_code,
    )


@router.get("/{fee_id}/pay", response_class=HTMLResponse, include_in_schema=False)
def public_payment_page(fee_id: int, token: str, db: Session = Depends(get_db)):
    """Public, no-login payment page a guardian opens from a WhatsApp/SMS link."""
    if not verify_payment_link_token(fee_id, token):
        return _payment_page(
            "<h2>This payment link is invalid or has expired.</h2>"
            "<p>Please contact the school office for a new link.</p>",
            status_code=400,
        )

    fee = db.query(Fee).filter(Fee.id == fee_id).first()
    if not fee:
        return _payment_page("<h2>Fee record not found.</h2>", status_code=404)

    balance = outstanding_balance(fee)
    if balance <= 0:
        return _payment_page("<h2>This fee is already fully paid.</h2><p>Thank you!</p>")

    settings = get_settings(db)
    upi_id = _school_upi_id(settings)
    if not upi_id:
        return _payment_page(
            "<h2>Online payment is not available for this school right now.</h2>",
            status_code=400,
        )

    student = db.query(Student).filter(Student.id == fee.student_id).first()
    student_label = "-"
    if student:
        student_label = f"{student.first_name} {student.last_name or ''}".strip()

    payee_name = settings.school_name or "School"
    note = f"Fee #{fee.id} {fee.fee_type or ''}".strip()
    params = urlencode(
        {"pa": upi_id, "pn": payee_name, "am": f"{balance:.2f}", "cu": "INR", "tn": note[:80]},
        quote_via=quote,
    )
    uri = f"upi://pay?{params}"

    qr_buf = io.BytesIO()
    qrcode.make(uri).save(qr_buf, format="PNG")
    qr_b64 = base64.b64encode(qr_buf.getvalue()).decode()

    return _payment_page(
        f"""
        <h2>Pay via UPI</h2>
        <p>{fee.fee_type or 'Fee'} — {student_label}</p>
        <img src="data:image/png;base64,{qr_b64}" alt="UPI payment QR code"
             style="width:220px;height:220px;" />
        <p style="font-size:1.3rem;margin:10px 0 2px;"><strong>Rs. {balance:.2f}</strong></p>
        <p style="margin:0;color:#667085;">to <strong>{upi_id}</strong> ({payee_name})</p>
        <p style="margin-top:16px;">
          <a href="{uri}" style="display:inline-block;padding:12px 22px;background:#1e293b;
             color:#fff;border-radius:8px;text-decoration:none;">Open in UPI app</a>
        </p>
        <p style="color:#667085;font-size:0.85rem;margin-top:24px;">
          After paying, please share the transaction reference with the school office
          to get your receipt.
        </p>
        """
    )


@router.get("/{fee_id}/receipt")
def fee_receipt(
    fee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Accounts", "Principal"])),
):
    """Download a PDF fee receipt."""
    fee = db.query(Fee).filter(Fee.id == fee_id).first()
    if not fee:
        raise HTTPException(status_code=404, detail="Fee record not found")

    student = db.query(Student).filter(Student.id == fee.student_id).first()
    settings = get_settings(db)

    student_name = "-"
    class_label = fee.class_name_snapshot or ""
    if student:
        student_name = (
            f"{student.first_name or ''} {student.last_name or ''}".strip()
            or student.admission_no
            or "-"
        )
        class_label = class_label or student.class_name or ""
        if student.admission_no:
            student_name = f"{student.admission_no} - {student_name}"

    total = fee.total_amount or 0
    paid = fee.paid_amount or 0
    pdf_bytes = fee_receipt_pdf({
        "school_name": settings.school_name,
        "currency": settings.currency,
        "receipt_no": fee.receipt_no,
        "student_name": student_name,
        "class_label": class_label or "-",
        "fee_type": fee.fee_type,
        "academic_year": fee.academic_year,
        "total": total,
        "paid": paid,
        "balance": max(total - paid, 0),
        "status": fee.payment_status,
        "payment_date": str(fee.payment_date) if fee.payment_date else "-",
    })

    filename = f"receipt_{fee.receipt_no or fee.id}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"},
    )


@router.delete("/{fee_id}")
def delete_fee(
    fee_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin"])
    )
):
    fee = db.query(Fee).filter(
        Fee.id == fee_id
    ).first()

    if not fee:
        raise HTTPException(
            status_code=404,
            detail="Fee record not found"
        )

    db.delete(fee)
    db.commit()

    return {
        "message": "Fee record deleted successfully"
    }


@router.get("/metadata/fee-types")
def get_fee_types(
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Accounts"])
    )
):
    return {
        "fee_types": VALID_FEE_TYPES
    }
