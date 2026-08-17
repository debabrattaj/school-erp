"""Biometric pull sync — the cron entrypoint.

Run on a schedule (a cPanel Cron Job, or any OS cron) to fetch punches from
devices registered with mode="pull". Devices with mode="push" are untouched
here: they call /biometric/ingest themselves.

Off by default per school: this only acts on a tenant whose central
"biometric_attendance" platform feature flag is on, same gating as the fee /
promotion / exam schedulers.

WHAT "PULL" CAN AND CANNOT REACH
--------------------------------
A terminal sitting on a school's LAN has a private address and is not
reachable from this server. Pull mode therefore means "fetch from an
internet-reachable HTTP endpoint" — in practice a vendor's cloud API, or a
small agent the school runs on their own network that exposes recent punches.
For a LAN-only terminal, the working arrangement is the reverse: run an agent
inside the school that reads the device and POSTs to /biometric/ingest. That
path needs nothing from this script.

The fetcher below speaks generic JSON over HTTPS, which covers vendor APIs
that return a list of punch records. A vendor whose API differs (odd auth, XML,
pagination, a proprietary envelope) needs its own adapter — add it to
FETCHERS, keyed by BiometricDevice.vendor, rather than special-casing here.

Usage:
  python run_biometric_sync.py             # sync every pull device
  python run_biometric_sync.py --dry-run   # fetch and report, write nothing
"""

import argparse
import json
import logging
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv  # noqa: E402
load_dotenv()

# httpx rather than requests: it is already a dependency (FastAPI's test
# client uses it), so the scheduler adds nothing new to install.
import httpx  # noqa: E402

from app import biometric  # noqa: E402
from app.models import BiometricDevice, BiometricSyncRun  # noqa: E402
from app.tenant import (  # noqa: E402
    CentralSessionLocal,
    DEFAULT_ACCOUNT_CODE,
    DEFAULT_SCHOOL_DATABASE_URL,
    get_school_session_factory,
    init_tenant_registry,
    is_feature_enabled,
)
from app.tenant_models import SchoolAccount  # noqa: E402

logger = logging.getLogger("biometric_sync")

FEATURE_KEY = "biometric_attendance"

# How far back to ask for on each run. Generous on purpose: the ingest path is
# idempotent, so an overlapping window costs a few duplicate counts and closes
# the gap left by a missed run, which is the better trade.
LOOKBACK_HOURS = 48

HTTP_TIMEOUT_SECONDS = 30


def tenant_accounts() -> list[tuple[str, str]]:
    """[(account_code, database_url), ...] for the default school plus every
    active account in the central registry, de-duplicated by URL."""
    init_tenant_registry()

    accounts = [(DEFAULT_ACCOUNT_CODE, DEFAULT_SCHOOL_DATABASE_URL)]
    seen_urls = {DEFAULT_SCHOOL_DATABASE_URL}

    db = CentralSessionLocal()
    try:
        for account in db.query(SchoolAccount).filter(SchoolAccount.status == "Active").all():
            if account.database_url and account.database_url not in seen_urls:
                accounts.append((account.account_code, account.database_url))
                seen_urls.add(account.database_url)
    finally:
        db.close()

    return accounts


def is_enabled_for_tenant(account_code: str) -> bool:
    return is_feature_enabled(account_code, FEATURE_KEY)


def fetch_generic_json(device: BiometricDevice, since: datetime) -> list[dict]:
    """Fetch punches from a JSON-over-HTTPS endpoint.

    Expects either a bare list of records, or an object with the list under
    "punches", "data" or "records". Individual records are normalised later by
    biometric.ingest_punches, which already tolerates the common field-name and
    timestamp variations.

    pull_config may carry:
      api_key / api_key_header  - sent as a request header
      params                    - extra query parameters
      since_param               - name of the "fetch since" query param
    """
    config = json.loads(device.pull_config) if device.pull_config else {}

    headers = {"Accept": "application/json"}
    if config.get("api_key"):
        headers[config.get("api_key_header", "Authorization")] = config["api_key"]

    params = dict(config.get("params") or {})
    params[config.get("since_param", "since")] = since.isoformat()
    if device.serial_number:
        params.setdefault("serial_number", device.serial_number)

    response = httpx.get(
        device.pull_endpoint,
        headers=headers,
        params=params,
        timeout=HTTP_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    body = response.json()

    if isinstance(body, list):
        return body
    for key in ("punches", "data", "records", "results"):
        if isinstance(body.get(key), list):
            return body[key]
    raise ValueError("Response contained no recognisable list of punch records")


# Vendor-specific adapters go here, keyed by BiometricDevice.vendor. Anything
# not listed falls back to the generic JSON fetcher above.
FETCHERS = {}


def fetcher_for(device: BiometricDevice):
    return FETCHERS.get((device.vendor or "").strip().lower(), fetch_generic_json)


def sync_device(db, device: BiometricDevice, dry_run: bool = False) -> dict:
    """Fetch and ingest one device's recent punches, recording the attempt."""
    since = datetime.utcnow() - timedelta(hours=LOOKBACK_HOURS)
    run = BiometricSyncRun(device_id=device.id, status="Success")

    try:
        records = fetcher_for(device)(device, since)
        run.fetched_count = len(records)

        if dry_run:
            logger.info(
                "[dry-run] %s: would ingest %s record(s)", device.serial_number, len(records)
            )
            return {"device": device.serial_number, "fetched": len(records), "dry_run": True}

        result = biometric.ingest_punches(db, device, records)
        run.ingested_count = result["ingested"]
        run.duplicate_count = result["duplicates"]
        run.unmatched_count = result["unmatched"]
        device.last_sync_at = datetime.utcnow()

    except Exception as exc:
        # One unreachable or misconfigured device must not stop the rest, so the
        # failure is recorded against that device and the loop carries on.
        run.status = "Failed"
        run.error_message = str(exc)[:500]
        logger.error("Sync failed for device %s: %s", device.serial_number, exc)

    if not dry_run:
        db.add(run)
        db.commit()

    return {
        "device": device.serial_number,
        "status": run.status,
        "fetched": run.fetched_count,
        "ingested": run.ingested_count,
        "duplicates": run.duplicate_count,
        "unmatched": run.unmatched_count,
        "error": run.error_message,
    }


def sync_tenant(account_code: str, database_url: str, dry_run: bool = False) -> list[dict]:
    factory = get_school_session_factory(database_url)
    db = factory()
    try:
        devices = (
            db.query(BiometricDevice)
            .filter(
                BiometricDevice.mode == "pull",
                BiometricDevice.is_active == True,  # noqa: E712
                BiometricDevice.pull_endpoint.isnot(None),
            )
            .all()
        )
        if not devices:
            return []
        return [sync_device(db, device, dry_run=dry_run) for device in devices]
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Pull punches from biometric devices")
    parser.add_argument("--dry-run", action="store_true", help="fetch and report, write nothing")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    total = 0
    for account_code, database_url in tenant_accounts():
        if not is_enabled_for_tenant(account_code):
            logger.info("Skipping %s — biometric_attendance is off for this school", account_code)
            continue

        results = sync_tenant(account_code, database_url, dry_run=args.dry_run)
        for result in results:
            total += 1
            logger.info("%s: %s", account_code, result)

    logger.info("Done — %s device sync(s) attempted", total)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
