"""Fee concessions and scholarships.

Schemes are what the school offers; grants are a scheme given to one student.
Granting is deliberately a two-step affair -- request, then approve -- because
a concession is money the school chooses not to collect, and who authorised it
needs to be answerable afterwards.
"""

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import concessions as concession_logic
from app import models
from app.database import get_db
from app.models import User
from app.security import require_roles

router = APIRouter(prefix="/concessions", tags=["Fee Concessions"])

# Who may define what the school offers, and who may approve giving it away.
MANAGERS = ["Admin", "Principal", "Accounts"]
APPROVERS = ["Admin", "Principal"]


class SchemeCreate(BaseModel):
    code: str
    name: str
    category: str | None = None
    discount_type: str = "percent"
    discount_value: float = 0
    applies_to_fee_type: str | None = None
    is_active: bool = True
    remarks: str | None = None


class SchemeUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    discount_type: str | None = None
    discount_value: float | None = None
    applies_to_fee_type: str | None = None
    is_active: bool | None = None
    remarks: str | None = None


class GrantCreate(BaseModel):
    student_id: int
    scheme_id: int
    academic_year: str | None = None
    discount_type: str | None = None
    discount_value: float | None = None
    reason: str | None = None
    valid_from: date | None = None
    valid_to: date | None = None


class GrantDecision(BaseModel):
    note: str | None = None


def _validate_discount(discount_type: str | None, value: float | None):
    if discount_type is not None:
        if discount_type.lower() not in concession_logic.VALID_DISCOUNT_TYPES:
            raise HTTPException(
                status_code=400,
                detail=f"discount_type must be one of {concession_logic.VALID_DISCOUNT_TYPES}",
            )
    if value is not None:
        if value < 0:
            raise HTTPException(status_code=400, detail="Discount value cannot be negative.")
        if (discount_type or "percent").lower() == "percent" and value > 100:
            raise HTTPException(status_code=400, detail="A percentage discount cannot exceed 100.")


def _scheme_response(scheme: models.ConcessionScheme) -> dict:
    return {
        "id": scheme.id, "code": scheme.code, "name": scheme.name,
        "category": scheme.category, "discount_type": scheme.discount_type,
        "discount_value": scheme.discount_value,
        "applies_to_fee_type": scheme.applies_to_fee_type,
        "is_active": bool(scheme.is_active), "remarks": scheme.remarks,
    }


def _grant_response(grant: models.StudentConcession, scheme=None) -> dict:
    return {
        "id": grant.id, "student_id": grant.student_id, "scheme_id": grant.scheme_id,
        "scheme_name": scheme.name if scheme else None,
        "academic_year": grant.academic_year,
        "discount_type": grant.discount_type, "discount_value": grant.discount_value,
        "status": grant.status, "reason": grant.reason,
        "requested_by": grant.requested_by, "requested_at": grant.requested_at,
        "decided_by": grant.decided_by, "decided_at": grant.decided_at,
        "decision_note": grant.decision_note,
        "valid_from": grant.valid_from, "valid_to": grant.valid_to,
    }


# ---------------- Schemes ----------------


@router.get("/schemes")
def list_schemes(
    active_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    query = db.query(models.ConcessionScheme)
    if active_only:
        query = query.filter(models.ConcessionScheme.is_active == True)  # noqa: E712
    return [_scheme_response(s) for s in query.order_by(models.ConcessionScheme.id).all()]


@router.post("/schemes")
def create_scheme(
    payload: SchemeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(APPROVERS)),
):
    _validate_discount(payload.discount_type, payload.discount_value)

    code = payload.code.strip()
    if not code or not payload.name.strip():
        raise HTTPException(status_code=400, detail="Code and name are required.")
    if db.query(models.ConcessionScheme).filter(models.ConcessionScheme.code == code).first():
        raise HTTPException(status_code=400, detail="A scheme with this code already exists.")

    scheme = models.ConcessionScheme(
        code=code, name=payload.name.strip(), category=payload.category,
        discount_type=payload.discount_type.lower(), discount_value=payload.discount_value,
        applies_to_fee_type=payload.applies_to_fee_type or None,
        is_active=payload.is_active, remarks=payload.remarks,
    )
    db.add(scheme)
    db.commit()
    db.refresh(scheme)
    return _scheme_response(scheme)


@router.put("/schemes/{scheme_id}")
def update_scheme(
    scheme_id: int,
    payload: SchemeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(APPROVERS)),
):
    scheme = db.query(models.ConcessionScheme).filter(models.ConcessionScheme.id == scheme_id).first()
    if not scheme:
        raise HTTPException(status_code=404, detail="Scheme not found")

    data = payload.model_dump(exclude_unset=True)
    _validate_discount(
        data.get("discount_type", scheme.discount_type),
        data.get("discount_value", scheme.discount_value),
    )
    for key, value in data.items():
        setattr(scheme, key, value.lower() if key == "discount_type" and value else value)

    db.commit()
    db.refresh(scheme)
    return _scheme_response(scheme)


@router.delete("/schemes/{scheme_id}")
def delete_scheme(
    scheme_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(APPROVERS)),
):
    scheme = db.query(models.ConcessionScheme).filter(models.ConcessionScheme.id == scheme_id).first()
    if not scheme:
        raise HTTPException(status_code=404, detail="Scheme not found")

    granted = (
        db.query(models.StudentConcession)
        .filter(models.StudentConcession.scheme_id == scheme_id)
        .count()
    )
    if granted:
        # Deleting would orphan the record of why a student's fees were
        # reduced. Deactivating keeps the history and stops future use.
        raise HTTPException(
            status_code=400,
            detail=f"This scheme is granted to {granted} student(s). Deactivate it instead of deleting.",
        )

    db.delete(scheme)
    db.commit()
    return {"deleted": True}


# ---------------- Grants ----------------


@router.get("/grants")
def list_grants(
    student_id: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    query = db.query(models.StudentConcession)
    if student_id:
        query = query.filter(models.StudentConcession.student_id == student_id)
    if status:
        query = query.filter(models.StudentConcession.status == status)

    rows = query.order_by(models.StudentConcession.id.desc()).all()
    schemes = {s.id: s for s in db.query(models.ConcessionScheme).all()}
    return [_grant_response(g, schemes.get(g.scheme_id)) for g in rows]


@router.post("/grants")
def create_grant(
    payload: GrantCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """Request a concession for a student. Starts unapproved and discounts
    nothing until someone with authority approves it."""
    _validate_discount(payload.discount_type, payload.discount_value)

    if not db.query(models.Student).filter(models.Student.id == payload.student_id).first():
        raise HTTPException(status_code=404, detail="Student not found")
    scheme = (
        db.query(models.ConcessionScheme)
        .filter(models.ConcessionScheme.id == payload.scheme_id)
        .first()
    )
    if not scheme:
        raise HTTPException(status_code=404, detail="Scheme not found")
    if not scheme.is_active:
        raise HTTPException(status_code=400, detail="This scheme is inactive.")

    if payload.valid_from and payload.valid_to and payload.valid_to < payload.valid_from:
        raise HTTPException(status_code=400, detail="valid_to cannot be before valid_from.")

    duplicate = (
        db.query(models.StudentConcession)
        .filter(
            models.StudentConcession.student_id == payload.student_id,
            models.StudentConcession.scheme_id == payload.scheme_id,
            models.StudentConcession.academic_year == payload.academic_year,
            models.StudentConcession.status.in_(["Requested", "Approved"]),
        )
        .first()
    )
    if duplicate:
        raise HTTPException(
            status_code=400,
            detail="This student already has a live grant for that scheme and year.",
        )

    grant = models.StudentConcession(
        student_id=payload.student_id, scheme_id=payload.scheme_id,
        academic_year=payload.academic_year,
        discount_type=(payload.discount_type or "").lower() or None,
        discount_value=payload.discount_value,
        reason=payload.reason, requested_by=current_user.email,
        valid_from=payload.valid_from, valid_to=payload.valid_to,
        status="Requested",
    )
    db.add(grant)
    db.commit()
    db.refresh(grant)
    return _grant_response(grant, scheme)


def _decide(db, grant_id: int, status: str, user: User, note: str | None):
    grant = (
        db.query(models.StudentConcession)
        .filter(models.StudentConcession.id == grant_id)
        .first()
    )
    if not grant:
        raise HTTPException(status_code=404, detail="Grant not found")

    grant.status = status
    grant.decided_by = user.email
    grant.decided_at = datetime.utcnow()
    grant.decision_note = note
    db.commit()
    db.refresh(grant)
    return grant


@router.post("/grants/{grant_id}/approve")
def approve_grant(
    grant_id: int,
    payload: GrantDecision,
    apply_to_unpaid: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(APPROVERS)),
):
    """Approve a grant, and by default re-price the student's unpaid fees.

    Without the re-pricing an approval would only affect fees raised later,
    which is rarely what anyone means when they approve a scholarship
    mid-year.
    """
    grant = _decide(db, grant_id, "Approved", current_user, payload.note)

    updated = []
    if apply_to_unpaid:
        fees = (
            db.query(models.Fee)
            .filter(
                models.Fee.student_id == grant.student_id,
                models.Fee.payment_status != "Paid",
            )
            .all()
        )
        for fee in fees:
            result = concession_logic.recalculate_fee(db, fee)
            if result["changed"]:
                updated.append(result)
        db.commit()

    return {"grant": _grant_response(grant), "fees_updated": updated}


@router.post("/grants/{grant_id}/reject")
def reject_grant(
    grant_id: int,
    payload: GrantDecision,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(APPROVERS)),
):
    return {"grant": _grant_response(_decide(db, grant_id, "Rejected", current_user, payload.note))}


@router.post("/grants/{grant_id}/revoke")
def revoke_grant(
    grant_id: int,
    payload: GrantDecision,
    apply_to_unpaid: bool = True,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(APPROVERS)),
):
    """Withdraw a concession and restore the full amount on unpaid fees."""
    grant = _decide(db, grant_id, "Revoked", current_user, payload.note)

    updated = []
    if apply_to_unpaid:
        fees = (
            db.query(models.Fee)
            .filter(
                models.Fee.student_id == grant.student_id,
                models.Fee.payment_status != "Paid",
            )
            .all()
        )
        for fee in fees:
            result = concession_logic.recalculate_fee(db, fee)
            if result["changed"]:
                updated.append(result)
        db.commit()

    return {"grant": _grant_response(grant), "fees_updated": updated}


# ---------------- Preview and repair ----------------


@router.get("/preview")
def preview(
    student_id: int,
    amount: float,
    fee_type: str | None = None,
    academic_year: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """What a given amount would come to for this student, and why.

    Powers the "why is this less?" line on a fee screen -- an unexplained
    smaller number invites a phone call.
    """
    return concession_logic.explain_discount(
        db, student_id, amount, fee_type=fee_type, academic_year=academic_year
    )


@router.post("/recalculate")
def recalculate(
    student_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(APPROVERS)),
):
    """Re-apply concessions across unpaid fees.

    For repairing history after a scheme's rate is corrected. Part-paid fees
    are reported and skipped rather than re-priced, since reducing a fee money
    has already gone against would leave a credit the app cannot represent.
    """
    query = db.query(models.Fee).filter(models.Fee.payment_status != "Paid")
    if student_id:
        query = query.filter(models.Fee.student_id == student_id)

    changed, skipped = [], []
    for fee in query.all():
        result = concession_logic.recalculate_fee(db, fee)
        (changed if result["changed"] else skipped).append(result)
    db.commit()

    return {
        "changed": len(changed),
        "skipped": len(skipped),
        "part_paid_skipped": [r["fee_id"] for r in skipped if r.get("reason") == "already part-paid"],
        "details": changed,
    }
