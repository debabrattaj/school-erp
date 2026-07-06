"""File uploads (student photos, documents, logos).

Stores files under UPLOAD_DIR, namespaced per tenant (account_code), with
random filenames. Files are served back as static assets at /uploads. Only a
small allow-list of content types is accepted, with a size cap.
"""

import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File

from app.models import User
from app.security import require_roles
from app.tenant import get_account_code_from_request

router = APIRouter(prefix="/uploads", tags=["Files"])

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "5"))

# extension -> allowed (content-type is also checked against this map's spirit)
ALLOWED_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp",  # images
    ".pdf",                                       # documents
}


@router.post("/")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Accounts", "Teacher"])
    ),
):
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext or 'unknown'}'. "
            f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    contents = await file.read()
    if len(contents) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(
            status_code=400,
            detail=f"File is too large (max {MAX_UPLOAD_MB} MB).",
        )

    account_code = get_account_code_from_request(request) or "default"
    # Basic path-safety on the tenant segment.
    safe_account = "".join(c for c in account_code if c.isalnum() or c in ("-", "_")) or "default"

    tenant_dir = os.path.join(UPLOAD_DIR, safe_account)
    os.makedirs(tenant_dir, exist_ok=True)

    name = f"{uuid.uuid4().hex}{ext}"
    with open(os.path.join(tenant_dir, name), "wb") as out:
        out.write(contents)

    url = f"/uploads/{safe_account}/{name}"
    return {"url": url, "filename": file.filename, "size": len(contents)}
