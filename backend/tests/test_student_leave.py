"""Student/guardian leave requests: submission (POST /portal/students/{id}/
leave-requests) and staff review (app/routes/student_leave.py). The gap
this closes -- Attendance's "Excused" status had nothing that could ever
set it, since only staff Leave existed and that has no student concept.
"""

from datetime import date

import pytest


@pytest.fixture()
def db_session(client):
    from app.database import SessionLocal
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _make_student(db, class_name="StuLeaveTest", **overrides):
    from app.models import Student
    import uuid
    defaults = dict(
        first_name="Test", class_name=class_name, section="A",
        student_status="Active", residential_type="Day Scholar",
        admission_no=f"STULEAVE-{uuid.uuid4().hex[:10]}",
    )
    defaults.update(overrides)
    student = Student(**defaults)
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


def test_submit_requires_auth(client, db_session):
    student = _make_student(db_session)
    resp = client.post(f"/portal/students/{student.id}/leave-requests", json={
        "from_date": "2026-06-01", "to_date": "2026-06-02",
    })
    assert resp.status_code == 401


def test_submit_rejects_end_before_start(client, auth, db_session):
    student = _make_student(db_session)
    resp = client.post(f"/portal/students/{student.id}/leave-requests", json={
        "from_date": "2026-06-05", "to_date": "2026-06-01",
    }, headers=auth)
    assert resp.status_code == 400


def test_submit_and_list_a_request(client, auth, db_session):
    student = _make_student(db_session)
    resp = client.post(f"/portal/students/{student.id}/leave-requests", json={
        "from_date": "2026-06-01", "to_date": "2026-06-03",
        "reason": "Family function",
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "Requested"
    assert body["reason"] == "Family function"
    assert body["requested_by"] == "admin@school.com"

    listed = client.get(f"/portal/students/{student.id}/leave-requests", headers=auth)
    assert listed.status_code == 200, listed.text
    assert len(listed.json()) == 1


def test_staff_list_requires_auth(client):
    resp = client.get("/student-leave-requests/")
    assert resp.status_code == 401


def test_approve_marks_attendance_excused_on_working_days(client, auth, db_session):
    from app.models import Attendance

    student = _make_student(db_session)
    # Monday 2026-06-01 to Sunday 2026-06-07: a full week including a Sunday,
    # which is not a working day under the default Monday-Saturday calendar.
    create = client.post(f"/portal/students/{student.id}/leave-requests", json={
        "from_date": "2026-06-01", "to_date": "2026-06-07",
        "reason": "Family trip",
    }, headers=auth)
    request_id = create.json()["id"]

    approve = client.post(f"/student-leave-requests/{request_id}/approve", json={
        "note": "Approved by front office",
    }, headers=auth)
    assert approve.status_code == 200, approve.text
    assert approve.json()["status"] == "Approved"

    records = (
        db_session.query(Attendance)
        .filter(Attendance.student_id == student.id)
        .order_by(Attendance.attendance_date)
        .all()
    )
    dates_marked = {r.attendance_date for r in records}
    assert date(2026, 6, 7) not in dates_marked  # Sunday: not a working day
    assert date(2026, 6, 1) in dates_marked
    assert all(r.status == "Excused" for r in records)
    assert all("Family trip" in (r.remarks or "") for r in records)


def test_approve_overwrites_an_existing_attendance_mark(client, auth, db_session):
    from app.models import Attendance

    student = _make_student(db_session)
    # Pre-mark the day as Absent (e.g. teacher marked it before the leave
    # request was reviewed) -- approval must override it to Excused.
    db_session.add(Attendance(
        student_id=student.id, attendance_date=date(2026, 6, 1),
        status="Absent", class_name_snapshot=student.class_name,
        section_snapshot=student.section,
    ))
    db_session.commit()

    create = client.post(f"/portal/students/{student.id}/leave-requests", json={
        "from_date": "2026-06-01", "to_date": "2026-06-01",
        "reason": "Sick",
    }, headers=auth)
    request_id = create.json()["id"]

    client.post(f"/student-leave-requests/{request_id}/approve", json={}, headers=auth)

    record = (
        db_session.query(Attendance)
        .filter(Attendance.student_id == student.id, Attendance.attendance_date == date(2026, 6, 1))
        .first()
    )
    assert record.status == "Excused"


def test_approve_twice_is_rejected(client, auth, db_session):
    student = _make_student(db_session)
    create = client.post(f"/portal/students/{student.id}/leave-requests", json={
        "from_date": "2026-06-08", "to_date": "2026-06-08",
    }, headers=auth)
    request_id = create.json()["id"]

    first = client.post(f"/student-leave-requests/{request_id}/approve", json={}, headers=auth)
    assert first.status_code == 200

    second = client.post(f"/student-leave-requests/{request_id}/approve", json={}, headers=auth)
    assert second.status_code == 400


def test_reject_does_not_touch_attendance(client, auth, db_session):
    from app.models import Attendance

    student = _make_student(db_session)
    create = client.post(f"/portal/students/{student.id}/leave-requests", json={
        "from_date": "2026-06-09", "to_date": "2026-06-09",
    }, headers=auth)
    request_id = create.json()["id"]

    reject = client.post(f"/student-leave-requests/{request_id}/reject", json={
        "note": "No supporting reason given",
    }, headers=auth)
    assert reject.status_code == 200
    assert reject.json()["status"] == "Rejected"

    count = (
        db_session.query(Attendance)
        .filter(Attendance.student_id == student.id, Attendance.attendance_date == date(2026, 6, 9))
        .count()
    )
    assert count == 0
