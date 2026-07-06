"""Database backups.

Uses SQLite's online backup API (safe while the app is running) to copy the
central registry DB and every tenant school DB into a timestamped folder under
BACKUP_DIR. Provides an on-demand entrypoint plus an opt-in background
scheduler. Old backups beyond BACKUP_KEEP are pruned.

Env vars:
  BACKUP_DIR             Where backups are written. Default "./backups".
  BACKUP_KEEP            How many timestamped backups to retain. Default 14.
  BACKUP_ENABLED         "true" to run the periodic scheduler. Default "false".
  BACKUP_INTERVAL_HOURS  Scheduler period in hours. Default 24.
  CENTRAL_DATABASE_URL   Central DB url (matches tenant.py). Default school_accounts.db.
"""

import os
import time
import shutil
import sqlite3
import logging
import threading
from datetime import datetime

from app.tenant import CentralSessionLocal
from app.tenant_models import SchoolAccount

logger = logging.getLogger("backup")

BACKUP_DIR = os.getenv("BACKUP_DIR", "./backups")
BACKUP_KEEP = int(os.getenv("BACKUP_KEEP", "14"))
BACKUP_ENABLED = os.getenv("BACKUP_ENABLED", "false").strip().lower() in ("1", "true", "yes", "on")
BACKUP_INTERVAL_HOURS = float(os.getenv("BACKUP_INTERVAL_HOURS", "24"))
CENTRAL_DATABASE_URL = os.getenv("CENTRAL_DATABASE_URL", "sqlite:///./school_accounts.db")

_SQLITE_PREFIX = "sqlite:///"


def _sqlite_path(url: str):
    if url and url.startswith(_SQLITE_PREFIX):
        return url[len(_SQLITE_PREFIX):]
    return None  # non-SQLite (e.g. Postgres) backends are handled elsewhere


def _discover_db_paths() -> dict:
    """Map a label -> on-disk path for the central DB and every tenant DB."""
    paths = {}
    central = _sqlite_path(CENTRAL_DATABASE_URL)
    if central:
        paths["central"] = central

    db = CentralSessionLocal()
    try:
        for account in db.query(SchoolAccount).all():
            path = _sqlite_path(account.database_url)
            if path:
                paths[account.account_code] = path
    finally:
        db.close()
    return paths


def _online_backup(src_path: str, dst_path: str) -> None:
    src = sqlite3.connect(src_path)
    try:
        dst = sqlite3.connect(dst_path)
        try:
            with dst:
                src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()


def _prune() -> None:
    if BACKUP_KEEP <= 0 or not os.path.isdir(BACKUP_DIR):
        return
    subdirs = sorted(
        d for d in os.listdir(BACKUP_DIR)
        if os.path.isdir(os.path.join(BACKUP_DIR, d))
    )
    for old in subdirs[:-BACKUP_KEEP]:
        shutil.rmtree(os.path.join(BACKUP_DIR, old), ignore_errors=True)


def backup_all() -> dict:
    """Back up every SQLite database into a fresh timestamped folder."""
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    target_dir = os.path.join(BACKUP_DIR, timestamp)
    os.makedirs(target_dir, exist_ok=True)

    results = []
    for name, path in _discover_db_paths().items():
        if not os.path.exists(path):
            results.append({"name": name, "ok": False, "error": "source file missing"})
            continue
        dst = os.path.join(target_dir, f"{name}.db")
        try:
            _online_backup(path, dst)
            results.append({"name": name, "ok": True, "bytes": os.path.getsize(dst)})
        except Exception as exc:
            results.append({"name": name, "ok": False, "error": str(exc)})

    _prune()
    ok = all(r["ok"] for r in results) if results else False
    return {"timestamp": timestamp, "dir": target_dir, "ok": ok, "databases": results}


def list_backups() -> list:
    if not os.path.isdir(BACKUP_DIR):
        return []
    out = []
    for name in sorted(os.listdir(BACKUP_DIR), reverse=True):
        full = os.path.join(BACKUP_DIR, name)
        if not os.path.isdir(full):
            continue
        db_files = [f for f in os.listdir(full) if f.endswith(".db")]
        total = sum(os.path.getsize(os.path.join(full, f)) for f in db_files)
        out.append({"timestamp": name, "databases": len(db_files), "total_bytes": total})
    return out


def start_scheduler() -> None:
    """Start the periodic backup thread if BACKUP_ENABLED is set."""
    if not BACKUP_ENABLED:
        return

    def _loop():
        interval = max(BACKUP_INTERVAL_HOURS, 0.01) * 3600
        while True:
            try:
                result = backup_all()
                logger.info("Scheduled backup complete: %s (ok=%s)", result["dir"], result["ok"])
            except Exception as exc:
                logger.error("Scheduled backup failed: %s", exc)
            time.sleep(interval)

    thread = threading.Thread(target=_loop, daemon=True, name="backup-scheduler")
    thread.start()
    logger.info("Backup scheduler started (every %s h)", BACKUP_INTERVAL_HOURS)
