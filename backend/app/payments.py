"""Online fee collection through a payment gateway.

Until now a fee could be *recorded* but not *collected*: the UPI flow produces
a deep link and a staff member types in the UTR afterwards. This module adds
real collection, where the gateway tells us the money arrived.

Multi-tenant note: each school collects into its own merchant account, so the
credentials live per-tenant in SchoolSettings rather than in one platform-wide
environment variable. Secrets are write-only through the API -- they go in and
are never read back out, the same way biometric device tokens work.

Provider-agnostic by design. Razorpay is the first (and currently only)
adapter because it is the default for Indian schools; another provider means
another entry in PROVIDERS, not changes to the routes.

No vendor SDK is used. Order creation is one REST call over httpx (already a
dependency) and signature verification is hmac from the standard library, so
this adds nothing to install on a host that has already proven hostile to
dependency installs.
"""

import hashlib
import hmac
import json
from datetime import datetime

import httpx
from sqlalchemy.orm import Session

from app import models

HTTP_TIMEOUT_SECONDS = 30

# What the gateway calls the states we care about. Anything not listed is
# treated as "not paid" -- an unknown status must never settle a fee.
RAZORPAY_PAID_EVENTS = {"payment.captured", "order.paid"}
RAZORPAY_FAILED_EVENTS = {"payment.failed"}


class PaymentError(Exception):
    """Raised for a gateway problem worth showing a human."""


# ---------------------------------------------------------------------------
# Per-school configuration
# ---------------------------------------------------------------------------


def get_gateway_config(db: Session):
    """The school's gateway credentials, or None if it hasn't set them up.

    Returns the secret, so this is for internal use only -- never hand the
    result straight back through an API response.
    """
    settings = db.query(models.SchoolSettings).first()
    if not settings:
        return None
    provider = (getattr(settings, "payment_provider", None) or "").strip().lower()
    key_id = (getattr(settings, "payment_key_id", None) or "").strip()
    key_secret = (getattr(settings, "payment_key_secret", None) or "").strip()
    if not provider or not key_id or not key_secret:
        return None
    return {
        "provider": provider,
        "key_id": key_id,
        "key_secret": key_secret,
        "webhook_secret": (getattr(settings, "payment_webhook_secret", None) or "").strip(),
        "currency": (settings.currency or "INR").upper(),
        "school_name": settings.school_name or "School",
    }


def is_gateway_enabled(db: Session) -> bool:
    return get_gateway_config(db) is not None


# ---------------------------------------------------------------------------
# Amounts
# ---------------------------------------------------------------------------


def to_minor_units(amount: float) -> int:
    """Rupees -> paise.

    Gateways bill in the currency's minor unit and reject anything that isn't a
    whole number of them. Rounding here rather than truncating avoids a
    floating-point 999.9999 silently becoming 99999 paise instead of 100000.
    """
    return int(round(float(amount) * 100))


def from_minor_units(minor: int) -> float:
    return round(int(minor) / 100.0, 2)


def outstanding_balance(fee: models.Fee) -> float:
    return max(round((fee.total_amount or 0) - (fee.paid_amount or 0), 2), 0.0)


# ---------------------------------------------------------------------------
# Razorpay adapter
# ---------------------------------------------------------------------------


def razorpay_create_order(config: dict, amount: float, receipt: str, notes: dict) -> dict:
    """Create an order and return the gateway's identifiers."""
    response = httpx.post(
        "https://api.razorpay.com/v1/orders",
        auth=(config["key_id"], config["key_secret"]),
        json={
            "amount": to_minor_units(amount),
            "currency": config["currency"],
            "receipt": receipt[:40],
            "notes": notes,
        },
        timeout=HTTP_TIMEOUT_SECONDS,
    )
    if response.status_code >= 400:
        raise PaymentError(f"Gateway rejected the order: {response.text[:300]}")
    body = response.json()
    return {"order_id": body["id"], "amount": from_minor_units(body["amount"])}


def razorpay_verify_checkout_signature(config: dict, order_id: str, payment_id: str, signature: str) -> bool:
    """Verify the signature the browser returns after a successful checkout.

    Razorpay signs "{order_id}|{payment_id}" with the API secret. This is what
    stops a caller from claiming a payment succeeded by POSTing arbitrary ids.
    """
    if not (order_id and payment_id and signature):
        return False
    expected = hmac.new(
        config["key_secret"].encode("utf-8"),
        f"{order_id}|{payment_id}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


def razorpay_verify_webhook_signature(config: dict, raw_body: bytes, signature: str) -> bool:
    """Verify a webhook, which is signed with the webhook secret over the body.

    Deliberately takes the raw bytes: re-serialising the parsed JSON would
    reorder or reformat it and the digest would never match.
    """
    secret = config.get("webhook_secret")
    if not secret or not signature:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def razorpay_parse_webhook(payload: dict) -> dict:
    """Pull the bits we act on out of a webhook body."""
    event = payload.get("event") or ""
    entities = payload.get("payload") or {}
    payment = (entities.get("payment") or {}).get("entity") or {}
    order = (entities.get("order") or {}).get("entity") or {}
    return {
        "event": event,
        "paid": event in RAZORPAY_PAID_EVENTS,
        "failed": event in RAZORPAY_FAILED_EVENTS,
        "order_id": payment.get("order_id") or order.get("id"),
        "payment_id": payment.get("id"),
        "amount": from_minor_units(payment.get("amount") or order.get("amount") or 0),
        "method": payment.get("method"),
    }


PROVIDERS = {
    "razorpay": {
        "create_order": razorpay_create_order,
        "verify_checkout": razorpay_verify_checkout_signature,
        "verify_webhook": razorpay_verify_webhook_signature,
        "parse_webhook": razorpay_parse_webhook,
    },
}


def adapter_for(config: dict) -> dict:
    adapter = PROVIDERS.get(config["provider"])
    if not adapter:
        raise PaymentError(f"Unsupported payment provider: {config['provider']}")
    return adapter


# ---------------------------------------------------------------------------
# Orders
# ---------------------------------------------------------------------------


def create_order_for_fee(db: Session, fee: models.Fee) -> models.PaymentOrder:
    """Open a gateway order for a fee's outstanding balance.

    Reuses an existing open order for the same fee and amount instead of
    creating a second one, so a guardian who reloads the payment page twice
    doesn't end up with two live orders against one fee.
    """
    config = get_gateway_config(db)
    if not config:
        raise PaymentError("Online payment is not configured for this school.")

    balance = outstanding_balance(fee)
    if balance <= 0:
        raise PaymentError("This fee has no outstanding balance.")

    existing = (
        db.query(models.PaymentOrder)
        .filter(
            models.PaymentOrder.fee_id == fee.id,
            models.PaymentOrder.status == "Created",
            models.PaymentOrder.amount == balance,
        )
        .first()
    )
    if existing:
        return existing

    result = adapter_for(config)["create_order"](
        config,
        balance,
        receipt=f"fee-{fee.id}",
        notes={"fee_id": str(fee.id), "student_id": str(fee.student_id)},
    )

    order = models.PaymentOrder(
        fee_id=fee.id, student_id=fee.student_id,
        provider=config["provider"], order_id=result["order_id"],
        amount=result["amount"], currency=config["currency"], status="Created",
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    return order


def settle_order(db: Session, order: models.PaymentOrder, payment_id: str, method: str | None = None) -> bool:
    """Mark an order paid and credit its fee. Returns False if already settled.

    Idempotent on purpose: a gateway will retry a webhook it thinks we missed,
    and the browser callback can arrive for the same payment as well. Crediting
    the fee twice would show a guardian as having overpaid.
    """
    if order.status == "Paid":
        return False

    fee = db.query(models.Fee).filter(models.Fee.id == order.fee_id).first()
    if not fee:
        raise PaymentError("The fee this payment belongs to no longer exists.")

    order.status = "Paid"
    order.payment_id = payment_id
    order.method = method
    order.paid_at = datetime.utcnow()

    # Credit only what this order was for. Trusting an amount from the callback
    # would let a tampered-with payload settle a fee it hasn't covered.
    fee.paid_amount = round((fee.paid_amount or 0) + order.amount, 2)

    from app.routes.fees import calculate_fee_status, generate_receipt_no

    due_amount, payment_status = calculate_fee_status(fee.total_amount, fee.paid_amount)
    fee.due_amount = due_amount
    fee.payment_status = payment_status
    fee.payment_date = datetime.utcnow().date()
    if not fee.receipt_no:
        fee.receipt_no = generate_receipt_no(db)

    note = f"Online payment: {payment_id}"
    fee.remarks = f"{fee.remarks} | {note}" if fee.remarks else note

    db.commit()
    return True


def handle_webhook(db: Session, raw_body: bytes, signature: str) -> dict:
    """Verify and apply a gateway webhook.

    Verification comes first and unconditionally: this endpoint is public, so
    an unsigned or wrongly-signed body must never reach the settlement logic.
    """
    config = get_gateway_config(db)
    if not config:
        raise PaymentError("Online payment is not configured for this school.")

    adapter = adapter_for(config)
    if not adapter["verify_webhook"](config, raw_body, signature):
        raise PaymentError("Invalid webhook signature.")

    parsed = adapter["parse_webhook"](json.loads(raw_body.decode("utf-8")))
    if not parsed["order_id"]:
        return {"handled": False, "reason": "no order id in payload"}

    order = (
        db.query(models.PaymentOrder)
        .filter(models.PaymentOrder.order_id == parsed["order_id"])
        .first()
    )
    if not order:
        # Not ours -- a webhook for a different system sharing the endpoint.
        return {"handled": False, "reason": "unknown order"}

    if parsed["failed"]:
        if order.status == "Created":
            order.status = "Failed"
            db.commit()
        return {"handled": True, "status": "Failed"}

    if not parsed["paid"]:
        return {"handled": False, "reason": f"ignored event {parsed['event']}"}

    settled = settle_order(db, order, parsed["payment_id"], parsed.get("method"))
    return {"handled": True, "status": "Paid", "newly_settled": settled}
