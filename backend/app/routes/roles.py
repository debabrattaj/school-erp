import json

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Role, User
from app.security import require_roles
from app.permissions import MODULES, MODULE_KEYS, SYSTEM_ROLE_PERMISSIONS

router = APIRouter(prefix="/roles", tags=["Roles & Permissions"])


class RolePayload(BaseModel):
    name: str
    description: str | None = None
    permissions: dict  # {feature_key: "view"|"manage"}


def ensure_system_roles(db: Session) -> None:
    """Idempotently make sure the built-in roles exist (for the roles UI)."""
    changed = False
    for name, perms in SYSTEM_ROLE_PERMISSIONS.items():
        role = db.query(Role).filter(Role.name == name).first()
        if not role:
            db.add(Role(name=name, permissions=json.dumps(perms), is_system=True))
            changed = True
    if changed:
        db.commit()


def _serialize(role: Role) -> dict:
    try:
        perms = json.loads(role.permissions) if role.permissions else {}
    except Exception:
        perms = {}
    return {
        "id": role.id,
        "name": role.name,
        "description": role.description,
        "is_system": bool(role.is_system),
        "permissions": perms,
    }


def _clean_permissions(perms: dict) -> dict:
    """Keep only known modules and valid levels."""
    out = {}
    for key, level in (perms or {}).items():
        if key in MODULE_KEYS and level in ("view", "manage"):
            out[key] = level
    return out


@router.get("/modules")
def list_modules(current_user: User = Depends(require_roles(["Admin"]))):
    return [{"key": k, "label": label} for k, label in MODULES]


@router.get("/")
def list_roles(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    ensure_system_roles(db)
    roles = db.query(Role).order_by(Role.is_system.desc(), Role.name).all()
    return [_serialize(r) for r in roles]


@router.post("/")
def create_role(
    payload: RolePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Role name is required.")
    if db.query(Role).filter(Role.name == name).first():
        raise HTTPException(status_code=400, detail="A role with that name already exists.")

    role = Role(
        name=name,
        description=(payload.description or "").strip() or None,
        permissions=json.dumps(_clean_permissions(payload.permissions)),
        is_system=False,
    )
    db.add(role)
    db.commit()
    db.refresh(role)
    return _serialize(role)


@router.put("/{role_id}")
def update_role(
    role_id: int,
    payload: RolePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_system:
        raise HTTPException(status_code=400, detail="Built-in roles cannot be edited.")

    role.description = (payload.description or "").strip() or None
    role.permissions = json.dumps(_clean_permissions(payload.permissions))
    db.commit()
    db.refresh(role)
    return _serialize(role)


@router.delete("/{role_id}")
def delete_role(
    role_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    if role.is_system:
        raise HTTPException(status_code=400, detail="Built-in roles cannot be deleted.")

    in_use = db.query(User).filter(User.role == role.name).count()
    if in_use:
        raise HTTPException(
            status_code=400,
            detail=f"{in_use} user(s) still have this role. Reassign them first.",
        )
    db.delete(role)
    db.commit()
    return {"message": "Role deleted"}
