"""Tests for backend/app/routes/health_infirmary.py (prefix /health-infirmary).

"health_infirmary" is an opt-in module in app.tenant.DEFAULT_FEATURES
(defaults to False) and is now gated via require_feature("health_infirmary")
on the router, so it must be switched on for these tests.
"""

import uuid

import pytest

TAG = uuid.uuid4().hex[:8]


def _set_health_infirmary_enabled(enabled: bool):
    from app.tenant import CentralSessionLocal, get_account
    from app.tenant_models import SchoolFeature

    account = get_account("default")
    db = CentralSessionLocal()
    try:
        row = (
            db.query(SchoolFeature)
            .filter(
                SchoolFeature.account_id == account["id"],
                SchoolFeature.feature_key == "health_infirmary",
            )
            .first()
        )
        if row:
            row.is_enabled = enabled
        else:
            db.add(SchoolFeature(
                account_id=account["id"], feature_key="health_infirmary", is_enabled=enabled,
            ))
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def health_infirmary_enabled(client):
    """Sold separately, so it ships disabled -- switch it on for these tests."""
    _set_health_infirmary_enabled(True)
    yield
    _set_health_infirmary_enabled(False)


def _student(client, auth, **overrides):
    payload = {
        "admission_no": f"HI-{TAG}-{uuid.uuid4().hex[:6]}",
        "first_name": "Infirmary",
        "last_name": "Patient",
    }
    payload.update(overrides)
    resp = client.post("/students/", json=payload, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_unauthenticated_request_is_rejected(client):
    resp = client.get("/health-infirmary/visits/")
    assert resp.status_code in (401, 403)


def test_create_visit_requires_an_existing_student(client, auth):
    resp = client.post("/health-infirmary/visits/", json={
        "student_id": 999999999,
        "visit_date": "2026-01-10",
        "symptoms": "Fever",
    }, headers=auth)
    assert resp.status_code == 404


def test_create_visit_rejects_blank_symptoms(client, auth):
    student = _student(client, auth)
    resp = client.post("/health-infirmary/visits/", json={
        "student_id": student["id"],
        "visit_date": "2026-01-10",
        "symptoms": "   ",
    }, headers=auth)
    assert resp.status_code == 400


def test_visit_lifecycle(client, auth):
    student = _student(client, auth)

    created = client.post("/health-infirmary/visits/", json={
        "student_id": student["id"],
        "visit_date": "2026-01-15",
        "visit_time": "10:30",
        "symptoms": "Fever and headache",
        "diagnosis": "Viral fever",
        "attended_by": "Nurse Rao",
    }, headers=auth)
    assert created.status_code == 200, created.text
    body = created.json()
    assert body["student_id"] == student["id"]
    assert body["admission_no"] == student["admission_no"]
    assert body["student_name"]
    assert body["status"] == "Open"
    visit_id = body["id"]

    listed = client.get("/health-infirmary/visits/", headers=auth)
    assert listed.status_code == 200
    assert any(v["id"] == visit_id for v in listed.json())

    filtered = client.get(
        "/health-infirmary/visits/",
        params={"student_id": student["id"]},
        headers=auth,
    )
    assert filtered.status_code == 200
    assert all(v["student_id"] == student["id"] for v in filtered.json())

    updated = client.put(f"/health-infirmary/visits/{visit_id}", json={
        "student_id": student["id"],
        "visit_date": "2026-01-15",
        "symptoms": "Fever and headache",
        "status": "Closed",
        "treatment": "Paracetamol",
    }, headers=auth)
    assert updated.status_code == 200, updated.text
    assert updated.json()["status"] == "Closed"
    assert updated.json()["treatment"] == "Paracetamol"

    deleted = client.delete(f"/health-infirmary/visits/{visit_id}", headers=auth)
    assert deleted.status_code == 200

    missing = client.put(f"/health-infirmary/visits/{visit_id}", json={
        "student_id": student["id"],
        "visit_date": "2026-01-15",
        "symptoms": "Fever",
    }, headers=auth)
    assert missing.status_code == 404
