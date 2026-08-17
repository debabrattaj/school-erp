"""Biometric attendance: device auth, idempotent ingest, enrollment resolution
and attendance derivation.
"""

import uuid
from datetime import date, datetime, time, timedelta

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


def _set_biometric_enabled(enabled: bool):
    from app.tenant import CentralSessionLocal, get_account
    from app.tenant_models import SchoolFeature

    account = get_account("default")
    db = CentralSessionLocal()
    try:
        row = (
            db.query(SchoolFeature)
            .filter(
                SchoolFeature.account_id == account["id"],
                SchoolFeature.feature_key == "biometric_attendance",
            )
            .first()
        )
        if row:
            row.is_enabled = enabled
        else:
            db.add(SchoolFeature(
                account_id=account["id"], feature_key="biometric_attendance", is_enabled=enabled,
            ))
        db.commit()
    finally:
        db.close()


def _reset_biometric_state():
    """Clear devices, enrollments, punches and the derivation config.

    The config is a single row per school and enrollments are school-wide, so
    without this a test's settings leak into the next one -- a half_day_before
    left set by one test silently changes another's expected status, and stale
    enrollments inflate the absent-marking count.
    """
    from app.database import SessionLocal
    from app.models import (
        BiometricAttendanceConfig,
        BiometricDevice,
        BiometricEnrollment,
        BiometricPunch,
        BiometricSyncRun,
    )

    db = SessionLocal()
    try:
        for model in (
            BiometricPunch,
            BiometricSyncRun,
            BiometricEnrollment,
            BiometricDevice,
            BiometricAttendanceConfig,
        ):
            db.query(model).delete()
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def biometric_enabled(client):
    """Sold separately, so it ships disabled -- switch it on for these tests."""
    _set_biometric_enabled(True)
    _reset_biometric_state()
    yield
    _set_biometric_enabled(False)


def _make_student(db, **overrides):
    from app.models import Student
    defaults = dict(
        first_name="Bio", last_name="Student", class_name="Bio-9",
        section="A", student_status="Active", residential_type="Day Scholar",
    )
    defaults.update(overrides)
    defaults.setdefault("admission_no", f"BIO-{uuid.uuid4().hex[:10]}")
    student = Student(**defaults)
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


def _register_device(client, auth, **overrides):
    payload = {
        "name": "Main Gate",
        "serial_number": f"SN-{uuid.uuid4().hex[:10]}",
        "vendor": "ZKTeco",
        "mode": "push",
    }
    payload.update(overrides)
    resp = client.post("/biometric/devices", json=payload, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _device_headers(device, token):
    return {
        "X-Device-Serial": device["serial_number"],
        "X-Device-Token": token,
        "X-School-Code": "default",
    }


# ---------------- Device registration and auth ----------------


def test_device_token_is_returned_once_and_not_stored_in_plaintext(client, auth, db_session):
    device = _register_device(client, auth)
    token = device["auth_token"]
    assert token, "registration must return the plaintext token exactly once"

    from app.models import BiometricDevice
    row = db_session.query(BiometricDevice).filter(BiometricDevice.id == device["id"]).first()
    assert row.auth_token_hash and row.auth_token_hash != token

    # Listing never exposes it again.
    listed = client.get("/biometric/devices", headers=auth).json()
    entry = next(d for d in listed if d["id"] == device["id"])
    assert entry["auth_token"] is None
    assert entry["has_token"] is True


def test_ingest_rejects_bad_or_missing_credentials(client, auth):
    device = _register_device(client, auth)
    body = {"punches": [{"device_user_id": "1", "timestamp": "2026-08-16T09:00:00"}]}

    assert client.post("/biometric/ingest", json=body).status_code == 401

    bad = _device_headers(device, "not-the-token")
    assert client.post("/biometric/ingest", json=body, headers=bad).status_code == 401

    unknown = {"X-Device-Serial": "NO-SUCH-DEVICE", "X-Device-Token": "x", "X-School-Code": "default"}
    assert client.post("/biometric/ingest", json=body, headers=unknown).status_code == 401


def test_disabled_device_is_refused(client, auth):
    device = _register_device(client, auth)
    token = device["auth_token"]
    client.put(f"/biometric/devices/{device['id']}", json={"is_active": False}, headers=auth)

    resp = client.post(
        "/biometric/ingest",
        json={"punches": [{"device_user_id": "1", "timestamp": "2026-08-16T09:00:00"}]},
        headers=_device_headers(device, token),
    )
    assert resp.status_code == 403


def test_rotating_token_invalidates_the_old_one(client, auth):
    device = _register_device(client, auth)
    old_token = device["auth_token"]

    rotated = client.post(f"/biometric/devices/{device['id']}/rotate-token", headers=auth).json()
    new_token = rotated["auth_token"]
    assert new_token != old_token

    body = {"punches": [{"device_user_id": "1", "timestamp": "2026-08-16T09:00:00"}]}
    assert client.post("/biometric/ingest", json=body, headers=_device_headers(device, old_token)).status_code == 401
    assert client.post("/biometric/ingest", json=body, headers=_device_headers(device, new_token)).status_code == 200


# ---------------- Ingest ----------------


def test_ingest_is_idempotent(client, auth):
    """Devices retry and pull windows overlap, so the same punch arrives twice."""
    device = _register_device(client, auth)
    headers = _device_headers(device, device["auth_token"])
    body = {"punches": [
        {"device_user_id": "77", "timestamp": "2026-08-16T09:01:00", "direction": "in"},
        {"device_user_id": "77", "timestamp": "2026-08-16T15:30:00", "direction": "out"},
    ]}

    first = client.post("/biometric/ingest", json=body, headers=headers).json()
    assert first["ingested"] == 2
    assert first["duplicates"] == 0

    second = client.post("/biometric/ingest", json=body, headers=headers).json()
    assert second["ingested"] == 0
    assert second["duplicates"] == 2


def test_ingest_keeps_unmatched_punches_and_relinks_them_on_enrollment(client, auth, db_session):
    """A punch from someone not yet mapped is kept, not dropped."""
    student = _make_student(db_session)
    device = _register_device(client, auth)
    headers = _device_headers(device, device["auth_token"])

    result = client.post("/biometric/ingest", json={"punches": [
        {"device_user_id": "4242", "timestamp": "2026-08-16T09:05:00"},
    ]}, headers=headers).json()
    assert result["ingested"] == 1
    assert result["unmatched"] == 1

    unmatched = client.get("/biometric/punches?unmatched_only=true", headers=auth).json()
    assert any(p["device_user_id"] == "4242" for p in unmatched)

    # Mapping the id afterwards retroactively attributes the stored punch.
    enrolled = client.post("/biometric/enrollments", json={
        "device_user_id": "4242", "student_id": student.id,
    }, headers=auth).json()
    assert enrolled["relinked_punches"] >= 1

    still_unmatched = client.get("/biometric/punches?unmatched_only=true", headers=auth).json()
    assert not any(p["device_user_id"] == "4242" for p in still_unmatched)


def test_ingest_tolerates_bad_records_without_losing_the_batch(client, auth):
    device = _register_device(client, auth)
    headers = _device_headers(device, device["auth_token"])

    result = client.post("/biometric/ingest", json={"punches": [
        {"device_user_id": "1", "timestamp": "2026-08-16T09:00:00"},
        {"device_user_id": "", "timestamp": "2026-08-16T09:00:00"},   # no id
        {"device_user_id": "2"},                                       # no timestamp
        {"device_user_id": "3", "timestamp": "not-a-date"},            # unparseable
        {"device_user_id": "4", "timestamp": "2026-08-16T09:02:00"},
    ]}, headers=headers).json()

    assert result["ingested"] == 2, "good records must still land"
    assert len(result["rejected"]) == 3


def test_enrollment_requires_exactly_one_subject(client, auth, db_session):
    student = _make_student(db_session)
    for payload in (
        {"device_user_id": "9"},
        {"device_user_id": "9", "student_id": student.id, "teacher_id": 1},
    ):
        resp = client.post("/biometric/enrollments", json=payload, headers=auth)
        assert resp.status_code == 400, resp.text


def test_device_specific_enrollment_overrides_the_shared_one(client, auth, db_session):
    """One terminal numbering people differently must not corrupt the roster."""
    from app import biometric
    from app.models import BiometricEnrollment

    shared_student = _make_student(db_session)
    odd_student = _make_student(db_session)
    device = _register_device(client, auth)

    db_session.add(BiometricEnrollment(device_id=None, device_user_id="5", student_id=shared_student.id))
    db_session.add(BiometricEnrollment(device_id=device["id"], device_user_id="5", student_id=odd_student.id))
    db_session.commit()

    resolved = biometric.resolve_enrollment(db_session, device["id"], "5")
    assert resolved.student_id == odd_student.id

    other_device = _register_device(client, auth)
    fallback = biometric.resolve_enrollment(db_session, other_device["id"], "5")
    assert fallback.student_id == shared_student.id


# ---------------- Attendance derivation ----------------


def _punch(db, device_id, student_id, when, direction=None):
    from app import biometric
    from app.models import BiometricPunch
    db.add(BiometricPunch(
        device_id=device_id,
        device_user_id=str(student_id),
        punched_at=when,
        direction=direction,
        dedupe_key=biometric.make_dedupe_key(device_id, str(student_id), when, direction),
        student_id=student_id,
    ))
    db.commit()


def test_derivation_is_off_until_switched_on(client, auth, db_session):
    student = _make_student(db_session)
    device = _register_device(client, auth)
    _punch(db_session, device["id"], student.id, datetime(2026, 8, 17, 9, 0))

    result = client.post("/biometric/derive", json={"target_date": "2026-08-17"}, headers=auth).json()
    assert result["disabled"] is True
    assert result["created"] == 0


def test_derivation_marks_present_late_and_half_day(client, auth, db_session):
    from app.models import Attendance

    present = _make_student(db_session)
    late = _make_student(db_session)
    half = _make_student(db_session)
    device = _register_device(client, auth)
    target = date(2026, 8, 18)

    _punch(db_session, device["id"], present.id, datetime(2026, 8, 18, 8, 55))
    _punch(db_session, device["id"], present.id, datetime(2026, 8, 18, 15, 30))
    _punch(db_session, device["id"], late.id, datetime(2026, 8, 18, 9, 45))
    _punch(db_session, device["id"], late.id, datetime(2026, 8, 18, 15, 30))
    _punch(db_session, device["id"], half.id, datetime(2026, 8, 18, 8, 50))
    _punch(db_session, device["id"], half.id, datetime(2026, 8, 18, 11, 0))

    client.put("/biometric/config", json={
        "derive_attendance": True, "late_after": "09:15:00", "half_day_before": "12:00:00",
    }, headers=auth)

    result = client.post("/biometric/derive", json={"target_date": "2026-08-18"}, headers=auth).json()
    assert result["created"] == 3

    def status_of(student_id):
        return (
            db_session.query(Attendance)
            .filter(Attendance.student_id == student_id, Attendance.attendance_date == target)
            .first()
            .status
        )

    assert status_of(present.id) == "Present"
    assert status_of(late.id) == "Late"
    assert status_of(half.id) == "Half Day"


def test_derivation_leaves_manual_marks_alone(client, auth, db_session):
    """A teacher's judgement outranks a turnstile unless explicitly overridden."""
    from app.models import Attendance

    student = _make_student(db_session)
    device = _register_device(client, auth)
    target = date(2026, 8, 19)

    db_session.add(Attendance(
        student_id=student.id, attendance_date=target, status="Absent",
        remarks="Marked by class teacher",
    ))
    db_session.commit()

    _punch(db_session, device["id"], student.id, datetime(2026, 8, 19, 9, 0))
    client.put("/biometric/config", json={"derive_attendance": True}, headers=auth)

    result = client.post("/biometric/derive", json={"target_date": "2026-08-19"}, headers=auth).json()
    assert result["skipped_manual"] == 1
    assert result["created"] == 0

    row = (
        db_session.query(Attendance)
        .filter(Attendance.student_id == student.id, Attendance.attendance_date == target)
        .first()
    )
    db_session.refresh(row)
    assert row.status == "Absent", "the manual mark must survive"

    # ...unless the school opts in.
    client.put("/biometric/config", json={"overwrite_manual": True}, headers=auth)
    client.post("/biometric/derive", json={"target_date": "2026-08-19"}, headers=auth)
    db_session.refresh(row)
    assert row.status == "Present"


def test_derivation_is_safe_to_rerun(client, auth, db_session):
    from app.models import Attendance

    student = _make_student(db_session)
    device = _register_device(client, auth)
    target = date(2026, 8, 20)
    _punch(db_session, device["id"], student.id, datetime(2026, 8, 20, 9, 0))

    client.put("/biometric/config", json={"derive_attendance": True}, headers=auth)
    first = client.post("/biometric/derive", json={"target_date": "2026-08-20"}, headers=auth).json()
    second = client.post("/biometric/derive", json={"target_date": "2026-08-20"}, headers=auth).json()

    assert first["created"] == 1
    assert second["created"] == 0

    count = (
        db_session.query(Attendance)
        .filter(Attendance.student_id == student.id, Attendance.attendance_date == target)
        .count()
    )
    assert count == 1, "re-running must not duplicate attendance rows"


def test_absent_marking_is_opt_in(client, auth, db_session):
    """A terminal that silently stops reporting must not mark a school absent."""
    from app.models import Attendance, BiometricEnrollment

    attended = _make_student(db_session)
    no_show = _make_student(db_session)
    device = _register_device(client, auth)
    target = date(2026, 8, 21)

    db_session.add(BiometricEnrollment(device_id=None, device_user_id=str(attended.id), student_id=attended.id))
    db_session.add(BiometricEnrollment(device_id=None, device_user_id=str(no_show.id), student_id=no_show.id))
    db_session.commit()
    _punch(db_session, device["id"], attended.id, datetime(2026, 8, 21, 9, 0))

    client.put("/biometric/config", json={"derive_attendance": True}, headers=auth)
    result = client.post("/biometric/derive", json={"target_date": "2026-08-21"}, headers=auth).json()
    assert result["absent_marked"] == 0

    client.put("/biometric/config", json={"absent_if_no_punch": True}, headers=auth)
    result = client.post("/biometric/derive", json={"target_date": "2026-08-21"}, headers=auth).json()
    assert result["absent_marked"] == 1

    row = (
        db_session.query(Attendance)
        .filter(Attendance.student_id == no_show.id, Attendance.attendance_date == target)
        .first()
    )
    assert row is not None and row.status == "Absent"


# ---------------- Helpers ----------------


def test_timestamp_parsing_accepts_vendor_formats():
    from app.biometric import parse_punch_timestamp

    expected = datetime(2026, 8, 16, 9, 5, 0)
    for value in (
        "2026-08-16T09:05:00",
        "2026-08-16T09:05:00Z",
        "2026-08-16 09:05:00",
        "16-08-2026 09:05:00",
        "16/08/2026 09:05:00",
    ):
        assert parse_punch_timestamp(value) == expected, value

    assert parse_punch_timestamp(datetime(2026, 8, 16, 9, 5)) == expected


def test_direction_normalisation():
    from app.biometric import normalise_direction

    for value in ("in", "IN", "0", "check-in", "entry"):
        assert normalise_direction(value) == "in", value
    for value in ("out", "OUT", "1", "check-out", "exit"):
        assert normalise_direction(value) == "out", value
    assert normalise_direction(None) is None
    assert normalise_direction("something-else") is None


def test_dedupe_key_ignores_sub_second_jitter():
    from app.biometric import make_dedupe_key

    a = make_dedupe_key(1, "5", datetime(2026, 8, 16, 9, 0, 0, 250000), "in")
    b = make_dedupe_key(1, "5", datetime(2026, 8, 16, 9, 0, 0, 900000), "in")
    assert a == b

    different_second = make_dedupe_key(1, "5", datetime(2026, 8, 16, 9, 0, 1), "in")
    assert a != different_second


# ---------------- Entitlement gate ----------------


def test_all_biometric_routes_blocked_when_module_disabled(client, auth):
    device = _register_device(client, auth)
    token = device["auth_token"]

    _set_biometric_enabled(False)

    assert client.get("/biometric/devices", headers=auth).status_code == 403
    assert client.get("/biometric/punches", headers=auth).status_code == 403
    assert client.get("/biometric/config", headers=auth).status_code == 403
    assert client.post("/biometric/derive", json={}, headers=auth).status_code == 403

    # A lapsed school stops accepting punches rather than collecting data it is
    # no longer entitled to hold.
    resp = client.post(
        "/biometric/ingest",
        json={"punches": [{"device_user_id": "1", "timestamp": "2026-08-16T09:00:00"}]},
        headers=_device_headers(device, token),
    )
    assert resp.status_code == 403


# ---------------- Pull sync (run_biometric_sync.py) ----------------


def test_pull_sync_ingests_and_records_a_run(client, auth, db_session, monkeypatch):
    import run_biometric_sync as sync
    from app.models import BiometricDevice, BiometricSyncRun

    student = _make_student(db_session)
    device = _register_device(client, auth, mode="pull", pull_endpoint="https://vendor.example/api/punches")
    client.post("/biometric/enrollments", json={
        "device_user_id": "31", "student_id": student.id,
    }, headers=auth)

    row = db_session.query(BiometricDevice).filter(BiometricDevice.id == device["id"]).first()

    monkeypatch.setattr(sync, "fetcher_for", lambda d: lambda dev, since: [
        {"device_user_id": "31", "timestamp": "2026-08-22T09:00:00"},
        {"device_user_id": "31", "timestamp": "2026-08-22T15:00:00"},
    ])

    result = sync.sync_device(db_session, row)
    assert result["status"] == "Success"
    assert result["fetched"] == 2
    assert result["ingested"] == 2

    # Re-running over an overlapping window must not double-record.
    again = sync.sync_device(db_session, row)
    assert again["ingested"] == 0
    assert again["duplicates"] == 2

    runs = db_session.query(BiometricSyncRun).filter(BiometricSyncRun.device_id == row.id).all()
    assert len(runs) == 2
    assert row.last_sync_at is not None


def test_pull_sync_records_failure_without_raising(client, auth, db_session, monkeypatch):
    """One unreachable device must not abort the whole run."""
    import run_biometric_sync as sync
    from app.models import BiometricDevice, BiometricSyncRun

    device = _register_device(client, auth, mode="pull", pull_endpoint="https://vendor.example/down")
    row = db_session.query(BiometricDevice).filter(BiometricDevice.id == device["id"]).first()

    def boom(dev, since):
        raise ConnectionError("device unreachable")

    monkeypatch.setattr(sync, "fetcher_for", lambda d: boom)

    result = sync.sync_device(db_session, row)
    assert result["status"] == "Failed"
    assert "unreachable" in result["error"]

    run = db_session.query(BiometricSyncRun).filter(BiometricSyncRun.device_id == row.id).first()
    assert run.status == "Failed"


def test_pull_sync_skips_push_devices(client, auth, db_session, monkeypatch):
    """Push devices call us; the poller must leave them alone."""
    import run_biometric_sync as sync

    _register_device(client, auth, mode="push")
    called = []
    monkeypatch.setattr(sync, "sync_device", lambda db, d, dry_run=False: called.append(d) or {})

    from app.tenant import DEFAULT_SCHOOL_DATABASE_URL
    results = sync.sync_tenant("default", DEFAULT_SCHOOL_DATABASE_URL)
    assert results == []
    assert called == []
