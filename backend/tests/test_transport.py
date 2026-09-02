"""Tests for backend/app/routes/transport.py (prefix /transport).

"transport" is an opt-in module in app.tenant.DEFAULT_FEATURES (defaults to
False) and is now gated via require_feature("transport") on the router, so
it must be switched on for these tests.
"""

import io
import uuid

import pytest

TAG = uuid.uuid4().hex[:8]


def _set_transport_enabled(enabled: bool):
    from app.tenant import CentralSessionLocal, get_account
    from app.tenant_models import SchoolFeature

    account = get_account("default")
    db = CentralSessionLocal()
    try:
        row = (
            db.query(SchoolFeature)
            .filter(
                SchoolFeature.account_id == account["id"],
                SchoolFeature.feature_key == "transport",
            )
            .first()
        )
        if row:
            row.is_enabled = enabled
        else:
            db.add(SchoolFeature(
                account_id=account["id"], feature_key="transport", is_enabled=enabled,
            ))
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def transport_enabled(client):
    """Sold separately, so it ships disabled -- switch it on for these tests."""
    _set_transport_enabled(True)
    yield
    _set_transport_enabled(False)


def _student(client, auth, **overrides):
    payload = {
        "admission_no": f"TR-{TAG}-{uuid.uuid4().hex[:6]}",
        "first_name": "Transport",
        "last_name": "Rider",
    }
    payload.update(overrides)
    resp = client.post("/students/", json=payload, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _route(client, auth, **overrides):
    payload = {"route_name": f"Route-{TAG}-{uuid.uuid4().hex[:6]}"}
    payload.update(overrides)
    resp = client.post("/transport/routes/", json=payload, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _vehicle(client, auth, **overrides):
    payload = {
        "vehicle_no": f"VEH-{TAG}-{uuid.uuid4().hex[:6]}",
        "capacity": 2,
    }
    payload.update(overrides)
    resp = client.post("/transport/vehicles/", json=payload, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _stop(client, auth, route_id, **overrides):
    payload = {"route_id": route_id, "stop_name": f"Stop-{uuid.uuid4().hex[:6]}"}
    payload.update(overrides)
    resp = client.post("/transport/stops/", json=payload, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_unauthenticated_request_is_rejected(client):
    resp = client.get("/transport/routes/")
    assert resp.status_code in (401, 403)


def test_route_crud_and_duplicate_name_rejected(client, auth):
    route = _route(client, auth)

    listed = client.get("/transport/routes/", headers=auth)
    assert listed.status_code == 200
    assert any(r["id"] == route["id"] for r in listed.json())

    dup = client.post("/transport/routes/", json={"route_name": route["route_name"]}, headers=auth)
    assert dup.status_code == 400

    updated = client.put(f"/transport/routes/{route['id']}", json={
        "route_name": route["route_name"],
        "monthly_fee": 500,
    }, headers=auth)
    assert updated.status_code == 200, updated.text
    assert updated.json()["monthly_fee"] == 500

    deleted = client.delete(f"/transport/routes/{route['id']}", headers=auth)
    assert deleted.status_code == 200


def test_vehicle_capacity_and_duplicate_validation(client, auth):
    bad_capacity = client.post("/transport/vehicles/", json={
        "vehicle_no": f"BAD-{uuid.uuid4().hex[:6]}", "capacity": 0,
    }, headers=auth)
    assert bad_capacity.status_code == 400

    vehicle = _vehicle(client, auth, capacity=1)
    assert vehicle["available_seats"] == 1
    assert vehicle["assigned_students"] == 0

    dup = client.post("/transport/vehicles/", json={
        "vehicle_no": vehicle["vehicle_no"], "capacity": 2,
    }, headers=auth)
    assert dup.status_code == 400


def test_stop_must_belong_to_declared_route(client, auth):
    route = _route(client, auth)
    other_route = _route(client, auth)
    stop = _stop(client, auth, route["id"])
    assert stop["route_name"] == route["route_name"]

    dup_stop = client.post("/transport/stops/", json={
        "route_id": route["id"], "stop_name": stop["stop_name"],
    }, headers=auth)
    assert dup_stop.status_code == 400

    listed = client.get("/transport/stops/", params={"route_id": route["id"]}, headers=auth)
    assert listed.status_code == 200
    assert any(s["id"] == stop["id"] for s in listed.json())
    assert all(s["id"] != stop["id"] for s in
               client.get("/transport/stops/", params={"route_id": other_route["id"]}, headers=auth).json())


def test_assignment_lifecycle_and_capacity_enforcement(client, auth):
    route = _route(client, auth)
    other_route = _route(client, auth)
    vehicle = _vehicle(client, auth, route_id=route["id"], capacity=1)
    stop = _stop(client, auth, route["id"])
    other_route_stop = _stop(client, auth, other_route["id"])
    student1 = _student(client, auth)
    student2 = _student(client, auth)

    # A pickup point from a different route than declared is rejected.
    mismatched_stop = client.post("/transport/assignments/", json={
        "student_id": student1["id"],
        "route_id": route["id"],
        "vehicle_id": vehicle["id"],
        "stop_id": other_route_stop["id"],
        "status": "Active",
    }, headers=auth)
    assert mismatched_stop.status_code == 400

    created = client.post("/transport/assignments/", json={
        "student_id": student1["id"],
        "route_id": route["id"],
        "vehicle_id": vehicle["id"],
        "stop_id": stop["id"],
        "status": "Active",
    }, headers=auth)
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["student_name"]
    assert body["route_name"] == route["route_name"]
    assert body["vehicle_no"] == vehicle["vehicle_no"]
    assert body["stop_name"] == stop["stop_name"]
    assignment_id = body["id"]

    # Vehicle capacity is 1 and already has an active assignment.
    full_vehicle = client.post("/transport/assignments/", json={
        "student_id": student2["id"],
        "route_id": route["id"],
        "vehicle_id": vehicle["id"],
        "status": "Active",
    }, headers=auth)
    assert full_vehicle.status_code == 400

    # The same student cannot have two active assignments.
    dup_student = client.post("/transport/assignments/", json={
        "student_id": student1["id"],
        "route_id": other_route["id"],
        "status": "Active",
    }, headers=auth)
    assert dup_student.status_code == 400

    listed = client.get("/transport/assignments/", params={"status": "Active"}, headers=auth)
    assert listed.status_code == 200
    assert any(a["id"] == assignment_id for a in listed.json())

    updated = client.put(f"/transport/assignments/{assignment_id}", json={
        "student_id": student1["id"],
        "route_id": route["id"],
        "vehicle_id": vehicle["id"],
        "stop_id": stop["id"],
        "status": "Inactive",
    }, headers=auth)
    assert updated.status_code == 200, updated.text
    assert updated.json()["status"] == "Inactive"

    # Now that the seat is freed, another student can take it.
    now_ok = client.post("/transport/assignments/", json={
        "student_id": student2["id"],
        "route_id": route["id"],
        "vehicle_id": vehicle["id"],
        "status": "Active",
    }, headers=auth)
    assert now_ok.status_code == 200, now_ok.text

    deleted = client.delete(f"/transport/assignments/{assignment_id}", headers=auth)
    assert deleted.status_code == 200


def test_vehicle_bulk_import_template_and_import(client, auth):
    route = _route(client, auth)

    template = client.get("/transport/vehicles/bulk-import-template", headers=auth)
    assert template.status_code == 200
    header = template.text.splitlines()[0]
    assert header == (
        "vehicle_no,route_name,vehicle_type,capacity,driver_name,"
        "driver_phone,attendant_name,remarks"
    )

    v1 = f"BULK-{TAG}-{uuid.uuid4().hex[:6]}"
    v2 = f"BULK-{TAG}-{uuid.uuid4().hex[:6]}"
    csv_body = (
        "vehicle_no,route_name,vehicle_type,capacity,driver_name,driver_phone,attendant_name,remarks\n"
        f"{v1},{route['route_name']},Bus,30,Driver One,9999900001,,\n"
        f"{v2},,Van,10,Driver Two,9999900002,,\n"
    )
    files = {"file": ("vehicles.csv", io.BytesIO(csv_body.encode("utf-8")), "text/csv")}

    dry = client.post("/transport/vehicles/bulk-import", params={"dry_run": True}, files=files, headers=auth)
    assert dry.status_code == 200, dry.text
    assert dry.json()["valid_rows"] == 2
    assert dry.json()["created"] == 0

    files = {"file": ("vehicles.csv", io.BytesIO(csv_body.encode("utf-8")), "text/csv")}
    real = client.post("/transport/vehicles/bulk-import", files=files, headers=auth)
    assert real.status_code == 200, real.text
    assert real.json()["created"] == 2

    imported = client.get("/transport/vehicles/", params={"route_id": route["id"]}, headers=auth).json()
    assert any(v["vehicle_no"] == v1 for v in imported)
