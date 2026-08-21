"""Private on-disk storage for proctoring artifacts (webcam snapshots).

Deliberately separate from app/routes/uploads.py's UPLOAD_DIR: that directory
is mounted as a public StaticFiles path at /uploads in app/main.py, so
anything under it is fetchable by anyone who can guess a filename. A
proctoring snapshot is a photo of a student taken without their active
participation -- it must only ever be reachable through an authenticated
route that checks the requesting staff member belongs to the same school and
the same session's own attempt/test chain (see
routes/online_tests.py:get_proctoring_snapshot), never a static path. Do not
add PROCTORING_UPLOAD_DIR to any StaticFiles mount.
"""

import os
import uuid

PROCTORING_UPLOAD_DIR = os.getenv("PROCTORING_UPLOAD_DIR", "./uploads_private/proctoring")
MAX_SNAPSHOT_MB = int(os.getenv("MAX_PROCTORING_SNAPSHOT_MB", "2"))
ALLOWED_SNAPSHOT_CONTENT_TYPES = {"image/jpeg", "image/jpg"}


def _safe_account_segment(account_code: str) -> str:
    return "".join(c for c in (account_code or "") if c.isalnum() or c in ("-", "_")) or "default"


def save_snapshot(account_code: str, session_id: int, contents: bytes) -> str:
    """Write a JPEG snapshot to disk and return its storage_path.

    storage_path is relative to PROCTORING_UPLOAD_DIR, never the raw
    filesystem path, so a config change to PROCTORING_UPLOAD_DIR later
    doesn't strand existing ProctoringSnapshot rows.
    """
    account_segment = _safe_account_segment(account_code)
    name = f"{uuid.uuid4().hex}.jpg"
    storage_path = os.path.join(account_segment, str(session_id), name)
    absolute_path = os.path.join(PROCTORING_UPLOAD_DIR, storage_path)
    os.makedirs(os.path.dirname(absolute_path), exist_ok=True)
    with open(absolute_path, "wb") as out:
        out.write(contents)
    return storage_path


def absolute_path_for(storage_path: str) -> str:
    return os.path.join(PROCTORING_UPLOAD_DIR, storage_path)


def delete_snapshot_file(storage_path: str) -> bool:
    """Best-effort delete; returns True if a file was actually removed."""
    try:
        os.remove(absolute_path_for(storage_path))
        return True
    except FileNotFoundError:
        return False
