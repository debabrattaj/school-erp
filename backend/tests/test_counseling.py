"""Coverage for app/routes/counseling.py (prefix /counseling), which had
zero test coverage before this file.

Note: this router has no GET /{id} endpoint -- only list, create, update,
delete -- so the happy path below verifies via the list response instead.
"""

import uuid


def _make_student(client, auth, tag):
    resp = client.post("/students/", json={
        "admission_no": f"CNS-{tag}",
        "first_name": "Wellbeing",
        "last_name": f"Case{tag}",
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def test_list_rejects_unauthenticated(client):
    resp = client.get("/counseling/")
    assert resp.status_code in (401, 403)


def test_create_rejects_unauthenticated(client):
    resp = client.post("/counseling/", json={
        "case_no": "",
        "student_id": 1,
        "concern_type": "Academic Stress",
    })
    assert resp.status_code in (401, 403)


def test_counseling_case_full_flow_for_admin(client, auth):
    tag = uuid.uuid4().hex[:8]
    student_id = _make_student(client, auth, tag)

    create_resp = client.post("/counseling/", json={
        "case_no": "",
        "student_id": student_id,
        "concern_type": "Academic Stress",
        "risk_level": "Low",
        "reported_by": "Class Teacher",
        "counselor": "Ms. Dsouza",
        "guardian_contacted": False,
        "confidentiality_level": "Restricted",
        "status": "Open",
    }, headers=auth)
    assert create_resp.status_code == 200, create_resp.text
    created = create_resp.json()
    assert created["student_id"] == student_id
    assert created["case_no"].startswith("CNS-")
    assert created["student_name"] == "Wellbeing Case" + tag
    case_id = created["id"]

    list_resp = client.get(
        "/counseling/", params={"concern_type": "Academic Stress"}, headers=auth
    )
    assert list_resp.status_code == 200, list_resp.text
    ids = [row["id"] for row in list_resp.json()]
    assert case_id in ids

    update_resp = client.put(f"/counseling/{case_id}", json={
        "case_no": "",
        "student_id": student_id,
        "concern_type": "Emotional Wellbeing",
        "risk_level": "Medium",
        "guardian_contacted": True,
        "status": "Monitoring",
        "outcome": "Improving",
    }, headers=auth)
    assert update_resp.status_code == 200, update_resp.text
    updated = update_resp.json()
    assert updated["concern_type"] == "Emotional Wellbeing"
    assert updated["risk_level"] == "Medium"
    assert updated["guardian_contacted"] is True
    assert updated["case_no"] == created["case_no"]

    delete_resp = client.delete(f"/counseling/{case_id}", headers=auth)
    assert delete_resp.status_code == 200, delete_resp.text

    list_after_delete = client.get("/counseling/", headers=auth)
    assert case_id not in [row["id"] for row in list_after_delete.json()]


def test_create_rejects_invalid_concern_type(client, auth):
    tag = uuid.uuid4().hex[:8]
    student_id = _make_student(client, auth, tag)

    resp = client.post("/counseling/", json={
        "case_no": "",
        "student_id": student_id,
        "concern_type": "Not A Real Concern",
    }, headers=auth)
    assert resp.status_code == 400


def test_create_rejects_unknown_student(client, auth):
    resp = client.post("/counseling/", json={
        "case_no": "",
        "student_id": 9_999_999,
        "concern_type": "Academic Stress",
    }, headers=auth)
    assert resp.status_code == 404
