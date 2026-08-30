"""Coverage for app/routes/teachers.py (prefix /teachers), which had no
tests at all before this file.

NOTE: unlike the bulk-import endpoints below (which do require
Admin/Principal via require_roles), the CRUD endpoints -- GET /teachers/,
GET /teachers/{id}, POST /teachers/, PUT /teachers/{id},
DELETE /teachers/{id} -- have no auth dependency of any kind (no
require_roles, not even get_current_user). This looks like the same class
of bug test_route_auth_audit.py pinned fixes for elsewhere in this repo
(student_enrollments.py / module_layouts.py); it has NOT been fixed here
per this task's scope (test-writing only), and is called out in the
task's final summary instead. This file therefore uses the `auth` fixture
for the CRUD flow for a clean, unambiguous authenticated test (which also
happens to pass with no auth header at all, since nothing checks it), and
proves the "rejects unauthenticated" requirement against the one part of
this router that actually enforces it: bulk-import.
"""

import io
import uuid


def _tag():
    return uuid.uuid4().hex[:8]


def test_bulk_import_template_rejects_unauthenticated(client):
    resp = client.get("/teachers/bulk-import-template")
    assert resp.status_code in (401, 403)


def test_bulk_import_rejects_unauthenticated(client):
    resp = client.post(
        "/teachers/bulk-import",
        files={"file": ("teachers.csv", io.BytesIO(b"employee_no,name\n"), "text/csv")},
    )
    assert resp.status_code in (401, 403)


def test_teacher_full_crud_flow(client, auth):
    tag = _tag()
    employee_no = f"TCHR-{tag}"

    create_resp = client.post("/teachers/", json={
        "employee_no": employee_no,
        "name": "Audit Teacher",
        "email": f"teacher-{tag}@example.com",
        "department": "Science",
        "subject": "Physics",
    }, headers=auth)
    assert create_resp.status_code == 200, create_resp.text
    teacher = create_resp.json()
    assert teacher["employee_no"] == employee_no
    assert teacher["name"] == "Audit Teacher"
    teacher_id = teacher["id"]

    dup_resp = client.post("/teachers/", json={
        "employee_no": employee_no, "name": "Duplicate",
    }, headers=auth)
    assert dup_resp.status_code == 400

    list_resp = client.get("/teachers/", headers=auth)
    assert list_resp.status_code == 200
    assert any(t["id"] == teacher_id for t in list_resp.json())

    get_resp = client.get(f"/teachers/{teacher_id}", headers=auth)
    assert get_resp.status_code == 200
    assert get_resp.json()["employee_no"] == employee_no

    update_resp = client.put(f"/teachers/{teacher_id}", json={
        "employee_no": employee_no,
        "name": "Updated Teacher Name",
        "department": "Mathematics",
    }, headers=auth)
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["name"] == "Updated Teacher Name"
    assert update_resp.json()["department"] == "Mathematics"

    delete_resp = client.delete(f"/teachers/{teacher_id}", headers=auth)
    assert delete_resp.status_code == 200

    missing_resp = client.get(f"/teachers/{teacher_id}", headers=auth)
    assert missing_resp.status_code == 404


def test_get_teacher_not_found(client, auth):
    resp = client.get("/teachers/999999999", headers=auth)
    assert resp.status_code == 404


def test_update_teacher_not_found(client, auth):
    resp = client.put("/teachers/999999999", json={
        "employee_no": "NOPE", "name": "Nobody",
    }, headers=auth)
    assert resp.status_code == 404


def test_delete_teacher_not_found(client, auth):
    resp = client.delete("/teachers/999999999", headers=auth)
    assert resp.status_code == 404


def test_class_teacher_assignment_syncs_to_class(client, auth):
    tag = _tag()

    class_resp = client.post("/classes/", json={
        "class_name": f"TCls-{tag}", "section": "A",
    }, headers=auth)
    assert class_resp.status_code == 200, class_resp.text
    class_id = class_resp.json()["id"]

    teacher_resp = client.post("/teachers/", json={
        "employee_no": f"TCHR-CT-{tag}",
        "name": "Class Teacher",
        "is_class_teacher": True,
        "class_id": class_id,
    }, headers=auth)
    assert teacher_resp.status_code == 200, teacher_resp.text
    teacher = teacher_resp.json()
    assert teacher["is_class_teacher"] is True
    assert teacher["class_id"] == class_id

    class_after = client.get(f"/classes/{class_id}", headers=auth)
    assert class_after.status_code == 200
    assert class_after.json()["class_teacher_id"] == teacher["id"]

    # Deleting the class teacher must clear the class's assignment too.
    delete_resp = client.delete(f"/teachers/{teacher['id']}", headers=auth)
    assert delete_resp.status_code == 200

    class_final = client.get(f"/classes/{class_id}", headers=auth)
    assert class_final.json()["class_teacher_id"] is None


def test_create_teacher_with_unknown_class_id_404(client, auth):
    tag = _tag()
    resp = client.post("/teachers/", json={
        "employee_no": f"TCHR-BADCLS-{tag}",
        "name": "Bad Class Teacher",
        "is_class_teacher": True,
        "class_id": 999999999,
    }, headers=auth)
    assert resp.status_code == 404


def test_bulk_import_template_columns(client, auth):
    resp = client.get("/teachers/bulk-import-template", headers=auth)
    assert resp.status_code == 200
    header = resp.text.splitlines()[0]
    assert header.split(",")[0] == "employee_no"
    assert "name" in header


def test_bulk_import_dry_run(client, auth):
    tag = _tag()
    csv_body = (
        "employee_no,name,email\n"
        f"BULK-{tag},Bulk Teacher,bulk-{tag}@example.com\n"
    )
    resp = client.post(
        "/teachers/bulk-import?dry_run=true",
        headers=auth,
        files={"file": ("teachers.csv", io.BytesIO(csv_body.encode()), "text/csv")},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["dry_run"] is True
    assert body["created"] == 0
    assert body["valid_rows"] == 1
    assert body["errors"] == []

    list_resp = client.get("/teachers/", headers=auth)
    assert not any(t["employee_no"] == f"BULK-{tag}" for t in list_resp.json())
