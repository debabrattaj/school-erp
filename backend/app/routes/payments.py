"""Online fee collection endpoints.

Three audiences, three authentication styles:

  * Staff configure the gateway with a normal user session.
  * A guardian opens a checkout from a signed payment link and has no login at
    all, so those routes authenticate with the link token instead.
  * The gateway itself calls the webhook, authenticating with an HMAC
    signature over the raw request body.
"""

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app import models, payments
from app.database import get_db
from app.models import User
from app.payment_links import verify_payment_link_token
from app.security import require_roles

router = APIRouter(prefix="/payments", tags=["Online Payments"])

MANAGERS = ["Admin", "Principal", "Accounts"]


def _order_response(order: models.PaymentOrder, key_id: str | None = None) -> dict:
    return {
        "id": order.id,
        "fee_id": order.fee_id,
        "provider": order.provider,
        "order_id": order.order_id,
        "amount": order.amount,
        "currency": order.currency,
        "status": order.status,
        "method": order.method,
        "paid_at": order.paid_at,
        # The publishable key only -- the secret never leaves the server.
        "key_id": key_id,
    }


# ---------------- Configuration (staff) ----------------


@router.get("/config")
def get_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """Gateway status. Deliberately reports whether secrets are set, not what
    they are -- they are write-only once saved."""
    settings = db.query(models.SchoolSettings).first()
    if not settings:
        return {"enabled": False, "mode": None, "provider": None, "key_id": None,
                "has_secret": False, "has_webhook_secret": False}

    config = payments.get_gateway_config(db)
    return {
        "enabled": config is not None,
        # route  = fees flow through the platform's account and the gateway
        #          transfers this school's share automatically
        # direct = this school's own merchant account
        "mode": config["mode"] if config else None,
        "provider": config["provider"] if config else settings.payment_provider,
        # Publishable key only. In route mode this is the platform's, which is
        # safe to expose -- it is what the checkout widget needs.
        "key_id": config["key_id"] if config else settings.payment_key_id,
        "has_secret": bool(settings.payment_key_secret),
        "has_webhook_secret": bool(settings.payment_webhook_secret),
        "supported_providers": sorted(payments.PROVIDERS.keys()),
        # Read-only here: both are set by the platform owner.
        "linked_account_id": settings.razorpay_linked_account_id,
        "platform_commission_percent": float(settings.platform_commission_percent or 0),
    }


@router.put("/config")
def update_config(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    """Save gateway credentials.

    A blank secret means "leave the stored one alone", so an admin editing the
    key id doesn't have to retype secrets the UI can't show them.
    """
    settings = db.query(models.SchoolSettings).first()
    if not settings:
        raise HTTPException(status_code=400, detail="Configure school settings first.")

    provider = (payload.get("payment_provider") or "").strip().lower()
    if provider and provider not in payments.PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported provider. Supported: {sorted(payments.PROVIDERS)}",
        )

    settings.payment_provider = provider or None
    if "payment_key_id" in payload:
        settings.payment_key_id = (payload.get("payment_key_id") or "").strip() or None
    for field in ("payment_key_secret", "payment_webhook_secret"):
        value = (payload.get(field) or "").strip()
        if value:
            setattr(settings, field, value)

    db.commit()
    return get_config(db=db, current_user=current_user)


# ---------------- Checkout (staff, and guardians via a signed link) ----------------


@router.post("/fees/{fee_id}/order")
def create_order(
    fee_id: int,
    token: str | None = None,
    db: Session = Depends(get_db),
):
    """Open a gateway order for a fee.

    Callable either by staff or by a guardian holding a valid payment-link
    token. The token is checked here rather than by a role dependency because
    guardians have no account to authenticate as.
    """
    fee = db.query(models.Fee).filter(models.Fee.id == fee_id).first()
    if not fee:
        raise HTTPException(status_code=404, detail="Fee record not found")

    if not (token and verify_payment_link_token(fee_id, token)):
        raise HTTPException(
            status_code=401,
            detail="A valid payment link is required to pay this fee.",
        )

    try:
        order = payments.create_order_for_fee(db, fee)
    except payments.PaymentError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    config = payments.get_gateway_config(db)
    return _order_response(order, key_id=config["key_id"] if config else None)


@router.post("/fees/{fee_id}/verify")
def verify_checkout(
    fee_id: int,
    payload: dict,
    token: str | None = None,
    db: Session = Depends(get_db),
):
    """Settle a fee from the browser's post-checkout callback.

    The signature is what makes this safe to expose: without it, anyone could
    POST an order id and mark a fee paid. The webhook settles the same payment
    independently, so this endpoint is a latency optimisation rather than the
    source of truth -- if it is skipped entirely the fee still gets credited.
    """
    if not (token and verify_payment_link_token(fee_id, token)):
        raise HTTPException(status_code=401, detail="A valid payment link is required.")

    config = payments.get_gateway_config(db)
    if not config:
        raise HTTPException(status_code=400, detail="Online payment is not configured.")

    order_id = (payload.get("order_id") or "").strip()
    payment_id = (payload.get("payment_id") or "").strip()
    signature = (payload.get("signature") or "").strip()

    adapter = payments.adapter_for(config)
    if not adapter["verify_checkout"](config, order_id, payment_id, signature):
        raise HTTPException(status_code=400, detail="Payment could not be verified.")

    order = (
        db.query(models.PaymentOrder)
        .filter(
            models.PaymentOrder.order_id == order_id,
            models.PaymentOrder.fee_id == fee_id,
        )
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Payment order not found for this fee.")

    payments.settle_order(db, order, payment_id)
    db.refresh(order)
    return _order_response(order)


# ---------------- Webhook (the gateway) ----------------


@router.post("/webhook", include_in_schema=False)
async def webhook(
    request: Request,
    db: Session = Depends(get_db),
    x_razorpay_signature: str | None = Header(default=None),
):
    """Receive gateway callbacks.

    Public by necessity -- the gateway cannot log in. Safety rests entirely on
    the HMAC signature over the raw body, so the raw bytes are read before any
    parsing: re-serialising the JSON would change the bytes and the digest
    would never match.

    Always answers 200 once the signature is valid, even for events we ignore.
    A non-2xx makes the gateway retry indefinitely, and retrying an event we
    have deliberately skipped achieves nothing.
    """
    raw_body = await request.body()

    try:
        result = payments.handle_webhook(db, raw_body, x_razorpay_signature or "")
    except payments.PaymentError as exc:
        # A bad signature is the one case worth refusing outright.
        raise HTTPException(status_code=400, detail=str(exc))

    return result


# ---------------- History (staff) ----------------


@router.get("/orders")
def list_orders(
    fee_id: int | None = None,
    status: str | None = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    query = db.query(models.PaymentOrder)
    if fee_id:
        query = query.filter(models.PaymentOrder.fee_id == fee_id)
    if status:
        query = query.filter(models.PaymentOrder.status == status)
    rows = (
        query.order_by(models.PaymentOrder.id.desc())
        .limit(min(limit, 500))
        .all()
    )
    return [_order_response(o) for o in rows]
