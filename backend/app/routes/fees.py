import io
from datetime import datetime
from urllib.parse import quote, urlencode

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Fee, Student, SchoolSettings, User
from app.schemas import FeeCreate, FeeUpdate, FeeResponse
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


def calculate_fee_status(total_amount: float, paid_amount: float):
    due_amount = total_amount - paid_amount

    if due_amount <= 0:
        return 0, "Paid"

    if paid_amount > 0:
        return due_amount, "Partial"

    return due_amount, "Unpaid"


def generate_receipt_no(db: Session):
    settings = get_settings(db)

    prefix = settings.receipt_prefix or "REC"
    year = datetime.now().year

    count = db.query(Fee).count() + 1

    return f"{prefix}-{year}-{str(count).zfill(5)}"


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

    if fee.fee_type not in VALID_FEE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid fee type. Allowed: {', '.join(VALID_FEE_TYPES)}"
        )

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
        fee.paid_amount
    )

    receipt_no = fee.receipt_no

    if not receipt_no and fee.paid_amount > 0:
        receipt_no = generate_receipt_no(db)

    new_fee = Fee(
        student_id=fee.student_id,
        fee_type=fee.fee_type,
        academic_year=fee.academic_year or get_settings(db).academic_year,
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

    return new_fee


@router.get("/", response_model=list[FeeResponse])
def get_fees(
    academic_year: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Accounts"])
    )
):
    query = db.query(Fee)

    if academic_year:
        query = query.filter(Fee.academic_year == academic_year)

    return query.order_by(Fee.id.desc()).all()


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

    _, original_status = calculate_fee_status(fee.total_amount, fee.paid_amount)

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
        fee.paid_amount
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

    balance = max((fee.total_amount or 0) - (fee.paid_amount or 0), 0)
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

    balance = max((fee.total_amount or 0) - (fee.paid_amount or 0), 0)
    if balance <= 0:
        raise HTTPException(status_code=400, detail="This fee has no outstanding balance.")

    # Payment received: settle the balance.
    fee.paid_amount = fee.total_amount
    fee.payment_date = datetime.now().date()
    due_amount, payment_status = calculate_fee_status(fee.total_amount, fee.paid_amount)
    fee.due_amount = due_amount
    fee.payment_status = payment_status
    if not fee.receipt_no:
        fee.receipt_no = generate_receipt_no(db)

    upi_note = f"UPI Ref: {reference}"
    fee.remarks = f"{fee.remarks} | {upi_note}" if fee.remarks else upi_note

    db.commit()
    db.refresh(fee)
    return fee


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
