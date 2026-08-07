"""Email/WhatsApp notification touchpoints (app/notifications.py) and the
routes that trigger them: fee-added, admission inquiry received, and new
user welcome. All run in log-only mail mode (no SMTP configured in tests),
so a CommunicationLog with status "Sent" is what proves delivery was
attempted successfully, not an actual mailbox.
"""

import uuid

import pytest


@pytest.fixture()
def db_session(client):
    # Depends on `client` purely to force app.main's import-time
    # Base.metadata.create_all() to have run first (see test_fee_scheduling.py).
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
        first_name="Test", class_name="NotifyTest-5A", section="A",
        student_status="Active", residential_type="Day Scholar",
    )
    defaults.update(overrides)
    if "admission_no" not in defaults:
        defaults["admission_no"] = f"NOTIFY-{uuid.uuid4().hex[:10]}"
    student = Student(**defaults)
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


def _make_fee(db, student, **overrides):
    from app.models import Fee
    defaults = dict(
        student_id=student.id, fee_type="Tuition Fee", academic_year="2026-27",
        total_amount=1000, paid_amount=0, due_amount=1000, payment_status="Unpaid",
    )
    defaults.update(overrides)
    fee = Fee(**defaults)
    db.add(fee)
    db.commit()
    db.refresh(fee)
    return fee


# --- notify_guardian_fee_added: WhatsApp + Email ---

def test_fee_added_sends_both_channels_when_both_contacts_present(db_session):
    from app.models import CommunicationLog
    from app.notifications import notify_guardian_fee_added

    db = db_session
    student = _make_student(
        db, guardian_phone="+919876543210", guardian_email="parent@example.com",
    )
    fee = _make_fee(db, student)

    notify_guardian_fee_added(db, fee, student, "Test School")

    logs = db.query(CommunicationLog).filter(
        CommunicationLog.related_module == "fees", CommunicationLog.related_record_id == fee.id
    ).all()
    channels = {log.channel for log in logs}
    assert channels == {"WhatsApp", "Email"}
    assert all(log.status == "Sent" for log in logs)


def test_fee_added_sends_only_email_when_no_phone(db_session):
    from app.models import CommunicationLog
    from app.notifications import notify_guardian_fee_added

    db = db_session
    student = _make_student(db, guardian_phone=None, guardian_email="parent2@example.com")
    fee = _make_fee(db, student)

    notify_guardian_fee_added(db, fee, student, "Test School")

    logs = db.query(CommunicationLog).filter(
        CommunicationLog.related_module == "fees", CommunicationLog.related_record_id == fee.id
    ).all()
    assert [log.channel for log in logs] == ["Email"]


def test_fee_added_skips_when_no_contact_details(db_session):
    from app.models import CommunicationLog
    from app.notifications import notify_guardian_fee_added

    db = db_session
    student = _make_student(db, guardian_phone=None, guardian_email=None)
    fee = _make_fee(db, student)

    notify_guardian_fee_added(db, fee, student, "Test School")

    count = db.query(CommunicationLog).filter(
        CommunicationLog.related_module == "fees", CommunicationLog.related_record_id == fee.id
    ).count()
    assert count == 0


def test_fee_added_skips_when_fully_paid(db_session):
    from app.models import CommunicationLog
    from app.notifications import notify_guardian_fee_added

    db = db_session
    student = _make_student(db, guardian_phone="+919876543211", guardian_email="paid@example.com")
    fee = _make_fee(db, student, total_amount=1000, paid_amount=1000, due_amount=0, payment_status="Paid")

    notify_guardian_fee_added(db, fee, student, "Test School")

    count = db.query(CommunicationLog).filter(
        CommunicationLog.related_module == "fees", CommunicationLog.related_record_id == fee.id
    ).count()
    assert count == 0


# --- notify_admission_inquiry_received ---

def test_admission_inquiry_notification_sent_with_guardian_email(db_session):
    from app.models import AdmissionInquiry, CommunicationLog
    from app.notifications import notify_admission_inquiry_received

    db = db_session
    inquiry = AdmissionInquiry(
        inquiry_no=f"NOTIFY-INQ-{uuid.uuid4().hex[:8]}",
        student_name="Aarav Kumar", grade_applying="5", academic_year="2026-27",
        guardian_name="Rahul Kumar", guardian_phone="+919876543212",
        guardian_email="guardian@example.com",
    )
    db.add(inquiry)
    db.commit()
    db.refresh(inquiry)

    notify_admission_inquiry_received(db, inquiry, "Test School")

    log = db.query(CommunicationLog).filter(
        CommunicationLog.related_module == "admissions", CommunicationLog.related_record_id == inquiry.id
    ).first()
    assert log is not None
    assert log.channel == "Email"
    assert log.status == "Sent"
    assert "Aarav Kumar" in log.message_body


def test_admission_inquiry_notification_skipped_without_guardian_email(db_session):
    from app.models import AdmissionInquiry, CommunicationLog
    from app.notifications import notify_admission_inquiry_received

    db = db_session
    inquiry = AdmissionInquiry(
        inquiry_no=f"NOTIFY-INQ-{uuid.uuid4().hex[:8]}",
        student_name="No Email Kid", grade_applying="5", academic_year="2026-27",
        guardian_name="Guardian", guardian_phone="+919876543213", guardian_email=None,
    )
    db.add(inquiry)
    db.commit()
    db.refresh(inquiry)

    notify_admission_inquiry_received(db, inquiry, "Test School")

    count = db.query(CommunicationLog).filter(
        CommunicationLog.related_module == "admissions", CommunicationLog.related_record_id == inquiry.id
    ).count()
    assert count == 0


# --- notify_new_user_welcome ---

def test_new_user_welcome_email_sent_and_never_includes_password(db_session):
    from app.models import CommunicationLog, User

    db = db_session
    user = User(
        name="New Teacher", email=f"newteacher-{uuid.uuid4().hex[:8]}@example.com",
        password_hash="irrelevant-hash-not-a-real-password", role="Teacher",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    from app.notifications import notify_new_user_welcome
    notify_new_user_welcome(db, user, "Test School")

    log = db.query(CommunicationLog).filter(
        CommunicationLog.related_module == "users", CommunicationLog.related_record_id == user.id
    ).first()
    assert log is not None
    assert log.channel == "Email"
    assert log.status == "Sent"
    assert "irrelevant-hash-not-a-real-password" not in log.message_body
    assert "Teacher" in log.message_body


# --- Integration: the actual routes fire these notifications ---

def test_create_admission_inquiry_route_sends_confirmation_email(client, auth, db_session):
    from app.models import CommunicationLog

    resp = client.post("/admissions/", json={
        "inquiry_no": "",
        "student_name": "Route Test Student",
        "grade_applying": "6",
        "academic_year": "2026-27",
        "guardian_name": "Route Test Guardian",
        "guardian_phone": "+919876543214",
        "guardian_email": "routetest@example.com",
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    inquiry_id = resp.json()["id"]

    log = db_session.query(CommunicationLog).filter(
        CommunicationLog.related_module == "admissions", CommunicationLog.related_record_id == inquiry_id
    ).first()
    assert log is not None
    assert log.channel == "Email"


def test_create_user_route_sends_welcome_email(client, auth, db_session):
    from app.models import CommunicationLog

    email = f"routeuser-{uuid.uuid4().hex[:8]}@example.com"
    resp = client.post("/users/", json={
        "name": "Route Test User",
        "email": email,
        "password": "Str0ng!Passw0rd",
        "role": "Teacher",
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    user_id = resp.json()["id"]

    log = db_session.query(CommunicationLog).filter(
        CommunicationLog.related_module == "users", CommunicationLog.related_record_id == user_id
    ).first()
    assert log is not None
    assert log.channel == "Email"
    assert "Str0ng!Passw0rd" not in log.message_body
