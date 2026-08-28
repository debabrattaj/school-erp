"""Vehicle tracking.

GPS data is messy in specific, predictable ways, and the tests here are about
those: trackers that buffer offline and replay an hour of stale fixes, ones
that report (0, 0) when they have no satellite lock, ones with a clock set
wrong, and ones that simply stop. Getting any of those wrong puts a bus on a
parent's map somewhere it is not.
"""

import uuid
from datetime import date, datetime, timedelta

import pytest


@pytest.fixture()
def db_session(client):
    from app.database import SessionLocal
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


# Two points about 1.2 km apart in Delhi, and one right next to the first.
DEPOT = (28.6139, 77.2090)
NEARBY = (28.6145, 77.2094)
FAR = (28.6250, 77.2200)


def _vehicle(db, route_id=None):
    from app.models import TransportVehicle
    vehicle = TransportVehicle(
        vehicle_no=f"DL-{uuid.uuid4().hex[:6]}", route_id=route_id,
        capacity=40, driver_name="Ram Singh", driver_phone="9876500100",
        is_active=True,
    )
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle


def _route_with_stop(db, lat=None, lng=None, pickup_time="07:30"):
    from app.models import TransportRoute, TransportStop
    route = TransportRoute(route_name=f"Route {uuid.uuid4().hex[:5]}", is_active=True)
    db.add(route)
    db.commit()
    db.refresh(route)

    stop = TransportStop(
        route_id=route.id, stop_name=f"Stop {uuid.uuid4().hex[:5]}",
        pickup_time=pickup_time, latitude=lat, longitude=lng,
        sort_order=1, is_active=True,
    )
    db.add(stop)
    db.commit()
    db.refresh(stop)
    return route, stop


def _device(client, auth, vehicle_id=None):
    payload = {"device_uid": f"TRK-{uuid.uuid4().hex[:8]}", "label": "Bus tracker"}
    if vehicle_id:
        payload["vehicle_id"] = vehicle_id
    resp = client.post("/transport-tracking/devices", json=payload, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _headers(device):
    return {"X-Device-Uid": device["device_uid"], "X-Device-Token": device["auth_token"]}


def _push(client, device, lat, lng, when=None, speed=None):
    fix = {"latitude": lat, "longitude": lng}
    if when is not None:
        fix["recorded_at"] = when.isoformat()
    if speed is not None:
        fix["speed_kmph"] = speed
    return client.post("/transport-tracking/ingest", json={"fixes": [fix]},
                       headers=_headers(device))


# --------------------------------------------------------------------------
# Device credentials
# --------------------------------------------------------------------------


def test_the_token_is_shown_once_and_never_again(client, auth, db_session):
    device = _device(client, auth)
    assert device["auth_token"]

    listed = client.get("/transport-tracking/devices", headers=auth).json()
    row = next(d for d in listed if d["id"] == device["id"])
    assert "auth_token" not in row
    assert row["has_token"] is True


def test_ingest_rejects_a_wrong_token(client, auth, db_session):
    vehicle = _vehicle(db_session)
    device = _device(client, auth, vehicle.id)

    resp = client.post("/transport-tracking/ingest", json={"fixes": [
        {"latitude": DEPOT[0], "longitude": DEPOT[1]},
    ]}, headers={"X-Device-Uid": device["device_uid"], "X-Device-Token": "nonsense"})
    assert resp.status_code == 401


def test_an_unknown_device_gets_the_same_error_as_a_bad_token(client, auth):
    """Different errors would let a caller probe which device ids are real."""
    unknown = client.post("/transport-tracking/ingest", json={"fixes": []},
                          headers={"X-Device-Uid": "no-such-device",
                                   "X-Device-Token": "nonsense"})
    assert unknown.status_code == 401
    assert unknown.json()["detail"] == "Invalid device credentials"


def test_rotating_the_token_retires_the_old_one(client, auth, db_session):
    vehicle = _vehicle(db_session)
    device = _device(client, auth, vehicle.id)
    old_headers = _headers(device)

    rotated = client.post(f"/transport-tracking/devices/{device['id']}/rotate-token",
                          headers=auth).json()
    assert rotated["auth_token"] != device["auth_token"]

    stale = client.post("/transport-tracking/ingest", json={"fixes": [
        {"latitude": DEPOT[0], "longitude": DEPOT[1]},
    ]}, headers=old_headers)
    assert stale.status_code == 401


def test_a_disabled_tracker_is_refused(client, auth, db_session):
    vehicle = _vehicle(db_session)
    device = _device(client, auth, vehicle.id)
    client.put(f"/transport-tracking/devices/{device['id']}",
               json={"is_active": False}, headers=auth)

    resp = _push(client, device, *DEPOT)
    assert resp.status_code == 403


# --------------------------------------------------------------------------
# What a tracker sends, and what we refuse
# --------------------------------------------------------------------------


def test_a_tracker_with_no_vehicle_has_nowhere_to_put_its_fixes(client, auth):
    device = _device(client, auth)
    body = _push(client, device, *DEPOT).json()
    assert body["stored"] == 0
    assert body["rejected"] == 1
    assert "not assigned to a vehicle" in body["rejected_reasons"][0]


def test_null_island_is_refused(client, auth, db_session):
    """(0, 0) is what a tracker reports with no satellite lock. A bus in the
    Gulf of Guinea is worse than a bus shown as unknown."""
    vehicle = _vehicle(db_session)
    device = _device(client, auth, vehicle.id)

    body = _push(client, device, 0.0, 0.0).json()
    assert body["stored"] == 0
    assert body["rejected"] == 1


def test_impossible_coordinates_are_refused(client, auth, db_session):
    vehicle = _vehicle(db_session)
    device = _device(client, auth, vehicle.id)
    assert _push(client, device, 95.0, 77.0).json()["rejected"] == 1


def test_a_fix_from_the_future_is_refused(client, auth, db_session):
    """A device with its clock set wrong would otherwise sit at the top of
    "latest position" for ever."""
    vehicle = _vehicle(db_session)
    device = _device(client, auth, vehicle.id)

    ahead = datetime.utcnow() + timedelta(hours=3)
    body = _push(client, device, *DEPOT, when=ahead).json()
    assert body["rejected"] == 1
    assert "device clock" in body["rejected_reasons"][0]


def test_one_bad_fix_does_not_throw_away_the_batch(client, auth, db_session):
    """A relay that got a 400 would just resend the same bad point for ever."""
    vehicle = _vehicle(db_session)
    device = _device(client, auth, vehicle.id)
    base = datetime.utcnow() - timedelta(minutes=5)

    resp = client.post("/transport-tracking/ingest", json={"fixes": [
        {"latitude": DEPOT[0], "longitude": DEPOT[1], "recorded_at": base.isoformat()},
        {"latitude": 0.0, "longitude": 0.0,
         "recorded_at": (base + timedelta(minutes=1)).isoformat()},
        {"latitude": NEARBY[0], "longitude": NEARBY[1],
         "recorded_at": (base + timedelta(minutes=2)).isoformat()},
    ]}, headers=_headers(device))
    body = resp.json()
    assert body["stored"] == 2
    assert body["rejected"] == 1


def test_replaying_the_same_fix_is_not_double_logged(client, auth, db_session):
    """Trackers retry after a timeout; a duplicated fix would show as a bus
    standing still."""
    vehicle = _vehicle(db_session)
    device = _device(client, auth, vehicle.id)
    when = datetime.utcnow() - timedelta(minutes=2)

    assert _push(client, device, *DEPOT, when=when).json()["stored"] == 1
    repeat = _push(client, device, *DEPOT, when=when).json()
    assert repeat["stored"] == 0
    assert repeat["duplicates"] == 1


# --------------------------------------------------------------------------
# Reading the position back
# --------------------------------------------------------------------------


def test_a_vehicle_with_no_fixes_reports_no_data(client, auth, db_session):
    vehicle = _vehicle(db_session)
    body = client.get(f"/transport-tracking/vehicles/{vehicle.id}/position",
                      headers=auth).json()
    assert body["status"] == "no_data"
    assert body["latitude"] is None


def test_a_recent_fix_reads_live(client, auth, db_session):
    vehicle = _vehicle(db_session)
    device = _device(client, auth, vehicle.id)
    _push(client, device, *DEPOT, when=datetime.utcnow() - timedelta(minutes=1))

    body = client.get(f"/transport-tracking/vehicles/{vehicle.id}/position",
                      headers=auth).json()
    assert body["status"] == "live"
    assert body["latitude"] == DEPOT[0]


def test_an_old_fix_reads_stale_not_current(client, auth, db_session):
    """A tracker that went quiet an hour ago tells you nothing about now."""
    vehicle = _vehicle(db_session)
    device = _device(client, auth, vehicle.id)
    _push(client, device, *DEPOT, when=datetime.utcnow() - timedelta(hours=1))

    body = client.get(f"/transport-tracking/vehicles/{vehicle.id}/position",
                      headers=auth).json()
    assert body["status"] == "stale"
    assert body["age_minutes"] >= 59


def test_a_replayed_buffer_does_not_drag_the_bus_backwards(client, auth, db_session):
    """A tracker back in coverage dumps an hour of old points. Ordering by
    arrival time instead of the device clock would move the bus back along
    its own route."""
    vehicle = _vehicle(db_session)
    device = _device(client, auth, vehicle.id)
    now = datetime.utcnow()

    _push(client, device, *FAR, when=now - timedelta(minutes=1))
    _push(client, device, *DEPOT, when=now - timedelta(minutes=45))

    body = client.get(f"/transport-tracking/vehicles/{vehicle.id}/position",
                      headers=auth).json()
    assert body["latitude"] == FAR[0]


def test_silent_trackers_are_listed(client, auth, db_session):
    vehicle = _vehicle(db_session)
    device = _device(client, auth, vehicle.id)

    silent = client.get("/transport-tracking/devices/silent", headers=auth).json()
    assert any(d["device_id"] == device["id"] for d in silent)

    _push(client, device, *DEPOT)
    silent = client.get("/transport-tracking/devices/silent", headers=auth).json()
    assert not any(d["device_id"] == device["id"] for d in silent)


# --------------------------------------------------------------------------
# Trips and geofencing
# --------------------------------------------------------------------------


def _running_trip(client, auth, db_session, stop_lat=None, stop_lng=None, pickup="07:30"):
    route, stop = _route_with_stop(db_session, stop_lat, stop_lng, pickup)
    vehicle = _vehicle(db_session, route.id)
    trip = client.post("/transport-tracking/trips", json={
        "vehicle_id": vehicle.id, "route_id": route.id, "direction": "Pickup",
    }, headers=auth).json()
    client.post(f"/transport-tracking/trips/{trip['id']}/start", headers=auth)
    return vehicle, route, stop, trip


def test_two_running_trips_for_one_vehicle_are_refused(client, auth, db_session):
    """Two would make every position report ambiguous."""
    vehicle, route, _, first = _running_trip(client, auth, db_session)
    second = client.post("/transport-tracking/trips", json={
        "vehicle_id": vehicle.id, "route_id": route.id, "direction": "Drop",
    }, headers=auth).json()

    resp = client.post(f"/transport-tracking/trips/{second['id']}/start", headers=auth)
    assert resp.status_code == 400
    assert "still running" in resp.json()["detail"]


def test_a_duplicate_run_on_the_same_day_is_refused(client, auth, db_session):
    vehicle, route, _, _ = _running_trip(client, auth, db_session)
    resp = client.post("/transport-tracking/trips", json={
        "vehicle_id": vehicle.id, "route_id": route.id, "direction": "Pickup",
    }, headers=auth)
    assert resp.status_code == 400


def test_arriving_inside_the_geofence_records_the_stop(client, auth, db_session):
    vehicle, _, stop, trip = _running_trip(client, auth, db_session, *NEARBY)
    device = _device(client, auth, vehicle.id)

    body = _push(client, device, *NEARBY).json()
    assert stop.stop_name in body["stops_reached"]

    stops = client.get(f"/transport-tracking/trips/{trip['id']}/stops", headers=auth).json()
    assert stops[0]["arrived_at"] is not None


def test_a_bus_still_far_away_does_not_register_an_arrival(client, auth, db_session):
    vehicle, _, _, trip = _running_trip(client, auth, db_session, *NEARBY)
    device = _device(client, auth, vehicle.id)

    assert _push(client, device, *FAR).json()["stops_reached"] == []
    stops = client.get(f"/transport-tracking/trips/{trip['id']}/stops", headers=auth).json()
    assert stops[0]["arrived_at"] is None


def test_idling_at_a_stop_records_one_arrival_and_extends_departure(client, auth, db_session):
    vehicle, _, _, trip = _running_trip(client, auth, db_session, *NEARBY)
    device = _device(client, auth, vehicle.id)
    now = datetime.utcnow()

    _push(client, device, *NEARBY, when=now - timedelta(minutes=3))
    _push(client, device, *NEARBY, when=now - timedelta(minutes=2))
    _push(client, device, *NEARBY, when=now - timedelta(minutes=1))

    stops = client.get(f"/transport-tracking/trips/{trip['id']}/stops", headers=auth).json()
    assert stops[0]["arrived_at"] is not None
    assert stops[0]["departed_at"] is not None
    assert stops[0]["departed_at"] > stops[0]["arrived_at"]


def test_a_stop_with_no_coordinates_is_skipped_not_placed_at_zero(client, auth, db_session):
    vehicle, _, _, trip = _running_trip(client, auth, db_session, None, None)
    device = _device(client, auth, vehicle.id)

    assert _push(client, device, *DEPOT).json()["stops_reached"] == []
    stops = client.get(f"/transport-tracking/trips/{trip['id']}/stops", headers=auth).json()
    assert stops[0]["has_coordinates"] is False


def test_ending_a_trip_flags_the_stops_it_never_reached(client, auth, db_session):
    vehicle, _, stop, trip = _running_trip(client, auth, db_session, *NEARBY)

    body = client.post(f"/transport-tracking/trips/{trip['id']}/end", headers=auth).json()
    assert stop.stop_name in body["missed_stops"]

    alerts = client.get("/transport-tracking/alerts", headers=auth).json()
    assert any(a["alert_type"] == "stop_missed" for a in alerts)


# --------------------------------------------------------------------------
# Alerts
# --------------------------------------------------------------------------


def test_speeding_raises_a_critical_alert(client, auth, db_session):
    vehicle = _vehicle(db_session)
    device = _device(client, auth, vehicle.id)

    body = _push(client, device, *DEPOT, speed=95).json()
    assert "over_speed" in body["alerts_raised"]

    alerts = client.get(f"/transport-tracking/alerts?vehicle_id={vehicle.id}",
                        headers=auth).json()
    speeding = next(a for a in alerts if a["alert_type"] == "over_speed")
    assert speeding["severity"] == "Critical"


def test_driving_within_the_limit_raises_nothing(client, auth, db_session):
    vehicle = _vehicle(db_session)
    device = _device(client, auth, vehicle.id)
    assert _push(client, device, *DEPOT, speed=40).json()["alerts_raised"] == []


def test_acknowledging_an_alert_records_who(client, auth, db_session):
    vehicle = _vehicle(db_session)
    device = _device(client, auth, vehicle.id)
    _push(client, device, *DEPOT, speed=95)

    alert = client.get(f"/transport-tracking/alerts?vehicle_id={vehicle.id}",
                       headers=auth).json()[0]
    acked = client.post(f"/transport-tracking/alerts/{alert['id']}/acknowledge",
                        json={"note": "Spoke to the driver"}, headers=auth).json()
    assert acked["acknowledged_by"] == "admin@school.com"

    remaining = client.get(
        f"/transport-tracking/alerts?vehicle_id={vehicle.id}&unacknowledged_only=true",
        headers=auth).json()
    assert not any(a["id"] == alert["id"] for a in remaining)


# --------------------------------------------------------------------------
# ETA: honest or absent
# --------------------------------------------------------------------------


def test_eta_is_none_with_no_position(client, auth, db_session):
    route, stop = _route_with_stop(db_session, *FAR)
    vehicle = _vehicle(db_session, route.id)

    body = client.get(
        f"/transport-tracking/vehicles/{vehicle.id}/eta?stop_id={stop.id}",
        headers=auth).json()
    assert body["eta_minutes_estimate"] is None
    assert "No position" in body["reason"]


def test_eta_is_none_when_the_bus_is_not_moving(client, auth, db_session):
    """There is nothing to estimate from, and a number would be invented."""
    route, stop = _route_with_stop(db_session, *FAR)
    vehicle = _vehicle(db_session, route.id)
    device = _device(client, auth, vehicle.id)
    _push(client, device, *DEPOT, speed=0)

    body = client.get(
        f"/transport-tracking/vehicles/{vehicle.id}/eta?stop_id={stop.id}",
        headers=auth).json()
    assert body["eta_minutes_estimate"] is None
    assert body["distance_km_straight_line"] > 0


def test_eta_is_none_for_a_stop_with_no_coordinates(client, auth, db_session):
    route, stop = _route_with_stop(db_session, None, None)
    vehicle = _vehicle(db_session, route.id)
    device = _device(client, auth, vehicle.id)
    _push(client, device, *DEPOT, speed=30)

    body = client.get(
        f"/transport-tracking/vehicles/{vehicle.id}/eta?stop_id={stop.id}",
        headers=auth).json()
    assert body["eta_minutes_estimate"] is None
    assert "no coordinates" in body["reason"]


def test_eta_carries_its_basis_so_it_cannot_be_sold_as_a_promise(client, auth, db_session):
    route, stop = _route_with_stop(db_session, *FAR)
    vehicle = _vehicle(db_session, route.id)
    device = _device(client, auth, vehicle.id)
    _push(client, device, *DEPOT, speed=30)

    body = client.get(
        f"/transport-tracking/vehicles/{vehicle.id}/eta?stop_id={stop.id}",
        headers=auth).json()
    assert body["eta_minutes_estimate"] > 0
    assert "not road routing" in body["basis"]


# --------------------------------------------------------------------------
# Parents
# --------------------------------------------------------------------------


def test_a_parent_sees_only_their_own_childs_bus(client, auth, db_session):
    """The portal guard is the one that decides which children a parent may
    look at; duplicating it here is how a parent follows another family's
    bus."""
    from app.models import ParentStudentLink, Student, TransportAssignment, User
    from app.security import hash_password

    route, stop = _route_with_stop(db_session, *NEARBY)
    vehicle = _vehicle(db_session, route.id)

    mine = Student(admission_no=f"BUS-{uuid.uuid4().hex[:6]}", first_name="Mine")
    theirs = Student(admission_no=f"BUS-{uuid.uuid4().hex[:6]}", first_name="Theirs")
    db_session.add_all([mine, theirs])
    db_session.commit()

    for student in (mine, theirs):
        db_session.add(TransportAssignment(
            student_id=student.id, route_id=route.id, vehicle_id=vehicle.id,
            stop_id=stop.id, status="Active",
        ))

    email = f"parent-{uuid.uuid4().hex[:6]}@example.com"
    parent = User(name="A Parent", email=email,
                  password_hash=hash_password("parentpass123"), role="Parent")
    db_session.add(parent)
    db_session.commit()
    db_session.add(ParentStudentLink(user_id=parent.id, student_id=mine.id,
                                     relationship="Father"))
    db_session.commit()

    token = client.post("/auth/login", json={
        "account_code": "default", "email": email, "password": "parentpass123",
    }).json()["access_token"]
    parent_auth = {"Authorization": f"Bearer {token}"}

    ok = client.get(f"/portal/students/{mine.id}/bus", headers=parent_auth)
    assert ok.status_code == 200
    assert ok.json()["assigned"] is True
    assert ok.json()["vehicle_no"] == vehicle.vehicle_no

    denied = client.get(f"/portal/students/{theirs.id}/bus", headers=parent_auth)
    assert denied.status_code == 403


def test_a_student_without_transport_is_told_so_plainly(client, auth, db_session):
    from app.models import Student
    student = Student(admission_no=f"WALK-{uuid.uuid4().hex[:6]}", first_name="Walker")
    db_session.add(student)
    db_session.commit()

    body = client.get(f"/portal/students/{student.id}/bus", headers=auth).json()
    assert body["assigned"] is False


# --------------------------------------------------------------------------
# Config and retention
# --------------------------------------------------------------------------


def test_a_geofence_smaller_than_gps_error_is_refused(client, auth):
    resp = client.put("/transport-tracking/config",
                      json={"geofence_radius_m": 3}, headers=auth)
    assert resp.status_code == 400
    assert "consumer GPS error" in resp.json()["detail"]


def test_purge_drops_old_trail_but_keeps_the_alerts(client, auth, db_session):
    """The continuous record of where a child's bus went does not need keeping
    for ever; the operational record does."""
    from app.models import VehicleLocation

    vehicle = _vehicle(db_session)
    device = _device(client, auth, vehicle.id)
    _push(client, device, *DEPOT, when=datetime.utcnow() - timedelta(days=90), speed=95)
    _push(client, device, *NEARBY, when=datetime.utcnow() - timedelta(minutes=2))

    removed = client.post("/transport-tracking/purge-history", headers=auth).json()["removed"]
    assert removed >= 1

    db_session.expire_all()
    kept = db_session.query(VehicleLocation).filter(
        VehicleLocation.vehicle_id == vehicle.id).count()
    assert kept == 1

    alerts = client.get(
        f"/transport-tracking/alerts?vehicle_id={vehicle.id}"
        f"&on_date={(date.today() - timedelta(days=90)).isoformat()}",
        headers=auth).json()
    assert any(a["alert_type"] == "over_speed" for a in alerts)


def test_tracking_paths_resolve_to_their_own_module(client):
    """/transport-tracking must not fall through to the transport module's
    permission, or granting route management would hand over the map too."""
    from app.permissions import feature_for_path

    assert feature_for_path("/transport-tracking/live") == "vehicle_tracking"
    assert feature_for_path("/transport/routes") == "transport"


# --------------------------------------------------------------------------
# The housekeeping cron
# --------------------------------------------------------------------------


def test_housekeeping_alerts_once_per_day_for_a_silent_tracker(client, auth, db_session):
    """A tracker dead all term must not produce an alert every run, or the
    alert list becomes something nobody reads."""
    import os

    from app.models import TransportAlert
    from run_tracking_housekeeping import run_tenant

    vehicle = _vehicle(db_session)
    _device(client, auth, vehicle.id)   # registered, never reports

    url = os.environ["DEFAULT_SCHOOL_DATABASE_URL"]
    first = run_tenant(url)
    assert first["no_signal_alerts"] >= 1

    second = run_tenant(url)
    assert second["no_signal_alerts"] == 0

    db_session.expire_all()
    alerts = db_session.query(TransportAlert).filter(
        TransportAlert.vehicle_id == vehicle.id,
        TransportAlert.alert_type == "no_signal",
    ).count()
    assert alerts == 1


def test_housekeeping_dry_run_writes_nothing(client, auth, db_session):
    import os

    from app.models import TransportAlert
    from run_tracking_housekeeping import run_tenant

    vehicle = _vehicle(db_session)
    _device(client, auth, vehicle.id)

    url = os.environ["DEFAULT_SCHOOL_DATABASE_URL"]
    before = db_session.query(TransportAlert).count()
    run_tenant(url, dry_run=True)

    db_session.expire_all()
    assert db_session.query(TransportAlert).filter(
        TransportAlert.vehicle_id == vehicle.id).count() == 0
    assert db_session.query(TransportAlert).count() == before
