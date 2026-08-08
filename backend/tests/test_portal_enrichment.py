"""Portal enrichment: timetable view, homework view, and two-way
parent-teacher messaging for a linked student.
"""

import uuid

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


def _make_student(db, **overrides):
    from app.models import Student
    defaults = dict(
        first_name="Portal", last_name="Kid", class_name="PortalTest-7",
        section="A", student_status="Active", residential_type="Day Scholar",
    )
    defaults.update(overrides)
    if "admission_no" not in defaults:
        defaults["admission_no"] = f"PORTAL-{uuid.uuid4().hex[:10]}"
    student = Student(**defaults)
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


def _make_parent_auth(client, db):
    from app.models import User
    from app.security import hash_password

    email = f"parent-{uuid.uuid4().hex[:8]}@example.com"
    user = User(name="Test Parent", email=email, password_hash=hash_password("ParentPass123!"), role="Parent")
    db.add(user)
    db.commit()
    db.refresh(user)

    login = client.post("/auth/login", json={"account_code": "default", "email": email, "password": "ParentPass123!"})
    assert login.status_code == 200, login.text
    return user, {"Authorization": f"Bearer {login.json()['access_token']}"}


def _link(client, auth, user_id, student_id):
    resp = client.post("/portal/links", json={"user_id": user_id, "student_id": student_id}, headers=auth)
    assert resp.status_code == 200, resp.text


@pytest.fixture()
def linked_parent(client, auth, db_session):
    student = _make_student(db_session)
    parent_user, parent_auth = _make_parent_auth(client, db_session)
    _link(client, auth, parent_user.id, student.id)
    return student, parent_auth


def test_portal_timetable_reflects_class_schedule(client, auth, db_session, linked_parent):
    from app.models import SchoolClass, TimetableEntry
    student, parent_auth = linked_parent

    school_class = SchoolClass(class_name=student.class_name, section=student.section)
    db_session.add(school_class)
    db_session.commit()
    db_session.refresh(school_class)

    entry = TimetableEntry(
        academic_year="2027-28", class_id=school_class.id,
        class_name_snapshot=student.class_name, section_snapshot=student.section,
        day_of_week="Tuesday", period_no=2, entry_type="period",
        start_time="10:00", end_time="10:40", subject="English",
    )
    db_session.add(entry)
    db_session.commit()

    resp = client.get(f"/portal/students/{student.id}/timetable", headers=parent_auth)
    assert resp.status_code == 200, resp.text
    entries = resp.json()
    assert len(entries) == 1
    assert entries[0]["subject"] == "English"
    assert entries[0]["day_of_week"] == "Tuesday"


def test_portal_homework_matches_class_and_section(client, auth, db_session, linked_parent):
    student, parent_auth = linked_parent

    client.post("/homework/", json={
        "class_name": student.class_name, "section": student.section,
        "title": "Matching assignment",
    }, headers=auth)
    client.post("/homework/", json={
        "class_name": "SomeOtherClass-9", "section": "Z",
        "title": "Not this student's assignment",
    }, headers=auth)

    resp = client.get(f"/portal/students/{student.id}/homework", headers=parent_auth)
    assert resp.status_code == 200, resp.text
    titles = [a["title"] for a in resp.json()]
    assert "Matching assignment" in titles
    assert "Not this student's assignment" not in titles


def test_portal_messages_two_way_thread(client, auth, linked_parent):
    student, parent_auth = linked_parent

    resp = client.post(
        f"/portal/students/{student.id}/messages",
        json={"body": "Question about the field trip"},
        headers=parent_auth,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_staff"] is False

    resp = client.post(
        f"/portal/students/{student.id}/messages",
        json={"body": "It's next Friday, permission slip attached in the app."},
        headers=auth,
    )
    assert resp.status_code == 200
    assert resp.json()["is_staff"] is True

    resp = client.get(f"/portal/students/{student.id}/messages", headers=parent_auth)
    assert resp.status_code == 200
    thread = resp.json()
    assert len(thread) == 2
    assert thread[0]["body"] == "Question about the field trip"
    assert thread[1]["sender_role"] == "Admin"


def test_portal_messages_empty_body_rejected(client, linked_parent):
    student, parent_auth = linked_parent
    resp = client.post(f"/portal/students/{student.id}/messages", json={"body": "   "}, headers=parent_auth)
    assert resp.status_code == 400


def test_unlinked_parent_cannot_access_another_students_data(client, auth, db_session, linked_parent):
    """The linked_parent fixture's parent is NOT linked to this second student."""
    _, parent_auth = linked_parent
    other_student = _make_student(db_session, admission_no=f"OTHER-{uuid.uuid4().hex[:8]}")

    for path in ("timetable", "homework", "messages"):
        resp = client.get(f"/portal/students/{other_student.id}/{path}", headers=parent_auth)
        assert resp.status_code == 403, f"{path} should be forbidden, got {resp.status_code}"

    resp = client.post(
        f"/portal/students/{other_student.id}/messages", json={"body": "hi"}, headers=parent_auth
    )
    assert resp.status_code == 403
