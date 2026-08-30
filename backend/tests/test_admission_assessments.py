"""Coverage for app/routes/admission_assessments.py (prefix
/admission-assessments), which had zero test coverage before this file.
"""

import uuid


def _make_inquiry(client, auth, tag):
    resp = client.post("/admissions/", json={
        "inquiry_no": "",
        "student_name": f"Assess Student {tag}",
        "grade_applying": "Grade 5",
        "academic_year": "2026-27",
        "guardian_name": f"Guardian {tag}",
        "guardian_phone": f"9{tag}",
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def test_list_rejects_unauthenticated(client):
    resp = client.get("/admission-assessments/")
    assert resp.status_code in (401, 403)


def test_create_rejects_unauthenticated(client):
    resp = client.post("/admission-assessments/", json={
        "inquiry_id": 1,
        "assessment_type": "Entrance Test",
        "scheduled_date": "2026-09-15",
    })
    assert resp.status_code in (401, 403)


def test_admission_assessment_full_flow_for_admin(client, auth):
    tag = uuid.uuid4().hex[:8]
    inquiry_id = _make_inquiry(client, auth, tag)

    create_resp = client.post("/admission-assessments/", json={
        "inquiry_id": inquiry_id,
        "assessment_type": "Entrance Test",
        "scheduled_date": "2026-09-15",
        "scheduled_time": "10:00",
        "mode": "On Campus",
        "panel_members": "Ms. Rao, Mr. Iyer",
        "location": "Room 4",
        "status": "Scheduled",
        "outcome": "Pending",
        "remarks": f"Auto test {tag}",
    }, headers=auth)
    assert create_resp.status_code == 200, create_resp.text
    created = create_resp.json()
    assert created["inquiry_id"] == inquiry_id
    assert created["assessment_type"] == "Entrance Test"
    assert created["student_name"] == f"Assess Student {tag}"
    assessment_id = created["id"]

    # List, filtered by the inquiry we just created.
    list_resp = client.get(
        "/admission-assessments/", params={"inquiry_id": inquiry_id}, headers=auth
    )
    assert list_resp.status_code == 200, list_resp.text
    ids = [row["id"] for row in list_resp.json()]
    assert assessment_id in ids

    # Get by id.
    get_resp = client.get(f"/admission-assessments/{assessment_id}", headers=auth)
    assert get_resp.status_code == 200, get_resp.text
    assert get_resp.json()["id"] == assessment_id

    # Update.
    update_resp = client.put(f"/admission-assessments/{assessment_id}", json={
        "inquiry_id": inquiry_id,
        "assessment_type": "Student Interview",
        "scheduled_date": "2026-09-20",
        "status": "Completed",
        "score": 85,
        "outcome": "Recommended",
    }, headers=auth)
    assert update_resp.status_code == 200, update_resp.text
    updated = update_resp.json()
    assert updated["assessment_type"] == "Student Interview"
    assert updated["status"] == "Completed"
    assert updated["score"] == 85

    # Delete.
    delete_resp = client.delete(f"/admission-assessments/{assessment_id}", headers=auth)
    assert delete_resp.status_code == 200, delete_resp.text

    get_after_delete = client.get(f"/admission-assessments/{assessment_id}", headers=auth)
    assert get_after_delete.status_code == 404


def test_create_admission_assessment_rejects_invalid_type(client, auth):
    tag = uuid.uuid4().hex[:8]
    inquiry_id = _make_inquiry(client, auth, tag)

    resp = client.post("/admission-assessments/", json={
        "inquiry_id": inquiry_id,
        "assessment_type": "Not A Real Type",
        "scheduled_date": "2026-09-15",
    }, headers=auth)
    assert resp.status_code == 400


def test_create_admission_assessment_rejects_missing_inquiry(client, auth):
    resp = client.post("/admission-assessments/", json={
        "inquiry_id": 9_999_999,
        "assessment_type": "Entrance Test",
        "scheduled_date": "2026-09-15",
    }, headers=auth)
    assert resp.status_code == 404
