"""Tests for backend/app/routes/multi_curriculum.py (prefix /multi-curriculum).

"multi_curriculum" defaults to True in app.tenant.DEFAULT_FEATURES, so no
feature-flag setup is needed for the default test tenant. (Like the other
opt-in modules in this audit, the route module doesn't call
require_feature(...) at all -- it just happens this one ships enabled.)
"""

import uuid

TAG = uuid.uuid4().hex[:8]


def _class(client, auth, **overrides):
    payload = {
        "class_name": f"MC-{uuid.uuid4().hex[:6]}",
        "section": "A",
    }
    payload.update(overrides)
    resp = client.post("/classes/", json=payload, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _plan_payload(**overrides):
    payload = {
        "program_name": f"IB Programme {uuid.uuid4().hex[:6]}",
        "curriculum_track": "IB DP",
        "grade_level": "Grade 11",
        "academic_year": "2026-2027",
    }
    payload.update(overrides)
    return payload


def test_unauthenticated_request_is_rejected(client):
    resp = client.get("/multi-curriculum/")
    assert resp.status_code in (401, 403)


def test_create_rejects_invalid_curriculum_track(client, auth):
    resp = client.post("/multi-curriculum/", json=_plan_payload(curriculum_track="Made Up Track"), headers=auth)
    assert resp.status_code == 400


def test_create_rejects_blank_program_name(client, auth):
    resp = client.post("/multi-curriculum/", json=_plan_payload(program_name="   "), headers=auth)
    assert resp.status_code == 400


def test_create_validates_class_id_exists(client, auth):
    resp = client.post("/multi-curriculum/", json=_plan_payload(class_id=999999999), headers=auth)
    assert resp.status_code == 404


def test_get_missing_plan_is_404(client, auth):
    resp = client.get("/multi-curriculum/999999999", headers=auth)
    assert resp.status_code == 404


def test_plan_lifecycle_with_class_link(client, auth):
    school_class = _class(client, auth)

    created = client.post("/multi-curriculum/", json=_plan_payload(
        class_id=school_class["id"],
        subject_groups="Maths, Physics, Chemistry",
        coordinator="Dr. Verma",
    ), headers=auth)
    assert created.status_code == 200, created.text
    plan = created.json()
    assert plan["status"] == "Draft"
    assert plan["class_name"] == school_class["class_name"]
    assert plan["section"] == school_class["section"]
    assert plan["class_display"] == f"{school_class['class_name']} {school_class['section']}"
    plan_id = plan["id"]

    fetched = client.get(f"/multi-curriculum/{plan_id}", headers=auth)
    assert fetched.status_code == 200
    assert fetched.json()["id"] == plan_id

    listed = client.get("/multi-curriculum/", params={"curriculum_track": "IB DP"}, headers=auth)
    assert listed.status_code == 200
    assert any(p["id"] == plan_id for p in listed.json())

    updated = client.put(f"/multi-curriculum/{plan_id}", json=_plan_payload(
        program_name=plan["program_name"],
        curriculum_track="IB DP",
        status="Active",
    ), headers=auth)
    assert updated.status_code == 200, updated.text
    assert updated.json()["status"] == "Active"
    assert updated.json()["class_id"] is None

    invalid_status = client.put(f"/multi-curriculum/{plan_id}", json=_plan_payload(
        program_name=plan["program_name"],
        status="Not A Status",
    ), headers=auth)
    assert invalid_status.status_code == 400

    deleted = client.delete(f"/multi-curriculum/{plan_id}", headers=auth)
    assert deleted.status_code == 200

    gone = client.get(f"/multi-curriculum/{plan_id}", headers=auth)
    assert gone.status_code == 404
