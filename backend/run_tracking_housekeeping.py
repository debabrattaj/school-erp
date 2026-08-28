"""Vehicle tracking housekeeping — the cron entrypoint.

Two jobs, both of which have to happen on a schedule rather than when
somebody remembers:

1. **Purge old position history.** A bus reporting every ten seconds writes
   around eight thousand rows a day. Left alone that is both a database
   problem and a privacy one -- a continuous record of where a child's bus
   went, kept for ever, for no operational reason. Trips, stop events and
   alerts survive the purge: those are the record schools actually need, and
   they hold no continuous trail.

2. **Raise a no_signal alert for trackers that have gone quiet.** A dead
   tracker is what a parent notices first, and nobody watches the silent-
   device list. At most one alert per device per day, because a tracker that
   has been off all term should not produce an alert every hour.

Runs for every active tenant. Unlike the fee, promotion, exam and biometric
schedulers this is not behind a platform feature flag: it is retention and
hygiene for data the school has already collected, and a school that stopped
paying for tracking should still have its old position history aged out.

Usage:
  python run_tracking_housekeeping.py
  python run_tracking_housekeeping.py --dry-run   # report, write nothing
"""

import argparse
import logging
import os
import sys
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv  # noqa: E402
load_dotenv()

from app import tracking  # noqa: E402
from app.models import TrackerDevice, TransportAlert, VehicleLocation  # noqa: E402
from app.tenant import (  # noqa: E402
    CentralSessionLocal,
    DEFAULT_ACCOUNT_CODE,
    DEFAULT_SCHOOL_DATABASE_URL,
    get_school_session_factory,
    init_tenant_registry,
)
from app.tenant_models import SchoolAccount  # noqa: E402

logger = logging.getLogger("tracking_housekeeping")


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


def alerted_today(db, device: TrackerDevice) -> bool:
    """Whether this tracker already has a no_signal alert today.

    A tracker that has been dead all term must not produce one alert per run,
    or the alert list becomes something nobody reads.
    """
    if not device.vehicle_id:
        return True  # nothing to attach an alert to

    start = datetime.combine(date.today(), datetime.min.time())
    return (
        db.query(TransportAlert)
        .filter(
            TransportAlert.vehicle_id == device.vehicle_id,
            TransportAlert.alert_type == "no_signal",
            TransportAlert.occurred_at >= start,
        )
        .first()
        is not None
    )


def run_tenant(database_url: str, dry_run: bool = False) -> dict:
    session_factory = get_school_session_factory(database_url)
    db = session_factory()
    try:
        config = tracking.get_config(db)
        cutoff_days = config.retain_locations_days or 30
        db.commit()

        if dry_run:
            cutoff = datetime.combine(date.today(), datetime.min.time()) - timedelta(days=cutoff_days)
            purged = (
                db.query(VehicleLocation)
                .filter(VehicleLocation.recorded_at < cutoff)
                .count()
            )
        else:
            purged = tracking.purge_old_locations(db)

        raised = 0
        for silent in tracking.silent_devices(db):
            device = (
                db.query(TrackerDevice)
                .filter(TrackerDevice.id == silent["device_id"])
                .first()
            )
            if not device or alerted_today(db, device):
                continue

            raised += 1
            if dry_run:
                continue

            minutes = silent["silent_minutes"]
            detail = (
                f"No position from {device.device_uid} for {minutes} minutes"
                if minutes is not None
                else f"{device.device_uid} has never reported a position"
            )
            tracking.raise_alert(db, device.vehicle_id, "no_signal", "Warning", detail)

        if not dry_run:
            db.commit()

        return {
            "locations_purged": purged,
            "retention_days": cutoff_days,
            "no_signal_alerts": raised,
        }
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Purge old vehicle positions and flag silent trackers")
    parser.add_argument("--dry-run", action="store_true", help="report, write nothing")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

    for account_code, database_url in tenant_accounts():
        try:
            result = run_tenant(database_url, dry_run=args.dry_run)
        except Exception as exc:  # one broken tenant must not stop the rest
            logger.exception("%s: housekeeping failed: %s", account_code, exc)
            continue
        logger.info("%s: %s", account_code, result)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
