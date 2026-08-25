"""Receipt numbering (app/routes/fees.py): financial-year-scoped and
continuation-based rather than a global COUNT(*) -- the old scheme reset
with the calendar year instead of the school's financial year, and a
deleted fee shrank the count enough to hand out an already-issued number.
"""

from datetime import date

import pytest


def test_financial_year_label_april_start():
    from app.routes.fees import financial_year_label
    assert financial_year_label(date(2026, 4, 1)) == "2026-27"
    assert financial_year_label(date(2026, 12, 31)) == "2026-27"


def test_financial_year_label_before_april_rolls_back():
    from app.routes.fees import financial_year_label
    assert financial_year_label(date(2026, 1, 1)) == "2025-26"
    assert financial_year_label(date(2026, 3, 31)) == "2025-26"


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
        first_name="Test", class_name="ReceiptTest", section="A",
        student_status="Active", residential_type="Day Scholar",
        admission_no=f"RCPT-{uuid.uuid4().hex[:10]}",
    )
    defaults.update(overrides)
    student = Student(**defaults)
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


def test_receipt_numbers_are_fy_prefixed(client, auth, db_session):
    student = _make_student(db_session)

    resp = client.post("/fees/", json={
        "student_id": student.id,
        "fee_type": "Tuition Fee",
        "total_amount": 1000,
        "paid_amount": 1000,
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    receipt_no = resp.json()["receipt_no"]

    from app.routes.fees import financial_year_label
    fy = financial_year_label(date.today())
    assert receipt_no.startswith(f"REC-{fy}-")


def test_receipt_number_not_reused_after_deleting_a_fee(client, auth, db_session):
    """Deleting the most-recently-numbered receipt must not cause the next
    one issued to collide with it -- a COUNT(*)-based scheme would reuse it."""
    s1 = _make_student(db_session)
    s2 = _make_student(db_session)

    first = client.post("/fees/", json={
        "student_id": s1.id, "fee_type": "Tuition Fee",
        "total_amount": 500, "paid_amount": 500,
    }, headers=auth)
    assert first.status_code == 200, first.text
    first_id = first.json()["id"]
    first_receipt = first.json()["receipt_no"]

    delete_resp = client.delete(f"/fees/{first_id}", headers=auth)
    assert delete_resp.status_code == 200, delete_resp.text

    second = client.post("/fees/", json={
        "student_id": s2.id, "fee_type": "Tuition Fee",
        "total_amount": 700, "paid_amount": 700,
    }, headers=auth)
    assert second.status_code == 200, second.text
    second_receipt = second.json()["receipt_no"]

    assert second_receipt != first_receipt


def test_receipt_numbers_increment_within_the_same_fy(client, auth, db_session):
    s1 = _make_student(db_session)
    s2 = _make_student(db_session)

    r1 = client.post("/fees/", json={
        "student_id": s1.id, "fee_type": "Tuition Fee",
        "total_amount": 100, "paid_amount": 100,
    }, headers=auth).json()["receipt_no"]
    r2 = client.post("/fees/", json={
        "student_id": s2.id, "fee_type": "Tuition Fee",
        "total_amount": 100, "paid_amount": 100,
    }, headers=auth).json()["receipt_no"]

    seq1 = int(r1.rsplit("-", 1)[-1])
    seq2 = int(r2.rsplit("-", 1)[-1])
    assert seq2 == seq1 + 1
