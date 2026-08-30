"""Two backend routers had zero authentication on every endpoint, found
during a site-wide audit: student_enrollments.py (create/update/delete
enrollments, bulk promotion, year-end processing -- including graduating
students) and module_layouts.py (create/update/delete a module's custom
field layout). Anyone with network access could call them with no token
at all. This pins the fix: unauthenticated calls are rejected, and a
legitimate staff login still works exactly as before.
"""

import uuid


def _unauth_client(client):
    # The shared `client` fixture is a session-scoped TestClient with no
    # Authorization header by default -- calling it directly (no `auth`
    # fixture) is the unauthenticated case.
    return client


def test_student_enrollments_list_rejects_unauthenticated(client):
    resp = _unauth_client(client).get("/student-enrollments/")
    assert resp.status_code in (401, 403)


def test_student_enrollments_create_rejects_unauthenticated(client):
    resp = _unauth_client(client).post("/student-enrollments/", json={
        "student_id": 1, "class_id": 1, "academic_year": "2026-27",
    })
    assert resp.status_code in (401, 403)


def test_student_enrollments_promote_rejects_unauthenticated(client):
    resp = _unauth_client(client).post("/student-enrollments/promote", json={
        "student_ids": [1], "from_class_id": 1, "to_class_id": 2,
        "from_academic_year": "2025-26", "to_academic_year": "2026-27",
        "start_date": "2026-04-01",
    })
    assert resp.status_code in (401, 403)


def test_student_enrollments_year_end_rejects_unauthenticated(client):
    resp = _unauth_client(client).post("/student-enrollments/year-end", json={
        "from_academic_year": "2025-26", "to_academic_year": "2026-27",
        "start_date": "2026-04-01", "actions": [],
    })
    assert resp.status_code in (401, 403)


def test_student_enrollments_list_works_for_authenticated_admin(client, auth):
    resp = client.get("/student-enrollments/", headers=auth)
    assert resp.status_code == 200, resp.text


def test_student_enrollments_full_flow_still_works_for_admin(client, auth):
    unique = uuid.uuid4().hex[:8]
    class_resp = client.post("/classes/", json={
        "class_name": f"AuditClass-{unique}", "section": "A",
    }, headers=auth)
    assert class_resp.status_code == 200, class_resp.text
    class_id = class_resp.json()["id"]

    student_resp = client.post("/students/", json={
        "admission_no": f"AUDIT-{unique}", "first_name": "Audit", "class_id": class_id,
    }, headers=auth)
    assert student_resp.status_code == 200, student_resp.text
    student_id = student_resp.json()["id"]

    enroll_resp = client.post("/student-enrollments/", json={
        "student_id": student_id, "class_id": class_id, "academic_year": "2026-27",
    }, headers=auth)
    assert enroll_resp.status_code == 200, enroll_resp.text


def test_module_layouts_get_rejects_unauthenticated(client):
    resp = _unauth_client(client).get("/module-layouts/Students")
    assert resp.status_code in (401, 403)


def test_module_layouts_put_rejects_unauthenticated(client):
    resp = _unauth_client(client).put("/module-layouts/Students", json={"layout_json": []})
    assert resp.status_code in (401, 403)


def test_module_layouts_delete_rejects_unauthenticated(client):
    resp = _unauth_client(client).delete("/module-layouts/Students")
    assert resp.status_code in (401, 403)


def test_module_layouts_save_and_read_still_works_for_admin(client, auth):
    put_resp = client.put("/module-layouts/Students", json={
        "layout_json": [{"section": "Basic", "fields": []}],
    }, headers=auth)
    assert put_resp.status_code == 200, put_resp.text

    get_resp = client.get("/module-layouts/Students", headers=auth)
    assert get_resp.status_code == 200, get_resp.text
