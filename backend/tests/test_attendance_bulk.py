"""Class-wide attendance marking: GET /attendance/roster and
POST /attendance/bulk. Marking a class one student at a time was the
biggest daily-use gap in the module -- these cover the roster prefill and
the upsert-on-resubmit behavior that makes the grid usable."""


def _create_class(client, auth, class_name="BulkAtt Class", section="A"):
    resp = client.post("/classes/", json={
        "class_name": class_name,
        "section": section,
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _create_student(client, auth, class_id, admission_no, first_name):
    resp = client.post("/students/", json={
        "admission_no": admission_no,
        "first_name": first_name,
        "class_id": class_id,
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def test_roster_requires_auth(client):
    resp = client.get("/attendance/roster", params={
        "class_id": 1, "attendance_date": "2026-01-01",
    })
    assert resp.status_code == 401


def test_roster_lists_students_with_no_prior_attendance(client, auth):
    class_id = _create_class(client, auth, "BulkAtt-Roster")
    student_id = _create_student(client, auth, class_id, "BULKATT-001", "Asha")

    resp = client.get("/attendance/roster", params={
        "class_id": class_id, "attendance_date": "2026-02-01",
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    roster = resp.json()
    assert len(roster) == 1
    assert roster[0]["student_id"] == student_id
    assert roster[0]["status"] is None
    assert roster[0]["attendance_id"] is None


def test_bulk_mark_creates_records_for_every_student(client, auth):
    class_id = _create_class(client, auth, "BulkAtt-Create")
    s1 = _create_student(client, auth, class_id, "BULKATT-010", "Ravi")
    s2 = _create_student(client, auth, class_id, "BULKATT-011", "Meena")

    resp = client.post("/attendance/bulk", json={
        "attendance_date": "2026-02-02",
        "class_id": class_id,
        "entries": [
            {"student_id": s1, "status": "Present"},
            {"student_id": s2, "status": "Absent", "remarks": "Sick"},
        ],
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    records = resp.json()
    assert len(records) == 2
    by_student = {r["student_id"]: r for r in records}
    assert by_student[s1]["status"] == "Present"
    assert by_student[s2]["status"] == "Absent"
    assert by_student[s2]["remarks"] == "Sick"

    roster = client.get("/attendance/roster", params={
        "class_id": class_id, "attendance_date": "2026-02-02",
    }, headers=auth).json()
    statuses = {row["student_id"]: row["status"] for row in roster}
    assert statuses[s1] == "Present"
    assert statuses[s2] == "Absent"


def test_bulk_mark_upserts_instead_of_conflicting(client, auth):
    """A teacher re-opening the same day's roster to fix a mistake must be
    able to resubmit without hitting the single-record endpoint's
    already-marked 400."""
    class_id = _create_class(client, auth, "BulkAtt-Upsert")
    student_id = _create_student(client, auth, class_id, "BULKATT-020", "Dev")

    first = client.post("/attendance/bulk", json={
        "attendance_date": "2026-02-03",
        "class_id": class_id,
        "entries": [{"student_id": student_id, "status": "Absent"}],
    }, headers=auth)
    assert first.status_code == 200, first.text
    first_id = first.json()[0]["id"]

    second = client.post("/attendance/bulk", json={
        "attendance_date": "2026-02-03",
        "class_id": class_id,
        "entries": [{"student_id": student_id, "status": "Present"}],
    }, headers=auth)
    assert second.status_code == 200, second.text
    second_record = second.json()[0]
    assert second_record["id"] == first_id  # same row, updated in place
    assert second_record["status"] == "Present"
    assert second_record["source"] == "Manual"


def test_bulk_mark_rejects_unknown_status(client, auth):
    class_id = _create_class(client, auth, "BulkAtt-BadStatus")
    student_id = _create_student(client, auth, class_id, "BULKATT-030", "Ira")

    resp = client.post("/attendance/bulk", json={
        "attendance_date": "2026-02-04",
        "class_id": class_id,
        "entries": [{"student_id": student_id, "status": "On Leave"}],
    }, headers=auth)
    assert resp.status_code == 400
    assert "Invalid status" in resp.json()["detail"]


def test_bulk_mark_requires_at_least_one_entry(client, auth):
    resp = client.post("/attendance/bulk", json={
        "attendance_date": "2026-02-05",
        "entries": [],
    }, headers=auth)
    assert resp.status_code == 400


def test_bulk_mark_rejects_unknown_student(client, auth):
    resp = client.post("/attendance/bulk", json={
        "attendance_date": "2026-02-06",
        "entries": [{"student_id": 999999, "status": "Present"}],
    }, headers=auth)
    assert resp.status_code == 404
