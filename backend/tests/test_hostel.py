"""Tests for backend/app/routes/hostel.py (prefix /hostel).

"hostel" is an opt-in module in app.tenant.DEFAULT_FEATURES (defaults to
False) and is now gated via require_feature("hostel") on the router, so it
must be switched on for these tests.
"""

import io
import uuid

import pytest

TAG = uuid.uuid4().hex[:8]


def _set_hostel_enabled(enabled: bool):
    from app.tenant import CentralSessionLocal, get_account
    from app.tenant_models import SchoolFeature

    account = get_account("default")
    db = CentralSessionLocal()
    try:
        row = (
            db.query(SchoolFeature)
            .filter(
                SchoolFeature.account_id == account["id"],
                SchoolFeature.feature_key == "hostel",
            )
            .first()
        )
        if row:
            row.is_enabled = enabled
        else:
            db.add(SchoolFeature(
                account_id=account["id"], feature_key="hostel", is_enabled=enabled,
            ))
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def hostel_enabled(client):
    """Sold separately, so it ships disabled -- switch it on for these tests."""
    _set_hostel_enabled(True)
    yield
    _set_hostel_enabled(False)


def _student(client, auth, **overrides):
    payload = {
        "admission_no": f"HS-{TAG}-{uuid.uuid4().hex[:6]}",
        "first_name": "Hostel",
        "last_name": "Boarder",
    }
    payload.update(overrides)
    resp = client.post("/students/", json=payload, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _block(client, auth, **overrides):
    payload = {
        "block_name": f"Block-{TAG}-{uuid.uuid4().hex[:6]}",
        "hostel_type": "Boys",
    }
    payload.update(overrides)
    resp = client.post("/hostel/blocks/", json=payload, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _room(client, auth, block_id, **overrides):
    payload = {
        "block_id": block_id,
        "room_no": f"R-{uuid.uuid4().hex[:6]}",
        "capacity": 2,
    }
    payload.update(overrides)
    resp = client.post("/hostel/rooms/", json=payload, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_unauthenticated_request_is_rejected(client):
    resp = client.get("/hostel/blocks/")
    assert resp.status_code in (401, 403)


def test_block_crud_and_duplicate_name_rejected(client, auth):
    block = _block(client, auth)

    listed = client.get("/hostel/blocks/", headers=auth)
    assert listed.status_code == 200
    assert any(b["id"] == block["id"] for b in listed.json())

    dup = client.post("/hostel/blocks/", json={
        "block_name": block["block_name"],
        "hostel_type": "Girls",
    }, headers=auth)
    assert dup.status_code == 400

    updated = client.put(f"/hostel/blocks/{block['id']}", json={
        "block_name": block["block_name"],
        "hostel_type": "Girls",
        "warden_name": "Mrs. Rao",
    }, headers=auth)
    assert updated.status_code == 200, updated.text
    assert updated.json()["hostel_type"] == "Girls"
    assert updated.json()["warden_name"] == "Mrs. Rao"

    deleted = client.delete(f"/hostel/blocks/{block['id']}", headers=auth)
    assert deleted.status_code == 200

    missing = client.get(f"/hostel/rooms/", params={"block_id": block["id"]}, headers=auth)
    assert missing.status_code == 200
    assert missing.json() == []


def test_room_capacity_and_duplicate_validation(client, auth):
    block = _block(client, auth)

    bad_capacity = client.post("/hostel/rooms/", json={
        "block_id": block["id"], "room_no": "101", "capacity": 0,
    }, headers=auth)
    assert bad_capacity.status_code == 400

    room = _room(client, auth, block["id"], room_no="101", capacity=2)
    assert room["block_name"] == block["block_name"]
    assert room["available_beds"] == 2
    assert room["occupied_beds"] == 0

    dup_room = client.post("/hostel/rooms/", json={
        "block_id": block["id"], "room_no": "101", "capacity": 2,
    }, headers=auth)
    assert dup_room.status_code == 400

    missing_block = client.post("/hostel/rooms/", json={
        "block_id": 999999999, "room_no": "102", "capacity": 2,
    }, headers=auth)
    assert missing_block.status_code == 404


def test_allocation_lifecycle_and_capacity_enforcement(client, auth):
    block = _block(client, auth)
    room = _room(client, auth, block["id"], capacity=1)
    student1 = _student(client, auth)
    student2 = _student(client, auth)

    created = client.post("/hostel/allocations/", json={
        "student_id": student1["id"],
        "room_id": room["id"],
        "bed_no": "A1",
        "status": "Active",
    }, headers=auth)
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["student_name"]
    assert body["room_no"] == room["room_no"]
    assert body["block_name"] == block["block_name"]
    allocation_id = body["id"]

    room_after = client.get("/hostel/rooms/", params={"block_id": block["id"]}, headers=auth).json()
    assert room_after[0]["occupied_beds"] == 1
    assert room_after[0]["available_beds"] == 0

    # Room is full (capacity 1, one active allocation already).
    full = client.post("/hostel/allocations/", json={
        "student_id": student2["id"],
        "room_id": room["id"],
        "bed_no": "A2",
        "status": "Active",
    }, headers=auth)
    assert full.status_code == 400

    # Same student cannot get a second active allocation.
    same_student_room = _room(client, auth, block["id"], capacity=2)
    dup_student = client.post("/hostel/allocations/", json={
        "student_id": student1["id"],
        "room_id": same_student_room["id"],
        "bed_no": "B1",
        "status": "Active",
    }, headers=auth)
    assert dup_student.status_code == 400

    listed = client.get("/hostel/allocations/", params={"status": "Active"}, headers=auth)
    assert listed.status_code == 200
    assert any(a["id"] == allocation_id for a in listed.json())

    vacated = client.put(f"/hostel/allocations/{allocation_id}", json={
        "student_id": student1["id"],
        "room_id": room["id"],
        "bed_no": "A1",
        "status": "Vacated",
    }, headers=auth)
    assert vacated.status_code == 200, vacated.text
    assert vacated.json()["status"] == "Vacated"

    room_freed = client.get("/hostel/rooms/", params={"block_id": block["id"]}, headers=auth).json()
    assert room_freed[0]["occupied_beds"] == 0

    deleted = client.delete(f"/hostel/allocations/{allocation_id}", headers=auth)
    assert deleted.status_code == 200


def test_room_bulk_import_template_and_import(client, auth):
    block = _block(client, auth)

    template = client.get("/hostel/rooms/bulk-import-template", headers=auth)
    assert template.status_code == 200
    header = template.text.splitlines()[0]
    assert header == "block_name,room_no,floor,capacity,remarks"

    csv_body = (
        "block_name,room_no,floor,capacity,remarks\n"
        f"{block['block_name']},201,2,3,\n"
        f"{block['block_name']},202,2,4,\n"
    )
    files = {"file": ("rooms.csv", io.BytesIO(csv_body.encode("utf-8")), "text/csv")}

    dry = client.post("/hostel/rooms/bulk-import", params={"dry_run": True}, files=files, headers=auth)
    assert dry.status_code == 200, dry.text
    dry_body = dry.json()
    assert dry_body["dry_run"] is True
    assert dry_body["valid_rows"] == 2
    assert dry_body["created"] == 0

    rooms_before = client.get("/hostel/rooms/", params={"block_id": block["id"]}, headers=auth).json()
    assert rooms_before == []

    files = {"file": ("rooms.csv", io.BytesIO(csv_body.encode("utf-8")), "text/csv")}
    real = client.post("/hostel/rooms/bulk-import", files=files, headers=auth)
    assert real.status_code == 200, real.text
    assert real.json()["created"] == 2

    rooms_after = client.get("/hostel/rooms/", params={"block_id": block["id"]}, headers=auth).json()
    assert len(rooms_after) == 2
