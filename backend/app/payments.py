"""Online payment gateway (Razorpay).

Pluggable like the mailer/whatsapp senders: real orders are created only when
RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET are configured; otherwise the API reports
"not configured" so the UI can hide online payment. Signature verification is
always available (it only needs the secret) and is the security-critical step
that authorizes marking a fee paid.

Built on stdlib urllib — no dependency.
"""

import os
import json
import hmac
import base64
import hashlib
import logging
import urllib.parse
import urllib.request
import urllib.error

logger = logging.getLogger("payments")

RAZORPAY_API = "https://api.razorpay.com/v1"


def key_id() -> str:
    return os.getenv("RAZORPAY_KEY_ID", "").strip()


def _key_secret() -> str:
    return os.getenv("RAZORPAY_KEY_SECRET", "").strip()


def is_configured() -> bool:
    return bool(key_id() and _key_secret())


def create_order(amount_minor: int, currency: str, receipt: str) -> dict:
    """Create a Razorpay order. `amount_minor` is in the smallest currency unit
    (paise/cents). Returns the order dict. Raises on failure.
    """
    if not is_configured():
        raise RuntimeError("Payment gateway is not configured")

    payload = urllib.parse.urlencode({
        "amount": int(amount_minor),
        "currency": (currency or "INR").upper(),
        "receipt": receipt,
        "payment_capture": 1,
    }).encode()

    auth = base64.b64encode(f"{key_id()}:{_key_secret()}".encode()).decode()
    request = urllib.request.Request(f"{RAZORPAY_API}/orders", data=payload, method="POST")
    request.add_header("Authorization", f"Basic {auth}")
    request.add_header("Content-Type", "application/x-www-form-urlencoded")

    with urllib.request.urlopen(request, timeout=15) as response:
        return json.loads(response.read().decode())


def verify_signature(order_id: str, payment_id: str, signature: str) -> bool:
    """Verify a Razorpay payment signature. Constant-time."""
    if not (order_id and payment_id and signature) or not _key_secret():
        return False
    expected = hmac.new(
        _key_secret().encode(),
        f"{order_id}|{payment_id}".encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)
