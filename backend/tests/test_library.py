"""Library circulation: issuing, returning, renewing, and reserving.

The tests that matter are the ones protecting the numbers a librarian and a
parent both look at: the due date a borrower is actually held to, the fine
that gets charged, and the borrowing caps -- plus the reservation queue
actually handing a freed copy to the right person next.
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


def _book(db, **overrides):
    from app.models import LibraryBook
    fields = {
        "accession_no": f"LIB-{uuid.uuid4().hex[:8]}",
        "title": "Test Book", "total_copies": 1, "available_copies": 1,
        "status": "Available",
    }
    fields.update(overrides)
    book = LibraryBook(**fields)
    db.add(book)
    db.commit()
    db.refresh(book)
    return book


def _student(db, **overrides):
    from app.models import Student
    fields = {
        "admission_no": f"LB-{uuid.uuid4().hex[:8]}",
        "first_name": "Library", "last_name": "Reader",
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
        "employee_no": f"LT-{uuid.uuid4().hex[:8]}", "name": "Library Teacher",
        "email": f"lt-{uuid.uuid4().hex[:6]}@example.com",
    }
    fields.update(overrides)
    teacher = Teacher(**fields)
    db.add(teacher)
    db.commit()
    db.refresh(teacher)
    return teacher


def _settings(db, **overrides):
    from app.models import LibrarySettings
    settings = db.query(LibrarySettings).first()
    if not settings:
        settings = LibrarySettings()
        db.add(settings)
    for key, value in overrides.items():
        setattr(settings, key, value)
    db.commit()
    db.refresh(settings)
    return settings


# --------------------------------------------------------------------------
# Issuing: due dates and borrowing caps
# --------------------------------------------------------------------------


def test_due_date_defaults_from_settings_loan_period(client, auth, db_session):
    _settings(db_session, loan_period_days=10)
    book = _book(db_session, available_copies=2)
    student = _student(db_session)

    resp = client.post("/library/issues/", json={
        "book_id": book.id, "borrower_type": "Student", "student_id": student.id,
        "issue_date": str(date.today()),
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    assert resp.json()["due_date"] == str(date.today() + timedelta(days=10))


def test_staff_issue_uses_the_staff_loan_period(client, auth, db_session):
    _settings(db_session, loan_period_days=10, loan_period_days_staff=25)
    book = _book(db_session, available_copies=2)
    teacher = _teacher(db_session)

    resp = client.post("/library/issues/", json={
        "book_id": book.id, "borrower_type": "Staff", "staff_id": teacher.id,
        "issue_date": str(date.today()),
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["due_date"] == str(date.today() + timedelta(days=25))
    assert body["student_id"] is None
    assert body["staff_id"] == teacher.id


def test_a_staff_issue_without_a_staff_id_is_refused(client, auth, db_session):
    book = _book(db_session, available_copies=2)
    resp = client.post("/library/issues/", json={
        "book_id": book.id, "borrower_type": "Staff",
        "issue_date": str(date.today()),
    }, headers=auth)
    assert resp.status_code == 400
    assert "staff_id" in resp.json()["detail"]


def test_no_available_copies_refuses_the_issue(client, auth, db_session):
    book = _book(db_session, available_copies=0)
    student = _student(db_session)
    resp = client.post("/library/issues/", json={
        "book_id": book.id, "student_id": student.id, "issue_date": str(date.today()),
    }, headers=auth)
    assert resp.status_code == 400
    assert "No available copies" in resp.json()["detail"]


def test_borrowing_cap_is_enforced_per_student(client, auth, db_session):
    _settings(db_session, max_books_student=1)
    student = _student(db_session)
    book1 = _book(db_session, available_copies=2)
    book2 = _book(db_session, available_copies=2)

    first = client.post("/library/issues/", json={
        "book_id": book1.id, "student_id": student.id, "issue_date": str(date.today()),
    }, headers=auth)
    assert first.status_code == 200, first.text

    second = client.post("/library/issues/", json={
        "book_id": book2.id, "student_id": student.id, "issue_date": str(date.today()),
    }, headers=auth)
    assert second.status_code == 400
    assert "Borrowing limit" in second.json()["detail"]


def test_borrowing_caps_for_students_and_staff_are_independent(client, auth, db_session):
    _settings(db_session, max_books_student=1, max_books_staff=1)
    student = _student(db_session)
    teacher = _teacher(db_session)
    book1 = _book(db_session, available_copies=2)
    book2 = _book(db_session, available_copies=2)

    for payload in (
        {"book_id": book1.id, "student_id": student.id},
        {"book_id": book2.id, "borrower_type": "Staff", "staff_id": teacher.id},
    ):
        payload["issue_date"] = str(date.today())
        resp = client.post("/library/issues/", json=payload, headers=auth)
        assert resp.status_code == 200, resp.text


# --------------------------------------------------------------------------
# Returning: the fine
# --------------------------------------------------------------------------


def test_returning_on_time_charges_no_fine(client, auth, db_session):
    _settings(db_session, fine_per_day=5)
    book = _book(db_session, available_copies=1)
    student = _student(db_session)
    issue_date = date.today() - timedelta(days=5)

    created = client.post("/library/issues/", json={
        "book_id": book.id, "student_id": student.id,
        "issue_date": str(issue_date), "due_date": str(date.today() + timedelta(days=2)),
    }, headers=auth).json()

    resp = client.put(f"/library/issues/{created['id']}", json={
        "book_id": book.id, "student_id": student.id, "issue_date": str(issue_date),
        "due_date": created["due_date"], "return_date": str(date.today()), "status": "Returned",
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    assert resp.json()["fine_amount"] == 0


def test_returning_late_auto_calculates_the_fine(client, auth, db_session):
    _settings(db_session, fine_per_day=5, fine_grace_days=0)
    book = _book(db_session, available_copies=1)
    student = _student(db_session)
    issue_date = date.today() - timedelta(days=20)
    due_date = date.today() - timedelta(days=6)

    created = client.post("/library/issues/", json={
        "book_id": book.id, "student_id": student.id,
        "issue_date": str(issue_date), "due_date": str(due_date),
    }, headers=auth).json()

    resp = client.put(f"/library/issues/{created['id']}", json={
        "book_id": book.id, "student_id": student.id, "issue_date": str(issue_date),
        "due_date": due_date.isoformat(), "return_date": str(date.today()), "status": "Returned",
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    # 6 days overdue * 5/day
    assert resp.json()["fine_amount"] == 30


def test_an_explicit_nonzero_fine_overrides_the_automatic_one(client, auth, db_session):
    _settings(db_session, fine_per_day=5)
    book = _book(db_session, available_copies=1)
    student = _student(db_session)
    issue_date = date.today() - timedelta(days=20)
    due_date = date.today() - timedelta(days=6)

    created = client.post("/library/issues/", json={
        "book_id": book.id, "student_id": student.id,
        "issue_date": str(issue_date), "due_date": str(due_date),
    }, headers=auth).json()

    resp = client.put(f"/library/issues/{created['id']}", json={
        "book_id": book.id, "student_id": student.id, "issue_date": str(issue_date),
        "due_date": due_date.isoformat(), "return_date": str(date.today()), "status": "Returned",
        "fine_amount": 500,
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    assert resp.json()["fine_amount"] == 500


def test_returning_frees_the_copy_for_the_next_borrower(client, auth, db_session):
    book = _book(db_session, available_copies=1)
    s1 = _student(db_session)
    s2 = _student(db_session)

    created = client.post("/library/issues/", json={
        "book_id": book.id, "student_id": s1.id, "issue_date": str(date.today()),
    }, headers=auth).json()

    blocked = client.post("/library/issues/", json={
        "book_id": book.id, "student_id": s2.id, "issue_date": str(date.today()),
    }, headers=auth)
    assert blocked.status_code == 400

    client.put(f"/library/issues/{created['id']}", json={
        "book_id": book.id, "student_id": s1.id, "issue_date": created["issue_date"],
        "due_date": created["due_date"], "return_date": str(date.today()), "status": "Returned",
    }, headers=auth)

    now_ok = client.post("/library/issues/", json={
        "book_id": book.id, "student_id": s2.id, "issue_date": str(date.today()),
    }, headers=auth)
    assert now_ok.status_code == 200, now_ok.text


# --------------------------------------------------------------------------
# Renewals
# --------------------------------------------------------------------------


def test_renewing_extends_the_due_date_and_counts_it(client, auth, db_session):
    _settings(db_session, loan_period_days=14, max_renewals=2)
    book = _book(db_session, available_copies=1)
    student = _student(db_session)

    created = client.post("/library/issues/", json={
        "book_id": book.id, "student_id": student.id, "issue_date": str(date.today()),
    }, headers=auth).json()
    assert created["renewal_count"] == 0

    renewed = client.post(f"/library/issues/{created['id']}/renew", headers=auth)
    assert renewed.status_code == 200, renewed.text
    body = renewed.json()
    assert body["renewal_count"] == 1
    # The original due date (today + 14) was already in the future, so the
    # renewal extends another full loan period from there, not from today.
    assert body["due_date"] == str(date.today() + timedelta(days=28))


def test_renewals_are_capped(client, auth, db_session):
    _settings(db_session, max_renewals=1)
    book = _book(db_session, available_copies=1)
    student = _student(db_session)
    created = client.post("/library/issues/", json={
        "book_id": book.id, "student_id": student.id, "issue_date": str(date.today()),
    }, headers=auth).json()

    first = client.post(f"/library/issues/{created['id']}/renew", headers=auth)
    assert first.status_code == 200

    second = client.post(f"/library/issues/{created['id']}/renew", headers=auth)
    assert second.status_code == 400
    assert "renewals already used" in second.json()["detail"]


def test_a_reserved_book_cannot_be_renewed(client, auth, db_session):
    _settings(db_session, block_renewal_if_reserved=True)
    book = _book(db_session, available_copies=1)
    borrower = _student(db_session)
    waiting_student = _student(db_session)

    issue = client.post("/library/issues/", json={
        "book_id": book.id, "student_id": borrower.id, "issue_date": str(date.today()),
    }, headers=auth).json()

    reservation = client.post("/library/reservations/", json={
        "book_id": book.id, "student_id": waiting_student.id,
    }, headers=auth)
    assert reservation.status_code == 200, reservation.text

    renewed = client.post(f"/library/issues/{issue['id']}/renew", headers=auth)
    assert renewed.status_code == 400
    assert "waiting" in renewed.json()["detail"]


def test_a_returned_book_cannot_be_renewed(client, auth, db_session):
    book = _book(db_session, available_copies=1)
    student = _student(db_session)
    created = client.post("/library/issues/", json={
        "book_id": book.id, "student_id": student.id, "issue_date": str(date.today()),
    }, headers=auth).json()
    client.put(f"/library/issues/{created['id']}", json={
        "book_id": book.id, "student_id": student.id, "issue_date": created["issue_date"],
        "due_date": created["due_date"], "return_date": str(date.today()), "status": "Returned",
    }, headers=auth)

    renewed = client.post(f"/library/issues/{created['id']}/renew", headers=auth)
    assert renewed.status_code == 400


# --------------------------------------------------------------------------
# Reservations
# --------------------------------------------------------------------------


def test_reservation_queue_promotes_the_earliest_waiting_borrower_on_return(client, auth, db_session):
    book = _book(db_session, available_copies=1)
    holder = _student(db_session)
    first_in_line = _student(db_session)
    second_in_line = _student(db_session)

    issue = client.post("/library/issues/", json={
        "book_id": book.id, "student_id": holder.id, "issue_date": str(date.today()),
    }, headers=auth).json()

    r1 = client.post("/library/reservations/", json={
        "book_id": book.id, "student_id": first_in_line.id,
    }, headers=auth).json()
    r2 = client.post("/library/reservations/", json={
        "book_id": book.id, "student_id": second_in_line.id,
    }, headers=auth).json()
    assert r1["queue_position"] == 1
    assert r2["queue_position"] == 2

    client.put(f"/library/issues/{issue['id']}", json={
        "book_id": book.id, "student_id": holder.id, "issue_date": issue["issue_date"],
        "due_date": issue["due_date"], "return_date": str(date.today()), "status": "Returned",
    }, headers=auth)

    reservations = client.get("/library/reservations/", params={"book_id": book.id}, headers=auth).json()
    by_id = {r["id"]: r for r in reservations}
    assert by_id[r1["id"]]["status"] == "Ready"
    assert by_id[r2["id"]]["status"] == "Waiting"

    # The book is held for r1's borrower -- a third party still cannot check it out.
    blocked = client.post("/library/issues/", json={
        "book_id": book.id, "student_id": second_in_line.id, "issue_date": str(date.today()),
    }, headers=auth)
    assert blocked.status_code == 400

    # But the person the hold is for can.
    fulfilled = client.post("/library/issues/", json={
        "book_id": book.id, "student_id": first_in_line.id, "issue_date": str(date.today()),
    }, headers=auth)
    assert fulfilled.status_code == 200, fulfilled.text
    assert fulfilled.json()["reservation_id"] == r1["id"]

    after = client.get("/library/reservations/", params={"book_id": book.id}, headers=auth).json()
    after_by_id = {r["id"]: r for r in after}
    assert after_by_id[r1["id"]]["status"] == "Fulfilled"


def test_cancelling_a_ready_reservation_releases_it_back(client, auth, db_session):
    book = _book(db_session, available_copies=1)
    holder = _student(db_session)
    waiter = _student(db_session)
    other = _student(db_session)

    issue = client.post("/library/issues/", json={
        "book_id": book.id, "student_id": holder.id, "issue_date": str(date.today()),
    }, headers=auth).json()
    reservation = client.post("/library/reservations/", json={
        "book_id": book.id, "student_id": waiter.id,
    }, headers=auth).json()
    client.put(f"/library/issues/{issue['id']}", json={
        "book_id": book.id, "student_id": holder.id, "issue_date": issue["issue_date"],
        "due_date": issue["due_date"], "return_date": str(date.today()), "status": "Returned",
    }, headers=auth)

    cancelled = client.post(f"/library/reservations/{reservation['id']}/cancel", headers=auth)
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "Cancelled"

    now_available = client.post("/library/issues/", json={
        "book_id": book.id, "student_id": other.id, "issue_date": str(date.today()),
    }, headers=auth)
    assert now_available.status_code == 200, now_available.text


def test_a_book_cannot_be_reserved_twice_by_the_same_borrower(client, auth, db_session):
    book = _book(db_session, available_copies=0)
    student = _student(db_session)
    first = client.post("/library/reservations/", json={
        "book_id": book.id, "student_id": student.id,
    }, headers=auth)
    assert first.status_code == 200

    second = client.post("/library/reservations/", json={
        "book_id": book.id, "student_id": student.id,
    }, headers=auth)
    assert second.status_code == 400


# --------------------------------------------------------------------------
# Settings
# --------------------------------------------------------------------------


def test_settings_round_trip(client, auth, db_session):
    resp = client.put("/library/settings", json={"fine_per_day": 3, "max_books_student": 4}, headers=auth)
    assert resp.status_code == 200, resp.text
    assert resp.json()["fine_per_day"] == 3
    assert resp.json()["max_books_student"] == 4

    fetched = client.get("/library/settings", headers=auth)
    assert fetched.json()["fine_per_day"] == 3


def test_negative_settings_are_refused(client, auth, db_session):
    resp = client.put("/library/settings", json={"fine_per_day": -1}, headers=auth)
    assert resp.status_code == 400
