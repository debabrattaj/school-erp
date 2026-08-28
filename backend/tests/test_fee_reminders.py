"""Fee reminders.

The tests that matter are the ones protecting parents from the system:
never the same reminder twice, never three at once when the feature is
switched on against a backlog, never a bill for the full amount after they
have paid half, and never silence when the school has no way to reach them.
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
    """Flip the entitlement the same way the Platform Console does."""
    from app.tenant import CentralSessionLocal, get_account
    from app.tenant_models import SchoolFeature

    account = get_account("default")
    db = CentralSessionLocal()
    try:
        row = (
            db.query(SchoolFeature)
            .filter(
                SchoolFeature.account_id == account["id"],
                SchoolFeature.feature_key == "fee_reminders",
            )
            .first()
        )
        if row:
            row.is_enabled = enabled
        else:
            db.add(SchoolFeature(
                account_id=account["id"], feature_key="fee_reminders", is_enabled=enabled,
            ))
        db.commit()
    finally:
        db.close()


@pytest.fixture()
def reminders_on(client):
    """Sold behind a platform flag and off by default, so a test that drives
    the API has to switch it on first -- exactly as a real school would need
    the platform owner to."""
    _set_reminders_enabled(True)
    yield
    _set_reminders_enabled(False)


def _student(db, **overrides):
    from app.models import Student
    fields = {
        "admission_no": f"FR-{uuid.uuid4().hex[:8]}",
        "first_name": "Fee", "last_name": "Payer",
        "guardian_name": "A Guardian", "guardian_email": "guardian@example.com",
        "guardian_phone": "9876500200",
    }
    fields.update(overrides)
    student = Student(**fields)
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


def _fee(db, student_id, days_ago=10, total=10000, paid=0, concession=0, status="Unpaid"):
    from app.models import Fee
    fee = Fee(
        student_id=student_id, fee_type="Tuition Fee", academic_year="2026-27",
        total_amount=total, paid_amount=paid, concession_amount=concession,
        due_amount=max(total - concession - paid, 0), payment_status=status,
        due_date=date.today() - timedelta(days=days_ago),
    )
    db.add(fee)
    db.commit()
    db.refresh(fee)
    return fee


def _rule(db, name, offset_days, channel="Email", min_due=0, active=True):
    from app.models import FeeReminderRule
    rule = FeeReminderRule(
        name=name, offset_days=offset_days, channel=channel,
        min_due_amount=min_due, is_active=active,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


def _clear_rules(db):
    from app.models import FeeReminderLog, FeeReminderRule
    db.query(FeeReminderLog).delete()
    db.query(FeeReminderRule).delete()
    db.commit()


def _run(db, **kwargs):
    from app.fee_reminders import run_reminders
    return run_reminders(db, **kwargs)


def _logs_for(db, fee_id):
    from app.models import FeeReminderLog
    db.expire_all()
    return db.query(FeeReminderLog).filter(FeeReminderLog.fee_id == fee_id).all()


def _sent_count(db, fee_id):
    """Reminders actually sent for one fee.

    The run's own counters cover every fee in the database, including those
    other tests created, so they cannot answer "did *this* fee get chased".
    """
    return len([e for e in _logs_for(db, fee_id) if e.status == "Sent"])


# --------------------------------------------------------------------------
# What is owed
# --------------------------------------------------------------------------


def test_outstanding_is_net_of_concession_and_payment(client, db_session):
    """Billing the full amount after a part payment is the fastest way to lose
    a parent's trust in the whole system."""
    from app.fee_reminders import outstanding_for

    student = _student(db_session)
    fee = _fee(db_session, student.id, total=10000, concession=2000, paid=3000)
    assert outstanding_for(fee) == 5000.0


def test_a_settled_fee_is_never_chased(client, db_session):
    from app.fee_reminders import is_chaseable

    student = _student(db_session)
    paid = _fee(db_session, student.id, total=5000, paid=5000, status="Paid")
    chaseable, reason = is_chaseable(paid)
    assert chaseable is False
    assert "Paid" in reason


def test_a_fee_with_no_due_date_has_no_ladder_to_climb(client, db_session):
    from app.fee_reminders import is_chaseable
    from app.models import Fee

    student = _student(db_session)
    fee = Fee(student_id=student.id, fee_type="Tuition Fee", total_amount=5000,
              paid_amount=0, payment_status="Unpaid", due_date=None)
    db_session.add(fee)
    db_session.commit()

    chaseable, reason = is_chaseable(fee)
    assert chaseable is False
    assert "due date" in reason


def test_a_fully_conceded_fee_is_not_chased(client, db_session):
    from app.fee_reminders import is_chaseable

    student = _student(db_session)
    fee = _fee(db_session, student.id, total=8000, concession=8000)
    chaseable, reason = is_chaseable(fee)
    assert chaseable is False
    assert "nothing outstanding" in reason


# --------------------------------------------------------------------------
# The ladder
# --------------------------------------------------------------------------


def test_a_rung_fires_once_however_often_the_cron_runs(client, db_session):
    """The unique constraint is what makes an hourly schedule safe."""
    _clear_rules(db_session)
    _rule(db_session, "First reminder", 7)
    student = _student(db_session)
    fee = _fee(db_session, student.id, days_ago=10)

    _run(db_session)
    assert _sent_count(db_session, fee.id) == 1

    _run(db_session)
    assert _sent_count(db_session, fee.id) == 1
    assert len(_logs_for(db_session, fee.id)) == 1


def test_switching_on_against_a_backlog_sends_one_message_not_three(client, db_session):
    """The catch-up case. Firing every passed rung at once would send every
    parent three emails in the same minute."""
    _clear_rules(db_session)
    _rule(db_session, "First reminder", 7)
    _rule(db_session, "Second reminder", 15)
    _rule(db_session, "Final notice", 30)

    student = _student(db_session)
    fee = _fee(db_session, student.id, days_ago=40)

    _run(db_session)

    logs = _logs_for(db_session, fee.id)
    assert len(logs) == 3
    sent = [entry for entry in logs if entry.status == "Sent"]
    assert len(sent) == 1
    # The furthest along the ladder is the one that goes.
    assert sent[0].offset_days == 30


def test_a_superseded_rung_never_fires_later(client, db_session):
    _clear_rules(db_session)
    _rule(db_session, "First reminder", 7)
    _rule(db_session, "Final notice", 30)

    student = _student(db_session)
    fee = _fee(db_session, student.id, days_ago=40)
    _run(db_session)

    _run(db_session)
    assert _sent_count(db_session, fee.id) == 1
    assert len(_logs_for(db_session, fee.id)) == 2


def test_rungs_fire_in_order_as_time_passes(client, db_session):
    """Not a backlog: each rung comes due on its own day."""
    _clear_rules(db_session)
    _rule(db_session, "First reminder", 7)
    _rule(db_session, "Final notice", 30)

    student = _student(db_session)
    fee = _fee(db_session, student.id, days_ago=0)

    _run(db_session, as_of=date.today() + timedelta(days=7))
    assert _sent_count(db_session, fee.id) == 1

    _run(db_session, as_of=date.today() + timedelta(days=10))
    assert _sent_count(db_session, fee.id) == 1     # nothing new is due yet

    _run(db_session, as_of=date.today() + timedelta(days=30))
    assert _sent_count(db_session, fee.id) == 2

    assert sorted(e.offset_days for e in _logs_for(db_session, fee.id)) == [7, 30]


def test_a_rung_that_is_not_due_yet_does_not_fire(client, db_session):
    _clear_rules(db_session)
    _rule(db_session, "Final notice", 30)
    student = _student(db_session)
    fee = _fee(db_session, student.id, days_ago=5)

    _run(db_session)
    assert _logs_for(db_session, fee.id) == []


def test_a_courtesy_rung_can_fire_before_the_due_date(client, db_session):
    _clear_rules(db_session)
    _rule(db_session, "Courtesy note", -3)
    student = _student(db_session)
    # Due in two days, so the -3 rung is already due.
    fee = _fee(db_session, student.id, days_ago=-2)

    _run(db_session)
    assert _sent_count(db_session, fee.id) == 1


def test_trivial_balances_are_left_alone(client, db_session):
    """Chasing twelve rupees costs more in goodwill than it collects."""
    _clear_rules(db_session)
    _rule(db_session, "First reminder", 7, min_due=500)

    student = _student(db_session)
    fee = _fee(db_session, student.id, days_ago=10, total=100)

    _run(db_session)
    assert _logs_for(db_session, fee.id) == []


def test_an_inactive_rung_is_ignored(client, db_session):
    _clear_rules(db_session)
    _rule(db_session, "Disabled", 7, active=False)
    student = _student(db_session)
    fee = _fee(db_session, student.id, days_ago=10)

    _run(db_session)
    assert _logs_for(db_session, fee.id) == []


def test_no_rules_means_no_work(client, db_session):
    _clear_rules(db_session)
    student = _student(db_session)
    _fee(db_session, student.id, days_ago=10)

    result = _run(db_session)
    assert result["sent"] == 0
    assert "No active reminder rules" in result["note"]


# --------------------------------------------------------------------------
# Paying stops it
# --------------------------------------------------------------------------


def test_paying_before_the_next_rung_stops_the_ladder(client, db_session):
    _clear_rules(db_session)
    _rule(db_session, "First reminder", 7)
    _rule(db_session, "Final notice", 30)

    student = _student(db_session)
    fee = _fee(db_session, student.id, days_ago=7)
    _run(db_session)
    assert _sent_count(db_session, fee.id) == 1

    fee.paid_amount = fee.total_amount
    fee.payment_status = "Paid"
    db_session.commit()

    _run(db_session, as_of=date.today() + timedelta(days=40))
    assert _sent_count(db_session, fee.id) == 1     # the final notice never goes


# --------------------------------------------------------------------------
# Unreachable families
# --------------------------------------------------------------------------


def test_no_contact_records_a_reason_rather_than_silence(client, db_session):
    """"We never got any reminder" is exactly the dispute this has to answer."""
    _clear_rules(db_session)
    _rule(db_session, "First reminder", 7, channel="Email")

    student = _student(db_session, guardian_email="", guardian_phone="")
    fee = _fee(db_session, student.id, days_ago=10)

    _run(db_session)

    entry = _logs_for(db_session, fee.id)[0]
    assert entry.status == "Skipped"
    assert "no email address" in entry.skip_reason


def test_an_sms_rung_needs_a_phone_not_an_email(client, db_session):
    _clear_rules(db_session)
    _rule(db_session, "SMS chase", 7, channel="SMS")

    student = _student(db_session, guardian_phone="", guardian_email="p@example.com")
    fee = _fee(db_session, student.id, days_ago=10)
    _run(db_session)

    assert "no phone number" in _logs_for(db_session, fee.id)[0].skip_reason


def test_a_portal_parent_is_used_when_the_student_record_has_no_email(client, db_session):
    from app.models import ParentStudentLink, User
    from app.security import hash_password

    _clear_rules(db_session)
    _rule(db_session, "First reminder", 7)

    student = _student(db_session, guardian_email="", guardian_name="")
    email = f"portal-{uuid.uuid4().hex[:6]}@example.com"
    parent = User(name="Portal Parent", email=email,
                  password_hash=hash_password("x12345678"), role="Parent")
    db_session.add(parent)
    db_session.commit()
    db_session.add(ParentStudentLink(user_id=parent.id, student_id=student.id))
    db_session.commit()

    fee = _fee(db_session, student.id, days_ago=10)
    _run(db_session)
    assert _sent_count(db_session, fee.id) == 1
    assert _logs_for(db_session, fee.id)[0].recipient == email


# --------------------------------------------------------------------------
# What the message says
# --------------------------------------------------------------------------


def test_the_message_quotes_the_outstanding_amount(client, db_session):
    from app.models import CommunicationLog

    _clear_rules(db_session)
    _rule(db_session, "First reminder", 7)

    student = _student(db_session)
    fee = _fee(db_session, student.id, days_ago=10, total=10000, concession=2000, paid=3000)
    _run(db_session)

    entry = _logs_for(db_session, fee.id)[0]
    assert entry.outstanding_amount == 5000.0

    message = db_session.query(CommunicationLog).filter(
        CommunicationLog.id == entry.communication_log_id).first()
    assert "5,000.00" in message.message_body
    assert message.related_module == "fees"
    assert message.related_record_id == fee.id


def test_a_school_template_replaces_the_built_in_wording(client, db_session):
    from app.models import CommunicationLog, CommunicationTemplate

    _clear_rules(db_session)
    template = CommunicationTemplate(
        template_name=f"Chase-{uuid.uuid4().hex[:6]}", channel="Email",
        category="Fee Reminder", subject="Overdue: {fee_type}",
        body="Namaste {recipient_name}, {amount_due} is pending for {student_name}.",
    )
    db_session.add(template)
    db_session.commit()
    db_session.refresh(template)

    rule = _rule(db_session, "Templated", 7)
    rule.template_id = template.id
    db_session.commit()

    student = _student(db_session, first_name="Asha", last_name="Rao")
    fee = _fee(db_session, student.id, days_ago=10, total=4500)
    _run(db_session)

    entry = _logs_for(db_session, fee.id)[0]
    message = db_session.query(CommunicationLog).filter(
        CommunicationLog.id == entry.communication_log_id).first()
    assert "Namaste" in message.message_body
    assert "Asha Rao" in message.message_body
    assert "4,500.00" in message.message_body


def test_an_unknown_placeholder_is_left_alone_rather_than_crashing(client, db_session):
    """One school's typo must not stop the whole run."""
    from app.fee_reminders import render

    assert render("Hi {recipient_name}, {not_a_variable}", {"recipient_name": "X"}) == \
        "Hi X, {not_a_variable}"


# --------------------------------------------------------------------------
# Preview and batching
# --------------------------------------------------------------------------


def test_preview_reports_without_sending_anything(client, db_session):
    _clear_rules(db_session)
    _rule(db_session, "First reminder", 7)
    student = _student(db_session)
    fee = _fee(db_session, student.id, days_ago=10)

    result = _run(db_session, dry_run=True)
    assert result["dry_run"] is True
    assert any(row["fee_id"] == fee.id for row in result["detail"])

    # Nothing was written, so a real run still has work to do.
    assert _logs_for(db_session, fee.id) == []
    _run(db_session)
    assert _sent_count(db_session, fee.id) == 1


def test_the_batch_limit_is_respected(client, db_session):
    """Shared hosting kills a long cron; a half-sent batch that cannot say how
    far it got is worse than a small one."""
    _clear_rules(db_session)
    _rule(db_session, "First reminder", 7)
    for _ in range(4):
        _fee(db_session, _student(db_session).id, days_ago=10)

    first = _run(db_session, limit=2)
    assert first["sent"] == 2

    second = _run(db_session, limit=10)
    assert second["sent"] >= 2


# --------------------------------------------------------------------------
# The API
# --------------------------------------------------------------------------


def test_the_module_is_off_until_the_platform_owner_enables_it(client, auth):
    """A module that messages parents must not switch itself on."""
    resp = client.get("/fee-reminders/rules", headers=auth)
    assert resp.status_code == 403


def test_rules_can_be_managed_once_enabled(client, auth, reminders_on, db_session):
    _clear_rules(db_session)
    created = client.post("/fee-reminders/rules", json={
        "name": "First reminder", "offset_days": 7, "channel": "Email",
    }, headers=auth)
    assert created.status_code == 200, created.text
    assert created.json()["when"] == "7 day(s) after due"

    listed = client.get("/fee-reminders/rules", headers=auth).json()
    assert any(r["id"] == created.json()["id"] for r in listed)


def test_two_rungs_on_the_same_day_and_channel_are_refused(client, auth, reminders_on, db_session):
    _clear_rules(db_session)
    client.post("/fee-reminders/rules",
                json={"name": "One", "offset_days": 7, "channel": "Email"}, headers=auth)
    clash = client.post("/fee-reminders/rules",
                        json={"name": "Two", "offset_days": 7, "channel": "Email"}, headers=auth)
    assert clash.status_code == 400
    assert "duplicate message" in clash.json()["detail"]


def test_the_same_day_on_a_different_channel_is_allowed(client, auth, reminders_on, db_session):
    _clear_rules(db_session)
    client.post("/fee-reminders/rules",
                json={"name": "Email chase", "offset_days": 7, "channel": "Email"}, headers=auth)
    sms = client.post("/fee-reminders/rules",
                      json={"name": "SMS chase", "offset_days": 7, "channel": "SMS"}, headers=auth)
    assert sms.status_code == 200


def test_a_rung_that_has_been_sent_cannot_be_deleted(client, auth, reminders_on, db_session):
    _clear_rules(db_session)
    rule = _rule(db_session, "Already sent", 7)
    student = _student(db_session)
    _fee(db_session, student.id, days_ago=10)
    _run(db_session)

    resp = client.delete(f"/fee-reminders/rules/{rule.id}", headers=auth)
    assert resp.status_code == 400
    assert "deactivate it instead" in resp.json()["detail"]


def test_an_unused_rung_can_be_deleted(client, auth, reminders_on, db_session):
    _clear_rules(db_session)
    rule = _rule(db_session, "Never used", 99)
    assert client.delete(f"/fee-reminders/rules/{rule.id}", headers=auth).status_code == 200


def test_history_shows_what_was_sent(client, auth, reminders_on, db_session):
    _clear_rules(db_session)
    _rule(db_session, "First reminder", 7)
    student = _student(db_session)
    fee = _fee(db_session, student.id, days_ago=10)
    _run(db_session)

    rows = client.get(f"/fee-reminders/history?fee_id={fee.id}", headers=auth).json()
    assert len(rows) == 1
    assert rows[0]["status"] == "Sent"
    assert rows[0]["outstanding_amount"] > 0
