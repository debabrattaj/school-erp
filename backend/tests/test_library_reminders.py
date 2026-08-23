"""Overdue library book reminders.

Mirrors test_fee_reminders.py: the protections that matter are the same --
never the same reminder twice, never a flood when the feature is switched on
against a backlog, and never silence when there is no way to reach the
borrower. The library-specific wrinkle is the borrower can be a student
(chased through the guardian) or a staff member (chased directly).
"""

import uuid
from datetime import date, timedelta

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


def _set_reminders_enabled(enabled: bool):
    from app.tenant import CentralSessionLocal, get_account
    from app.tenant_models import SchoolFeature

    account = get_account("default")
    db = CentralSessionLocal()
    try:
        row = (
            db.query(SchoolFeature)
            .filter(
                SchoolFeature.account_id == account["id"],
                SchoolFeature.feature_key == "library_reminders",
            )
            .first()
        )
        if row:
            row.is_enabled = enabled
        else:
            db.add(SchoolFeature(
                account_id=account["id"], feature_key="library_reminders", is_enabled=enabled,
            ))
        db.commit()
    finally:
        db.close()


@pytest.fixture()
def reminders_on(client):
    _set_reminders_enabled(True)
    yield
    _set_reminders_enabled(False)


def _student(db, **overrides):
    from app.models import Student
    fields = {
        "admission_no": f"LR-{uuid.uuid4().hex[:8]}",
        "first_name": "Overdue", "last_name": "Reader",
        "guardian_name": "A Guardian", "guardian_email": "guardian@example.com",
        "guardian_phone": "9876500200",
    }
    fields.update(overrides)
    student = Student(**fields)
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


def _teacher(db, **overrides):
    from app.models import Teacher
    fields = {
        "employee_no": f"LRT-{uuid.uuid4().hex[:8]}", "name": "Overdue Teacher",
        "email": f"lrt-{uuid.uuid4().hex[:6]}@example.com", "phone": "9876500300",
    }
    fields.update(overrides)
    teacher = Teacher(**fields)
    db.add(teacher)
    db.commit()
    db.refresh(teacher)
    return teacher


def _book(db, **overrides):
    from app.models import LibraryBook
    fields = {
        "accession_no": f"LRB-{uuid.uuid4().hex[:8]}", "title": "Overdue Test Book",
        "total_copies": 2, "available_copies": 2,
    }
    fields.update(overrides)
    book = LibraryBook(**fields)
    db.add(book)
    db.commit()
    db.refresh(book)
    return book


def _issue(db, book_id, days_ago=10, borrower_type="Student", student_id=None, staff_id=None, status="Issued"):
    from app.models import LibraryIssue
    issue_date = date.today() - timedelta(days=days_ago + 14)
    issue = LibraryIssue(
        book_id=book_id, borrower_type=borrower_type, student_id=student_id, staff_id=staff_id,
        issue_date=issue_date, due_date=date.today() - timedelta(days=days_ago), status=status,
    )
    db.add(issue)
    db.commit()
    db.refresh(issue)
    return issue


def _rule(db, name, offset_days, channel="Email", active=True):
    from app.models import LibraryReminderRule
    rule = LibraryReminderRule(name=name, offset_days=offset_days, channel=channel, is_active=active)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


def _clear_rules(db):
    from app.models import LibraryReminderLog, LibraryReminderRule
    db.query(LibraryReminderLog).delete()
    db.query(LibraryReminderRule).delete()
    db.commit()


def _run(db, **kwargs):
    from app.library_reminders import run_reminders
    return run_reminders(db, **kwargs)


def _logs_for(db, issue_id):
    from app.models import LibraryReminderLog
    db.expire_all()
    return db.query(LibraryReminderLog).filter(LibraryReminderLog.issue_id == issue_id).all()


def _sent_count(db, issue_id):
    return len([e for e in _logs_for(db, issue_id) if e.status == "Sent"])


# --------------------------------------------------------------------------
# What is chaseable
# --------------------------------------------------------------------------


def test_a_returned_book_is_never_chased(client, db_session):
    from app.library_reminders import is_chaseable
    book = _book(db_session)
    student = _student(db_session)
    issue = _issue(db_session, book.id, student_id=student.id, status="Returned")
    chaseable, reason = is_chaseable(issue)
    assert chaseable is False
    assert "Returned" in reason


def test_an_issue_with_no_due_date_has_no_ladder(client, db_session):
    from app.library_reminders import is_chaseable
    from app.models import LibraryIssue
    book = _book(db_session)
    student = _student(db_session)
    issue = LibraryIssue(book_id=book.id, borrower_type="Student", student_id=student.id,
                          issue_date=date.today(), status="Issued", due_date=None)
    db_session.add(issue)
    db_session.commit()
    chaseable, reason = is_chaseable(issue)
    assert chaseable is False
    assert "due date" in reason


# --------------------------------------------------------------------------
# The ladder
# --------------------------------------------------------------------------


def test_a_rung_fires_once_however_often_the_cron_runs(client, db_session):
    _clear_rules(db_session)
    _rule(db_session, "First overdue notice", 3)
    book = _book(db_session)
    student = _student(db_session)
    issue = _issue(db_session, book.id, days_ago=5, student_id=student.id)

    _run(db_session)
    assert _sent_count(db_session, issue.id) == 1

    _run(db_session)
    assert _sent_count(db_session, issue.id) == 1
    assert len(_logs_for(db_session, issue.id)) == 1


def test_switching_on_against_a_backlog_sends_one_message_not_three(client, db_session):
    _clear_rules(db_session)
    _rule(db_session, "First notice", 3)
    _rule(db_session, "Second notice", 10)
    _rule(db_session, "Final notice", 20)

    book = _book(db_session)
    student = _student(db_session)
    issue = _issue(db_session, book.id, days_ago=25, student_id=student.id)

    _run(db_session)
    logs = _logs_for(db_session, issue.id)
    assert len(logs) == 3
    sent = [e for e in logs if e.status == "Sent"]
    assert len(sent) == 1
    assert sent[0].offset_days == 20


def test_a_rung_not_due_yet_does_not_fire(client, db_session):
    _clear_rules(db_session)
    _rule(db_session, "Final notice", 20)
    book = _book(db_session)
    student = _student(db_session)
    issue = _issue(db_session, book.id, days_ago=5, student_id=student.id)

    _run(db_session)
    assert _logs_for(db_session, issue.id) == []


def test_an_inactive_rule_is_ignored(client, db_session):
    _clear_rules(db_session)
    _rule(db_session, "Disabled", 3, active=False)
    book = _book(db_session)
    student = _student(db_session)
    issue = _issue(db_session, book.id, days_ago=5, student_id=student.id)

    _run(db_session)
    assert _logs_for(db_session, issue.id) == []


def test_returning_the_book_stops_the_ladder(client, db_session):
    _clear_rules(db_session)
    _rule(db_session, "First notice", 3)
    _rule(db_session, "Final notice", 20)
    book = _book(db_session)
    student = _student(db_session)
    issue = _issue(db_session, book.id, days_ago=3, student_id=student.id)

    _run(db_session)
    assert _sent_count(db_session, issue.id) == 1

    issue.status = "Returned"
    db_session.commit()

    _run(db_session, as_of=date.today() + timedelta(days=25))
    assert _sent_count(db_session, issue.id) == 1     # the final notice never goes


# --------------------------------------------------------------------------
# Who gets chased
# --------------------------------------------------------------------------


def test_a_student_borrower_is_chased_through_the_guardian(client, db_session):
    _clear_rules(db_session)
    _rule(db_session, "First notice", 3)
    book = _book(db_session)
    student = _student(db_session, guardian_email="parent@example.com")
    issue = _issue(db_session, book.id, days_ago=5, student_id=student.id)

    _run(db_session)
    entry = _logs_for(db_session, issue.id)[0]
    assert entry.status == "Sent"
    assert entry.recipient == "parent@example.com"


def test_a_staff_borrower_is_chased_directly(client, db_session):
    _clear_rules(db_session)
    _rule(db_session, "First notice", 3)
    book = _book(db_session)
    teacher = _teacher(db_session, email="teacher@example.com")
    issue = _issue(db_session, book.id, days_ago=5, borrower_type="Staff", staff_id=teacher.id)

    _run(db_session)
    entry = _logs_for(db_session, issue.id)[0]
    assert entry.status == "Sent"
    assert entry.recipient == "teacher@example.com"


def test_no_contact_records_a_reason_rather_than_silence(client, db_session):
    _clear_rules(db_session)
    _rule(db_session, "First notice", 3, channel="Email")
    book = _book(db_session)
    student = _student(db_session, guardian_email="", guardian_phone="", guardian_name="")
    issue = _issue(db_session, book.id, days_ago=5, student_id=student.id)

    _run(db_session)
    entry = _logs_for(db_session, issue.id)[0]
    assert entry.status == "Skipped"
    assert "no email address" in entry.skip_reason


# --------------------------------------------------------------------------
# The fine
# --------------------------------------------------------------------------


def test_the_fine_quoted_matches_settings(client, db_session):
    from app.models import CommunicationLog, LibrarySettings

    settings = db_session.query(LibrarySettings).first()
    if not settings:
        settings = LibrarySettings()
        db_session.add(settings)
    settings.fine_per_day = 5
    settings.fine_grace_days = 0
    db_session.commit()

    _clear_rules(db_session)
    _rule(db_session, "First notice", 3)
    book = _book(db_session)
    student = _student(db_session)
    issue = _issue(db_session, book.id, days_ago=6, student_id=student.id)

    _run(db_session)
    entry = _logs_for(db_session, issue.id)[0]
    assert entry.fine_amount == 30

    message = db_session.query(CommunicationLog).filter(
        CommunicationLog.id == entry.communication_log_id).first()
    assert "30.00" in message.message_body
    assert message.related_module == "library"


# --------------------------------------------------------------------------
# Preview
# --------------------------------------------------------------------------


def test_preview_reports_without_sending_anything(client, db_session):
    _clear_rules(db_session)
    _rule(db_session, "First notice", 3)
    book = _book(db_session)
    student = _student(db_session)
    issue = _issue(db_session, book.id, days_ago=5, student_id=student.id)

    result = _run(db_session, dry_run=True)
    assert result["dry_run"] is True
    assert any(row["issue_id"] == issue.id for row in result["detail"])
    assert _logs_for(db_session, issue.id) == []

    _run(db_session)
    assert _sent_count(db_session, issue.id) == 1


# --------------------------------------------------------------------------
# The API
# --------------------------------------------------------------------------


def test_the_module_is_off_until_the_platform_owner_enables_it(client, auth):
    resp = client.get("/library-reminders/rules", headers=auth)
    assert resp.status_code == 403


def test_rules_can_be_managed_once_enabled(client, auth, reminders_on, db_session):
    _clear_rules(db_session)
    created = client.post("/library-reminders/rules", json={
        "name": "First notice", "offset_days": 3, "channel": "Email",
    }, headers=auth)
    assert created.status_code == 200, created.text
    assert created.json()["when"] == "3 day(s) after due"

    listed = client.get("/library-reminders/rules", headers=auth).json()
    assert any(r["id"] == created.json()["id"] for r in listed)


def test_two_rungs_on_the_same_day_and_channel_are_refused(client, auth, reminders_on, db_session):
    _clear_rules(db_session)
    client.post("/library-reminders/rules",
                json={"name": "One", "offset_days": 3, "channel": "Email"}, headers=auth)
    clash = client.post("/library-reminders/rules",
                        json={"name": "Two", "offset_days": 3, "channel": "Email"}, headers=auth)
    assert clash.status_code == 400


def test_a_rung_that_has_fired_cannot_be_deleted(client, auth, reminders_on, db_session):
    _clear_rules(db_session)
    rule = _rule(db_session, "Already sent", 3)
    book = _book(db_session)
    student = _student(db_session)
    _issue(db_session, book.id, days_ago=5, student_id=student.id)
    _run(db_session)

    resp = client.delete(f"/library-reminders/rules/{rule.id}", headers=auth)
    assert resp.status_code == 400
    assert "deactivate it instead" in resp.json()["detail"]
