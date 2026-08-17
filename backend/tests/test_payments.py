"""Online fee collection: signature verification, settlement, idempotency.

These are the paths where a bug costs real money — a forged callback marking
a fee paid, or a retried webhook crediting it twice — so they get direct tests
rather than being covered only through the happy path.
"""

import hashlib
import hmac
import json
import uuid

import pytest

KEY_ID = "rzp_test_key"
KEY_SECRET = "rzp_test_secret"
WEBHOOK_SECRET = "whsec_test"


@pytest.fixture()
def db_session(client):
    from app.database import SessionLocal
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture()
def gateway(db_session):
    """A school with gateway credentials configured."""
    from app.models import SchoolSettings

    settings = db_session.query(SchoolSettings).first()
    created = False
    if not settings:
        settings = SchoolSettings(school_name="Test School", currency="INR")
        db_session.add(settings)
        created = True
    previous = (
        settings.payment_provider, settings.payment_key_id,
        settings.payment_key_secret, settings.payment_webhook_secret,
    )
    settings.payment_provider = "razorpay"
    settings.payment_key_id = KEY_ID
    settings.payment_key_secret = KEY_SECRET
    settings.payment_webhook_secret = WEBHOOK_SECRET
    db_session.commit()

    yield settings

    if created:
        db_session.delete(settings)
    else:
        (settings.payment_provider, settings.payment_key_id,
         settings.payment_key_secret, settings.payment_webhook_secret) = previous
    db_session.commit()


def _make_fee(db, total=5000.0, paid=0.0):
    from app.models import Fee, Student

    student = Student(
        admission_no=f"PAY-{uuid.uuid4().hex[:8]}",
        first_name="Pay", last_name="Tester", class_name="7", section="A",
        student_status="Active", residential_type="Day Scholar",
    )
    db.add(student)
    db.commit()
    db.refresh(student)

    fee = Fee(
        student_id=student.id, fee_type="Tuition", total_amount=total,
        paid_amount=paid, due_amount=total - paid,
        payment_status="Unpaid" if paid == 0 else "Partial",
    )
    db.add(fee)
    db.commit()
    db.refresh(fee)
    return fee


def _order_for(db, fee, order_id="order_TEST123", amount=None, status="Created"):
    from app.models import PaymentOrder

    order = PaymentOrder(
        fee_id=fee.id, student_id=fee.student_id, provider="razorpay",
        order_id=order_id, amount=amount if amount is not None else fee.total_amount,
        currency="INR", status=status,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


def _webhook_body(order_id, payment_id="pay_TEST999", event="payment.captured", amount_paise=500000):
    return json.dumps({
        "event": event,
        "payload": {
            "payment": {
                "entity": {
                    "id": payment_id, "order_id": order_id,
                    "amount": amount_paise, "method": "upi",
                }
            }
        },
    }).encode("utf-8")


def _sign(body: bytes, secret=WEBHOOK_SECRET) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


# ---------------- Amount conversion ----------------


def test_minor_unit_conversion_rounds_rather_than_truncates():
    """A float like 999.9999 must not become 99999 paise — a rupee lost."""
    from app.payments import from_minor_units, to_minor_units

    # The case that actually bites: a float that is a hair under a round
    # rupee must not truncate down to one paise short.
    assert to_minor_units(1000) == 100000
    assert to_minor_units(999.9999) == 100000
    assert to_minor_units(0.01) == 1
    assert to_minor_units(2499.5) == 249950
    # Half-paise inputs are not real fee amounts (fees carry two decimals), and
    # 12.345 is 1234.4999... in IEEE-754, so it rounds down. Asserted so the
    # behaviour is pinned rather than discovered later against a live payment.
    assert to_minor_units(12.345) == 1234
    assert from_minor_units(100000) == 1000.0
    assert from_minor_units(1235) == 12.35


# ---------------- Signature verification ----------------


def test_checkout_signature_accepts_only_the_real_signature():
    from app.payments import razorpay_verify_checkout_signature

    config = {"key_secret": KEY_SECRET}
    order_id, payment_id = "order_ABC", "pay_XYZ"
    good = hmac.new(
        KEY_SECRET.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256
    ).hexdigest()

    assert razorpay_verify_checkout_signature(config, order_id, payment_id, good) is True
    assert razorpay_verify_checkout_signature(config, order_id, payment_id, "deadbeef") is False
    assert razorpay_verify_checkout_signature(config, order_id, payment_id, "") is False
    # Signature bound to this exact pair: reusing it for another order fails.
    assert razorpay_verify_checkout_signature(config, "order_OTHER", payment_id, good) is False
    assert razorpay_verify_checkout_signature(config, order_id, "pay_OTHER", good) is False


def test_webhook_signature_is_computed_over_the_raw_body():
    from app.payments import razorpay_verify_webhook_signature

    config = {"webhook_secret": WEBHOOK_SECRET}
    body = _webhook_body("order_1")

    assert razorpay_verify_webhook_signature(config, body, _sign(body)) is True
    assert razorpay_verify_webhook_signature(config, body, "nope") is False
    # Same JSON re-serialised differently is a different byte string, so the
    # digest must not match -- this is why the endpoint reads raw bytes.
    reserialised = json.dumps(json.loads(body), indent=2).encode()
    assert razorpay_verify_webhook_signature(config, reserialised, _sign(body)) is False
    # No configured secret means nothing verifies, rather than everything.
    assert razorpay_verify_webhook_signature({"webhook_secret": ""}, body, _sign(body)) is False


# ---------------- Webhook settlement ----------------


def test_webhook_settles_the_fee(client, db_session, gateway):
    from app.models import Fee

    fee = _make_fee(db_session, total=5000.0)
    order = _order_for(db_session, fee, order_id=f"order_{uuid.uuid4().hex[:10]}")
    body = _webhook_body(order.order_id)

    resp = client.post(
        "/payments/webhook", content=body,
        headers={"X-Razorpay-Signature": _sign(body), "Content-Type": "application/json"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "Paid"

    db_session.refresh(fee)
    assert fee.paid_amount == 5000.0
    assert fee.payment_status == "Paid"
    assert fee.receipt_no


def test_webhook_is_idempotent(client, db_session, gateway):
    """Gateways retry. Crediting twice would show the guardian as overpaid."""
    fee = _make_fee(db_session, total=5000.0)
    order = _order_for(db_session, fee, order_id=f"order_{uuid.uuid4().hex[:10]}")
    body = _webhook_body(order.order_id)
    headers = {"X-Razorpay-Signature": _sign(body), "Content-Type": "application/json"}

    first = client.post("/payments/webhook", content=body, headers=headers).json()
    second = client.post("/payments/webhook", content=body, headers=headers).json()

    assert first["newly_settled"] is True
    assert second["newly_settled"] is False

    db_session.refresh(fee)
    assert fee.paid_amount == 5000.0, "second delivery must not credit again"


def test_webhook_rejects_a_forged_signature(client, db_session, gateway):
    """Without this check anyone could mark any fee paid."""
    fee = _make_fee(db_session, total=5000.0)
    order = _order_for(db_session, fee, order_id=f"order_{uuid.uuid4().hex[:10]}")
    body = _webhook_body(order.order_id)

    resp = client.post(
        "/payments/webhook", content=body,
        headers={"X-Razorpay-Signature": "forged", "Content-Type": "application/json"},
    )
    assert resp.status_code == 400

    db_session.refresh(fee)
    assert fee.paid_amount == 0, "a forged webhook must not credit the fee"


def test_webhook_ignores_unknown_orders_and_events(client, db_session, gateway):
    unknown = _webhook_body("order_NOT_OURS")
    resp = client.post(
        "/payments/webhook", content=unknown,
        headers={"X-Razorpay-Signature": _sign(unknown), "Content-Type": "application/json"},
    )
    assert resp.status_code == 200
    assert resp.json()["handled"] is False

    fee = _make_fee(db_session)
    order = _order_for(db_session, fee, order_id=f"order_{uuid.uuid4().hex[:10]}")
    other = _webhook_body(order.order_id, event="payment.authorized")
    resp = client.post(
        "/payments/webhook", content=other,
        headers={"X-Razorpay-Signature": _sign(other), "Content-Type": "application/json"},
    )
    assert resp.status_code == 200
    assert resp.json()["handled"] is False

    db_session.refresh(fee)
    assert fee.paid_amount == 0, "authorized-but-not-captured must not settle"


def test_failed_payment_marks_the_order_not_the_fee(client, db_session, gateway):
    fee = _make_fee(db_session, total=5000.0)
    order = _order_for(db_session, fee, order_id=f"order_{uuid.uuid4().hex[:10]}")
    body = _webhook_body(order.order_id, event="payment.failed")

    resp = client.post(
        "/payments/webhook", content=body,
        headers={"X-Razorpay-Signature": _sign(body), "Content-Type": "application/json"},
    )
    assert resp.json()["status"] == "Failed"

    db_session.refresh(order)
    db_session.refresh(fee)
    assert order.status == "Failed"
    assert fee.paid_amount == 0


def test_settlement_credits_the_order_amount_not_the_payload_amount(client, db_session, gateway):
    """A tampered payload claiming a larger amount must not over-credit."""
    fee = _make_fee(db_session, total=5000.0)
    order = _order_for(db_session, fee, order_id=f"order_{uuid.uuid4().hex[:10]}", amount=2000.0)
    # Payload claims 50,000 rupees against an order that was for 2,000.
    body = _webhook_body(order.order_id, amount_paise=5000000)

    client.post(
        "/payments/webhook", content=body,
        headers={"X-Razorpay-Signature": _sign(body), "Content-Type": "application/json"},
    )

    db_session.refresh(fee)
    assert fee.paid_amount == 2000.0, "credit must follow our order, not their payload"
    assert fee.payment_status == "Partial"


# ---------------- Checkout verification endpoint ----------------


def test_verify_endpoint_requires_a_valid_payment_link(client, db_session, gateway):
    fee = _make_fee(db_session)
    resp = client.post(f"/payments/fees/{fee.id}/verify", json={})
    assert resp.status_code == 401

    resp = client.post(f"/payments/fees/{fee.id}/verify?token=garbage", json={})
    assert resp.status_code == 401


def test_verify_endpoint_rejects_a_bad_signature(client, db_session, gateway):
    from app.payment_links import create_payment_link_token

    fee = _make_fee(db_session)
    order = _order_for(db_session, fee, order_id=f"order_{uuid.uuid4().hex[:10]}")
    token = create_payment_link_token(fee.id)

    resp = client.post(
        f"/payments/fees/{fee.id}/verify?token={token}",
        json={"order_id": order.order_id, "payment_id": "pay_X", "signature": "forged"},
    )
    assert resp.status_code == 400

    db_session.refresh(fee)
    assert fee.paid_amount == 0


def test_verify_endpoint_settles_with_a_good_signature(client, db_session, gateway):
    from app.payment_links import create_payment_link_token

    fee = _make_fee(db_session, total=3000.0)
    order = _order_for(db_session, fee, order_id=f"order_{uuid.uuid4().hex[:10]}", amount=3000.0)
    token = create_payment_link_token(fee.id)
    payment_id = "pay_GOOD"
    signature = hmac.new(
        KEY_SECRET.encode(), f"{order.order_id}|{payment_id}".encode(), hashlib.sha256
    ).hexdigest()

    resp = client.post(
        f"/payments/fees/{fee.id}/verify?token={token}",
        json={"order_id": order.order_id, "payment_id": payment_id, "signature": signature},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "Paid"

    db_session.refresh(fee)
    assert fee.paid_amount == 3000.0


# ---------------- Configuration ----------------


def test_config_never_returns_the_secrets(client, auth, gateway):
    resp = client.get("/payments/config", headers=auth)
    assert resp.status_code == 200, resp.text
    body = resp.json()

    assert body["enabled"] is True
    assert body["key_id"] == KEY_ID
    assert body["has_secret"] is True
    assert KEY_SECRET not in json.dumps(body)
    assert WEBHOOK_SECRET not in json.dumps(body)


def test_config_rejects_an_unsupported_provider(client, auth):
    resp = client.put(
        "/payments/config",
        json={"payment_provider": "some-unknown-gateway", "payment_key_id": "x"},
        headers=auth,
    )
    assert resp.status_code == 400


def test_blank_secret_keeps_the_stored_one(client, auth, db_session, gateway):
    """The UI can't show a secret, so an admin editing the key id shouldn't
    have to retype it."""
    resp = client.put(
        "/payments/config",
        json={"payment_provider": "razorpay", "payment_key_id": "rzp_new_id",
              "payment_key_secret": ""},
        headers=auth,
    )
    assert resp.status_code == 200, resp.text

    db_session.refresh(gateway)
    assert gateway.payment_key_id == "rzp_new_id"
    assert gateway.payment_key_secret == KEY_SECRET, "blank must not wipe the secret"


def test_order_creation_fails_clearly_when_gateway_not_configured(client, db_session):
    from app.models import SchoolSettings
    from app.payment_links import create_payment_link_token

    settings = db_session.query(SchoolSettings).first()
    previous = settings.payment_provider if settings else None
    if settings:
        settings.payment_provider = None
        db_session.commit()

    fee = _make_fee(db_session)
    token = create_payment_link_token(fee.id)
    resp = client.post(f"/payments/fees/{fee.id}/order?token={token}")
    assert resp.status_code == 400
    assert "not configured" in resp.json()["detail"].lower()

    if settings:
        settings.payment_provider = previous
        db_session.commit()
