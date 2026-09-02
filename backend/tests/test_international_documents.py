"""Tests for backend/app/routes/international_documents.py
(prefix /international-documents).

"international_documents" defaults to True in app.tenant.DEFAULT_FEATURES,
so no feature-flag setup is needed for the default test tenant. (Like the
other opt-in modules in this audit, the route module doesn't call
require_feature(...) at all.)
"""

import uuid

TAG = uuid.uuid4().hex[:8]


def _student(client, auth, **overrides):
    payload = {
        "admission_no": f"ID-{TAG}-{uuid.uuid4().hex[:6]}",
        "first_name": "International",
        "last_name": "Applicant",
    }
    payload.update(overrides)
    resp = client.post("/students/", json=payload, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_unauthenticated_request_is_rejected(client):
    resp = client.get("/international-documents/")
    assert resp.status_code in (401, 403)


def test_create_requires_an_existing_student(client, auth):
    resp = client.post("/international-documents/", json={
        "student_id": 999999999,
        "document_type": "Passport",
    }, headers=auth)
    assert resp.status_code == 404


def test_create_rejects_blank_document_type(client, auth):
    student = _student(client, auth)
    resp = client.post("/international-documents/", json={
        "student_id": student["id"],
        "document_type": "   ",
    }, headers=auth)
    assert resp.status_code == 400


def test_create_rejects_invalid_status(client, auth):
    student = _student(client, auth)
    resp = client.post("/international-documents/", json={
        "student_id": student["id"],
        "document_type": "Visa",
        "status": "Not A Status",
    }, headers=auth)
    assert resp.status_code == 400


def test_get_missing_document_is_404(client, auth):
    resp = client.get("/international-documents/999999999", headers=auth)
    assert resp.status_code == 404


def test_document_lifecycle(client, auth):
    student = _student(client, auth)

    created = client.post("/international-documents/", json={
        "student_id": student["id"],
        "document_type": "Passport",
        "document_no": f"P{uuid.uuid4().hex[:8]}",
        "issue_date": "2024-01-01",
        "expiry_date": "2034-01-01",
        "issuing_country": "United Kingdom",
    }, headers=auth)
    assert created.status_code == 200, created.text
    doc = created.json()
    assert doc["status"] == "Pending"
    assert doc["student_name"]
    assert doc["admission_no"] == student["admission_no"]
    doc_id = doc["id"]

    fetched = client.get(f"/international-documents/{doc_id}", headers=auth)
    assert fetched.status_code == 200
    assert fetched.json()["id"] == doc_id

    listed = client.get(
        "/international-documents/",
        params={"student_id": student["id"], "document_type": "Passport"},
        headers=auth,
    )
    assert listed.status_code == 200
    assert any(d["id"] == doc_id for d in listed.json())

    updated = client.put(f"/international-documents/{doc_id}", json={
        "student_id": student["id"],
        "document_type": "Passport",
        "document_no": doc["document_no"],
        "status": "Verified",
        "verified_by": "Admin",
        "verified_date": "2026-01-05",
    }, headers=auth)
    assert updated.status_code == 200, updated.text
    assert updated.json()["status"] == "Verified"
    assert updated.json()["verified_by"] == "Admin"

    missing_student_on_update = client.put(f"/international-documents/{doc_id}", json={
        "student_id": 999999999,
        "document_type": "Passport",
    }, headers=auth)
    assert missing_student_on_update.status_code == 404

    deleted = client.delete(f"/international-documents/{doc_id}", headers=auth)
    assert deleted.status_code == 200

    gone = client.get(f"/international-documents/{doc_id}", headers=auth)
    assert gone.status_code == 404
