from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Fee, Student, SchoolSettings, User
from app.schemas import FeeCreate, FeeUpdate, FeeResponse
from app.security import require_roles

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
        total_amount=fee.total_amount,
        paid_amount=fee.paid_amount,
        due_amount=due_amount,
        payment_status=payment_status,
        payment_date=fee.payment_date,
        receipt_no=receipt_no,
        remarks=fee.remarks
    )

    db.add(new_fee)
    db.commit()
    db.refresh(new_fee)

    return new_fee


@router.get("/", response_model=list[FeeResponse])
def get_fees(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Accounts"])
    )
):
    return db.query(Fee).order_by(Fee.id.desc()).all()


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

    if "fee_type" in update_data and update_data["fee_type"]:
        if update_data["fee_type"] not in VALID_FEE_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid fee type. Allowed: {', '.join(VALID_FEE_TYPES)}"
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