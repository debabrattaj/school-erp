"""Staff leave and substitute cover.

The rules worth testing are the ones that cost something when wrong: charging
staff for weekends they didn't take, letting a pending request eat entitlement,
and above all putting a substitute in two classrooms at the same time.
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


def _teacher(db, name="Leave Tester", subject="Mathematics"):
    from app.models import Teacher
    teacher = Teacher(
        employee_no=f"LV-{uuid.uuid4().hex[:8]}", name=name, subject=subject,
    )
    db.add(teacher)
    db.commit()
    db.refresh(teacher)
    return teacher


def _leave_type(client, auth, **overrides):
    payload = {
        "code": f"LT-{uuid.uuid4().hex[:6]}", "name": "Casual Leave",
        "annual_quota": 12, "is_paid": True,
    }
    payload.update(overrides)
    resp = client.post("/leave/types", json=payload, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _next_weekday(target: int, base: date | None = None) -> date:
    """The next date whose weekday() equals target, so tests don't drift with
    the day they happen to run on."""
    cursor = (base or date.today()) + timedelta(days=1)
    while cursor.weekday() != target:
        cursor += timedelta(days=1)
    return cursor


def _request(client, auth, teacher_id, leave_type_id, from_date, to_date, **overrides):
    payload = {
        "teacher_id": teacher_id, "leave_type_id": leave_type_id,
        "from_date": str(from_date), "to_date": str(to_date),
    }
    payload.update(overrides)
    return client.post("/leave/requests", json=payload, headers=auth)


def _timetable_entry(db, teacher_id, day_of_week, period_no, class_name="8", section="A", subject="Mathematics"):
    from app.models import TimetableEntry
    entry = TimetableEntry(
        teacher_id=teacher_id, day_of_week=day_of_week, period_no=period_no,
        class_name_snapshot=class_name, section_snapshot=section,
        subject=subject, entry_type="Class", room=f"R{period_no}",
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


# ---------------- Working-day counting ----------------


def test_leave_days_exclude_non_working_days(client, db_session):
    """A Friday-to-Monday absence costs two days, not four. Charging the
    weekend would quietly consume entitlement staff never used."""
    from app.leave import count_leave_days

    friday = _next_weekday(4)
    monday = friday + timedelta(days=3)

    # Default working week is Monday-Saturday, so only Sunday is skipped.
    assert count_leave_days(db_session, friday, monday) == 3.0

    saturday = friday + timedelta(days=1)
    sunday = friday + timedelta(days=2)
    assert count_leave_days(db_session, saturday, saturday) == 1.0
    assert count_leave_days(db_session, sunday, sunday) == 0.0


def test_half_day_counts_as_half(client, db_session):
    from app.leave import count_leave_days

    monday = _next_weekday(0)
    assert count_leave_days(db_session, monday, monday, is_half_day=True) == 0.5


def test_half_day_must_be_a_single_date(client, db_session):
    from app.leave import LeaveError, count_leave_days

    monday = _next_weekday(0)
    with pytest.raises(LeaveError):
        count_leave_days(db_session, monday, monday + timedelta(days=1), is_half_day=True)


def test_reversed_dates_are_refused(client, db_session):
    from app.leave import LeaveError, count_leave_days

    monday = _next_weekday(0)
    with pytest.raises(LeaveError):
        count_leave_days(db_session, monday, monday - timedelta(days=3))


# ---------------- Balances ----------------


def test_a_pending_request_does_not_consume_entitlement(client, auth, db_session):
    """Otherwise a teacher who applies speculatively loses days never taken."""
    teacher = _teacher(db_session)
    leave_type = _leave_type(client, auth, annual_quota=10)
    monday = _next_weekday(0)

    _request(client, auth, teacher.id, leave_type["id"], monday, monday + timedelta(days=1))

    balances = client.get(f"/leave/balances?teacher_id={teacher.id}", headers=auth).json()
    row = next(b for b in balances if b["leave_type_id"] == leave_type["id"])
    assert row["used_days"] == 0
    assert row["remaining_days"] == 10


def test_approval_deducts_and_cancellation_restores(client, auth, db_session):
    teacher = _teacher(db_session)
    leave_type = _leave_type(client, auth, annual_quota=10)
    monday = _next_weekday(0)

    created = _request(client, auth, teacher.id, leave_type["id"], monday, monday + timedelta(days=1)).json()
    assert created["days"] == 2

    approved = client.post(f"/leave/requests/{created['id']}/approve", json={}, headers=auth).json()
    assert approved["days_deducted"] == 2
    assert approved["remaining"] == 8

    cancelled = client.post(f"/leave/requests/{created['id']}/cancel", json={}, headers=auth).json()
    assert cancelled["days_restored"] == 2

    balances = client.get(f"/leave/balances?teacher_id={teacher.id}", headers=auth).json()
    row = next(b for b in balances if b["leave_type_id"] == leave_type["id"])
    assert row["remaining_days"] == 10


def test_approval_is_refused_when_the_balance_runs_out(client, auth, db_session):
    teacher = _teacher(db_session)
    leave_type = _leave_type(client, auth, annual_quota=1)
    monday = _next_weekday(0)

    created = _request(client, auth, teacher.id, leave_type["id"], monday, monday + timedelta(days=2)).json()
    resp = client.post(f"/leave/requests/{created['id']}/approve", json={}, headers=auth)

    assert resp.status_code == 400
    assert "remain" in resp.json()["detail"].lower()


def test_unpaid_leave_may_go_past_the_quota(client, auth, db_session):
    """Unpaid leave has no entitlement to exhaust, so it must not be refused."""
    teacher = _teacher(db_session)
    leave_type = _leave_type(
        client, auth, name="Unpaid", annual_quota=0,
        is_paid=False, allow_negative_balance=True,
    )
    monday = _next_weekday(0)

    created = _request(client, auth, teacher.id, leave_type["id"], monday, monday + timedelta(days=2)).json()
    resp = client.post(f"/leave/requests/{created['id']}/approve", json={}, headers=auth)
    assert resp.status_code == 200, resp.text


def test_overlapping_requests_are_refused(client, auth, db_session):
    teacher = _teacher(db_session)
    leave_type = _leave_type(client, auth)
    monday = _next_weekday(0)

    _request(client, auth, teacher.id, leave_type["id"], monday, monday + timedelta(days=2))
    clash = _request(client, auth, teacher.id, leave_type["id"], monday + timedelta(days=1), monday + timedelta(days=3))

    assert clash.status_code == 400
    assert "covering those dates" in clash.json()["detail"]


def test_a_cancelled_request_frees_the_dates_again(client, auth, db_session):
    teacher = _teacher(db_session)
    leave_type = _leave_type(client, auth)
    monday = _next_weekday(0)

    first = _request(client, auth, teacher.id, leave_type["id"], monday, monday).json()
    client.post(f"/leave/requests/{first['id']}/cancel", json={}, headers=auth)

    again = _request(client, auth, teacher.id, leave_type["id"], monday, monday)
    assert again.status_code == 200, again.text


def test_approved_leave_cannot_be_rejected(client, auth, db_session):
    """Rejecting would leave the balance deducted with no leave to show for it."""
    teacher = _teacher(db_session)
    leave_type = _leave_type(client, auth)
    monday = _next_weekday(0)

    created = _request(client, auth, teacher.id, leave_type["id"], monday, monday).json()
    client.post(f"/leave/requests/{created['id']}/approve", json={}, headers=auth)

    resp = client.post(f"/leave/requests/{created['id']}/reject", json={}, headers=auth)
    assert resp.status_code == 400
    assert "cancel" in resp.json()["detail"].lower()


# ---------------- Cover ----------------


def test_approving_leave_raises_cover_from_the_timetable(client, auth, db_session):
    teacher = _teacher(db_session)
    leave_type = _leave_type(client, auth)
    monday = _next_weekday(0)

    _timetable_entry(db_session, teacher.id, "Monday", 1)
    _timetable_entry(db_session, teacher.id, "Monday", 3)

    created = _request(client, auth, teacher.id, leave_type["id"], monday, monday).json()
    approved = client.post(f"/leave/requests/{created['id']}/approve", json={}, headers=auth).json()
    assert approved["covers_raised"] == 2

    cover = client.get(f"/leave/cover?on_date={monday}", headers=auth).json()
    mine = [c for c in cover if c["absent_teacher_id"] == teacher.id]
    assert len(mine) == 2
    assert {c["period_no"] for c in mine} == {1, 3}
    assert all(c["status"] == "Unassigned" for c in mine)


def test_raising_cover_twice_does_not_duplicate_slots(client, auth, db_session):
    from app.leave import raise_cover_for_leave
    from app.models import LeaveRequest

    teacher = _teacher(db_session)
    leave_type = _leave_type(client, auth)
    monday = _next_weekday(0)
    _timetable_entry(db_session, teacher.id, "Monday", 2)

    created = _request(client, auth, teacher.id, leave_type["id"], monday, monday).json()
    client.post(f"/leave/requests/{created['id']}/approve", json={}, headers=auth)

    request = db_session.query(LeaveRequest).filter(LeaveRequest.id == created["id"]).first()
    again = raise_cover_for_leave(db_session, request)
    db_session.commit()

    assert again == 0, "a second raise must not duplicate the hole"


def test_a_substitute_cannot_be_double_booked(client, auth, db_session):
    """The whole point of the feature: one teacher, two classrooms, same period."""
    absent = _teacher(db_session, name="Absent Teacher")
    busy = _teacher(db_session, name="Busy Teacher")
    leave_type = _leave_type(client, auth)
    monday = _next_weekday(0)

    _timetable_entry(db_session, absent.id, "Monday", 4)
    # The candidate already teaches their own class in that period.
    _timetable_entry(db_session, busy.id, "Monday", 4, class_name="9", section="B")

    created = _request(client, auth, absent.id, leave_type["id"], monday, monday).json()
    client.post(f"/leave/requests/{created['id']}/approve", json={}, headers=auth)

    cover = client.get(f"/leave/cover?on_date={monday}", headers=auth).json()
    slot = next(c for c in cover if c["absent_teacher_id"] == absent.id and c["period_no"] == 4)

    resp = client.post(
        f"/leave/cover/{slot['id']}/assign",
        json={"substitute_teacher_id": busy.id}, headers=auth,
    )
    assert resp.status_code == 400
    assert "already teaching" in resp.json()["detail"]


def test_a_substitute_cannot_cover_two_classes_in_one_period(client, auth, db_session):
    absent_a = _teacher(db_session, name="Absent A")
    absent_b = _teacher(db_session, name="Absent B")
    free = _teacher(db_session, name="Free Teacher")
    leave_type = _leave_type(client, auth)
    monday = _next_weekday(0)

    _timetable_entry(db_session, absent_a.id, "Monday", 5, class_name="7")
    _timetable_entry(db_session, absent_b.id, "Monday", 5, class_name="8")

    for teacher in (absent_a, absent_b):
        created = _request(client, auth, teacher.id, leave_type["id"], monday, monday).json()
        client.post(f"/leave/requests/{created['id']}/approve", json={}, headers=auth)

    cover = client.get(f"/leave/cover?on_date={monday}", headers=auth).json()
    slot_a = next(c for c in cover if c["absent_teacher_id"] == absent_a.id)
    slot_b = next(c for c in cover if c["absent_teacher_id"] == absent_b.id)

    first = client.post(
        f"/leave/cover/{slot_a['id']}/assign",
        json={"substitute_teacher_id": free.id}, headers=auth,
    )
    assert first.status_code == 200, first.text

    second = client.post(
        f"/leave/cover/{slot_b['id']}/assign",
        json={"substitute_teacher_id": free.id}, headers=auth,
    )
    assert second.status_code == 400
    assert "already covering" in second.json()["detail"]


def test_a_teacher_on_leave_cannot_be_a_substitute(client, auth, db_session):
    absent = _teacher(db_session, name="Absent One")
    also_away = _teacher(db_session, name="Also Away")
    leave_type = _leave_type(client, auth)
    monday = _next_weekday(0)

    _timetable_entry(db_session, absent.id, "Monday", 6)

    for teacher in (absent, also_away):
        created = _request(client, auth, teacher.id, leave_type["id"], monday, monday).json()
        client.post(f"/leave/requests/{created['id']}/approve", json={}, headers=auth)

    cover = client.get(f"/leave/cover?on_date={monday}", headers=auth).json()
    slot = next(c for c in cover if c["absent_teacher_id"] == absent.id)

    resp = client.post(
        f"/leave/cover/{slot['id']}/assign",
        json={"substitute_teacher_id": also_away.id}, headers=auth,
    )
    assert resp.status_code == 400
    assert "on leave" in resp.json()["detail"]


def test_the_absent_teacher_cannot_cover_their_own_class(client, auth, db_session):
    absent = _teacher(db_session)
    leave_type = _leave_type(client, auth)
    monday = _next_weekday(0)
    _timetable_entry(db_session, absent.id, "Monday", 7)

    created = _request(client, auth, absent.id, leave_type["id"], monday, monday).json()
    client.post(f"/leave/requests/{created['id']}/approve", json={}, headers=auth)

    cover = client.get(f"/leave/cover?on_date={monday}", headers=auth).json()
    slot = next(c for c in cover if c["absent_teacher_id"] == absent.id)

    resp = client.post(
        f"/leave/cover/{slot['id']}/assign",
        json={"substitute_teacher_id": absent.id}, headers=auth,
    )
    assert resp.status_code == 400


def test_candidates_report_why_someone_is_unavailable(client, auth, db_session):
    """A head filling a gap wants to see the obvious candidate is busy, not
    have them silently missing from the list."""
    absent = _teacher(db_session, name="Absent Two")
    busy = _teacher(db_session, name="Busy Two")
    leave_type = _leave_type(client, auth)
    monday = _next_weekday(0)

    _timetable_entry(db_session, absent.id, "Monday", 8)
    _timetable_entry(db_session, busy.id, "Monday", 8, class_name="10")

    created = _request(client, auth, absent.id, leave_type["id"], monday, monday).json()
    client.post(f"/leave/requests/{created['id']}/approve", json={}, headers=auth)

    cover = client.get(f"/leave/cover?on_date={monday}", headers=auth).json()
    slot = next(c for c in cover if c["absent_teacher_id"] == absent.id and c["period_no"] == 8)

    candidates = client.get(f"/leave/cover/{slot['id']}/candidates", headers=auth).json()
    entry = next(c for c in candidates if c["teacher_id"] == busy.id)

    assert entry["available"] is False
    assert "already teaching" in entry["unavailable_reason"]
    assert all(c["teacher_id"] != absent.id for c in candidates), "the absent teacher is not a candidate"


def test_cancelling_leave_drops_unfilled_cover_but_keeps_assigned(client, auth, db_session):
    """Someone has been told they are teaching that period; silently
    un-telling them is worse than a row for a human to clear."""
    absent = _teacher(db_session, name="Absent Three")
    cover_teacher = _teacher(db_session, name="Cover Three")
    leave_type = _leave_type(client, auth)
    monday = _next_weekday(0)

    _timetable_entry(db_session, absent.id, "Monday", 1, class_name="5")
    _timetable_entry(db_session, absent.id, "Monday", 2, class_name="5")

    created = _request(client, auth, absent.id, leave_type["id"], monday, monday).json()
    client.post(f"/leave/requests/{created['id']}/approve", json={}, headers=auth)

    slots = [
        c for c in client.get(f"/leave/cover?on_date={monday}", headers=auth).json()
        if c["absent_teacher_id"] == absent.id
    ]
    assert len(slots) == 2
    client.post(
        f"/leave/cover/{slots[0]['id']}/assign",
        json={"substitute_teacher_id": cover_teacher.id}, headers=auth,
    )

    result = client.post(f"/leave/requests/{created['id']}/cancel", json={}, headers=auth).json()
    assert result["unassigned_covers_removed"] == 1

    remaining = [
        c for c in client.get(f"/leave/cover?on_date={monday}", headers=auth).json()
        if c["absent_teacher_id"] == absent.id
    ]
    assert len(remaining) == 1
    assert remaining[0]["status"] == "Assigned"
