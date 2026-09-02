import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SavedReportView, User
from app.security import require_roles

router = APIRouter(prefix="/report-views", tags=["Report Views"])

# Same role gate as the Reports Center page itself (frontend/src/App.jsx).
ALLOWED_ROLES = ["Admin", "Principal", "Accounts"]


class SavedReportViewCreate(BaseModel):
    name: str
    module_name: str
    filters: dict = {}


def _serialize(row: SavedReportView) -> dict:
    try:
        filters = json.loads(row.filters) if row.filters else {}
    except (ValueError, TypeError):
        filters = {}

    return {
        "id": row.id,
        "name": row.name,
        "module_name": row.module_name,
        "filters": filters,
        "created_at": row.created_at,
    }


@router.get("")
def list_report_views(
    module_name: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(ALLOWED_ROLES)),
):
    """The signed-in user's saved report views, optionally filtered to one module."""
    query = db.query(SavedReportView).filter(SavedReportView.user_id == current_user.id)

    if module_name:
        query = query.filter(SavedReportView.module_name == module_name)

    rows = query.order_by(SavedReportView.created_at.desc()).all()

    return [_serialize(row) for row in rows]


@router.post("")
def create_report_view(
    payload: SavedReportViewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(ALLOWED_ROLES)),
):
    name = payload.name.strip()

    if not name:
        raise HTTPException(status_code=400, detail="View name is required")

    row = SavedReportView(
        user_id=current_user.id,
        name=name,
        module_name=payload.module_name,
        filters=json.dumps(payload.filters or {}),
    )

    db.add(row)
    db.commit()
    db.refresh(row)

    return _serialize(row)


@router.delete("/{view_id}")
def delete_report_view(
    view_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(ALLOWED_ROLES)),
):
    row = (
        db.query(SavedReportView)
        .filter(SavedReportView.id == view_id, SavedReportView.user_id == current_user.id)
        .first()
    )

    if not row:
        raise HTTPException(status_code=404, detail="Saved view not found")

    db.delete(row)
    db.commit()

    return {"message": "Saved view deleted"}
