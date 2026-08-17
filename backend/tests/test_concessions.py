"""Fee concessions: approval gating, stacking, caps, and re-pricing.

A concession is money the school chooses not to collect, so the rules that
matter are the ones preventing an unapproved or stale grant from quietly
reducing a bill, and preventing stacked schemes from producing a negative fee.
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


def _student(db, **overrides):
    from app.models import Student
    defaults = dict(
        first_name="Con", last_name="Tester", class_name="6", section="A",
        student_status="Active", residential_type="Day Scholar",
    )
    defaults.update(overrides)
    defaults.setdefault("admission_no", f"CON-{uuid.uuid4().hex[:8]}")
    student = Student(**defaults)
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


def _scheme(client, auth, **overrides):
    payload = {
        "code": f"SCH-{uuid.uuid4().hex[:6]}",
        "name": "Sibling Discount",
        "category": "Sibling",
        "discount_type": "percent",
        "discount_value": 10,
    }
    payload.update(overrides)
    resp = client.post("/concessions/schemes", json=payload, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _grant(client, auth, student_id, scheme_id, **overrides):
    payload = {"student_id": student_id, "scheme_id": scheme_id}
    payload.update(overrides)
    resp = client.post("/concessions/grants", json=payload, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _fee(db, student, total=10000.0, fee_type="Tuition Fee", paid=0.0, year=None):
    from app.models import Fee
    fee = Fee(
        student_id=student.id, fee_type=fee_type, total_amount=total,
        paid_amount=paid, due_amount=total - paid, academic_year=year,
        payment_status="Unpaid" if paid == 0 else "Partial",
    )
    db.add(fee)
    db.commit()
    db.refresh(fee)
    return fee


# ---------------- Balance arithmetic ----------------


def test_existing_fee_maths_is_unchanged_without_a_concession():
    """Seven call sites predate concessions; none may shift behaviour."""
    from app.routes.fees import calculate_fee_status

    assert calculate_fee_status(5000, 0) == (5000, "Unpaid")
    assert calculate_fee_status(5000, 2000) == (3000, "Partial")
    assert calculate_fee_status(5000, 5000) == (0, "Paid")


def test_concession_reduces_what_is_owed():
    from app.routes.fees import calculate_fee_status

    assert calculate_fee_status(5000, 0, 1000) == (4000, "Unpaid")
    assert calculate_fee_status(5000, 4000, 1000) == (0, "Paid")
    # A full scholarship must read as settled, not sit Unpaid forever.
    assert calculate_fee_status(5000, 0, 5000) == (0, "Paid")


def test_a_concession_can_never_make_a_fee_negative():
    from app.routes.fees import calculate_fee_status

    assert calculate_fee_status(5000, 0, 9999) == (0, "Paid")


# ---------------- Stacking and caps ----------------


def test_percentages_apply_to_the_original_amount_not_sequentially():
    """Two 50% schemes mean free, which is what "half for staff, half for
    siblings" means to a school -- and it makes the result independent of the
    order the grants happen to come back in."""
    from app.concessions import compute_discount

    class G:
        discount_type = None
        discount_value = None

    class S:
        def __init__(self, t, v):
            self.discount_type, self.discount_value = t, v

    pair = [(G(), S("percent", 50)), (G(), S("percent", 50))]
    assert compute_discount(10000, pair) == 10000

    mixed = [(G(), S("percent", 10)), (G(), S("fixed", 500))]
    assert compute_discount(10000, mixed) == 1500


def test_stacked_discounts_are_capped_at_the_fee():
    from app.concessions import compute_discount

    class G:
        discount_type = None
        discount_value = None

    class S:
        def __init__(self, t, v):
            self.discount_type, self.discount_value = t, v

    over = [(G(), S("percent", 80)), (G(), S("fixed", 9000))]
    assert compute_discount(10000, over) == 10000


# ---------------- Approval gating ----------------


def test_an_unapproved_grant_discounts_nothing(client, auth, db_session):
    student = _student(db_session)
    scheme = _scheme(client, auth, discount_value=50)
    _grant(client, auth, student.id, scheme["id"])

    resp = client.get(
        f"/concessions/preview?student_id={student.id}&amount=10000", headers=auth
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["concession_amount"] == 0, "a request must not discount before approval"


def test_approval_makes_it_apply(client, auth, db_session):
    student = _student(db_session)
    scheme = _scheme(client, auth, discount_value=25)
    grant = _grant(client, auth, student.id, scheme["id"])

    client.post(f"/concessions/grants/{grant['id']}/approve", json={}, headers=auth)

    body = client.get(
        f"/concessions/preview?student_id={student.id}&amount=10000", headers=auth
    ).json()
    assert body["concession_amount"] == 2500
    assert body["payable_amount"] == 7500


def test_rejected_and_revoked_grants_do_not_apply(client, auth, db_session):
    for decision in ("reject", "revoke"):
        student = _student(db_session)
        scheme = _scheme(client, auth, discount_value=50)
        grant = _grant(client, auth, student.id, scheme["id"])
        client.post(f"/concessions/grants/{grant['id']}/approve", json={}, headers=auth)
        client.post(f"/concessions/grants/{grant['id']}/{decision}", json={}, headers=auth)

        body = client.get(
            f"/concessions/preview?student_id={student.id}&amount=10000", headers=auth
        ).json()
        assert body["concession_amount"] == 0, decision


# ---------------- Scoping ----------------


def test_a_scheme_scoped_to_one_fee_type_leaves_others_alone(client, auth, db_session):
    student = _student(db_session)
    scheme = _scheme(client, auth, discount_value=50, applies_to_fee_type="Tuition Fee")
    grant = _grant(client, auth, student.id, scheme["id"])
    client.post(f"/concessions/grants/{grant['id']}/approve", json={}, headers=auth)

    tuition = client.get(
        f"/concessions/preview?student_id={student.id}&amount=10000&fee_type=Tuition%20Fee", headers=auth
    ).json()
    transport = client.get(
        f"/concessions/preview?student_id={student.id}&amount=10000&fee_type=Transport%20Fee", headers=auth
    ).json()

    assert tuition["concession_amount"] == 5000
    assert transport["concession_amount"] == 0, "a tuition scheme must not discount transport"


def test_an_expired_grant_stops_applying(client, auth, db_session):
    """A one-year scholarship must not quietly discount next year."""
    student = _student(db_session)
    scheme = _scheme(client, auth, discount_value=50)
    yesterday = date.today() - timedelta(days=1)
    grant = _grant(
        client, auth, student.id, scheme["id"],
        valid_from=str(yesterday - timedelta(days=365)), valid_to=str(yesterday),
    )
    client.post(f"/concessions/grants/{grant['id']}/approve", json={}, headers=auth)

    body = client.get(
        f"/concessions/preview?student_id={student.id}&amount=10000", headers=auth
    ).json()
    assert body["concession_amount"] == 0


def test_a_student_override_beats_the_scheme_rate(client, auth, db_session):
    student = _student(db_session)
    scheme = _scheme(client, auth, discount_value=10)
    grant = _grant(client, auth, student.id, scheme["id"], discount_type="percent", discount_value=35)
    client.post(f"/concessions/grants/{grant['id']}/approve", json={}, headers=auth)

    body = client.get(
        f"/concessions/preview?student_id={student.id}&amount=10000", headers=auth
    ).json()
    assert body["concession_amount"] == 3500


# ---------------- Fees ----------------


def test_a_new_fee_picks_up_an_approved_concession(client, auth, db_session):
    """A scholarship must not depend on someone remembering to discount."""
    student = _student(db_session)
    scheme = _scheme(client, auth, discount_value=20)
    grant = _grant(client, auth, student.id, scheme["id"])
    client.post(f"/concessions/grants/{grant['id']}/approve", json={}, headers=auth)

    resp = client.post("/fees/", json={
        "student_id": student.id, "fee_type": "Tuition Fee",
        "total_amount": 10000, "paid_amount": 0,
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    fee = resp.json()

    assert fee["concession_amount"] == 2000
    assert fee["due_amount"] == 8000
    assert fee["total_amount"] == 10000, "the gross amount stays on the record"


def test_approving_mid_year_reprices_existing_unpaid_fees(client, auth, db_session):
    """Approving a scholarship that only affects future fees is rarely what
    anyone means."""
    student = _student(db_session)
    fee = _fee(db_session, student, total=10000.0)
    scheme = _scheme(client, auth, discount_value=30)
    grant = _grant(client, auth, student.id, scheme["id"])

    resp = client.post(f"/concessions/grants/{grant['id']}/approve", json={}, headers=auth)
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["fees_updated"]) >= 1

    db_session.refresh(fee)
    assert fee.concession_amount == 3000
    assert fee.due_amount == 7000


def test_repricing_skips_part_paid_fees(client, auth, db_session):
    """Discounting a fee money has gone against would leave a credit balance
    the app has no way to represent."""
    student = _student(db_session)
    fee = _fee(db_session, student, total=10000.0, paid=4000.0)
    scheme = _scheme(client, auth, discount_value=50)
    grant = _grant(client, auth, student.id, scheme["id"])

    client.post(f"/concessions/grants/{grant['id']}/approve", json={}, headers=auth)

    db_session.refresh(fee)
    assert fee.concession_amount == 0, "a part-paid fee must be left for a human"
    assert fee.paid_amount == 4000.0


def test_revoking_restores_the_full_amount(client, auth, db_session):
    student = _student(db_session)
    fee = _fee(db_session, student, total=10000.0)
    scheme = _scheme(client, auth, discount_value=40)
    grant = _grant(client, auth, student.id, scheme["id"])
    client.post(f"/concessions/grants/{grant['id']}/approve", json={}, headers=auth)

    db_session.refresh(fee)
    assert fee.due_amount == 6000

    client.post(f"/concessions/grants/{grant['id']}/revoke", json={}, headers=auth)
    db_session.refresh(fee)
    assert fee.concession_amount == 0
    assert fee.due_amount == 10000


# ---------------- Validation ----------------


def test_a_percentage_over_100_is_refused(client, auth):
    resp = client.post("/concessions/schemes", json={
        "code": f"BAD-{uuid.uuid4().hex[:6]}", "name": "Impossible",
        "discount_type": "percent", "discount_value": 150,
    }, headers=auth)
    assert resp.status_code == 400


def test_negative_discounts_are_refused(client, auth):
    resp = client.post("/concessions/schemes", json={
        "code": f"NEG-{uuid.uuid4().hex[:6]}", "name": "Negative",
        "discount_type": "fixed", "discount_value": -100,
    }, headers=auth)
    assert resp.status_code == 400


def test_duplicate_live_grants_are_refused(client, auth, db_session):
    student = _student(db_session)
    scheme = _scheme(client, auth)
    _grant(client, auth, student.id, scheme["id"])

    resp = client.post("/concessions/grants", json={
        "student_id": student.id, "scheme_id": scheme["id"],
    }, headers=auth)
    assert resp.status_code == 400


def test_a_granted_scheme_cannot_be_deleted(client, auth, db_session):
    """Deleting would orphan the record of why a student's fees were reduced."""
    student = _student(db_session)
    scheme = _scheme(client, auth)
    _grant(client, auth, student.id, scheme["id"])

    resp = client.delete(f"/concessions/schemes/{scheme['id']}", headers=auth)
    assert resp.status_code == 400
    assert "deactivate" in resp.json()["detail"].lower()


def test_preview_explains_where_the_discount_came_from(client, auth, db_session):
    student = _student(db_session)
    sibling = _scheme(client, auth, name="Sibling", discount_value=10)
    merit = _scheme(client, auth, name="Merit", discount_type="fixed", discount_value=500)
    for scheme in (sibling, merit):
        grant = _grant(client, auth, student.id, scheme["id"])
        client.post(f"/concessions/grants/{grant['id']}/approve", json={}, headers=auth)

    body = client.get(
        f"/concessions/preview?student_id={student.id}&amount=10000", headers=auth
    ).json()

    assert body["concession_amount"] == 1500
    names = {line["scheme_name"] for line in body["lines"]}
    assert names == {"Sibling", "Merit"}
    assert body["capped"] is False
