"""Coverage for backend/app/routes/timetable.py (prefix /timetable) --
weekly timetable grid CRUD. No tests existed for this module before this
file (site-wide zero-coverage audit). Auto-generation endpoints
(/auto-generate/preview and /auto-generate/apply) are gated behind the
"timetable_auto_generation" platform feature switch and bulk-write the
whole school's grid -- left untested here since they are not part of the
plain CRUD surface and enabling them is a platform-owner concern.
"""

import uuid


def test_list_rejects_unauthenticated(client):
    resp = client.get("/timetable/")
    assert resp.status_code in (401, 403)


def test_create_rejects_unauthenticated(client):
    resp = client.post(
        "/timetable/",
        json={
            "academic_year": "2026-27",
            "day_of_week": "Monday",
            "period_no": 1,
        },
    )
    assert resp.status_code in (401, 403)


def test_create_rejects_invalid_day(client, auth):
    resp = client.post(
        "/timetable/",
        json={
            "academic_year": "2026-27",
            "day_of_week": "Someday",
            "period_no": 1,
        },
        headers=auth,
    )
    assert resp.status_code == 400, resp.text


def test_create_rejects_invalid_period_no(client, auth):
    resp = client.post(
        "/timetable/",
        json={
            "academic_year": "2026-27",
            "day_of_week": "Monday",
            "period_no": 0,
        },
        headers=auth,
    )
    assert resp.status_code == 400, resp.text


def test_full_crud_flow_for_admin(client, auth):
    unique = uuid.uuid4().hex[:8]

    class_resp = client.post(
        "/classes/",
        json={"class_name": f"TTClass-{unique}", "section": "A"},
        headers=auth,
    )
    assert class_resp.status_code == 200, class_resp.text
    class_id = class_resp.json()["id"]

    create_resp = client.post(
        "/timetable/",
        json={
            "academic_year": f"2026-27-{unique}",
            "class_id": class_id,
            "day_of_week": "Monday",
            "period_no": 1,
            "subject": "Mathematics",
        },
        headers=auth,
    )
    assert create_resp.status_code == 200, create_resp.text
    entry = create_resp.json()
    assert entry["day_of_week"] == "Monday"
    assert entry["period_no"] == 1
    assert entry["class_name_snapshot"] == f"TTClass-{unique}"
    entry_id = entry["id"]

    list_resp = client.get(
        "/timetable/",
        params={"academic_year": f"2026-27-{unique}", "class_id": class_id},
        headers=auth,
    )
    assert list_resp.status_code == 200, list_resp.text
    ids = [e["id"] for e in list_resp.json()]
    assert entry_id in ids

    update_resp = client.put(
        f"/timetable/{entry_id}",
        json={"subject": "Science", "period_no": 2},
        headers=auth,
    )
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["subject"] == "Science"
    assert update_resp.json()["period_no"] == 2

    delete_resp = client.delete(f"/timetable/{entry_id}", headers=auth)
    assert delete_resp.status_code == 200, delete_resp.text
    assert delete_resp.json() == {"message": "Timetable entry deleted"}

    after_delete = client.get(
        "/timetable/",
        params={"academic_year": f"2026-27-{unique}", "class_id": class_id},
        headers=auth,
    )
    assert entry_id not in [e["id"] for e in after_delete.json()]


def test_create_detects_teacher_clash(client, auth):
    unique = uuid.uuid4().hex[:8]
    academic_year = f"2026-clash-{unique}"

    class_a = client.post(
        "/classes/", json={"class_name": f"TTClashA-{unique}", "section": "A"}, headers=auth
    ).json()
    class_b = client.post(
        "/classes/", json={"class_name": f"TTClashB-{unique}", "section": "A"}, headers=auth
    ).json()

    teacher_resp = client.post(
        "/teachers/",
        json={"employee_no": f"TCH-{unique}", "name": f"Clash Teacher {unique}"},
        headers=auth,
    )
    assert teacher_resp.status_code == 200, teacher_resp.text
    teacher_id = teacher_resp.json()["id"]

    first = client.post(
        "/timetable/",
        json={
            "academic_year": academic_year,
            "class_id": class_a["id"],
            "day_of_week": "Tuesday",
            "period_no": 1,
            "teacher_id": teacher_id,
            "subject": "Physics",
        },
        headers=auth,
    )
    assert first.status_code == 200, first.text

    clashing = client.post(
        "/timetable/",
        json={
            "academic_year": academic_year,
            "class_id": class_b["id"],
            "day_of_week": "Tuesday",
            "period_no": 1,
            "teacher_id": teacher_id,
            "subject": "Chemistry",
        },
        headers=auth,
    )
    assert clashing.status_code == 400, clashing.text
    assert "already assigned" in clashing.json()["detail"]


def test_update_missing_entry_returns_404(client, auth):
    resp = client.put(
        "/timetable/999999999", json={"subject": "Ghost"}, headers=auth
    )
    assert resp.status_code == 404, resp.text


def test_delete_missing_entry_returns_404(client, auth):
    resp = client.delete("/timetable/999999999", headers=auth)
    assert resp.status_code == 404, resp.text


def test_pdf_export_requires_class_or_teacher(client, auth):
    resp = client.get("/timetable/pdf", headers=auth)
    assert resp.status_code == 400, resp.text


def test_pdf_export_for_class(client, auth):
    unique = uuid.uuid4().hex[:8]
    academic_year = f"2026-pdf-{unique}"

    class_resp = client.post(
        "/classes/", json={"class_name": f"TTPdf-{unique}", "section": "A"}, headers=auth
    )
    class_id = class_resp.json()["id"]

    create_resp = client.post(
        "/timetable/",
        json={
            "academic_year": academic_year,
            "class_id": class_id,
            "day_of_week": "Wednesday",
            "period_no": 1,
            "subject": "English",
        },
        headers=auth,
    )
    assert create_resp.status_code == 200, create_resp.text

    pdf_resp = client.get(
        "/timetable/pdf",
        params={"class_id": class_id, "academic_year": academic_year},
        headers=auth,
    )
    assert pdf_resp.status_code == 200, pdf_resp.text
    assert pdf_resp.headers["content-type"] == "application/pdf"
