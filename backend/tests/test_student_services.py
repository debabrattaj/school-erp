"""Coverage for app/routes/student_services.py (prefix /student-services),
which had zero test coverage before this file.
"""

import uuid


def _make_student(client, auth, tag):
    resp = client.post("/students/", json={
        "admission_no": f"SVC-{tag}",
        "first_name": "Service",
        "last_name": f"Ticket{tag}",
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def test_list_rejects_unauthenticated(client):
    resp = client.get("/student-services/")
    assert resp.status_code in (401, 403)


def test_create_rejects_unauthenticated(client):
    resp = client.post("/student-services/", json={
        "ticket_no": "",
        "requester_name": "Nobody",
        "category": "General Request",
        "subject": "Test",
        "description": "Test",
    })
    assert resp.status_code in (401, 403)


def test_service_ticket_full_flow_for_admin(client, auth):
    tag = uuid.uuid4().hex[:8]
    student_id = _make_student(client, auth, tag)

    create_resp = client.post("/student-services/", json={
        "ticket_no": "",
        "student_id": student_id,
        "requester_name": f"Parent {tag}",
        "requester_role": "Parent",
        "contact_phone": "9999999999",
        "category": "Documents",
        "priority": "High",
        "subject": "Need bonafide certificate",
        "description": "Requesting a bonafide certificate for visa purposes.",
        "status": "Open",
    }, headers=auth)
    assert create_resp.status_code == 200, create_resp.text
    created = create_resp.json()
    assert created["student_id"] == student_id
    assert created["ticket_no"].startswith("SVC-")
    assert created["student_name"] == "Service Ticket" + tag
    ticket_id = created["id"]

    list_resp = client.get(
        "/student-services/", params={"category": "Documents"}, headers=auth
    )
    assert list_resp.status_code == 200, list_resp.text
    ids = [row["id"] for row in list_resp.json()]
    assert ticket_id in ids

    get_resp = client.get(f"/student-services/{ticket_id}", headers=auth)
    assert get_resp.status_code == 200, get_resp.text
    assert get_resp.json()["id"] == ticket_id

    update_resp = client.put(f"/student-services/{ticket_id}", json={
        "ticket_no": "",
        "student_id": student_id,
        "requester_name": f"Parent {tag}",
        "category": "Documents",
        "priority": "Urgent",
        "subject": "Need bonafide certificate",
        "description": "Requesting a bonafide certificate for visa purposes.",
        "status": "Resolved",
        "resolution": "Certificate issued and emailed.",
    }, headers=auth)
    assert update_resp.status_code == 200, update_resp.text
    updated = update_resp.json()
    assert updated["status"] == "Resolved"
    assert updated["priority"] == "Urgent"
    assert updated["ticket_no"] == created["ticket_no"]

    delete_resp = client.delete(f"/student-services/{ticket_id}", headers=auth)
    assert delete_resp.status_code == 200, delete_resp.text

    get_after_delete = client.get(f"/student-services/{ticket_id}", headers=auth)
    assert get_after_delete.status_code == 404


def test_create_rejects_missing_subject(client, auth):
    resp = client.post("/student-services/", json={
        "ticket_no": "",
        "requester_name": "Someone",
        "category": "General Request",
        "subject": "",
        "description": "Something",
    }, headers=auth)
    assert resp.status_code == 400


def test_create_rejects_invalid_category(client, auth):
    resp = client.post("/student-services/", json={
        "ticket_no": "",
        "requester_name": "Someone",
        "category": "Not A Real Category",
        "subject": "Subject",
        "description": "Description",
    }, headers=auth)
    assert resp.status_code == 400
