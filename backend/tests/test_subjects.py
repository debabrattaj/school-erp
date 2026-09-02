"""Coverage for backend/app/routes/subjects.py (no fixed prefix -- routes
are /subjects/, /class-subjects/, /class-exam-mappings/). No tests existed
for this module before this file (site-wide zero-coverage audit).

NOTE: unlike every sibling module covered in this batch, the CRUD endpoints
here (list/get/create/update/delete subjects, class-subjects, and
class-exam-mappings) carry NO auth dependency at all -- only the two
bulk-import endpoints require roles. This looks like a genuine gap (the
same class of bug test_route_auth_audit.py documents as already fixed for
student_enrollments.py/module_layouts.py) and is reported rather than
silently patched here. The unauthenticated-rejection case below is
therefore exercised against bulk-import, the one place auth is enforced.
"""

import io
import uuid


def _subject_payload(unique, **overrides):
    data = {
        "subject_code": f"SUBJ-{unique}",
        "subject_name": f"Test Subject {unique}",
        "subject_type": "Scholastic",
        "is_active": True,
    }
    data.update(overrides)
    return data


def test_bulk_import_template_rejects_unauthenticated(client):
    resp = client.get("/subjects/bulk-import-template")
    assert resp.status_code in (401, 403)


def test_bulk_import_rejects_unauthenticated(client):
    csv_bytes = b"subject_code,subject_name,subject_type,is_active\n"
    resp = client.post(
        "/subjects/bulk-import",
        files={"file": ("subjects.csv", io.BytesIO(csv_bytes), "text/csv")},
    )
    assert resp.status_code in (401, 403)


def test_bulk_import_template_works_for_admin(client, auth):
    resp = client.get("/subjects/bulk-import-template", headers=auth)
    assert resp.status_code == 200, resp.text
    assert "subject_code" in resp.text


def test_subject_crud_flow(client, auth):
    unique = uuid.uuid4().hex[:8]

    create_resp = client.post(
        "/subjects/", json=_subject_payload(unique), headers=auth
    )
    assert create_resp.status_code == 200, create_resp.text
    created = create_resp.json()
    assert created["subject_code"] == f"SUBJ-{unique}"
    subject_id = created["id"]

    list_resp = client.get("/subjects/", headers=auth)
    assert list_resp.status_code == 200, list_resp.text
    assert any(s["id"] == subject_id for s in list_resp.json())

    get_resp = client.get(f"/subjects/{subject_id}", headers=auth)
    assert get_resp.status_code == 200, get_resp.text
    assert get_resp.json()["subject_name"] == f"Test Subject {unique}"

    update_resp = client.put(
        f"/subjects/{subject_id}",
        json=_subject_payload(unique, subject_name=f"Updated Subject {unique}"),
        headers=auth,
    )
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["subject_name"] == f"Updated Subject {unique}"

    delete_resp = client.delete(f"/subjects/{subject_id}", headers=auth)
    assert delete_resp.status_code == 200, delete_resp.text
    assert delete_resp.json() == {"message": "Subject deleted successfully"}

    get_after_delete = client.get(f"/subjects/{subject_id}", headers=auth)
    assert get_after_delete.status_code == 404, get_after_delete.text


def test_create_subject_duplicate_code_returns_400(client, auth):
    unique = uuid.uuid4().hex[:8]
    first = client.post("/subjects/", json=_subject_payload(unique), headers=auth)
    assert first.status_code == 200, first.text

    dup = client.post("/subjects/", json=_subject_payload(unique), headers=auth)
    assert dup.status_code == 400, dup.text


def test_get_subject_missing_returns_404(client, auth):
    resp = client.get("/subjects/999999999", headers=auth)
    assert resp.status_code == 404, resp.text


def test_class_subject_mapping_flow(client, auth):
    unique = uuid.uuid4().hex[:8]

    class_resp = client.post(
        "/classes/",
        json={"class_name": f"SubjClass-{unique}", "section": "A"},
        headers=auth,
    )
    assert class_resp.status_code == 200, class_resp.text
    class_id = class_resp.json()["id"]

    subject_resp = client.post(
        "/subjects/", json=_subject_payload(unique), headers=auth
    )
    assert subject_resp.status_code == 200, subject_resp.text
    subject_id = subject_resp.json()["id"]

    create_mapping = client.post(
        "/class-subjects/",
        json={
            "class_id": class_id,
            "subject_id": subject_id,
            "academic_year": "2026-27",
            "weekly_periods": 5,
        },
        headers=auth,
    )
    assert create_mapping.status_code == 200, create_mapping.text
    mapping = create_mapping.json()
    assert mapping["class_id"] == class_id
    assert mapping["subject_name"] == f"Test Subject {unique}"
    mapping_id = mapping["id"]

    get_mapping = client.get(f"/class-subjects/{mapping_id}", headers=auth)
    assert get_mapping.status_code == 200, get_mapping.text

    list_mapping = client.get(
        "/class-subjects/", params={"class_id": class_id}, headers=auth
    )
    assert list_mapping.status_code == 200, list_mapping.text
    assert any(m["id"] == mapping_id for m in list_mapping.json())

    update_mapping = client.put(
        f"/class-subjects/{mapping_id}",
        json={
            "class_id": class_id,
            "subject_id": subject_id,
            "academic_year": "2026-27",
            "weekly_periods": 8,
        },
        headers=auth,
    )
    assert update_mapping.status_code == 200, update_mapping.text
    assert update_mapping.json()["weekly_periods"] == 8

    delete_mapping = client.delete(f"/class-subjects/{mapping_id}", headers=auth)
    assert delete_mapping.status_code == 200, delete_mapping.text
    assert delete_mapping.json()["message"] == "Class subject mapping deleted successfully"


def test_create_class_subject_missing_class_returns_404(client, auth):
    resp = client.post(
        "/class-subjects/",
        json={"class_id": 999999999, "subject_name": "Ghost Subject"},
        headers=auth,
    )
    assert resp.status_code == 404, resp.text


def test_class_exam_mapping_flow(client, auth):
    unique = uuid.uuid4().hex[:8]

    class_resp = client.post(
        "/classes/",
        json={"class_name": f"ExamMapClass-{unique}", "section": "A"},
        headers=auth,
    )
    assert class_resp.status_code == 200, class_resp.text
    class_id = class_resp.json()["id"]

    exam_resp = client.post(
        "/exams/",
        json={"exam_name": f"Unit Test {unique}", "academic_year": "2026-27"},
        headers=auth,
    )
    assert exam_resp.status_code == 200, exam_resp.text
    exam_id = exam_resp.json()["id"]

    create_mapping = client.post(
        "/class-exam-mappings/",
        json={
            "class_id": class_id,
            "exam_id": exam_id,
            "academic_year": "2026-27",
        },
        headers=auth,
    )
    assert create_mapping.status_code == 200, create_mapping.text
    mapping_id = create_mapping.json()["id"]

    list_resp = client.get(
        "/class-exam-mappings/", params={"class_id": class_id}, headers=auth
    )
    assert list_resp.status_code == 200, list_resp.text
    assert any(m["id"] == mapping_id for m in list_resp.json())

    delete_resp = client.delete(f"/class-exam-mappings/{mapping_id}", headers=auth)
    assert delete_resp.status_code == 200, delete_resp.text
    assert delete_resp.json()["message"] == "Class exam mapping deleted successfully"


def test_create_class_exam_mapping_missing_exam_returns_404(client, auth):
    unique = uuid.uuid4().hex[:8]
    class_resp = client.post(
        "/classes/",
        json={"class_name": f"ExamMapClass2-{unique}", "section": "A"},
        headers=auth,
    )
    assert class_resp.status_code == 200, class_resp.text
    class_id = class_resp.json()["id"]

    resp = client.post(
        "/class-exam-mappings/",
        json={"class_id": class_id, "exam_id": 999999999, "academic_year": "2026-27"},
        headers=auth,
    )
    assert resp.status_code == 404, resp.text
