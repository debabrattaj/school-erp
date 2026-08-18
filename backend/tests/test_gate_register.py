"""Gate register: visitors on campus, and students or staff leaving it.

The tests that matter here are the ones a safeguarding review would ask about:
that a child cannot leave without an approval, cannot leave to an unnamed
adult, cannot be handed to someone on the blocked list, and that the register
can always say who is on site.
"""

import uuid
from datetime import date, datetime, timedelta

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


def _student(db, first_name="Gate", last_name="Tester", **overrides):
    from app.models import Student
    student = Student(
        admission_no=f"GT-{uuid.uuid4().hex[:8]}",
        first_name=first_name, last_name=last_name,
        **overrides,
    )
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


def _teacher(db, name="Gate Staff"):
    from app.models import Teacher
    teacher = Teacher(employee_no=f"GS-{uuid.uuid4().hex[:8]}", name=name)
    db.add(teacher)
    db.commit()
    db.refresh(teacher)
    return teacher


def _visitor(client, auth, **overrides):
    payload = {"visitor_name": "Ravi Kumar", "phone": "9876500001", "purpose": "Meeting"}
    payload.update(overrides)
    return client.post("/gate/visitors", json=payload, headers=auth)


def _pass(client, auth, student_id, **overrides):
    payload = {"pass_type": "Student", "student_id": student_id, "reason": "Dentist"}
    payload.update(overrides)
    return client.post("/gate/passes", json=payload, headers=auth)


# --------------------------------------------------------------------------
# Visitors
# --------------------------------------------------------------------------


def test_walk_in_is_registered_and_admitted_in_one_step(client, auth):
    resp = _visitor(client, auth, visitor_name="Walk In", phone="9876500010")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "In"
    assert body["checked_in_at"] is not None
    assert body["pass_no"].startswith(f"V-{date.today():%Y%m%d}-")


def test_preregistered_visitor_waits_for_check_in(client, auth):
    resp = _visitor(client, auth, visitor_name="Expected Guest", phone="9876500011",
                    check_in_now=False)
    assert resp.status_code == 200
    assert resp.json()["status"] == "Expected"
    assert resp.json()["checked_in_at"] is None

    admitted = client.post(f"/gate/visitors/{resp.json()['id']}/check-in", headers=auth)
    assert admitted.status_code == 200
    assert admitted.json()["status"] == "In"


def test_pass_numbers_increment_within_a_day(client, auth):
    first = _visitor(client, auth, visitor_name="Seq One", phone="9876500012").json()
    second = _visitor(client, auth, visitor_name="Seq Two", phone="9876500013").json()
    assert first["pass_no"] != second["pass_no"]
    assert int(second["pass_no"].rsplit("-", 1)[-1]) > int(first["pass_no"].rsplit("-", 1)[-1])


def test_checking_out_twice_is_refused(client, auth):
    visit = _visitor(client, auth, visitor_name="Double Out", phone="9876500014").json()
    assert client.post(f"/gate/visitors/{visit['id']}/check-out", headers=auth).status_code == 200

    again = client.post(f"/gate/visitors/{visit['id']}/check-out", headers=auth)
    assert again.status_code == 400
    assert "already been checked out" in again.json()["detail"]


def test_checking_out_someone_who_never_arrived_is_refused(client, auth):
    visit = _visitor(client, auth, visitor_name="No Show", phone="9876500015",
                     check_in_now=False).json()
    resp = client.post(f"/gate/visitors/{visit['id']}/check-out", headers=auth)
    assert resp.status_code == 400
    assert "never checked in" in resp.json()["detail"]


def test_on_campus_lists_only_visitors_still_inside(client, auth):
    inside = _visitor(client, auth, visitor_name="Still Here", phone="9876500016").json()
    left = _visitor(client, auth, visitor_name="Gone Home", phone="9876500017").json()
    client.post(f"/gate/visitors/{left['id']}/check-out", headers=auth)

    ids = {v["id"] for v in client.get("/gate/visitors/on-campus", headers=auth).json()}
    assert inside["id"] in ids
    assert left["id"] not in ids


def test_denied_entry_is_recorded_rather_than_dropped(client, auth):
    visit = _visitor(client, auth, visitor_name="Turned Away", phone="9876500018",
                     check_in_now=False).json()
    resp = client.post(f"/gate/visitors/{visit['id']}/deny",
                       json={"note": "No appointment"}, headers=auth)
    assert resp.status_code == 200
    assert resp.json()["status"] == "Denied"
    assert resp.json()["denied_reason"] == "No appointment"


# --------------------------------------------------------------------------
# Blocked visitors
# --------------------------------------------------------------------------


def test_a_block_needs_something_matchable(client, auth):
    resp = client.post("/gate/blocked", json={"name": "Nameless Only", "reason": "Trespass"},
                       headers=auth)
    assert resp.status_code == 400
    assert "phone number or ID number" in resp.json()["detail"]


def test_blocked_visitor_is_turned_away_at_registration(client, auth):
    client.post("/gate/blocked", json={
        "name": "Barred Person", "phone": "9876500020", "reason": "Abusive to staff",
    }, headers=auth)

    resp = _visitor(client, auth, visitor_name="Barred Person", phone="9876500020")
    assert resp.status_code == 400
    assert "Abusive to staff" in resp.json()["detail"]


def test_block_matching_ignores_phone_formatting(client, auth):
    """A barred person does not helpfully re-type their number the same way."""
    client.post("/gate/blocked", json={
        "name": "Formatted", "phone": "+91 98765 00021", "reason": "Barred",
    }, headers=auth)

    resp = _visitor(client, auth, visitor_name="Formatted", phone="9876500021")
    assert resp.status_code == 400


def test_block_matches_on_id_proof_number_too(client, auth):
    client.post("/gate/blocked", json={
        "name": "By Proof", "id_proof_number": "abc-9911", "reason": "Barred",
    }, headers=auth)

    resp = _visitor(client, auth, visitor_name="Different Spelling",
                    phone="9876500022", id_proof_number="ABC-9911")
    assert resp.status_code == 400


def test_lifting_a_block_lets_them_back_in_and_keeps_the_record(client, auth):
    block = client.post("/gate/blocked", json={
        "name": "Reformed", "phone": "9876500023", "reason": "Old dispute",
    }, headers=auth).json()

    lifted = client.post(f"/gate/blocked/{block['id']}/lift",
                         json={"note": "Resolved with the family"}, headers=auth)
    assert lifted.status_code == 200
    assert lifted.json()["is_active"] is False

    assert _visitor(client, auth, visitor_name="Reformed", phone="9876500023").status_code == 200

    # The reason survives the lift -- it is what a later reader wants.
    archived = client.get("/gate/blocked?include_lifted=true", headers=auth).json()
    row = next(b for b in archived if b["id"] == block["id"])
    assert row["reason"] == "Old dispute"
    assert row["lifted_note"] == "Resolved with the family"


# --------------------------------------------------------------------------
# Gate passes: the safeguarding path
# --------------------------------------------------------------------------


def test_a_student_cannot_be_released_without_an_approval(client, auth, db_session):
    student = _student(db_session, first_name="Unapproved")
    gate_pass = _pass(client, auth, student.id).json()
    assert gate_pass["status"] == "Requested"

    resp = client.post(f"/gate/passes/{gate_pass['id']}/release",
                       json={"collected_by_name": "Someone"}, headers=auth)
    assert resp.status_code == 400
    assert "not been approved" in resp.json()["detail"]


def test_a_student_cannot_be_released_to_an_unnamed_adult(client, auth, db_session):
    student = _student(db_session, first_name="Unnamed")
    gate_pass = _pass(client, auth, student.id).json()
    client.post(f"/gate/passes/{gate_pass['id']}/approve", json={}, headers=auth)

    resp = client.post(f"/gate/passes/{gate_pass['id']}/release", json={}, headers=auth)
    assert resp.status_code == 400
    assert "who is collecting" in resp.json()["detail"]


def test_release_to_a_known_contact_is_flagged_as_matched(client, auth, db_session):
    student = _student(db_session, first_name="Known", father_name="Suresh Rao",
                       guardian_phone="9876500030")
    gate_pass = _pass(client, auth, student.id).json()
    client.post(f"/gate/passes/{gate_pass['id']}/approve", json={}, headers=auth)

    resp = client.post(f"/gate/passes/{gate_pass['id']}/release", json={
        "collected_by_name": "suresh rao", "collected_by_relation": "Father",
    }, headers=auth)
    assert resp.status_code == 200
    assert resp.json()["collector_matched_contact"] is True
    assert resp.json()["status"] == "Out"


def test_release_to_an_unrecognised_adult_is_allowed_but_recorded(client, auth, db_session):
    """Schools do release children to a driver or an uncle. Blocking it would
    just teach the gate to type the father's name in every time; recording it
    is the part an audit actually uses."""
    student = _student(db_session, first_name="Unrecognised", father_name="Suresh Rao")
    gate_pass = _pass(client, auth, student.id).json()
    client.post(f"/gate/passes/{gate_pass['id']}/approve", json={}, headers=auth)

    resp = client.post(f"/gate/passes/{gate_pass['id']}/release", json={
        "collected_by_name": "Family Driver", "collected_by_relation": "Driver",
    }, headers=auth)
    assert resp.status_code == 200
    assert resp.json()["status"] == "Out"
    assert resp.json()["collector_matched_contact"] is False
    assert resp.json()["collected_by_name"] == "Family Driver"


def test_a_blocked_person_cannot_collect_a_student(client, auth, db_session):
    client.post("/gate/blocked", json={
        "name": "Barred Relative", "phone": "9876500031",
        "reason": "Court order — no contact",
    }, headers=auth)

    student = _student(db_session, first_name="Protected")
    gate_pass = _pass(client, auth, student.id).json()
    client.post(f"/gate/passes/{gate_pass['id']}/approve", json={}, headers=auth)

    resp = client.post(f"/gate/passes/{gate_pass['id']}/release", json={
        "collected_by_name": "Barred Relative", "collected_by_phone": "9876500031",
    }, headers=auth)
    assert resp.status_code == 400
    assert "cannot collect a student" in resp.json()["detail"]

    still = client.get("/gate/passes", headers=auth).json()
    assert next(p for p in still if p["id"] == gate_pass["id"])["status"] == "Approved"


def test_a_second_open_pass_for_the_same_student_is_refused(client, auth, db_session):
    student = _student(db_session, first_name="Twice")
    first = _pass(client, auth, student.id)
    assert first.status_code == 200

    second = _pass(client, auth, student.id)
    assert second.status_code == 400
    assert first.json()["pass_no"] in second.json()["detail"]


def test_a_new_pass_is_allowed_once_the_student_is_back(client, auth, db_session):
    student = _student(db_session, first_name="Returned")
    gate_pass = _pass(client, auth, student.id).json()
    client.post(f"/gate/passes/{gate_pass['id']}/approve", json={}, headers=auth)
    client.post(f"/gate/passes/{gate_pass['id']}/release",
                json={"collected_by_name": "Parent"}, headers=auth)
    assert client.post(f"/gate/passes/{gate_pass['id']}/return", headers=auth).status_code == 200

    assert _pass(client, auth, student.id).status_code == 200


def test_still_out_is_the_roll_call_list(client, auth, db_session):
    student = _student(db_session, first_name="Away")
    gate_pass = _pass(client, auth, student.id).json()
    client.post(f"/gate/passes/{gate_pass['id']}/approve", json={}, headers=auth)
    client.post(f"/gate/passes/{gate_pass['id']}/release",
                json={"collected_by_name": "Parent"}, headers=auth)

    out_ids = {p["id"] for p in client.get("/gate/passes/still-out", headers=auth).json()}
    assert gate_pass["id"] in out_ids

    client.post(f"/gate/passes/{gate_pass['id']}/return", headers=auth)
    out_ids = {p["id"] for p in client.get("/gate/passes/still-out", headers=auth).json()}
    assert gate_pass["id"] not in out_ids


def test_only_round_trip_passes_can_be_overdue(client, auth, db_session):
    """A student sent home sick is not late back."""
    earlier = datetime.utcnow() - timedelta(hours=2)

    coming_back = _student(db_session, first_name="Dentist")
    trip = _pass(client, auth, coming_back.id, expected_return=True,
                 expected_return_at=earlier.isoformat()).json()

    gone_home = _student(db_session, first_name="Sick")
    one_way = _pass(client, auth, gone_home.id, expected_return=False).json()

    for p in (trip, one_way):
        client.post(f"/gate/passes/{p['id']}/approve", json={}, headers=auth)
        client.post(f"/gate/passes/{p['id']}/release",
                    json={"collected_by_name": "Parent"}, headers=auth)

    rows = {p["id"]: p for p in client.get("/gate/passes/still-out", headers=auth).json()}
    assert rows[trip["id"]]["overdue"] is True
    assert rows[one_way["id"]]["overdue"] is False


def test_a_staff_pass_needs_no_collector(client, auth, db_session):
    teacher = _teacher(db_session, name="Errand Runner")
    gate_pass = client.post("/gate/passes", json={
        "pass_type": "Staff", "teacher_id": teacher.id, "reason": "Bank",
    }, headers=auth).json()
    client.post(f"/gate/passes/{gate_pass['id']}/approve", json={}, headers=auth)

    resp = client.post(f"/gate/passes/{gate_pass['id']}/release", json={}, headers=auth)
    assert resp.status_code == 200
    assert resp.json()["status"] == "Out"


def test_a_pass_already_used_cannot_be_cancelled(client, auth, db_session):
    student = _student(db_session, first_name="Cancel Late")
    gate_pass = _pass(client, auth, student.id).json()
    client.post(f"/gate/passes/{gate_pass['id']}/approve", json={}, headers=auth)
    client.post(f"/gate/passes/{gate_pass['id']}/release",
                json={"collected_by_name": "Parent"}, headers=auth)

    resp = client.post(f"/gate/passes/{gate_pass['id']}/cancel", json={}, headers=auth)
    assert resp.status_code == 400
    assert "already left" in resp.json()["detail"]


def test_releasing_twice_is_refused(client, auth, db_session):
    student = _student(db_session, first_name="Twice Out")
    gate_pass = _pass(client, auth, student.id).json()
    client.post(f"/gate/passes/{gate_pass['id']}/approve", json={}, headers=auth)
    client.post(f"/gate/passes/{gate_pass['id']}/release",
                json={"collected_by_name": "Parent"}, headers=auth)

    resp = client.post(f"/gate/passes/{gate_pass['id']}/release",
                       json={"collected_by_name": "Parent"}, headers=auth)
    assert resp.status_code == 400
    assert "already been used" in resp.json()["detail"]


def test_summary_counts_what_the_head_of_school_asks_for(client, auth, db_session):
    resp = client.get("/gate/summary", headers=auth)
    assert resp.status_code == 200
    body = resp.json()
    for key in ("visitors_today", "visitors_on_campus", "students_out",
                "staff_out", "overdue_returns", "active_blocks"):
        assert isinstance(body[key], int)


def test_gate_paths_resolve_to_a_grantable_module(client):
    """Without this mapping a custom "Security" role gets a blanket 403,
    because feature_for_path returns None and require_roles fails closed."""
    from app.permissions import feature_for_path, MODULE_KEYS

    assert feature_for_path("/gate/visitors") == "gate_register"
    assert feature_for_path("/gate/passes/1/release") == "gate_register"
    assert "gate_register" in MODULE_KEYS
