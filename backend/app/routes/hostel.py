from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import ValidationError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.csv_import import csv_template_response, read_csv_upload
from app.database import get_db
from app.models import HostelAllocation, HostelBlock, HostelRoom, Student, User
from app.schemas import (
    HostelAllocationCreate,
    HostelAllocationResponse,
    HostelBlockCreate,
    HostelBlockResponse,
    HostelRoomCreate,
    HostelRoomResponse,
)
from app.security import require_roles

router = APIRouter(prefix="/hostel", tags=["Hostel"])

ROOM_BULK_IMPORT_COLUMNS = ["block_name", "room_no", "floor", "capacity", "remarks"]


def commit_or_400(db: Session, message: str):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=message)


def get_or_404(db: Session, model, record_id: int, label: str):
    record = db.query(model).filter(model.id == record_id).first()

    if not record:
        raise HTTPException(status_code=404, detail=f"{label} not found")

    return record


def student_name(student: Student):
    name = (
        getattr(student, "student_name", None)
        or f"{student.first_name or ''} {student.last_name or ''}".strip()
    )
    return name or f"Student ID: {student.id}"


def serialize_room(room: HostelRoom, db: Session):
    block = db.query(HostelBlock).filter(HostelBlock.id == room.block_id).first()
    occupied = (
        db.query(HostelAllocation)
        .filter(
            HostelAllocation.room_id == room.id,
            HostelAllocation.status == "Active",
        )
        .count()
    )

    return {
        "id": room.id,
        "block_id": room.block_id,
        "room_no": room.room_no,
        "floor": room.floor,
        "capacity": room.capacity,
        "is_active": room.is_active,
        "remarks": room.remarks,
        "block_name": block.block_name if block else "-",
        "occupied_beds": occupied,
        "available_beds": max((room.capacity or 0) - occupied, 0),
    }


def serialize_allocation(allocation: HostelAllocation, db: Session):
    student = db.query(Student).filter(Student.id == allocation.student_id).first()
    room = db.query(HostelRoom).filter(HostelRoom.id == allocation.room_id).first()
    block = None

    if room:
        block = db.query(HostelBlock).filter(HostelBlock.id == room.block_id).first()

    return {
        "id": allocation.id,
        "student_id": allocation.student_id,
        "room_id": allocation.room_id,
        "bed_no": allocation.bed_no,
        "start_date": allocation.start_date,
        "end_date": allocation.end_date,
        "status": allocation.status,
        "remarks": allocation.remarks,
        "student_name": student_name(student) if student else "-",
        "admission_no": student.admission_no if student else None,
        "room_no": room.room_no if room else "-",
        "block_name": block.block_name if block else "-",
    }


@router.get("/blocks/", response_model=list[HostelBlockResponse])
def get_blocks(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    return db.query(HostelBlock).order_by(HostelBlock.id.desc()).all()


@router.post("/blocks/", response_model=HostelBlockResponse)
def create_block(
    payload: HostelBlockCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    block = HostelBlock(**payload.model_dump())
    db.add(block)
    commit_or_400(db, "Hostel block with this name already exists")
    db.refresh(block)
    return block


@router.put("/blocks/{block_id}", response_model=HostelBlockResponse)
def update_block(
    block_id: int,
    payload: HostelBlockCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    block = get_or_404(db, HostelBlock, block_id, "Hostel block")

    for key, value in payload.model_dump().items():
        setattr(block, key, value)

    commit_or_400(db, "Hostel block with this name already exists")
    db.refresh(block)
    return block


@router.delete("/blocks/{block_id}")
def delete_block(
    block_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    block = get_or_404(db, HostelBlock, block_id, "Hostel block")
    db.delete(block)
    db.commit()
    return {"message": "Hostel block deleted successfully"}


@router.get("/rooms/", response_model=list[HostelRoomResponse])
def get_rooms(
    block_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    query = db.query(HostelRoom)

    if block_id:
        query = query.filter(HostelRoom.block_id == block_id)

    rooms = query.order_by(HostelRoom.id.desc()).all()
    return [serialize_room(room, db) for room in rooms]


@router.post("/rooms/", response_model=HostelRoomResponse)
def create_room(
    payload: HostelRoomCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    get_or_404(db, HostelBlock, payload.block_id, "Hostel block")

    if payload.capacity <= 0:
        raise HTTPException(status_code=400, detail="Room capacity must be greater than 0")

    room = HostelRoom(**payload.model_dump())
    db.add(room)
    commit_or_400(db, "Room already exists in this hostel block")
    db.refresh(room)
    return serialize_room(room, db)


@router.get("/rooms/bulk-import-template")
def bulk_import_rooms_template(
    current_user: User = Depends(require_roles(["Admin"])),
):
    return csv_template_response(
        ROOM_BULK_IMPORT_COLUMNS,
        {
            "block_name": "Block A",
            "room_no": "101",
            "floor": "1",
            "capacity": "4",
            "remarks": "",
        },
        "hostel_rooms_import_template.csv",
    )


@router.post("/rooms/bulk-import")
def bulk_import_rooms(
    file: UploadFile = File(...),
    dry_run: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    rows, unknown_columns = read_csv_upload(file, ROOM_BULK_IMPORT_COLUMNS)

    block_lookup = {
        block.block_name.strip().lower(): block.id
        for block in db.query(HostelBlock).all()
    }

    seen = set()
    errors = []
    to_create = []

    for row_index, cleaned in rows:
        block_name = cleaned.get("block_name")
        room_no = cleaned.get("room_no")
        if not block_name:
            errors.append({"row": row_index, "error": "block_name is required"})
            continue
        if not room_no:
            errors.append({"row": row_index, "error": "room_no is required"})
            continue

        block_id = block_lookup.get(block_name.strip().lower())
        if block_id is None:
            errors.append({"row": row_index, "error": f"No hostel block found named {block_name!r}"})
            continue

        key = (block_id, room_no.strip().lower())
        if key in seen:
            errors.append({"row": row_index, "error": f"Duplicate room in file: {block_name} / {room_no}"})
            continue
        if db.query(HostelRoom).filter(HostelRoom.block_id == block_id, HostelRoom.room_no == room_no).first():
            errors.append({"row": row_index, "error": f"Room already exists in this hostel block: {room_no}"})
            continue

        try:
            validated = HostelRoomCreate(
                block_id=block_id,
                room_no=room_no,
                floor=cleaned.get("floor"),
                capacity=int(cleaned["capacity"]) if cleaned.get("capacity") else 1,
                remarks=cleaned.get("remarks"),
            )
        except (ValidationError, ValueError) as exc:
            message = exc.errors()[0]["msg"] if isinstance(exc, ValidationError) else "capacity must be a whole number"
            errors.append({"row": row_index, "error": message})
            continue

        if validated.capacity <= 0:
            errors.append({"row": row_index, "error": "Room capacity must be greater than 0"})
            continue

        seen.add(key)
        to_create.append(validated)

    created_count = 0
    if not dry_run:
        for validated in to_create:
            db.add(HostelRoom(**validated.model_dump()))
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


@router.put("/rooms/{room_id}", response_model=HostelRoomResponse)
def update_room(
    room_id: int,
    payload: HostelRoomCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    room = get_or_404(db, HostelRoom, room_id, "Hostel room")
    get_or_404(db, HostelBlock, payload.block_id, "Hostel block")

    occupied = (
        db.query(HostelAllocation)
        .filter(HostelAllocation.room_id == room_id, HostelAllocation.status == "Active")
        .count()
    )

    if payload.capacity < occupied:
        raise HTTPException(
            status_code=400,
            detail="Room capacity cannot be less than active allocations",
        )

    for key, value in payload.model_dump().items():
        setattr(room, key, value)

    commit_or_400(db, "Room already exists in this hostel block")
    db.refresh(room)
    return serialize_room(room, db)


@router.delete("/rooms/{room_id}")
def delete_room(
    room_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    room = get_or_404(db, HostelRoom, room_id, "Hostel room")
    db.delete(room)
    db.commit()
    return {"message": "Hostel room deleted successfully"}


@router.get("/allocations/", response_model=list[HostelAllocationResponse])
def get_allocations(
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    query = db.query(HostelAllocation)

    if status:
        query = query.filter(HostelAllocation.status == status)

    allocations = query.order_by(HostelAllocation.id.desc()).all()
    return [serialize_allocation(allocation, db) for allocation in allocations]


@router.post("/allocations/", response_model=HostelAllocationResponse)
def create_allocation(
    payload: HostelAllocationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    get_or_404(db, Student, payload.student_id, "Student")
    room = get_or_404(db, HostelRoom, payload.room_id, "Hostel room")

    if payload.status == "Active":
        active_student = (
            db.query(HostelAllocation)
            .filter(
                HostelAllocation.student_id == payload.student_id,
                HostelAllocation.status == "Active",
            )
            .first()
        )

        if active_student:
            raise HTTPException(
                status_code=400,
                detail="Student already has an active hostel allocation",
            )

        occupied = (
            db.query(HostelAllocation)
            .filter(
                HostelAllocation.room_id == payload.room_id,
                HostelAllocation.status == "Active",
            )
            .count()
        )

        if occupied >= room.capacity:
            raise HTTPException(status_code=400, detail="Selected room is full")

    allocation = HostelAllocation(**payload.model_dump())
    db.add(allocation)
    commit_or_400(db, "This bed is already allocated")
    db.refresh(allocation)
    return serialize_allocation(allocation, db)


@router.put("/allocations/{allocation_id}", response_model=HostelAllocationResponse)
def update_allocation(
    allocation_id: int,
    payload: HostelAllocationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    allocation = get_or_404(db, HostelAllocation, allocation_id, "Hostel allocation")
    get_or_404(db, Student, payload.student_id, "Student")
    room = get_or_404(db, HostelRoom, payload.room_id, "Hostel room")

    if payload.status == "Active":
        active_student = (
            db.query(HostelAllocation)
            .filter(
                HostelAllocation.id != allocation_id,
                HostelAllocation.student_id == payload.student_id,
                HostelAllocation.status == "Active",
            )
            .first()
        )

        if active_student:
            raise HTTPException(
                status_code=400,
                detail="Student already has an active hostel allocation",
            )

        occupied = (
            db.query(HostelAllocation)
            .filter(
                HostelAllocation.id != allocation_id,
                HostelAllocation.room_id == payload.room_id,
                HostelAllocation.status == "Active",
            )
            .count()
        )

        if occupied >= room.capacity:
            raise HTTPException(status_code=400, detail="Selected room is full")

    for key, value in payload.model_dump().items():
        setattr(allocation, key, value)

    commit_or_400(db, "This bed is already allocated")
    db.refresh(allocation)
    return serialize_allocation(allocation, db)


@router.delete("/allocations/{allocation_id}")
def delete_allocation(
    allocation_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    allocation = get_or_404(db, HostelAllocation, allocation_id, "Hostel allocation")
    db.delete(allocation)
    db.commit()
    return {"message": "Hostel allocation deleted successfully"}
