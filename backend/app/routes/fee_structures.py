from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.csv_import import csv_template_response, read_csv_upload
from app.database import get_db
from app.fee_scheduling import validate_schedule
from app.models import FeeGenerationRun, FeeStructure, User
from app.schemas import (
    FeeStructureCreate,
    FeeStructureUpdate,
    FeeStructureResponse,
    FeeStructureClassLookupResponse,
    FeeGenerationRunResponse,
)
from app.security import require_roles

router = APIRouter(
    prefix="/fee-structures",
    tags=["Finance & Billing"]
)

BULK_IMPORT_COLUMNS = [
    "academic_year",
    "class_name",
    "residential_type",
    "fee_type",
    "amount",
    "due_date",
    "remarks",
]


def find_existing(
    db: Session,
    academic_year: str,
    class_name: str | None,
    residential_type: str | None,
    fee_type: str,
):
    query = db.query(FeeStructure).filter(
        FeeStructure.academic_year == academic_year,
        FeeStructure.fee_type == fee_type,
    )
    query = query.filter(
        FeeStructure.class_name == class_name
        if class_name
        else FeeStructure.class_name.is_(None)
    )
    query = query.filter(
        FeeStructure.residential_type == residential_type
        if residential_type
        else FeeStructure.residential_type.is_(None)
    )
    return query.first()


def resolve_structure(
    db: Session,
    academic_year: str,
    class_name: str | None,
    residential_type: str | None,
    fee_type: str,
):
    """Most specific match first, falling back to wildcards on class and/or residential type."""
    class_candidates = [class_name, None] if class_name else [None]
    residential_candidates = [residential_type, None] if residential_type else [None]

    for cls in class_candidates:
        for res in residential_candidates:
            structure = find_existing(db, academic_year, cls, res, fee_type)
            if structure:
                return structure
    return None


def resolve_class_structures(
    db: Session,
    academic_year: str,
    class_name: str | None,
    fee_type: str,
):
    """Every fee structure row applicable to a whole class, grouped by
    residential type ("Hosteller" / "Day Scholar" / None for "Both").

    Mirrors resolve_structure's "specific class wins over All Classes" rule
    on the class axis, but does NOT collapse the residential axis: a class
    can have separate Hosteller/Day Scholar amounts configured side by side
    (see the Fee Structure form's own note about boarders often paying more
    Tuition Fee than day scholars), so bulk class-fee creation needs to see
    all of them to bill each group correctly.
    """
    for cls in ([class_name, None] if class_name else [None]):
        rows = (
            db.query(FeeStructure)
            .filter(
                FeeStructure.academic_year == academic_year,
                FeeStructure.fee_type == fee_type,
                FeeStructure.class_name == cls if cls else FeeStructure.class_name.is_(None),
            )
            .all()
        )
        if rows:
            return {row.residential_type: row for row in rows}
    return {}


@router.post("/", response_model=FeeStructureResponse)
def create_fee_structure(
    payload: FeeStructureCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Accounts"])),
):
    existing = find_existing(
        db, payload.academic_year, payload.class_name, payload.residential_type, payload.fee_type
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail="A fee structure already exists for this academic year, class, residential type, and fee type.",
        )

    if payload.amount < 0:
        raise HTTPException(status_code=400, detail="Amount cannot be negative")

    try:
        validate_schedule(payload.auto_generate, payload.recurrence, payload.next_run_date)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    structure = FeeStructure(**payload.model_dump())
    db.add(structure)
    db.commit()
    db.refresh(structure)
    return structure


@router.get("/", response_model=list[FeeStructureResponse])
def list_fee_structures(
    academic_year: str | None = None,
    class_name: str | None = None,
    residential_type: str | None = None,
    fee_type: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts"])),
):
    query = db.query(FeeStructure)
    if academic_year:
        query = query.filter(FeeStructure.academic_year == academic_year)
    if class_name:
        query = query.filter(FeeStructure.class_name == class_name)
    if residential_type:
        query = query.filter(FeeStructure.residential_type == residential_type)
    if fee_type:
        query = query.filter(FeeStructure.fee_type == fee_type)
    return query.order_by(FeeStructure.academic_year.desc(), FeeStructure.fee_type.asc()).all()


@router.get("/lookup", response_model=FeeStructureResponse)
def lookup_fee_structure(
    academic_year: str,
    fee_type: str,
    class_name: str | None = None,
    residential_type: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts"])),
):
    structure = resolve_structure(db, academic_year, class_name, residential_type, fee_type)

    if not structure:
        raise HTTPException(status_code=404, detail="No fee structure configured for this selection")

    return structure


@router.get("/lookup-class", response_model=FeeStructureClassLookupResponse)
def lookup_class_fee_structure(
    academic_year: str,
    fee_type: str,
    class_name: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts"])),
):
    """Preview how a class-wide fee will resolve: one amount for everyone
    ("single"), or split by residential type when Hosteller/Day Scholar
    have their own structure rows ("split")."""
    structures = resolve_class_structures(db, academic_year, class_name, fee_type)

    if not structures:
        raise HTTPException(status_code=404, detail="No fee structure configured for this selection")

    if set(structures.keys()) == {None}:
        structure = structures[None]
        return FeeStructureClassLookupResponse(
            mode="single",
            amount=structure.amount,
            due_date=structure.due_date,
        )

    both = structures.get(None)
    hosteller = structures.get("Hosteller") or both
    day_scholar = structures.get("Day Scholar") or both

    return FeeStructureClassLookupResponse(
        mode="split",
        hosteller_amount=hosteller.amount if hosteller else None,
        hosteller_due_date=hosteller.due_date if hosteller else None,
        day_scholar_amount=day_scholar.amount if day_scholar else None,
        day_scholar_due_date=day_scholar.due_date if day_scholar else None,
    )


@router.get("/generation-runs", response_model=list[FeeGenerationRunResponse])
def list_generation_runs(
    fee_structure_id: int | None = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts"])),
):
    """Recent scheduled auto-generation attempts, most recent first — lets an
    admin confirm the cron job actually ran without SSHing in to read logs."""
    query = db.query(FeeGenerationRun)
    if fee_structure_id:
        query = query.filter(FeeGenerationRun.fee_structure_id == fee_structure_id)
    return query.order_by(FeeGenerationRun.id.desc()).limit(min(limit, 200)).all()


@router.get("/bulk-import-template")
def bulk_import_template(
    current_user: User = Depends(require_roles(["Admin", "Accounts"])),
):
    return csv_template_response(
        BULK_IMPORT_COLUMNS,
        {
            "academic_year": "2026-27",
            "class_name": "8",
            "residential_type": "",
            "fee_type": "Tuition Fee",
            "amount": "5000",
            "due_date": "2026-04-10",
            "remarks": "",
        },
        "fee_structures_import_template.csv",
    )


@router.post("/bulk-import")
def bulk_import_fee_structures(
    file: UploadFile = File(...),
    dry_run: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Accounts"])),
):
    rows, unknown_columns = read_csv_upload(file, BULK_IMPORT_COLUMNS)

    seen = set()
    errors = []
    to_create = []

    for row_index, cleaned in rows:
        academic_year = cleaned.get("academic_year")
        fee_type = cleaned.get("fee_type")
        if not academic_year:
            errors.append({"row": row_index, "error": "academic_year is required"})
            continue
        if not fee_type:
            errors.append({"row": row_index, "error": "fee_type is required"})
            continue
        if not cleaned.get("amount"):
            errors.append({"row": row_index, "error": "amount is required"})
            continue

        key = (academic_year, cleaned.get("class_name"), cleaned.get("residential_type"), fee_type)
        if key in seen:
            errors.append({"row": row_index, "error": "Duplicate academic_year/class_name/residential_type/fee_type in file"})
            continue
        if find_existing(db, academic_year, cleaned.get("class_name"), cleaned.get("residential_type"), fee_type):
            errors.append({
                "row": row_index,
                "error": "A fee structure already exists for this academic year, class, residential type, and fee type.",
            })
            continue

        try:
            validated = FeeStructureCreate(
                academic_year=academic_year,
                class_name=cleaned.get("class_name"),
                residential_type=cleaned.get("residential_type"),
                fee_type=fee_type,
                amount=cleaned["amount"],
                due_date=cleaned.get("due_date"),
                remarks=cleaned.get("remarks"),
            )
        except ValidationError as exc:
            errors.append({"row": row_index, "error": exc.errors()[0]["msg"]})
            continue

        if validated.amount < 0:
            errors.append({"row": row_index, "error": "Amount cannot be negative"})
            continue

        seen.add(key)
        to_create.append(validated)

    created_count = 0
    if not dry_run:
        for validated in to_create:
            db.add(FeeStructure(**validated.model_dump()))
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
    next_residential = update_data.get("residential_type", structure.residential_type)
    next_type = update_data.get("fee_type", structure.fee_type)

    conflict = find_existing(db, next_year, next_class, next_residential, next_type)
    if conflict and conflict.id != structure.id:
        raise HTTPException(
            status_code=400,
            detail="A fee structure already exists for this academic year, class, residential type, and fee type.",
        )

    if "amount" in update_data and update_data["amount"] < 0:
        raise HTTPException(status_code=400, detail="Amount cannot be negative")

    try:
        validate_schedule(
            update_data.get("auto_generate", structure.auto_generate),
            update_data.get("recurrence", structure.recurrence),
            update_data.get("next_run_date", structure.next_run_date),
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

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
