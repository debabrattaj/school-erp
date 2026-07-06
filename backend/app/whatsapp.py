"""Pluggable WhatsApp sender (Twilio WhatsApp API).

Used for both the WhatsApp and SMS communication channels — the school sends
via WhatsApp instead of a separate SMS gateway. Like the mailer, it uses the
real API when configured and falls back to logging otherwise, and never raises.

Built on stdlib urllib so it adds no dependency.

Env vars:
  TWILIO_ACCOUNT_SID           Twilio account SID. If empty -> log-only mode.
  TWILIO_AUTH_TOKEN            Twilio auth token.
  TWILIO_WHATSAPP_FROM        Sender, e.g. "whatsapp:+14155238886".
  WHATSAPP_DEFAULT_COUNTRY_CODE  Prepended to local numbers lacking a '+'. Default "+91".
  WHATSAPP_TIMEOUT            Request timeout seconds. Default 10.
"""

import os
import json
import base64
import logging
import urllib.parse
import urllib.request
import urllib.error

logger = logging.getLogger("whatsapp")


def is_configured() -> bool:
    return bool(
        os.getenv("TWILIO_ACCOUNT_SID", "").strip()
        and os.getenv("TWILIO_AUTH_TOKEN", "").strip()
        and os.getenv("TWILIO_WHATSAPP_FROM", "").strip()
    )


def normalize_whatsapp_number(raw: str) -> str:
    """Turn a stored phone number into a 'whatsapp:+<e164>' address.

    Numbers already in international form ('+') are used as-is; local numbers get
    the default country code prepended (leading zeros stripped).
    """
    number = (raw or "").strip().replace(" ", "").replace("-", "")
    if number.startswith("whatsapp:"):
        return number
    if not number.startswith("+"):
        cc = os.getenv("WHATSAPP_DEFAULT_COUNTRY_CODE", "+91").strip()
        number = cc + number.lstrip("0")
    return f"whatsapp:{number}"


def send_whatsapp(to_phone: str, body: str) -> bool:
    """Send a WhatsApp message. Returns True on success (or in log-only mode),
    False on failure. Never raises.
    """
    to = (to_phone or "").strip()
    if not to:
        return False

    if not is_configured():
        logger.info("[whatsapp:log-mode] To=%s\n%s", to, body)
        return True

    sid = os.getenv("TWILIO_ACCOUNT_SID").strip()
    token = os.getenv("TWILIO_AUTH_TOKEN").strip()
    sender = os.getenv("TWILIO_WHATSAPP_FROM").strip()
    timeout = int(os.getenv("WHATSAPP_TIMEOUT", "10"))

    url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
    form = urllib.parse.urlencode(
        {"From": sender, "To": normalize_whatsapp_number(to), "Body": body}
    ).encode()

    auth = base64.b64encode(f"{sid}:{token}".encode()).decode()
    request = urllib.request.Request(url, data=form, method="POST")
    request.add_header("Authorization", f"Basic {auth}")
    request.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode() or "{}")
        logger.info("WhatsApp queued to %s (sid=%s)", to, payload.get("sid"))
        return True
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")
        logger.error("WhatsApp send to %s failed: HTTP %s %s", to, exc.code, detail)
        return False
    except Exception as exc:
        logger.error("WhatsApp send to %s failed: %s", to, exc)
        return False
