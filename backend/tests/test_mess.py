"""Tests for backend/app/routes/mess.py (prefix /mess).

"mess_management" is an opt-in module in app.tenant.DEFAULT_FEATURES
(defaults to False) and is now gated via require_feature("mess_management")
on the router, so it must be switched on for these tests.
"""

import uuid

import pytest

TAG = uuid.uuid4().hex[:8]


def _set_mess_enabled(enabled: bool):
    from app.tenant import CentralSessionLocal, get_account
    from app.tenant_models import SchoolFeature

    account = get_account("default")
    db = CentralSessionLocal()
    try:
        row = (
            db.query(SchoolFeature)
            .filter(
                SchoolFeature.account_id == account["id"],
                SchoolFeature.feature_key == "mess_management",
            )
            .first()
        )
        if row:
            row.is_enabled = enabled
        else:
            db.add(SchoolFeature(
                account_id=account["id"], feature_key="mess_management", is_enabled=enabled,
            ))
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def mess_enabled(client):
    """Sold separately, so it ships disabled -- switch it on for these tests."""
    _set_mess_enabled(True)
    yield
    _set_mess_enabled(False)


def _student(client, auth, **overrides):
    payload = {
        "admission_no": f"MS-{TAG}-{uuid.uuid4().hex[:6]}",
        "first_name": "Mess",
        "last_name": "Diner",
    }
    payload.update(overrides)
    resp = client.post("/students/", json=payload, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_unauthenticated_request_is_rejected(client):
    resp = client.get("/mess/menus/")
    assert resp.status_code in (401, 403)


def test_menu_crud_and_validation(client, auth):
    menu_date = "2026-02-01"
    created = client.post("/mess/menus/", json={
        "menu_date": menu_date,
        "meal_type": "Lunch",
        "menu_items": "Rice, Dal, Sabzi",
    }, headers=auth)
    assert created.status_code == 200, created.text
    menu = created.json()
    assert menu["is_published"] is True

    blank_items = client.post("/mess/menus/", json={
        "menu_date": menu_date,
        "meal_type": "Dinner",
        "menu_items": "   ",
    }, headers=auth)
    assert blank_items.status_code == 400

    dup = client.post("/mess/menus/", json={
        "menu_date": menu_date,
        "meal_type": "Lunch",
        "menu_items": "Roti, Curry",
    }, headers=auth)
    assert dup.status_code == 400

    listed = client.get("/mess/menus/", params={"menu_date": menu_date}, headers=auth)
    assert listed.status_code == 200
    assert any(m["id"] == menu["id"] for m in listed.json())

    updated = client.put(f"/mess/menus/{menu['id']}", json={
        "menu_date": menu_date,
        "meal_type": "Lunch",
        "menu_items": "Rice, Dal, Paneer",
        "is_published": False,
    }, headers=auth)
    assert updated.status_code == 200, updated.text
    assert updated.json()["menu_items"] == "Rice, Dal, Paneer"
    assert updated.json()["is_published"] is False

    deleted = client.delete(f"/mess/menus/{menu['id']}", headers=auth)
    assert deleted.status_code == 200

    still_listed = client.get("/mess/menus/", params={"menu_date": menu_date}, headers=auth)
    assert all(m["id"] != menu["id"] for m in still_listed.json())


def test_attendance_lifecycle_and_duplicate_rejected(client, auth):
    student = _student(client, auth)
    meal_date = "2026-02-02"

    missing_student = client.post("/mess/attendance/", json={
        "student_id": 999999999,
        "meal_date": meal_date,
        "meal_type": "Breakfast",
    }, headers=auth)
    assert missing_student.status_code == 404

    created = client.post("/mess/attendance/", json={
        "student_id": student["id"],
        "meal_date": meal_date,
        "meal_type": "Breakfast",
        "status": "Present",
    }, headers=auth)
    assert created.status_code == 200, created.text
    record = created.json()
    assert record["student_name"]
    assert record["admission_no"] == student["admission_no"]

    dup = client.post("/mess/attendance/", json={
        "student_id": student["id"],
        "meal_date": meal_date,
        "meal_type": "Breakfast",
        "status": "Absent",
    }, headers=auth)
    assert dup.status_code == 400

    filtered = client.get(
        "/mess/attendance/",
        params={"meal_date": meal_date, "meal_type": "Breakfast", "status": "Present"},
        headers=auth,
    )
    assert filtered.status_code == 200
    assert any(r["id"] == record["id"] for r in filtered.json())

    updated = client.put(f"/mess/attendance/{record['id']}", json={
        "student_id": student["id"],
        "meal_date": meal_date,
        "meal_type": "Breakfast",
        "status": "Absent",
        "remarks": "Sick leave",
    }, headers=auth)
    assert updated.status_code == 200, updated.text
    assert updated.json()["status"] == "Absent"

    deleted = client.delete(f"/mess/attendance/{record['id']}", headers=auth)
    assert deleted.status_code == 200

    missing_after_delete = client.put(f"/mess/attendance/{record['id']}", json={
        "student_id": student["id"],
        "meal_date": meal_date,
        "meal_type": "Breakfast",
        "status": "Present",
    }, headers=auth)
    assert missing_after_delete.status_code == 404
