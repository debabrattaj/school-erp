"""Preserve school-uploaded evidence independently of a mutable source link."""
import hashlib
import os
from pathlib import Path
from urllib.parse import urlsplit, unquote
from fastapi import HTTPException


def root():
    return Path(os.getenv("EVIDENCE_ARCHIVE_DIR", "./uploads_private/evidence")).resolve()


def local_upload(url, account_code):
    parsed = urlsplit(url or "")
    if parsed.scheme or parsed.netloc: return None
    parts = unquote(parsed.path).split("/")
    if len(parts) != 4 or parts[:2] != ["", "uploads"] or parts[2] != account_code:
        return None
    base = (Path(os.getenv("UPLOAD_DIR", "./uploads")) / account_code).resolve()
    path = (base / parts[3]).resolve()
    if not path.is_relative_to(base) or not path.is_file(): return None
    return path


def archive_evidence(url, account_code="default"):
    path = local_upload(url, account_code)
    if not path: return {"archive_note": "Reference preserved; attach a school-uploaded file to preserve its bytes."}
    if path.stat().st_size > 20_000_000: raise HTTPException(400, "Evidence file exceeds 20 MB.")
    data = path.read_bytes()
    checksum = hashlib.sha256(data).hexdigest()
    archive = root(); archive.mkdir(parents=True, exist_ok=True)
    name = checksum + path.suffix.lower()
    if not (archive / name).exists(): (archive / name).write_bytes(data)
    return {"archive_file": name, "filename": path.name, "sha256": checksum, "bytes": len(data)}


def archived_file(name):
    if not name or Path(name).name != name: raise HTTPException(404, "No archived attachment.")
    path = (root() / name).resolve()
    if not path.is_relative_to(root()) or not path.is_file(): raise HTTPException(404, "Archived attachment not found.")
    return path
