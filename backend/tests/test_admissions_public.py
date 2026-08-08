"""POST /admissions/public — the unauthenticated 'Apply Online' endpoint.

Runs in log-only mail mode (no SMTP configured in tests), consistent with
test_notifications.py.
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


def _payload(**overrides):
    unique = uuid.uuid4().hex[:8]
    defaults = dict(
        student_name=f"Public Applicant {unique}",
        grade_applying="7",
        academic_year="2026-27",
        guardian_name="Test Guardian",
        guardian_phone="+919800000000",
        guardian_email=f"guardian-{unique}@example.com",
        notes="Submitted via automated test",
    )
    defaults.update(overrides)
    return defaults


def test_public_submission_requires_no_auth_and_creates_inquiry(client, db_session):
    from app.models import AdmissionInquiry

    resp = client.post("/admissions/public", json=_payload())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["inquiry_no"]
    assert "received" in body["message"].lower()

    inquiry = (
        db_session.query(AdmissionInquiry)
        .filter(AdmissionInquiry.inquiry_no == body["inquiry_no"])
        .first()
    )
    assert inquiry is not None
    assert inquiry.source == "Website"
    assert inquiry.stage == "Inquiry"
    assert inquiry.assigned_to is None
    assert inquiry.converted_student_id is None


def test_public_submission_ignores_internal_fields(client, db_session):
    """A public caller can't set stage/assigned_to/converted_student_id —
    the schema doesn't declare them, so pydantic drops them silently.
    """
    from app.models import AdmissionInquiry

    payload = _payload()
    payload["stage"] = "Enrolled"
    payload["assigned_to"] = "Someone"
    payload["converted_student_id"] = 999999

    resp = client.post("/admissions/public", json=payload)
    assert resp.status_code == 200, resp.text

    inquiry = (
        db_session.query(AdmissionInquiry)
        .filter(AdmissionInquiry.inquiry_no == resp.json()["inquiry_no"])
        .first()
    )
    assert inquiry.stage == "Inquiry"
    assert inquiry.assigned_to is None
    assert inquiry.converted_student_id is None


def test_public_submission_honeypot_drops_silently(client, db_session):
    from app.models import AdmissionInquiry

    before = db_session.query(AdmissionInquiry).count()

    resp = client.post("/admissions/public", json=_payload(website="http://spam.example"))
    assert resp.status_code == 200, resp.text
    assert resp.json()["inquiry_no"] == ""

    after = db_session.query(AdmissionInquiry).count()
    assert after == before


@pytest.mark.parametrize(
    "field",
    ["student_name", "grade_applying", "academic_year", "guardian_name", "guardian_phone"],
)
def test_public_submission_requires_field(client, field):
    payload = _payload(**{field: "   "})
    resp = client.post("/admissions/public", json=payload)
    assert resp.status_code == 400
    assert field.replace("_", " ") in resp.json()["detail"].lower() or "required" in resp.json()["detail"].lower()


def test_public_submission_unknown_school_returns_404(client):
    resp = client.post("/admissions/public", json=_payload(account_code="no-such-school"))
    assert resp.status_code == 404


def test_public_school_info_returns_branding_for_known_school(client):
    resp = client.get("/admissions/public/school-info", params={"account_code": "default"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["school_name"]


def test_public_school_info_404_for_unknown_school(client):
    resp = client.get("/admissions/public/school-info", params={"account_code": "no-such-school"})
    assert resp.status_code == 404


def test_public_submission_sends_confirmation_email(client, db_session):
    from app.models import AdmissionInquiry, CommunicationLog

    resp = client.post("/admissions/public", json=_payload())
    assert resp.status_code == 200, resp.text
    inquiry = (
        db_session.query(AdmissionInquiry)
        .filter(AdmissionInquiry.inquiry_no == resp.json()["inquiry_no"])
        .first()
    )

    log = (
        db_session.query(CommunicationLog)
        .filter(
            CommunicationLog.related_module == "admissions",
            CommunicationLog.related_record_id == inquiry.id,
        )
        .first()
    )
    assert log is not None
    assert log.channel == "Email"
    assert log.status == "Sent"
