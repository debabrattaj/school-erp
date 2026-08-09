"""Scheduled fee auto-generation: pure recurrence math (app/fee_scheduling.py)
plus the assign_class_fee dedup/active-only behavior it relies on
(app/routes/fees.py) and the fee-structures API's schedule validation.
"""

from datetime import date

import pytest


# --- Pure recurrence math (app/fee_scheduling.py) ---

def test_add_months_same_year():
    from app.fee_scheduling import add_months
    assert add_months(date(2026, 1, 15), 1) == date(2026, 2, 15)
    assert add_months(date(2026, 1, 15), 3) == date(2026, 4, 15)


def test_add_months_rolls_year():
    from app.fee_scheduling import add_months
    assert add_months(date(2026, 11, 5), 3) == date(2027, 2, 5)
    assert add_months(date(2026, 12, 1), 1) == date(2027, 1, 1)


def test_add_months_preserves_day():
    from app.fee_scheduling import add_months
    # Only ever called with day <= 28 in practice (validate_schedule enforces
    # it), so no Feb-30 ambiguity to resolve here.
    assert add_months(date(2026, 1, 28), 1) == date(2026, 2, 28)


def test_billing_period_label_monthly():
    from app.fee_scheduling import billing_period_label
    assert billing_period_label("monthly", date(2026, 8, 1)) == "2026-08"
    assert billing_period_label("monthly", date(2026, 1, 1)) == "2026-01"


def test_billing_period_label_quarterly():
    from app.fee_scheduling import billing_period_label
    assert billing_period_label("quarterly", date(2026, 1, 1)) == "2026-Q1"
    assert billing_period_label("quarterly", date(2026, 4, 1)) == "2026-Q2"
    assert billing_period_label("quarterly", date(2026, 12, 31)) == "2026-Q4"


def test_billing_period_label_annually_and_once():
    from app.fee_scheduling import billing_period_label
    assert billing_period_label("annually", date(2026, 6, 1)) == "2026"
    assert billing_period_label("once", date(2026, 8, 6)) == "2026-08-06"


def test_advance_recurring():
    from app.fee_scheduling import advance
    assert advance("monthly", date(2026, 8, 1)) == date(2026, 9, 1)
    assert advance("quarterly", date(2026, 8, 1)) == date(2026, 11, 1)
    assert advance("annually", date(2026, 8, 1)) == date(2027, 8, 1)


def test_advance_once_never_recurs():
    from app.fee_scheduling import advance
    assert advance("once", date(2026, 8, 1)) is None
    assert advance("bogus", date(2026, 8, 1)) is None


def test_validate_schedule_noop_when_disabled():
    from app.fee_scheduling import validate_schedule
    # Garbage is fine as long as auto_generate is off.
    validate_schedule(False, "not-a-real-recurrence", None)


def test_validate_schedule_rejects_bad_recurrence():
    from app.fee_scheduling import validate_schedule
    with pytest.raises(ValueError):
        validate_schedule(True, "weekly", date(2026, 8, 1))


def test_validate_schedule_requires_next_run_date():
    from app.fee_scheduling import validate_schedule
    with pytest.raises(ValueError):
        validate_schedule(True, "monthly", None)


def test_validate_schedule_rejects_late_month_day():
    from app.fee_scheduling import validate_schedule
    with pytest.raises(ValueError):
        validate_schedule(True, "monthly", date(2026, 8, 31))


def test_validate_schedule_accepts_valid_config():
    from app.fee_scheduling import validate_schedule
    validate_schedule(True, "monthly", date(2026, 8, 1))  # must not raise


# --- assign_class_fee billing_period dedup / active_only (app/routes/fees.py) ---

@pytest.fixture()
def db_session(client):
    # Depends on `client` purely to force app.main's import-time
    # Base.metadata.create_all() to have run first, so the tables these
    # tests hit against SessionLocal's engine actually exist.
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
        first_name="Test", class_name="SchedTest-5A", section="A",
        student_status="Active", residential_type="Day Scholar",
    )
    defaults.update(overrides)
    if "admission_no" not in defaults:
        import uuid
        defaults["admission_no"] = f"SCHED-{uuid.uuid4().hex[:10]}"
    student = Student(**defaults)
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


def test_assign_class_fee_skips_already_billed_students_on_rerun(db_session):
    from app.models import Fee
    from app.routes.fees import assign_class_fee

    db = db_session
    s1 = _make_student(db, class_name="SchedTest-Dedup")
    s2 = _make_student(db, class_name="SchedTest-Dedup")

    first = assign_class_fee(
        db, class_name="SchedTest-Dedup", fee_type="Tuition Fee",
        academic_year="2026-27", total_amount=500, billing_period="2026-08",
    )
    assert first.created_count == 2
    assert first.skipped_count == 0

    second = assign_class_fee(
        db, class_name="SchedTest-Dedup", fee_type="Tuition Fee",
        academic_year="2026-27", total_amount=500, billing_period="2026-08",
    )
    assert second.created_count == 0
    assert second.skipped_count == 2

    fees = db.query(Fee).filter(Fee.class_name_snapshot == "SchedTest-Dedup").all()
    assert len(fees) == 2
    assert {f.billing_period for f in fees} == {"2026-08"}


def test_assign_class_fee_different_period_bills_again(db_session):
    from app.routes.fees import assign_class_fee

    db = db_session
    _make_student(db, class_name="SchedTest-NextCycle")

    first = assign_class_fee(
        db, class_name="SchedTest-NextCycle", fee_type="Tuition Fee",
        academic_year="2026-27", total_amount=500, billing_period="2026-08",
    )
    second = assign_class_fee(
        db, class_name="SchedTest-NextCycle", fee_type="Tuition Fee",
        academic_year="2026-27", total_amount=500, billing_period="2026-09",
    )
    assert first.created_count == 1
    assert second.created_count == 1  # a new cycle, not a duplicate


def test_assign_class_fee_active_only_excludes_inactive_students(db_session):
    from app.routes.fees import assign_class_fee

    db = db_session
    _make_student(db, class_name="SchedTest-ActiveOnly", student_status="Active")
    _make_student(db, class_name="SchedTest-ActiveOnly", student_status="Withdrawn")

    result = assign_class_fee(
        db, class_name="SchedTest-ActiveOnly", fee_type="Tuition Fee",
        academic_year="2026-27", total_amount=500, billing_period="2026-08",
        active_only=True,
    )
    assert result.created_count == 1


def test_assign_class_fee_manual_call_still_raises_on_no_match(db_session):
    """billing_period=None (a manual call) must keep the original behavior:
    404 when nothing in the class matches, not a quiet empty success."""
    from fastapi import HTTPException
    from app.routes.fees import assign_class_fee

    with pytest.raises(HTTPException) as exc_info:
        assign_class_fee(
            db_session, class_name="SchedTest-DoesNotExist-No-Students", fee_type="Tuition Fee",
            academic_year="2026-27", total_amount=500,
        )
    assert exc_info.value.status_code == 404


# --- Fee Structure API: schedule fields are validated (app/routes/fee_structures.py) ---

def test_fee_structure_rejects_auto_generate_without_recurrence(client, auth):
    resp = client.post("/fee-structures/", json={
        "academic_year": "2099-SCHED",
        "class_name": "SchedTest-API",
        "fee_type": "Tuition Fee",
        "amount": 500,
        "auto_generate": True,
    }, headers=auth)
    assert resp.status_code == 400


def test_fee_structure_accepts_valid_schedule(client, auth):
    resp = client.post("/fee-structures/", json={
        "academic_year": "2099-SCHED",
        "class_name": "SchedTest-API-2",
        "fee_type": "Tuition Fee",
        "amount": 500,
        "auto_generate": True,
        "recurrence": "monthly",
        "next_run_date": "2099-09-01",
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["auto_generate"] is True
    assert body["recurrence"] == "monthly"
    assert body["next_run_date"] == "2099-09-01"


def test_generation_runs_endpoint_requires_auth(client):
    resp = client.get("/fee-structures/generation-runs")
    assert resp.status_code in (401, 403)


# --- Platform feature gate (app/tenant.py DEFAULT_FEATURES / is_feature_enabled) ---

def test_fee_auto_generation_defaults_to_disabled():
    from app.tenant import DEFAULT_FEATURES
    assert DEFAULT_FEATURES["fee_auto_generation"] is False


def test_run_scheduled_fees_skips_unknown_account():
    import run_scheduled_fees
    assert run_scheduled_fees.is_feature_enabled("no-such-account", run_scheduled_fees.FEATURE_KEY) is False


def test_run_scheduled_fees_respects_platform_toggle(client):
    import run_scheduled_fees
    from app.tenant import CentralSessionLocal, get_account, is_feature_enabled
    from app.tenant_models import SchoolFeature

    account = get_account("default")
    assert is_feature_enabled("default", run_scheduled_fees.FEATURE_KEY) is False

    db = CentralSessionLocal()
    try:
        row = (
            db.query(SchoolFeature)
            .filter(SchoolFeature.account_id == account["id"], SchoolFeature.feature_key == "fee_auto_generation")
            .first()
        )
        if row:
            row.is_enabled = True
        else:
            db.add(SchoolFeature(account_id=account["id"], feature_key="fee_auto_generation", is_enabled=True))
        db.commit()
    finally:
        db.close()

    try:
        assert is_feature_enabled("default", run_scheduled_fees.FEATURE_KEY) is True
    finally:
        db = CentralSessionLocal()
        try:
            row = (
                db.query(SchoolFeature)
                .filter(SchoolFeature.account_id == account["id"], SchoolFeature.feature_key == "fee_auto_generation")
                .first()
            )
            if row:
                row.is_enabled = False
                db.commit()
        finally:
            db.close()
