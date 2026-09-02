"""Vehicle tracking: trackers, trips, live positions and alerts.

Ingest is authenticated by device credentials rather than a user session,
because it is called by hardware -- the same shape the biometric module uses
for attendance terminals.
"""

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import models
from app import tracking as tracking_logic
from app.database import get_db
from app.models import User
from app.security import require_roles
from app.tenant import require_feature

# Vehicle tracking rides on the transport module -- gate every route
# (including device ingest, which resolves its tenant from the same
# X-School-Code header require_feature reads) so the flag is a real
# entitlement check, not just a sidebar hint.
router = APIRouter(
    prefix="/transport-tracking",
    tags=["Vehicle Tracking"],
    dependencies=[Depends(require_feature("transport"))],
)

MANAGERS = ["Admin", "Principal", "Accounts"]
READERS = ["Admin", "Principal", "Accounts", "Teacher"]


# ---------------- payloads ----------------


class DeviceCreate(BaseModel):
    device_uid: str
    label: str | None = None
    vendor: str | None = None
    model: str | None = None
    vehicle_id: int | None = None
    notes: str | None = None


class DeviceUpdate(BaseModel):
    label: str | None = None
    vendor: str | None = None
    model: str | None = None
    vehicle_id: int | None = None
    is_active: bool | None = None
    notes: str | None = None


class Fix(BaseModel):
    latitude: float
    longitude: float
    recorded_at: datetime | None = None
    speed_kmph: float | None = None
    heading: float | None = None
    accuracy_m: float | None = None


class IngestRequest(BaseModel):
    fixes: list[Fix]


class TripCreate(BaseModel):
    vehicle_id: int
    route_id: int | None = None
    trip_date: date | None = None
    direction: str = "Pickup"
    driver_name: str | None = None
    driver_phone: str | None = None
    remarks: str | None = None


class StopLocation(BaseModel):
    latitude: float
    longitude: float


class ConfigUpdate(BaseModel):
    geofence_radius_m: int | None = None
    over_speed_kmph: int | None = None
    stale_after_minutes: int | None = None
    retain_locations_days: int | None = None


class AckNote(BaseModel):
    note: str | None = None


# ---------------- responses ----------------


def _device_response(d: models.TrackerDevice, token: str | None = None) -> dict:
    body = {
        "id": d.id, "device_uid": d.device_uid, "label": d.label,
        "vendor": d.vendor, "model": d.model, "vehicle_id": d.vehicle_id,
        "is_active": bool(d.is_active), "last_seen_at": d.last_seen_at,
        "notes": d.notes,
        "has_token": bool(d.auth_token_hash),
    }
    if token:
        # Shown once, at registration or rotation. Only the hash is stored, so
        # there is no way to show it again.
        body["auth_token"] = token
    return body


def _trip_response(t: models.VehicleTrip, extras: dict | None = None) -> dict:
    extras = extras or {}
    return {
        "id": t.id, "vehicle_id": t.vehicle_id,
        "vehicle_no": extras.get(("vehicle", t.vehicle_id)),
        "route_id": t.route_id, "route_name": extras.get(("route", t.route_id)),
        "trip_date": t.trip_date, "direction": t.direction, "status": t.status,
        "started_at": t.started_at, "ended_at": t.ended_at,
        "driver_name": t.driver_name, "driver_phone": t.driver_phone,
        "remarks": t.remarks,
    }


def _alert_response(a: models.TransportAlert, extras: dict | None = None) -> dict:
    extras = extras or {}
    return {
        "id": a.id, "vehicle_id": a.vehicle_id,
        "vehicle_no": extras.get(("vehicle", a.vehicle_id)),
        "trip_id": a.trip_id, "alert_type": a.alert_type,
        "severity": a.severity, "occurred_at": a.occurred_at,
        "detail": a.detail, "latitude": a.latitude, "longitude": a.longitude,
        "acknowledged_by": a.acknowledged_by, "acknowledged_at": a.acknowledged_at,
    }


def _extras(db: Session) -> dict:
    extras = {}
    for v in db.query(models.TransportVehicle).all():
        extras[("vehicle", v.id)] = v.vehicle_no
    for r in db.query(models.TransportRoute).all():
        extras[("route", r.id)] = r.route_name
    return extras


# ---------------- devices ----------------


@router.get("/devices")
def list_devices(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(READERS)),
):
    rows = db.query(models.TrackerDevice).order_by(models.TrackerDevice.id).all()
    return [_device_response(d) for d in rows]


@router.get("/devices/silent")
def list_silent_devices(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(READERS)),
):
    """Active trackers that have stopped reporting — a dead tracker is what a
    parent notices first."""
    return tracking_logic.silent_devices(db)


@router.post("/devices")
def create_device(
    payload: DeviceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    uid = payload.device_uid.strip()
    if not uid:
        raise HTTPException(status_code=400, detail="A device identifier is required.")
    if db.query(models.TrackerDevice).filter(models.TrackerDevice.device_uid == uid).first():
        raise HTTPException(status_code=400, detail="A tracker with this identifier already exists.")
    if payload.vehicle_id and not db.query(models.TransportVehicle).filter(
        models.TransportVehicle.id == payload.vehicle_id
    ).first():
        raise HTTPException(status_code=404, detail="Vehicle not found")

    token, token_hash = tracking_logic.generate_device_token()
    device = models.TrackerDevice(
        device_uid=uid, label=payload.label, vendor=payload.vendor,
        model=payload.model, vehicle_id=payload.vehicle_id,
        auth_token_hash=token_hash, is_active=True, notes=payload.notes,
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return _device_response(device, token)


def _get_device(db: Session, device_id: int) -> models.TrackerDevice:
    device = db.query(models.TrackerDevice).filter(models.TrackerDevice.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Tracker not found")
    return device


@router.put("/devices/{device_id}")
def update_device(
    device_id: int,
    payload: DeviceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    device = _get_device(db, device_id)
    data = payload.model_dump(exclude_unset=True)
    if data.get("vehicle_id") and not db.query(models.TransportVehicle).filter(
        models.TransportVehicle.id == data["vehicle_id"]
    ).first():
        raise HTTPException(status_code=404, detail="Vehicle not found")
    for field, value in data.items():
        setattr(device, field, value)
    db.commit()
    db.refresh(device)
    return _device_response(device)


@router.post("/devices/{device_id}/rotate-token")
def rotate_device_token(
    device_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """Issue a new credential. The old one stops working immediately."""
    device = _get_device(db, device_id)
    token, token_hash = tracking_logic.generate_device_token()
    device.auth_token_hash = token_hash
    db.commit()
    db.refresh(device)
    return _device_response(device, token)


@router.delete("/devices/{device_id}")
def delete_device(
    device_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    device = _get_device(db, device_id)
    # The fixes it reported stay: they are the record of where the bus went.
    db.query(models.VehicleLocation).filter(
        models.VehicleLocation.device_id == device.id
    ).update({models.VehicleLocation.device_id: None}, synchronize_session=False)
    db.delete(device)
    db.commit()
    return {"deleted": device_id}


# ---------------- ingest ----------------


@router.post("/ingest")
def ingest(
    payload: IngestRequest,
    db: Session = Depends(get_db),
    x_device_uid: str | None = Header(default=None),
    x_device_token: str | None = Header(default=None),
):
    """Accept position reports from a tracker or an on-prem relay.

    Authenticated by device credentials, NOT a user session: this is called by
    hardware. The tenant comes from the X-School-Code header, which the shared
    resolver already honours for requests without a JWT.

    A batch is accepted whole: trackers buffer while out of coverage and
    replay, so a POST of fifty backdated fixes is normal, not an error.
    """
    if not x_device_uid or not x_device_token:
        raise HTTPException(status_code=401, detail="Device credentials required")

    device = (
        db.query(models.TrackerDevice)
        .filter(models.TrackerDevice.device_uid == x_device_uid.strip())
        .first()
    )
    # The same error either way, so a caller cannot probe which ids are real.
    if not device or not tracking_logic.verify_device_token(x_device_token, device.auth_token_hash):
        raise HTTPException(status_code=401, detail="Invalid device credentials")
    if not device.is_active:
        raise HTTPException(status_code=403, detail="This tracker is disabled")

    stored = duplicates = rejected = 0
    reasons: list[str] = []
    alerts: list[str] = []
    stops: list[str] = []

    # Oldest first, so a replayed buffer builds the trail in the order it
    # happened and stop arrivals land in the right sequence.
    for fix in sorted(payload.fixes, key=lambda f: f.recorded_at or datetime.utcnow()):
        try:
            result = tracking_logic.record_fix(
                db, device, fix.latitude, fix.longitude,
                recorded_at=fix.recorded_at, speed_kmph=fix.speed_kmph,
                heading=fix.heading, accuracy_m=fix.accuracy_m,
            )
        except tracking_logic.TrackingError as exc:
            # One bad fix must not throw away the rest of the batch; a relay
            # that got a 400 would just resend the same bad point for ever.
            db.rollback()
            rejected += 1
            if str(exc) not in reasons:
                reasons.append(str(exc))
            continue

        if result["stored"]:
            stored += 1
            alerts.extend(result.get("alerts", []))
            stops.extend(result.get("stops_reached", []))
        elif result.get("duplicate"):
            duplicates += 1

    return {
        "device": device.device_uid,
        "stored": stored, "duplicates": duplicates, "rejected": rejected,
        "rejected_reasons": reasons,
        "alerts_raised": alerts, "stops_reached": stops,
    }


# ---------------- trips ----------------


@router.get("/trips")
def list_trips(
    on_date: date | None = None,
    vehicle_id: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(READERS)),
):
    query = db.query(models.VehicleTrip)
    query = query.filter(models.VehicleTrip.trip_date == (on_date or date.today()))
    if vehicle_id:
        query = query.filter(models.VehicleTrip.vehicle_id == vehicle_id)
    if status:
        query = query.filter(models.VehicleTrip.status == status)

    extras = _extras(db)
    rows = query.order_by(models.VehicleTrip.id).all()
    return [_trip_response(t, extras) for t in rows]


@router.post("/trips")
def create_trip(
    payload: TripCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    vehicle = (
        db.query(models.TransportVehicle)
        .filter(models.TransportVehicle.id == payload.vehicle_id)
        .first()
    )
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    if payload.direction not in tracking_logic.TRIP_DIRECTIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Direction must be one of: {', '.join(tracking_logic.TRIP_DIRECTIONS)}.",
        )

    trip_date = payload.trip_date or date.today()
    route_id = payload.route_id or vehicle.route_id
    existing = (
        db.query(models.VehicleTrip)
        .filter(
            models.VehicleTrip.vehicle_id == payload.vehicle_id,
            models.VehicleTrip.trip_date == trip_date,
            models.VehicleTrip.direction == payload.direction,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"This vehicle already has a {payload.direction} trip on {trip_date}.",
        )

    trip = models.VehicleTrip(
        vehicle_id=payload.vehicle_id, route_id=route_id, trip_date=trip_date,
        direction=payload.direction, status="Scheduled",
        driver_name=payload.driver_name or vehicle.driver_name,
        driver_phone=payload.driver_phone or vehicle.driver_phone,
        remarks=payload.remarks,
    )
    db.add(trip)
    db.commit()
    db.refresh(trip)
    return _trip_response(trip, _extras(db))


def _get_trip(db: Session, trip_id: int) -> models.VehicleTrip:
    trip = db.query(models.VehicleTrip).filter(models.VehicleTrip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


@router.post("/trips/{trip_id}/start")
def start_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    try:
        trip = tracking_logic.start_trip(db, _get_trip(db, trip_id))
    except tracking_logic.TrackingError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _trip_response(trip, _extras(db))


@router.post("/trips/{trip_id}/end")
def end_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """Close the run, flagging any stop it never reached."""
    try:
        result = tracking_logic.end_trip(db, _get_trip(db, trip_id))
    except tracking_logic.TrackingError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    trip = _get_trip(db, trip_id)
    return {"trip": _trip_response(trip, _extras(db)), **result}


@router.post("/trips/{trip_id}/cancel")
def cancel_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    trip = _get_trip(db, trip_id)
    if trip.status == "Completed":
        raise HTTPException(status_code=400, detail="This trip has already finished.")
    trip.status = "Cancelled"
    db.commit()
    db.refresh(trip)
    return _trip_response(trip, _extras(db))


@router.get("/trips/{trip_id}/stops")
def trip_stops(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(READERS)),
):
    """Every stop on the run, reached or not, in route order."""
    trip = _get_trip(db, trip_id)
    events = {
        e.stop_id: e for e in
        db.query(models.TripStopEvent).filter(models.TripStopEvent.trip_id == trip.id).all()
    }
    out = []
    for stop in tracking_logic.route_stops(db, trip.route_id):
        event = events.get(stop.id)
        out.append({
            "stop_id": stop.id, "stop_name": stop.stop_name,
            "sort_order": stop.sort_order,
            "scheduled_time": stop.pickup_time if trip.direction == "Pickup" else stop.drop_time,
            "has_coordinates": tracking_logic.valid_coordinates(stop.latitude, stop.longitude),
            "arrived_at": event.arrived_at if event else None,
            "departed_at": event.departed_at if event else None,
            "delay_minutes": event.delay_minutes if event else None,
            "detected_by": event.detected_by if event else None,
        })
    return out


# ---------------- live positions ----------------


@router.get("/live")
def live(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(READERS)),
):
    """Where every active vehicle is, each labelled live, stale or no_data."""
    vehicles = (
        db.query(models.TransportVehicle)
        .filter(models.TransportVehicle.is_active == True)  # noqa: E712
        .order_by(models.TransportVehicle.id)
        .all()
    )
    return [tracking_logic.position_report(db, v) for v in vehicles]


def _get_vehicle(db: Session, vehicle_id: int) -> models.TransportVehicle:
    vehicle = (
        db.query(models.TransportVehicle)
        .filter(models.TransportVehicle.id == vehicle_id)
        .first()
    )
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle


@router.get("/vehicles/{vehicle_id}/position")
def vehicle_position(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(READERS)),
):
    return tracking_logic.position_report(db, _get_vehicle(db, vehicle_id))


@router.get("/vehicles/{vehicle_id}/history")
def vehicle_history(
    vehicle_id: int,
    on_date: date | None = None,
    limit: int = 500,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(READERS)),
):
    """The trail for one day, oldest first."""
    _get_vehicle(db, vehicle_id)
    day = on_date or date.today()
    start = datetime.combine(day, datetime.min.time())

    rows = (
        db.query(models.VehicleLocation)
        .filter(
            models.VehicleLocation.vehicle_id == vehicle_id,
            models.VehicleLocation.recorded_at >= start,
            models.VehicleLocation.recorded_at < start + timedelta(days=1),
        )
        .order_by(models.VehicleLocation.recorded_at)
        .limit(max(1, min(limit, 5000)))
        .all()
    )
    return [
        {
            "recorded_at": r.recorded_at, "latitude": r.latitude,
            "longitude": r.longitude, "speed_kmph": r.speed_kmph,
            "heading": r.heading, "trip_id": r.trip_id,
        }
        for r in rows
    ]


@router.get("/vehicles/{vehicle_id}/eta")
def vehicle_eta(
    vehicle_id: int,
    stop_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(READERS)),
):
    """A rough arrival estimate, with its basis attached.

    Straight-line distance over recent average speed — not road routing. The
    `basis` field travels with the number so a UI cannot present it as a
    promise, and the estimate is null with a reason whenever it cannot be
    made honestly.
    """
    _get_vehicle(db, vehicle_id)
    stop = db.query(models.TransportStop).filter(models.TransportStop.id == stop_id).first()
    if not stop:
        raise HTTPException(status_code=404, detail="Stop not found")
    return tracking_logic.eta_to_stop(db, vehicle_id, stop)


# ---------------- stop coordinates ----------------


@router.put("/stops/{stop_id}/location")
def set_stop_location(
    stop_id: int,
    payload: StopLocation,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """Geocode a stop. Until this is set, the stop has no geofence and its
    arrivals must be recorded by hand."""
    stop = db.query(models.TransportStop).filter(models.TransportStop.id == stop_id).first()
    if not stop:
        raise HTTPException(status_code=404, detail="Stop not found")
    if not tracking_logic.valid_coordinates(payload.latitude, payload.longitude):
        raise HTTPException(status_code=400, detail="Those coordinates are not a usable position.")

    stop.latitude = payload.latitude
    stop.longitude = payload.longitude
    db.commit()
    db.refresh(stop)
    return {
        "stop_id": stop.id, "stop_name": stop.stop_name,
        "latitude": stop.latitude, "longitude": stop.longitude,
    }


# ---------------- alerts ----------------


@router.get("/alerts")
def list_alerts(
    on_date: date | None = None,
    vehicle_id: int | None = None,
    alert_type: str | None = None,
    unacknowledged_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(READERS)),
):
    query = db.query(models.TransportAlert)
    day = on_date or date.today()
    start = datetime.combine(day, datetime.min.time())
    query = query.filter(
        models.TransportAlert.occurred_at >= start,
        models.TransportAlert.occurred_at < start + timedelta(days=1),
    )
    if vehicle_id:
        query = query.filter(models.TransportAlert.vehicle_id == vehicle_id)
    if alert_type:
        query = query.filter(models.TransportAlert.alert_type == alert_type)
    if unacknowledged_only:
        query = query.filter(models.TransportAlert.acknowledged_at.is_(None))

    extras = _extras(db)
    rows = query.order_by(models.TransportAlert.occurred_at.desc()).all()
    return [_alert_response(a, extras) for a in rows]


@router.post("/alerts/{alert_id}/acknowledge")
def acknowledge_alert(
    alert_id: int,
    payload: AckNote,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    alert = db.query(models.TransportAlert).filter(models.TransportAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.acknowledged_by = current_user.email
    alert.acknowledged_at = datetime.utcnow()
    if payload.note:
        alert.detail = f"{alert.detail or ''}\n{payload.note}".strip()
    db.commit()
    db.refresh(alert)
    return _alert_response(alert, _extras(db))


# ---------------- config and housekeeping ----------------


def _config_response(config: models.TrackingConfig) -> dict:
    return {
        "geofence_radius_m": config.geofence_radius_m,
        "over_speed_kmph": config.over_speed_kmph,
        "stale_after_minutes": config.stale_after_minutes,
        "retain_locations_days": config.retain_locations_days,
    }


@router.get("/config")
def get_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(READERS)),
):
    config = tracking_logic.get_config(db)
    db.commit()
    return _config_response(config)


@router.put("/config")
def update_config(
    payload: ConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    config = tracking_logic.get_config(db)
    data = payload.model_dump(exclude_unset=True)

    if data.get("geofence_radius_m") is not None and data["geofence_radius_m"] < 10:
        raise HTTPException(
            status_code=400,
            detail="A geofence under 10m is smaller than consumer GPS error; arrivals would never register.",
        )
    if data.get("over_speed_kmph") is not None and data["over_speed_kmph"] < 5:
        raise HTTPException(status_code=400, detail="That speed limit would alert on walking pace.")
    if data.get("stale_after_minutes") is not None and data["stale_after_minutes"] < 1:
        raise HTTPException(status_code=400, detail="Positions must be allowed at least a minute to arrive.")

    for field, value in data.items():
        setattr(config, field, value)
    db.commit()
    db.refresh(config)
    return _config_response(config)


@router.post("/purge-history")
def purge_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """Drop position history past the retention window.

    Trips, stop events and alerts survive — those are the operational record.
    Only the continuous trail of where a child's bus went is dropped.
    """
    return {"removed": tracking_logic.purge_old_locations(db)}
