"""Class/section segment send (POST /communications/logs/bulk-class): the
"send to all parents of Class X" capability the single-recipient
create_log endpoint had no way to express.
"""

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
    import uuid
    defaults = dict(
        first_name="Test", class_name="CommBulkTest", section="A",
        student_status="Active", residential_type="Day Scholar",
        admission_no=f"COMMBULK-{uuid.uuid4().hex[:10]}",
        guardian_name="Guardian Name",
        guardian_phone="+911234567890",
        guardian_email="guardian@example.com",
    )
    defaults.update(overrides)
    student = Student(**defaults)
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


def test_bulk_class_requires_auth(client):
    resp = client.post("/communications/logs/bulk-class", json={
        "class_name": "X", "category": "Notice", "message_body": "Hi",
    })
    assert resp.status_code == 401


def test_bulk_class_sends_to_every_matching_guardian(client, auth, db_session):
    _make_student(db_session, class_name="CommBulkTest-Send", section="A")
    _make_student(db_session, class_name="CommBulkTest-Send", section="A")
    # Different section: must not be included when section is specified.
    _make_student(db_session, class_name="CommBulkTest-Send", section="B")

    resp = client.post("/communications/logs/bulk-class", json={
        "class_name": "CommBulkTest-Send", "section": "A",
        "channel": "In App", "category": "Notice", "message_body": "PTM tomorrow",
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["matched_count"] == 2
    assert body["sent_count"] == 2
    assert body["failed_count"] == 0
    assert body["skipped_count"] == 0


def test_bulk_class_without_section_includes_all_sections(client, auth, db_session):
    _make_student(db_session, class_name="CommBulkTest-AllSections", section="A")
    _make_student(db_session, class_name="CommBulkTest-AllSections", section="B")

    resp = client.post("/communications/logs/bulk-class", json={
        "class_name": "CommBulkTest-AllSections",
        "channel": "In App", "category": "Notice", "message_body": "Holiday notice",
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    assert resp.json()["matched_count"] == 2


def test_bulk_class_skips_students_without_contact_for_channel(client, auth, db_session):
    _make_student(db_session, class_name="CommBulkTest-NoPhone", guardian_phone=None)

    resp = client.post("/communications/logs/bulk-class", json={
        "class_name": "CommBulkTest-NoPhone",
        "channel": "WhatsApp", "category": "Notice", "message_body": "Reminder",
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["matched_count"] == 1
    assert body["skipped_count"] == 1
    assert body["sent_count"] == 0


def test_bulk_class_excludes_inactive_students(client, auth, db_session):
    _make_student(db_session, class_name="CommBulkTest-Inactive", student_status="Active")
    _make_student(db_session, class_name="CommBulkTest-Inactive", student_status="Withdrawn")

    resp = client.post("/communications/logs/bulk-class", json={
        "class_name": "CommBulkTest-Inactive",
        "channel": "In App", "category": "Notice", "message_body": "Notice",
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    assert resp.json()["matched_count"] == 1


def test_bulk_class_404s_when_nothing_matches(client, auth):
    resp = client.post("/communications/logs/bulk-class", json={
        "class_name": "CommBulkTest-NoSuchClass",
        "channel": "In App", "category": "Notice", "message_body": "Notice",
    }, headers=auth)
    assert resp.status_code == 404


def test_bulk_class_creates_one_log_per_recipient(client, auth, db_session):
    from app.models import CommunicationLog

    _make_student(db_session, class_name="CommBulkTest-LogCount")
    _make_student(db_session, class_name="CommBulkTest-LogCount")

    client.post("/communications/logs/bulk-class", json={
        "class_name": "CommBulkTest-LogCount",
        "channel": "In App", "category": "Notice", "message_body": "Notice-LogCount-Unique",
    }, headers=auth)

    logs = (
        db_session.query(CommunicationLog)
        .filter(CommunicationLog.related_module == "students")
        .filter(CommunicationLog.message_body == "Notice-LogCount-Unique")
        .all()
    )
    assert len(logs) == 2
