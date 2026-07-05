from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Student,
    TransportAssignment,
    TransportRoute,
    TransportStop,
    TransportVehicle,
    User,
)
from app.schemas import (
    TransportAssignmentCreate,
    TransportAssignmentResponse,
    TransportRouteCreate,
    TransportRouteResponse,
    TransportStopCreate,
    TransportStopResponse,
    TransportVehicleCreate,
    TransportVehicleResponse,
)
from app.security import require_roles

router = APIRouter(prefix="/transport", tags=["Transport"])


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


def get_student_name(student: Student):
    name = (
        getattr(student, "student_name", None)
        or f"{student.first_name or ''} {student.last_name or ''}".strip()
    )
    return name or f"Student ID: {student.id}"


def serialize_vehicle(vehicle: TransportVehicle, db: Session):
    route = None
    if vehicle.route_id:
        route = db.query(TransportRoute).filter(TransportRoute.id == vehicle.route_id).first()

    assigned = (
        db.query(TransportAssignment)
        .filter(
            TransportAssignment.vehicle_id == vehicle.id,
            TransportAssignment.status == "Active",
        )
        .count()
    )

    return {
        "id": vehicle.id,
        "vehicle_no": vehicle.vehicle_no,
        "route_id": vehicle.route_id,
        "vehicle_type": vehicle.vehicle_type,
        "capacity": vehicle.capacity,
        "driver_name": vehicle.driver_name,
        "driver_phone": vehicle.driver_phone,
        "attendant_name": vehicle.attendant_name,
        "is_active": vehicle.is_active,
        "remarks": vehicle.remarks,
        "route_name": route.route_name if route else "-",
        "assigned_students": assigned,
        "available_seats": max((vehicle.capacity or 0) - assigned, 0),
    }


def serialize_stop(stop: TransportStop, db: Session):
    route = db.query(TransportRoute).filter(TransportRoute.id == stop.route_id).first()

    return {
        "id": stop.id,
        "route_id": stop.route_id,
        "stop_name": stop.stop_name,
        "pickup_time": stop.pickup_time,
        "drop_time": stop.drop_time,
        "sort_order": stop.sort_order,
        "is_active": stop.is_active,
        "remarks": stop.remarks,
        "route_name": route.route_name if route else "-",
    }


def serialize_assignment(assignment: TransportAssignment, db: Session):
    student = db.query(Student).filter(Student.id == assignment.student_id).first()
    route = db.query(TransportRoute).filter(TransportRoute.id == assignment.route_id).first()
    vehicle = None
    stop = None

    if assignment.vehicle_id:
        vehicle = (
            db.query(TransportVehicle)
            .filter(TransportVehicle.id == assignment.vehicle_id)
            .first()
        )

    if assignment.stop_id:
        stop = db.query(TransportStop).filter(TransportStop.id == assignment.stop_id).first()

    return {
        "id": assignment.id,
        "student_id": assignment.student_id,
        "route_id": assignment.route_id,
        "vehicle_id": assignment.vehicle_id,
        "stop_id": assignment.stop_id,
        "start_date": assignment.start_date,
        "end_date": assignment.end_date,
        "status": assignment.status,
        "remarks": assignment.remarks,
        "student_name": get_student_name(student) if student else "-",
        "admission_no": student.admission_no if student else None,
        "route_name": route.route_name if route else "-",
        "vehicle_no": vehicle.vehicle_no if vehicle else "-",
        "stop_name": stop.stop_name if stop else "-",
    }


def validate_assignment_payload(
    db: Session,
    payload: TransportAssignmentCreate,
    assignment_id: int | None = None,
):
    get_or_404(db, Student, payload.student_id, "Student")
    get_or_404(db, TransportRoute, payload.route_id, "Transport route")

    vehicle = None
    if payload.vehicle_id:
        vehicle = get_or_404(db, TransportVehicle, payload.vehicle_id, "Vehicle")
        if vehicle.route_id and vehicle.route_id != payload.route_id:
            raise HTTPException(
                status_code=400,
                detail="Selected vehicle is assigned to a different route",
            )

    if payload.stop_id:
        stop = get_or_404(db, TransportStop, payload.stop_id, "Pickup point")
        if stop.route_id != payload.route_id:
            raise HTTPException(
                status_code=400,
                detail="Selected pickup point does not belong to this route",
            )

    if payload.status == "Active":
        active_student_query = db.query(TransportAssignment).filter(
            TransportAssignment.student_id == payload.student_id,
            TransportAssignment.status == "Active",
        )
        if assignment_id:
            active_student_query = active_student_query.filter(
                TransportAssignment.id != assignment_id
            )

        if active_student_query.first():
            raise HTTPException(
                status_code=400,
                detail="Student already has an active transport assignment",
            )

        if vehicle:
            assigned_query = db.query(TransportAssignment).filter(
                TransportAssignment.vehicle_id == vehicle.id,
                TransportAssignment.status == "Active",
            )
            if assignment_id:
                assigned_query = assigned_query.filter(
                    TransportAssignment.id != assignment_id
                )

            if assigned_query.count() >= vehicle.capacity:
                raise HTTPException(status_code=400, detail="Selected vehicle is full")


@router.get("/routes/", response_model=list[TransportRouteResponse])
def get_routes(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts"])),
):
    return db.query(TransportRoute).order_by(TransportRoute.id.desc()).all()


@router.post("/routes/", response_model=TransportRouteResponse)
def create_route(
    payload: TransportRouteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    route = TransportRoute(**payload.model_dump())
    db.add(route)
    commit_or_400(db, "Transport route with this name already exists")
    db.refresh(route)
    return route


@router.put("/routes/{route_id}", response_model=TransportRouteResponse)
def update_route(
    route_id: int,
    payload: TransportRouteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    route = get_or_404(db, TransportRoute, route_id, "Transport route")

    for key, value in payload.model_dump().items():
        setattr(route, key, value)

    commit_or_400(db, "Transport route with this name already exists")
    db.refresh(route)
    return route


@router.delete("/routes/{route_id}")
def delete_route(
    route_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    route = get_or_404(db, TransportRoute, route_id, "Transport route")
    db.delete(route)
    db.commit()
    return {"message": "Transport route deleted successfully"}


@router.get("/vehicles/", response_model=list[TransportVehicleResponse])
def get_vehicles(
    route_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts"])),
):
    query = db.query(TransportVehicle)

    if route_id:
        query = query.filter(TransportVehicle.route_id == route_id)

    vehicles = query.order_by(TransportVehicle.id.desc()).all()
    return [serialize_vehicle(vehicle, db) for vehicle in vehicles]


@router.post("/vehicles/", response_model=TransportVehicleResponse)
def create_vehicle(
    payload: TransportVehicleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    if payload.route_id:
        get_or_404(db, TransportRoute, payload.route_id, "Transport route")

    if payload.capacity <= 0:
        raise HTTPException(status_code=400, detail="Vehicle capacity must be greater than 0")

    vehicle = TransportVehicle(**payload.model_dump())
    db.add(vehicle)
    commit_or_400(db, "Vehicle with this number already exists")
    db.refresh(vehicle)
    return serialize_vehicle(vehicle, db)


@router.put("/vehicles/{vehicle_id}", response_model=TransportVehicleResponse)
def update_vehicle(
    vehicle_id: int,
    payload: TransportVehicleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    vehicle = get_or_404(db, TransportVehicle, vehicle_id, "Vehicle")

    if payload.route_id:
        get_or_404(db, TransportRoute, payload.route_id, "Transport route")

    assigned = (
        db.query(TransportAssignment)
        .filter(
            TransportAssignment.vehicle_id == vehicle_id,
            TransportAssignment.status == "Active",
        )
        .count()
    )
    if payload.capacity < assigned:
        raise HTTPException(
            status_code=400,
            detail="Vehicle capacity cannot be less than active assignments",
        )

    for key, value in payload.model_dump().items():
        setattr(vehicle, key, value)

    commit_or_400(db, "Vehicle with this number already exists")
    db.refresh(vehicle)
    return serialize_vehicle(vehicle, db)


@router.delete("/vehicles/{vehicle_id}")
def delete_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    vehicle = get_or_404(db, TransportVehicle, vehicle_id, "Vehicle")
    db.delete(vehicle)
    db.commit()
    return {"message": "Vehicle deleted successfully"}


@router.get("/stops/", response_model=list[TransportStopResponse])
def get_stops(
    route_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts"])),
):
    query = db.query(TransportStop)

    if route_id:
        query = query.filter(TransportStop.route_id == route_id)

    stops = query.order_by(TransportStop.sort_order.asc(), TransportStop.id.desc()).all()
    return [serialize_stop(stop, db) for stop in stops]


@router.post("/stops/", response_model=TransportStopResponse)
def create_stop(
    payload: TransportStopCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    get_or_404(db, TransportRoute, payload.route_id, "Transport route")
    stop = TransportStop(**payload.model_dump())
    db.add(stop)
    commit_or_400(db, "Pickup point already exists on this route")
    db.refresh(stop)
    return serialize_stop(stop, db)


@router.put("/stops/{stop_id}", response_model=TransportStopResponse)
def update_stop(
    stop_id: int,
    payload: TransportStopCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    stop = get_or_404(db, TransportStop, stop_id, "Pickup point")
    get_or_404(db, TransportRoute, payload.route_id, "Transport route")

    for key, value in payload.model_dump().items():
        setattr(stop, key, value)

    commit_or_400(db, "Pickup point already exists on this route")
    db.refresh(stop)
    return serialize_stop(stop, db)


@router.delete("/stops/{stop_id}")
def delete_stop(
    stop_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    stop = get_or_404(db, TransportStop, stop_id, "Pickup point")
    db.delete(stop)
    db.commit()
    return {"message": "Pickup point deleted successfully"}


@router.get("/assignments/", response_model=list[TransportAssignmentResponse])
def get_assignments(
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts"])),
):
    query = db.query(TransportAssignment)

    if status:
        query = query.filter(TransportAssignment.status == status)

    assignments = query.order_by(TransportAssignment.id.desc()).all()
    return [serialize_assignment(assignment, db) for assignment in assignments]


@router.post("/assignments/", response_model=TransportAssignmentResponse)
def create_assignment(
    payload: TransportAssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    validate_assignment_payload(db, payload)
    assignment = TransportAssignment(**payload.model_dump())
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return serialize_assignment(assignment, db)


@router.put("/assignments/{assignment_id}", response_model=TransportAssignmentResponse)
def update_assignment(
    assignment_id: int,
    payload: TransportAssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    assignment = get_or_404(db, TransportAssignment, assignment_id, "Transport assignment")
    validate_assignment_payload(db, payload, assignment_id)

    for key, value in payload.model_dump().items():
        setattr(assignment, key, value)

    db.commit()
    db.refresh(assignment)
    return serialize_assignment(assignment, db)


@router.delete("/assignments/{assignment_id}")
def delete_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    assignment = get_or_404(db, TransportAssignment, assignment_id, "Transport assignment")
    db.delete(assignment)
    db.commit()
    return {"message": "Transport assignment deleted successfully"}
