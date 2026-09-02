"""Coverage for app/routes/alumni_withdrawals.py (prefix
/alumni-withdrawals), which had zero test coverage before this file.

Note: this router has no GET /{id} endpoint -- only list, create, update,
delete -- so the happy path below verifies via the list response instead.
"""

import uuid


def _make_student(client, auth, tag):
    resp = client.post("/students/", json={
        "admission_no": f"AW-{tag}",
        "first_name": "Alumni",
        "last_name": f"Test{tag}",
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def test_list_rejects_unauthenticated(client):
    resp = client.get("/alumni-withdrawals/")
    assert resp.status_code in (401, 403)


def test_create_rejects_unauthenticated(client):
    resp = client.post("/alumni-withdrawals/", json={
        "record_no": "",
        "student_name": "Nobody",
        "reason": "Testing",
    })
    assert resp.status_code in (401, 403)


def test_alumni_withdrawal_full_flow_for_admin(client, auth):
    tag = uuid.uuid4().hex[:8]
    student_id = _make_student(client, auth, tag)

    create_resp = client.post("/alumni-withdrawals/", json={
        "record_no": "",
        "student_id": student_id,
        "student_name": "",
        "record_type": "Transfer",
        "reason": f"Relocating {tag}",
        "destination_school": "Other School",
        "certificate_status": "Pending",
        "current_status": "Pending",
    }, headers=auth)
    assert create_resp.status_code == 200, create_resp.text
    created = create_resp.json()
    assert created["student_id"] == student_id
    # student_name/admission_no should be hydrated from the student record.
    assert created["student_name"] == "Alumni Test" + tag
    assert created["admission_no"] == f"AW-{tag}"
    assert created["record_no"].startswith("AW-")
    record_id = created["id"]

    list_resp = client.get(
        "/alumni-withdrawals/", params={"record_type": "Transfer"}, headers=auth
    )
    assert list_resp.status_code == 200, list_resp.text
    ids = [row["id"] for row in list_resp.json()]
    assert record_id in ids

    update_resp = client.put(f"/alumni-withdrawals/{record_id}", json={
        "record_no": "",
        "student_id": student_id,
        "student_name": "",
        "record_type": "Transfer",
        "reason": "Updated reason",
        "current_status": "Approved",
        "approved_by": "Principal",
    }, headers=auth)
    assert update_resp.status_code == 200, update_resp.text
    updated = update_resp.json()
    assert updated["reason"] == "Updated reason"
    assert updated["current_status"] == "Approved"
    # record_no should be preserved across the update since we sent "".
    assert updated["record_no"] == created["record_no"]

    delete_resp = client.delete(f"/alumni-withdrawals/{record_id}", headers=auth)
    assert delete_resp.status_code == 200, delete_resp.text

    list_after_delete = client.get("/alumni-withdrawals/", headers=auth)
    assert record_id not in [row["id"] for row in list_after_delete.json()]


def test_create_rejects_missing_reason(client, auth):
    resp = client.post("/alumni-withdrawals/", json={
        "record_no": "",
        "student_name": "No Reason Given",
        "reason": "",
    }, headers=auth)
    assert resp.status_code == 400


def test_create_rejects_unknown_student(client, auth):
    resp = client.post("/alumni-withdrawals/", json={
        "record_no": "",
        "student_id": 9_999_999,
        "student_name": "Ghost Student",
        "reason": "Testing missing student",
    }, headers=auth)
    assert resp.status_code == 404
