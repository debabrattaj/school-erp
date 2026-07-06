"""TOTP (RFC 6238) for authenticator-app multi-factor auth.

Pure stdlib — no dependency. Produces/verifies the 6-digit time-based codes used
by Google Authenticator, Authy, 1Password, etc., and builds the otpauth:// URI
used to provision them.
"""

import hmac
import time
import base64
import struct
import hashlib
import secrets
from urllib.parse import quote

DIGITS = 6
STEP_SECONDS = 30
ISSUER = "School ERP"


def generate_secret() -> str:
    """A fresh base32 secret (no padding), 160 bits per RFC recommendation."""
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def _hotp(secret_b32: str, counter: int) -> str:
    key = base64.b32decode(secret_b32 + "=" * (-len(secret_b32) % 8))
    digest = hmac.new(key, struct.pack(">Q", counter), hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    code = (struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7FFFFFFF) % (10 ** DIGITS)
    return str(code).zfill(DIGITS)


def verify_totp(secret_b32: str, code: str, window: int = 1) -> bool:
    """Verify a code, allowing +/- `window` steps for clock skew. Constant-time."""
    if not secret_b32 or not code:
        return False
    code = code.strip().replace(" ", "")
    if not code.isdigit():
        return False
    counter = int(time.time() // STEP_SECONDS)
    for drift in range(-window, window + 1):
        if hmac.compare_digest(_hotp(secret_b32, counter + drift), code.zfill(DIGITS)):
            return True
    return False


def provisioning_uri(secret_b32: str, account_name: str, issuer: str = ISSUER) -> str:
    """otpauth:// URI for QR-code / manual entry into an authenticator app."""
    label = quote(f"{issuer}:{account_name}")
    return (
        f"otpauth://totp/{label}"
        f"?secret={secret_b32}&issuer={quote(issuer)}&digits={DIGITS}&period={STEP_SECONDS}"
    )
