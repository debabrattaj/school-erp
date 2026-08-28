"""Vehicle tracking: where the bus is, and whether that is where it should be.

Deliberately device-agnostic. Every tracker vendor speaks a different
protocol -- and most speak a binary one over a raw TCP socket that a cPanel
host cannot listen on -- but all of them, and any driver-phone app, can make
an HTTP POST. So ingest is an authenticated endpoint that a tracker or a
small on-prem relay calls, exactly as the biometric module does for
terminals.

Two honesty rules run through this file:

* **Distances are straight-line**, not road distance. That is good enough to
  decide "the bus is at the stop"; it is not a routing engine, and every
  arrival estimate says so.
* **Silence is unknown, not stationary.** A tracker that has stopped
  reporting is reported as an unknown position with an age, never as a bus
  sitting where it was last seen.
"""

import hashlib
import math
import secrets
from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app import models

TOKEN_BYTES = 32
EARTH_RADIUS_KM = 6371.0088

TRIP_DIRECTIONS = ("Pickup", "Drop")
TRIP_STATUSES = ("Scheduled", "Running", "Completed", "Cancelled")
ALERT_TYPES = ("over_speed", "no_signal", "stop_missed", "late_arrival")

# A device clock can drift, and a badly configured one can be hours out.
# Anything further ahead than this is refused rather than stored, because a
# future-dated fix would sit at the top of "latest position" for ever.
MAX_CLOCK_SKEW_MINUTES = 15


class TrackingError(Exception):
    """A tracking problem worth showing a human."""


def _now() -> datetime:
    return datetime.utcnow()


# ---------------------------------------------------------------------------
# Device credentials
# ---------------------------------------------------------------------------


def generate_device_token() -> tuple[str, str]:
    """Return (plaintext, hash). Only the hash is stored."""
    token = secrets.token_urlsafe(TOKEN_BYTES)
    return token, hash_device_token(token)


def hash_device_token(token: str) -> str:
    """Plain SHA-256.

    These are 256 bits of randomness rather than user-chosen secrets, so there
    is nothing to brute-force; a deliberately slow hash would only burn CPU on
    every position report, of which there is one every few seconds per bus.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_device_token(token: str, token_hash: str | None) -> bool:
    if not token or not token_hash:
        return False
    return secrets.compare_digest(hash_device_token(token), token_hash)


# ---------------------------------------------------------------------------
# Geometry
# ---------------------------------------------------------------------------


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in kilometres.

    Straight-line, not road distance. A bus that is 200m away as the crow
    flies may be a kilometre away by road, which is why this is used to decide
    proximity to a stop and never presented as a journey length.
    """
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(d_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2) ** 2
    )
    return 2 * EARTH_RADIUS_KM * math.asin(min(1.0, math.sqrt(a)))


def valid_coordinates(latitude: float | None, longitude: float | None) -> bool:
    """Reject the impossible, and reject exactly (0, 0).

    Null Island is what a tracker reports when it has no fix but sends anyway,
    and a bus shown in the Gulf of Guinea is worse than one shown as unknown.
    """
    if latitude is None or longitude is None:
        return False
    if not (-90.0 <= latitude <= 90.0) or not (-180.0 <= longitude <= 180.0):
        return False
    return not (abs(latitude) < 1e-9 and abs(longitude) < 1e-9)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------


def get_config(db: Session) -> models.TrackingConfig:
    config = db.query(models.TrackingConfig).first()
    if not config:
        config = models.TrackingConfig()
        db.add(config)
        db.flush()
    return config


# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------


def record_fix(
    db: Session,
    device: models.TrackerDevice,
    latitude: float,
    longitude: float,
    recorded_at: datetime | None = None,
    speed_kmph: float | None = None,
    heading: float | None = None,
    accuracy_m: float | None = None,
) -> dict:
    """Store one position report and act on it.

    Returns what was done, so a relay can tell a stored fix from a rejected or
    duplicate one instead of assuming success from a 200.
    """
    if not device.vehicle_id:
        raise TrackingError("This tracker is not assigned to a vehicle yet.")
    if not valid_coordinates(latitude, longitude):
        raise TrackingError("Those coordinates are not a usable position.")

    moment = recorded_at or _now()
    if moment > _now() + timedelta(minutes=MAX_CLOCK_SKEW_MINUTES):
        raise TrackingError("That fix is dated in the future; check the device clock.")

    device.last_seen_at = _now()

    existing = (
        db.query(models.VehicleLocation)
        .filter(
            models.VehicleLocation.vehicle_id == device.vehicle_id,
            models.VehicleLocation.recorded_at == moment,
        )
        .first()
    )
    if existing:
        # A tracker that retries a batch after a timeout must not double-log
        # the same fix, or the history shows a stationary bus.
        db.commit()
        return {"stored": False, "duplicate": True, "alerts": []}

    trip = current_trip(db, device.vehicle_id, moment.date())

    fix = models.VehicleLocation(
        vehicle_id=device.vehicle_id, device_id=device.id,
        trip_id=trip.id if trip else None,
        recorded_at=moment, received_at=_now(),
        latitude=latitude, longitude=longitude,
        speed_kmph=speed_kmph, heading=heading, accuracy_m=accuracy_m,
    )
    db.add(fix)
    db.flush()

    alerts = []
    config = get_config(db)
    if speed_kmph is not None and speed_kmph > config.over_speed_kmph:
        alerts.append(raise_alert(
            db, device.vehicle_id, "over_speed", "Critical",
            f"{round(speed_kmph)} km/h in a {config.over_speed_kmph} km/h limit",
            latitude=latitude, longitude=longitude, trip=trip, occurred_at=moment,
        ))

    arrivals = []
    if trip:
        arrivals = detect_stop_arrivals(db, trip, latitude, longitude, moment, config)

    db.commit()
    return {
        "stored": True, "duplicate": False,
        "trip_id": trip.id if trip else None,
        "alerts": [a.alert_type for a in alerts if a],
        "stops_reached": arrivals,
    }


# ---------------------------------------------------------------------------
# Trips
# ---------------------------------------------------------------------------


def current_trip(db: Session, vehicle_id: int, on_date: date) -> models.VehicleTrip | None:
    """The running trip for this vehicle today, if one has been started.

    Fixes arriving outside a running trip are still stored -- a bus moving to
    the depot is real -- they simply belong to no trip.
    """
    return (
        db.query(models.VehicleTrip)
        .filter(
            models.VehicleTrip.vehicle_id == vehicle_id,
            models.VehicleTrip.trip_date == on_date,
            models.VehicleTrip.status == "Running",
        )
        .first()
    )


def start_trip(db: Session, trip: models.VehicleTrip) -> models.VehicleTrip:
    if trip.status == "Running":
        raise TrackingError("This trip is already running.")
    if trip.status in ("Completed", "Cancelled"):
        raise TrackingError("This trip is finished; create a new one.")

    running = current_trip(db, trip.vehicle_id, trip.trip_date)
    if running and running.id != trip.id:
        raise TrackingError(
            f"{running.direction} trip {running.id} is still running for this vehicle. "
            "Two running trips would make every position report ambiguous."
        )

    trip.status = "Running"
    trip.started_at = _now()
    db.commit()
    db.refresh(trip)
    return trip


def end_trip(db: Session, trip: models.VehicleTrip) -> dict:
    if trip.status != "Running":
        raise TrackingError("This trip is not running.")

    trip.status = "Completed"
    trip.ended_at = _now()

    # A stop with no arrival by the end of the run was skipped. Recorded now
    # rather than guessed at during the run, because a bus can be late without
    # having missed anything.
    missed = missed_stops(db, trip)
    for stop in missed:
        raise_alert(
            db, trip.vehicle_id, "stop_missed", "Warning",
            f"No arrival recorded at {stop.stop_name}", trip=trip,
        )

    db.commit()
    db.refresh(trip)
    return {"missed_stops": [s.stop_name for s in missed]}


def route_stops(db: Session, route_id: int | None) -> list[models.TransportStop]:
    if not route_id:
        return []
    return (
        db.query(models.TransportStop)
        .filter(
            models.TransportStop.route_id == route_id,
            models.TransportStop.is_active == True,  # noqa: E712
        )
        .order_by(models.TransportStop.sort_order, models.TransportStop.id)
        .all()
    )


def missed_stops(db: Session, trip: models.VehicleTrip) -> list[models.TransportStop]:
    reached = {
        e.stop_id for e in
        db.query(models.TripStopEvent).filter(models.TripStopEvent.trip_id == trip.id).all()
    }
    return [s for s in route_stops(db, trip.route_id) if s.id not in reached]


# ---------------------------------------------------------------------------
# Geofencing
# ---------------------------------------------------------------------------


def _parse_clock(value: str | None, on_date: date) -> datetime | None:
    """Stop times are stored as free text like "07:45"; parse what we can."""
    text = (value or "").strip()
    if not text:
        return None
    for fmt in ("%H:%M", "%H:%M:%S", "%I:%M %p", "%I:%M%p"):
        try:
            parsed = datetime.strptime(text.upper(), fmt)
        except ValueError:
            continue
        return datetime.combine(on_date, parsed.time())
    # Unparseable is fine: the stop simply has no scheduled time to be late
    # against, which is better than inventing one.
    return None


def detect_stop_arrivals(
    db: Session,
    trip: models.VehicleTrip,
    latitude: float,
    longitude: float,
    moment: datetime,
    config: models.TrackingConfig,
) -> list[str]:
    """Record an arrival for any stop this fix is inside the geofence of.

    First arrival wins: a bus idling at a stop sends many fixes, and only the
    moment it got there is interesting. Stops without coordinates are skipped
    rather than treated as at (0, 0).
    """
    reached = []
    radius_km = (config.geofence_radius_m or 150) / 1000.0

    for stop in route_stops(db, trip.route_id):
        if not valid_coordinates(stop.latitude, stop.longitude):
            continue
        if haversine_km(latitude, longitude, stop.latitude, stop.longitude) > radius_km:
            continue

        existing = (
            db.query(models.TripStopEvent)
            .filter(
                models.TripStopEvent.trip_id == trip.id,
                models.TripStopEvent.stop_id == stop.id,
            )
            .first()
        )
        if existing:
            # Still here: extend the departure rather than logging a second
            # arrival.
            existing.departed_at = moment
            continue

        scheduled_text = stop.pickup_time if trip.direction == "Pickup" else stop.drop_time
        scheduled = _parse_clock(scheduled_text, trip.trip_date)
        delay = int(round((moment - scheduled).total_seconds() / 60)) if scheduled else None

        db.add(models.TripStopEvent(
            trip_id=trip.id, stop_id=stop.id, arrived_at=moment,
            detected_by="geofence", scheduled_time=scheduled_text,
            delay_minutes=delay,
        ))
        db.flush()
        reached.append(stop.stop_name)

        if delay is not None and delay > 10:
            raise_alert(
                db, trip.vehicle_id, "late_arrival", "Warning",
                f"{stop.stop_name} reached {delay} minutes late",
                latitude=latitude, longitude=longitude, trip=trip, occurred_at=moment,
            )

    return reached


# ---------------------------------------------------------------------------
# Reading positions back
# ---------------------------------------------------------------------------


def latest_fix(db: Session, vehicle_id: int) -> models.VehicleLocation | None:
    """The newest fix by the *device's* clock.

    Ordering by arrival time instead would let a tracker replaying an hour of
    buffered points drag the bus backwards along its own route.
    """
    return (
        db.query(models.VehicleLocation)
        .filter(models.VehicleLocation.vehicle_id == vehicle_id)
        .order_by(models.VehicleLocation.recorded_at.desc(), models.VehicleLocation.id.desc())
        .first()
    )


def position_report(db: Session, vehicle: models.TransportVehicle, as_of: datetime | None = None) -> dict:
    """Where a vehicle is, plus how much that answer should be trusted."""
    moment = as_of or _now()
    config = get_config(db)
    fix = latest_fix(db, vehicle.id)

    if not fix:
        return {
            "vehicle_id": vehicle.id, "vehicle_no": vehicle.vehicle_no,
            "status": "no_data", "latitude": None, "longitude": None,
            "recorded_at": None, "age_minutes": None, "speed_kmph": None,
        }

    age = max(0, int(round((moment - fix.recorded_at).total_seconds() / 60)))
    stale = age > (config.stale_after_minutes or 10)
    return {
        "vehicle_id": vehicle.id, "vehicle_no": vehicle.vehicle_no,
        # "stale" rather than a position presented as current: a tracker that
        # went quiet twenty minutes ago tells you nothing about now.
        "status": "stale" if stale else "live",
        "latitude": fix.latitude, "longitude": fix.longitude,
        "recorded_at": fix.recorded_at, "age_minutes": age,
        "speed_kmph": fix.speed_kmph, "heading": fix.heading,
        "trip_id": fix.trip_id,
    }


def recent_speed_kmph(db: Session, vehicle_id: int, samples: int = 5) -> float | None:
    """Average speed over the last few fixes, ignoring the ones at rest."""
    rows = (
        db.query(models.VehicleLocation)
        .filter(
            models.VehicleLocation.vehicle_id == vehicle_id,
            models.VehicleLocation.speed_kmph.isnot(None),
        )
        .order_by(models.VehicleLocation.recorded_at.desc())
        .limit(samples)
        .all()
    )
    moving = [r.speed_kmph for r in rows if (r.speed_kmph or 0) > 1]
    if not moving:
        return None
    return round(sum(moving) / len(moving), 1)


def eta_to_stop(db: Session, vehicle_id: int, stop: models.TransportStop) -> dict:
    """A rough arrival estimate, labelled as one.

    Straight-line distance over recent average speed. This is not a routing
    engine: it does not know about roads, turns, traffic or the order of the
    remaining stops, and it will read low on a route that doubles back. It is
    returned with its basis attached so a UI cannot present it as a promise,
    and it is None rather than a guess when the bus is not moving or has no
    recent fix.
    """
    unknown = {
        "stop_id": stop.id, "stop_name": stop.stop_name,
        "distance_km_straight_line": None,
        "eta_minutes_estimate": None,
        "basis": "straight-line distance over recent average speed; not road routing",
    }
    if not valid_coordinates(stop.latitude, stop.longitude):
        return {**unknown, "reason": "This stop has no coordinates on file."}

    fix = latest_fix(db, vehicle_id)
    if not fix:
        return {**unknown, "reason": "No position has been reported for this vehicle."}

    config = get_config(db)
    age = (_now() - fix.recorded_at).total_seconds() / 60
    if age > (config.stale_after_minutes or 10):
        return {**unknown, "reason": f"The last position is {int(age)} minutes old."}

    distance = round(haversine_km(fix.latitude, fix.longitude, stop.latitude, stop.longitude), 2)
    speed = recent_speed_kmph(db, vehicle_id)
    if not speed:
        return {
            **unknown, "distance_km_straight_line": distance,
            "reason": "The vehicle is not moving, so there is nothing to estimate from.",
        }

    return {
        "stop_id": stop.id, "stop_name": stop.stop_name,
        "distance_km_straight_line": distance,
        "eta_minutes_estimate": int(round(distance / speed * 60)),
        "basis": "straight-line distance over recent average speed; not road routing",
    }


# ---------------------------------------------------------------------------
# Alerts and housekeeping
# ---------------------------------------------------------------------------


def raise_alert(
    db: Session,
    vehicle_id: int,
    alert_type: str,
    severity: str = "Warning",
    detail: str | None = None,
    latitude: float | None = None,
    longitude: float | None = None,
    trip: models.VehicleTrip | None = None,
    occurred_at: datetime | None = None,
) -> models.TransportAlert:
    alert = models.TransportAlert(
        vehicle_id=vehicle_id, trip_id=trip.id if trip else None,
        alert_type=alert_type, severity=severity,
        occurred_at=occurred_at or _now(), detail=detail,
        latitude=latitude, longitude=longitude,
    )
    db.add(alert)
    db.flush()
    return alert


def silent_devices(db: Session, as_of: datetime | None = None) -> list[dict]:
    """Active trackers that have stopped reporting.

    A bus with a dead tracker is the case a parent notices first, so it is
    surfaced as its own list rather than left to be inferred from an absence.
    """
    moment = as_of or _now()
    config = get_config(db)
    cutoff = moment - timedelta(minutes=config.stale_after_minutes or 10)

    out = []
    devices = (
        db.query(models.TrackerDevice)
        .filter(models.TrackerDevice.is_active == True)  # noqa: E712
        .all()
    )
    for device in devices:
        if device.last_seen_at and device.last_seen_at >= cutoff:
            continue
        out.append({
            "device_id": device.id, "device_uid": device.device_uid,
            "label": device.label, "vehicle_id": device.vehicle_id,
            "last_seen_at": device.last_seen_at,
            "silent_minutes": (
                int(round((moment - device.last_seen_at).total_seconds() / 60))
                if device.last_seen_at else None
            ),
        })
    return out


def purge_old_locations(db: Session, as_of: date | None = None) -> int:
    """Drop position history past its retention window.

    A child's movement record does not need keeping for ever. Trips, stop
    events and alerts survive: those are the operational record, and they hold
    no continuous trail.
    """
    config = get_config(db)
    days = config.retain_locations_days or 30
    if days <= 0:
        return 0

    cutoff = datetime.combine(as_of or date.today(), datetime.min.time()) - timedelta(days=days)
    removed = (
        db.query(models.VehicleLocation)
        .filter(models.VehicleLocation.recorded_at < cutoff)
        .delete(synchronize_session=False)
    )
    db.commit()
    return removed
