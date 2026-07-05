"""Audit logging: append-only 'who did what, when' trail for mutating actions.

Records are written to the central DB (school_accounts.db) via the AuditLog
model. Writing is best-effort — an audit failure must never break the actual
request, so all DB work here is wrapped in try/except.
"""

from jose import jwt, JWTError

from app.security import SECRET_KEY, ALGORITHM
from app.tenant import CentralSessionLocal
from app.tenant_models import AuditLog

# Only these methods change state and are worth auditing.
AUDITED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Path prefixes we never audit (health checks, docs, static, etc.).
_SKIP_PREFIXES = ("/docs", "/openapi", "/redoc", "/favicon")


def actor_from_token(auth_header: str | None) -> dict:
    """Best-effort decode of the bearer token into actor fields.

    Returns empty-ish values for anonymous / unauthenticated requests (e.g. a
    login attempt itself) rather than raising.
    """
    actor = {"email": None, "role": None, "account_code": None}
    if not auth_header or not auth_header.lower().startswith("bearer "):
        return actor

    token = auth_header.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return actor

    actor["email"] = payload.get("sub")
    actor["role"] = payload.get("role") or (
        "PlatformOwner" if payload.get("scope") == "platform" else None
    )
    actor["account_code"] = payload.get("account_code")
    return actor


def should_audit(method: str, path: str) -> bool:
    if method.upper() not in AUDITED_METHODS:
        return False
    return not any(path.startswith(prefix) for prefix in _SKIP_PREFIXES)


def record_audit(
    *,
    method: str,
    path: str,
    status_code: int | None,
    client_ip: str | None,
    actor: dict,
    detail: str | None = None,
) -> None:
    """Persist one audit row. Never raises."""
    db = CentralSessionLocal()
    try:
        db.add(
            AuditLog(
                method=method,
                path=path,
                status_code=status_code,
                client_ip=client_ip,
                actor_email=actor.get("email"),
                actor_role=actor.get("role"),
                account_code=actor.get("account_code"),
                detail=detail,
            )
        )
        db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()
