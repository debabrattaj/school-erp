from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

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
