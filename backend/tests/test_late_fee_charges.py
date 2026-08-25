"""Late fee charging: pure fine math (app/late_fee_scheduling.py) plus the
run_late_fee_charges.py cron entrypoint, which is what actually applies
late_fee_rule -- previously a free-text field nothing ever computed from.
"""

from datetime import date

import pytest


# --- Pure fine math (app/late_fee_scheduling.py) ---

def test_no_fine_without_a_configured_rule():
    from app.late_fee_scheduling import compute_late_fee
    assert compute_late_fee(date(2026, 1, 1), None, None, 0, date(2026, 2, 1)) == 0.0
    assert compute_late_fee(date(2026, 1, 1), 50, None, 0, date(2026, 2, 1)) == 0.0
    assert compute_late_fee(date(2026, 1, 1), 0, "Weekly", 0, date(2026, 2, 1)) == 0.0


def test_no_fine_before_due_date():
    from app.late_fee_scheduling import compute_late_fee
    assert compute_late_fee(date(2026, 3, 1), 50, "Weekly", 0, date(2026, 2, 1)) == 0.0


def test_no_fine_within_grace_period():
    from app.late_fee_scheduling import compute_late_fee
    # Due Jan 1, 5-day grace: still Jan 5 is within grace.
    assert compute_late_fee(date(2026, 1, 1), 50, "Weekly", 5, date(2026, 1, 5)) == 0.0


def test_one_time_fine_is_flat():
    from app.late_fee_scheduling import compute_late_fee
    assert compute_late_fee(date(2026, 1, 1), 100, "One-Time", 0, date(2026, 1, 2)) == 100.0
    assert compute_late_fee(date(2026, 1, 1), 100, "One-Time", 0, date(2026, 6, 1)) == 100.0


def test_weekly_fine_accrues_per_week_elapsed():
    from app.late_fee_scheduling import compute_late_fee
    # Due Jan 1, no grace: day 1 overdue = 1st week's fine.
    assert compute_late_fee(date(2026, 1, 1), 50, "Weekly", 0, date(2026, 1, 2)) == 50.0
    # 11 days overdue = into the 2nd week.
    assert compute_late_fee(date(2026, 1, 1), 50, "Weekly", 0, date(2026, 1, 12)) == 100.0
    # 21 days overdue = into the 4th week.
    assert compute_late_fee(date(2026, 1, 1), 50, "Weekly", 0, date(2026, 1, 22)) == 200.0


def test_monthly_fine_accrues_per_30_days_elapsed():
    from app.late_fee_scheduling import compute_late_fee
    assert compute_late_fee(date(2026, 1, 1), 200, "Monthly", 0, date(2026, 1, 2)) == 200.0
    assert compute_late_fee(date(2026, 1, 1), 200, "Monthly", 0, date(2026, 3, 15)) == 600.0


def test_grace_period_shifts_the_start_date():
    from app.late_fee_scheduling import compute_late_fee
    # Due Jan 1 with a 10-day grace behaves like due Jan 11 for fine purposes.
    with_grace = compute_late_fee(date(2026, 1, 1), 50, "Weekly", 10, date(2026, 1, 12))
    without_grace = compute_late_fee(date(2026, 1, 11), 50, "Weekly", 0, date(2026, 1, 12))
    assert with_grace == without_grace == 50.0


# --- run_late_fee_charges.py cron entrypoint ---

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
        first_name="Test", class_name="LateFeeTest", section="A",
        student_status="Active", residential_type="Day Scholar",
        admission_no=f"LATEFEE-{uuid.uuid4().hex[:10]}",
    )
    defaults.update(overrides)
    student = Student(**defaults)
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


def _enable_feature(client, feature_key="fee_late_charges"):
    from app.tenant import CentralSessionLocal, get_account
    from app.tenant_models import SchoolFeature

    account = get_account("default")
    db = CentralSessionLocal()
    try:
        row = (
            db.query(SchoolFeature)
            .filter(SchoolFeature.account_id == account["id"], SchoolFeature.feature_key == feature_key)
            .first()
        )
        if row:
            row.is_enabled = True
        else:
            db.add(SchoolFeature(account_id=account["id"], feature_key=feature_key, is_enabled=True))
        db.commit()
    finally:
        db.close()


def _disable_feature(client, feature_key="fee_late_charges"):
    from app.tenant import CentralSessionLocal, get_account
    from app.tenant_models import SchoolFeature

    account = get_account("default")
    db = CentralSessionLocal()
    try:
        row = (
            db.query(SchoolFeature)
            .filter(SchoolFeature.account_id == account["id"], SchoolFeature.feature_key == feature_key)
            .first()
        )
        if row:
            row.is_enabled = False
            db.commit()
    finally:
        db.close()


def test_fee_late_charges_defaults_to_disabled():
    from app.tenant import DEFAULT_FEATURES
    assert DEFAULT_FEATURES["fee_late_charges"] is False


def test_run_late_fee_charges_skips_unknown_account(client):
    import run_late_fee_charges
    assert run_late_fee_charges.is_feature_enabled("no-such-account", run_late_fee_charges.FEATURE_KEY) is False


def test_run_for_tenant_noop_when_flag_disabled(client, db_session):
    import run_late_fee_charges

    student = _make_student(db_session)
    from app.models import Fee
    fee = Fee(
        student_id=student.id, fee_type="Tuition Fee",
        total_amount=1000, paid_amount=0, due_amount=1000,
        payment_status="Unpaid", due_date=date(2020, 1, 1),
    )
    db_session.add(fee)
    db_session.commit()
    fee_id = fee.id

    from app.tenant import DEFAULT_SCHOOL_DATABASE_URL
    charged = run_late_fee_charges.run_for_tenant("default", DEFAULT_SCHOOL_DATABASE_URL, dry_run=False)
    assert charged == 0

    db_session.refresh(fee)
    assert fee.late_fee_charged == 0


def test_run_for_tenant_noop_without_configured_rule(client, db_session):
    import run_late_fee_charges

    _enable_feature(client)
    try:
        from app.models import Fee, SchoolSettings
        from app.routes.fees import get_settings
        settings = get_settings(db_session)
        if settings:
            settings.late_fee_amount = None
            settings.late_fee_frequency = None
            db_session.commit()

        student = _make_student(db_session)
        fee = Fee(
            student_id=student.id, fee_type="Tuition Fee",
            total_amount=1000, paid_amount=0, due_amount=1000,
            payment_status="Unpaid", due_date=date(2020, 1, 1),
        )
        db_session.add(fee)
        db_session.commit()

        from app.tenant import DEFAULT_SCHOOL_DATABASE_URL
        charged = run_late_fee_charges.run_for_tenant("default", DEFAULT_SCHOOL_DATABASE_URL, dry_run=False)
        assert charged == 0
    finally:
        _disable_feature(client)


def test_run_for_tenant_charges_overdue_fee(client, db_session):
    import run_late_fee_charges
    from app.models import Fee, SchoolSettings

    _enable_feature(client)
    try:
        from app.routes.fees import get_settings
        settings = get_settings(db_session)
        settings.late_fee_amount = 50
        settings.late_fee_frequency = "One-Time"
        settings.late_fee_grace_days = 0
        db_session.commit()

        student = _make_student(db_session)
        fee = Fee(
            student_id=student.id, fee_type="Tuition Fee",
            total_amount=1000, paid_amount=0, due_amount=1000,
            payment_status="Unpaid", due_date=date(2020, 1, 1),
        )
        db_session.add(fee)
        db_session.commit()
        fee_id = fee.id

        from app.tenant import DEFAULT_SCHOOL_DATABASE_URL
        charged = run_late_fee_charges.run_for_tenant("default", DEFAULT_SCHOOL_DATABASE_URL, dry_run=False)
        assert charged >= 1

        db_session.refresh(fee)
        assert fee.late_fee_charged == 50
        assert fee.due_amount == 1050
        assert fee.payment_status == "Unpaid"
    finally:
        _disable_feature(client)
        from app.routes.fees import get_settings
        settings = get_settings(db_session)
        settings.late_fee_amount = None
        settings.late_fee_frequency = None
        db_session.commit()


def test_run_for_tenant_dry_run_changes_nothing(client, db_session):
    import run_late_fee_charges
    from app.models import Fee, SchoolSettings

    _enable_feature(client)
    try:
        from app.routes.fees import get_settings
        settings = get_settings(db_session)
        settings.late_fee_amount = 75
        settings.late_fee_frequency = "One-Time"
        settings.late_fee_grace_days = 0
        db_session.commit()

        student = _make_student(db_session)
        fee = Fee(
            student_id=student.id, fee_type="Tuition Fee",
            total_amount=1000, paid_amount=0, due_amount=1000,
            payment_status="Unpaid", due_date=date(2020, 1, 1),
        )
        db_session.add(fee)
        db_session.commit()

        from app.tenant import DEFAULT_SCHOOL_DATABASE_URL
        run_late_fee_charges.run_for_tenant("default", DEFAULT_SCHOOL_DATABASE_URL, dry_run=True)

        db_session.refresh(fee)
        assert fee.late_fee_charged == 0
        assert fee.due_amount == 1000
    finally:
        _disable_feature(client)
        from app.routes.fees import get_settings
        settings = get_settings(db_session)
        settings.late_fee_amount = None
        settings.late_fee_frequency = None
        db_session.commit()


def test_run_for_tenant_never_fines_a_fully_paid_fee(client, db_session):
    import run_late_fee_charges
    from app.models import Fee, SchoolSettings

    _enable_feature(client)
    try:
        from app.routes.fees import get_settings
        settings = get_settings(db_session)
        settings.late_fee_amount = 50
        settings.late_fee_frequency = "One-Time"
        settings.late_fee_grace_days = 0
        db_session.commit()

        student = _make_student(db_session)
        fee = Fee(
            student_id=student.id, fee_type="Tuition Fee",
            total_amount=1000, paid_amount=1000, due_amount=0,
            payment_status="Paid", due_date=date(2020, 1, 1),
        )
        db_session.add(fee)
        db_session.commit()

        from app.tenant import DEFAULT_SCHOOL_DATABASE_URL
        run_late_fee_charges.run_for_tenant("default", DEFAULT_SCHOOL_DATABASE_URL, dry_run=False)

        db_session.refresh(fee)
        assert fee.late_fee_charged == 0
        assert fee.payment_status == "Paid"
    finally:
        _disable_feature(client)
        from app.routes.fees import get_settings
        settings = get_settings(db_session)
        settings.late_fee_amount = None
        settings.late_fee_frequency = None
        db_session.commit()
