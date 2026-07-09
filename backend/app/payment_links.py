"""Signed, expiring links to the public (no-login) fee payment page.

Guardians receive these over WhatsApp/SMS and open them without an account —
parents don't get portal logins by default. The token binds the link to one
specific fee and expires, so it can't be replayed against another fee or
reused indefinitely.
"""

import os
from datetime import datetime, timedelta, timezone

from jose import jwt, JWTError

from app.security import SECRET_KEY, ALGORITHM

PAYMENT_LINK_MINUTES = 60 * 24 * 30  # 30 days
BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:8000")


def create_payment_link_token(fee_id: int) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=PAYMENT_LINK_MINUTES)
    return jwt.encode({"fee_id": fee_id, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def verify_payment_link_token(fee_id: int, token: str) -> bool:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return False
    return payload.get("fee_id") == fee_id


def build_payment_link(fee_id: int) -> str:
    token = create_payment_link_token(fee_id)
    return f"{BACKEND_BASE_URL}/fees/{fee_id}/pay?token={token}"
