from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import FeeStructure, User
from app.schemas import (
    FeeStructureCreate,
    FeeStructureUpdate,
    FeeStructureResponse,
)
from app.security import require_roles

router = APIRouter(
    prefix="/fee-structures",
    tags=["Finance & Billing"]
)


def find_existing(db: Session, academic_year: str, class_name: str | None, fee_type: str):
    query = db.query(FeeStructure).filter(
        FeeStructure.academic_year == academic_year,
        FeeStructure.fee_type == fee_type,
    )
    if class_name:
        query = query.filter(FeeStructure.class_name == class_name)
    else:
        query = query.filter(FeeStructure.class_name.is_(None))
    return query.first()


@router.post("/", response_model=FeeStructureResponse)
def create_fee_structure(
    payload: FeeStructureCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Accounts"])),
):
    existing = find_existing(db, payload.academic_year, payload.class_name, payload.fee_type)
    if existing:
        raise HTTPException(
            status_code=400,
            detail="A fee structure already exists for this academic year, class, and fee type.",
        )

    if payload.amount < 0:
        raise HTTPException(status_code=400, detail="Amount cannot be negative")

    structure = FeeStructure(**payload.model_dump())
    db.add(structure)
    db.commit()
    db.refresh(structure)
    return structure


@router.get("/", response_model=list[FeeStructureResponse])
def list_fee_structures(
    academic_year: str | None = None,
    class_name: str | None = None,
    fee_type: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts"])),
):
    query = db.query(FeeStructure)
    if academic_year:
        query = query.filter(FeeStructure.academic_year == academic_year)
    if class_name:
        query = query.filter(FeeStructure.class_name == class_name)
    if fee_type:
        query = query.filter(FeeStructure.fee_type == fee_type)
    return query.order_by(FeeStructure.academic_year.desc(), FeeStructure.fee_type.asc()).all()


@router.get("/lookup", response_model=FeeStructureResponse)
def lookup_fee_structure(
    academic_year: str,
    fee_type: str,
    class_name: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts"])),
):
    structure = None
    if class_name:
        structure = find_existing(db, academic_year, class_name, fee_type)
    if not structure:
        structure = find_existing(db, academic_year, None, fee_type)

    if not structure:
        raise HTTPException(status_code=404, detail="No fee structure configured for this selection")

    return structure


@router.put("/{structure_id}", response_model=FeeStructureResponse)
def update_fee_structure(
    structure_id: int,
    payload: FeeStructureUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Accounts"])),
):
    structure = db.query(FeeStructure).filter(FeeStructure.id == structure_id).first()
    if not structure:
        raise HTTPException(status_code=404, detail="Fee structure not found")

    update_data = payload.model_dump(exclude_unset=True)

    next_year = update_data.get("academic_year", structure.academic_year)
    next_class = update_data.get("class_name", structure.class_name)
    next_type = update_data.get("fee_type", structure.fee_type)

    conflict = find_existing(db, next_year, next_class, next_type)
    if conflict and conflict.id != structure.id:
        raise HTTPException(
            status_code=400,
            detail="A fee structure already exists for this academic year, class, and fee type.",
        )

    if "amount" in update_data and update_data["amount"] < 0:
        raise HTTPException(status_code=400, detail="Amount cannot be negative")

    for key, value in update_data.items():
        setattr(structure, key, value)

    db.commit()
    db.refresh(structure)
    return structure


@router.delete("/{structure_id}")
def delete_fee_structure(
    structure_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    structure = db.query(FeeStructure).filter(FeeStructure.id == structure_id).first()
    if not structure:
        raise HTTPException(status_code=404, detail="Fee structure not found")

    db.delete(structure)
    db.commit()
    return {"message": "Fee structure deleted successfully"}
