"""Staff leave and substitute cover endpoints."""

from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import leave as leave_logic
from app import models
from app.database import get_db
from app.models import User
from app.security import require_roles

router = APIRouter(prefix="/leave", tags=["Staff Leave & Substitution"])

STAFF = ["Admin", "Principal", "Teacher"]
APPROVERS = ["Admin", "Principal"]


class LeaveTypeCreate(BaseModel):
    code: str
    name: str
    annual_quota: float = 0
    is_paid: bool = True
    allow_negative_balance: bool = False
    is_active: bool = True
    remarks: str | None = None


class LeaveRequestCreate(BaseModel):
    teacher_id: int
    leave_type_id: int
    from_date: date
    to_date: date
    is_half_day: bool = False
    reason: str | None = None
    academic_year: str | None = None


class Decision(BaseModel):
    note: str | None = None


class AssignRequest(BaseModel):
    substitute_teacher_id: int
    notes: str | None = None


def _type_response(t: models.LeaveType) -> dict:
    return {
        "id": t.id, "code": t.code, "name": t.name,
        "annual_quota": t.annual_quota, "is_paid": bool(t.is_paid),
        "allow_negative_balance": bool(t.allow_negative_balance),
        "is_active": bool(t.is_active), "remarks": t.remarks,
    }


def _request_response(r: models.LeaveRequest, teacher=None, leave_type=None) -> dict:
    return {
        "id": r.id, "teacher_id": r.teacher_id,
        "teacher_name": teacher.name if teacher else None,
        "leave_type_id": r.leave_type_id,
        "leave_type": leave_type.name if leave_type else None,
        "academic_year": r.academic_year,
        "from_date": r.from_date, "to_date": r.to_date,
        "days": r.days, "is_half_day": bool(r.is_half_day),
        "reason": r.reason, "status": r.status,
        "decided_by": r.decided_by, "decided_at": r.decided_at,
        "decision_note": r.decision_note,
    }


def _cover_response(c: models.SubstitutionAssignment, names: dict | None = None) -> dict:
    names = names or {}
    return {
        "id": c.id, "cover_date": c.cover_date, "period_no": c.period_no,
        "class_name": c.class_name, "section": c.section,
        "subject": c.subject, "room": c.room,
        "absent_teacher_id": c.absent_teacher_id,
        "absent_teacher": names.get(c.absent_teacher_id),
        "substitute_teacher_id": c.substitute_teacher_id,
        "substitute_teacher": names.get(c.substitute_teacher_id),
        "status": c.status, "assigned_by": c.assigned_by,
        "assigned_at": c.assigned_at, "notes": c.notes,
    }


# ---------------- Leave types ----------------


@router.get("/types")
def list_types(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(STAFF)),
):
    return [_type_response(t) for t in db.query(models.LeaveType).order_by(models.LeaveType.id).all()]


@router.post("/types")
def create_type(
    payload: LeaveTypeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(APPROVERS)),
):
    code = payload.code.strip()
    if not code or not payload.name.strip():
        raise HTTPException(status_code=400, detail="Code and name are required.")
    if payload.annual_quota < 0:
        raise HTTPException(status_code=400, detail="Annual quota cannot be negative.")
    if db.query(models.LeaveType).filter(models.LeaveType.code == code).first():
        raise HTTPException(status_code=400, detail="A leave type with this code already exists.")

    leave_type = models.LeaveType(
        code=code, name=payload.name.strip(), annual_quota=payload.annual_quota,
        is_paid=payload.is_paid, allow_negative_balance=payload.allow_negative_balance,
        is_active=payload.is_active, remarks=payload.remarks,
    )
    db.add(leave_type)
    db.commit()
    db.refresh(leave_type)
    return _type_response(leave_type)


# ---------------- Balances ----------------


@router.get("/balances")
def balances(
    teacher_id: int,
    academic_year: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(STAFF)),
):
    """Entitlement, used and remaining for each active leave type."""
    types = db.query(models.LeaveType).filter(models.LeaveType.is_active == True).all()  # noqa: E712
    out = []
    for leave_type in types:
        balance = leave_logic.get_or_create_balance(db, teacher_id, leave_type, academic_year)
        out.append({
            "leave_type_id": leave_type.id, "leave_type": leave_type.name,
            "entitled_days": balance.entitled_days, "used_days": balance.used_days,
            "remaining_days": leave_logic.remaining_days(balance),
            "is_paid": bool(leave_type.is_paid),
        })
    db.commit()
    return out


# ---------------- Requests ----------------


@router.get("/requests")
def list_requests(
    teacher_id: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(STAFF)),
):
    query = db.query(models.LeaveRequest)
    if teacher_id:
        query = query.filter(models.LeaveRequest.teacher_id == teacher_id)
    if status:
        query = query.filter(models.LeaveRequest.status == status)

    rows = query.order_by(models.LeaveRequest.id.desc()).all()
    teachers = {t.id: t for t in db.query(models.Teacher).all()}
    types = {t.id: t for t in db.query(models.LeaveType).all()}
    return [_request_response(r, teachers.get(r.teacher_id), types.get(r.leave_type_id)) for r in rows]


@router.post("/requests")
def create_request(
    payload: LeaveRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(STAFF)),
):
    if not db.query(models.Teacher).filter(models.Teacher.id == payload.teacher_id).first():
        raise HTTPException(status_code=404, detail="Teacher not found")
    leave_type = (
        db.query(models.LeaveType).filter(models.LeaveType.id == payload.leave_type_id).first()
    )
    if not leave_type or not leave_type.is_active:
        raise HTTPException(status_code=400, detail="Leave type not found or inactive.")

    try:
        days = leave_logic.count_leave_days(
            db, payload.from_date, payload.to_date, payload.is_half_day
        )
    except leave_logic.LeaveError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if days <= 0:
        raise HTTPException(
            status_code=400,
            detail="That range contains no working days.",
        )

    clashes = leave_logic.overlapping_requests(
        db, payload.teacher_id, payload.from_date, payload.to_date
    )
    if clashes:
        raise HTTPException(
            status_code=400,
            detail="This teacher already has a leave request covering those dates.",
        )

    request = models.LeaveRequest(
        teacher_id=payload.teacher_id, leave_type_id=payload.leave_type_id,
        academic_year=payload.academic_year,
        from_date=payload.from_date, to_date=payload.to_date,
        days=days, is_half_day=payload.is_half_day,
        reason=payload.reason, status="Requested",
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return _request_response(request, None, leave_type)


def _get_request(db, request_id: int) -> models.LeaveRequest:
    request = db.query(models.LeaveRequest).filter(models.LeaveRequest.id == request_id).first()
    if not request:
        raise HTTPException(status_code=404, detail="Leave request not found")
    return request


@router.post("/requests/{request_id}/approve")
def approve_request(
    request_id: int,
    payload: Decision,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(APPROVERS)),
):
    """Approve leave: deduct the balance and raise cover for the classes missed."""
    request = _get_request(db, request_id)
    try:
        result = leave_logic.approve(db, request, current_user.email, payload.note)
    except leave_logic.LeaveError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))

    db.refresh(request)
    return {"request": _request_response(request), **result}


@router.post("/requests/{request_id}/reject")
def reject_request(
    request_id: int,
    payload: Decision,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(APPROVERS)),
):
    from datetime import datetime

    request = _get_request(db, request_id)
    if request.status == "Approved":
        raise HTTPException(
            status_code=400,
            detail="This leave is already approved — cancel it instead, so the balance is returned.",
        )
    request.status = "Rejected"
    request.decided_by = current_user.email
    request.decided_at = datetime.utcnow()
    request.decision_note = payload.note
    db.commit()
    db.refresh(request)
    return {"request": _request_response(request)}


@router.post("/requests/{request_id}/cancel")
def cancel_request(
    request_id: int,
    payload: Decision,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(STAFF)),
):
    """Cancel leave, returning the days and dropping any unfilled cover."""
    request = _get_request(db, request_id)
    if request.status == "Cancelled":
        raise HTTPException(status_code=400, detail="This request is already cancelled.")
    result = leave_logic.cancel(db, request, current_user.email, payload.note)
    db.refresh(request)
    return {"request": _request_response(request), **result}


# ---------------- Substitute cover ----------------


@router.get("/cover")
def list_cover(
    on_date: date | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(STAFF)),
):
    """Cover slots, defaulting to today -- the "holes in today" list."""
    query = db.query(models.SubstitutionAssignment)
    query = query.filter(models.SubstitutionAssignment.cover_date == (on_date or date.today()))
    if status:
        query = query.filter(models.SubstitutionAssignment.status == status)

    rows = query.order_by(models.SubstitutionAssignment.period_no).all()
    names = {t.id: t.name for t in db.query(models.Teacher).all()}
    return [_cover_response(c, names) for c in rows]


@router.get("/cover/{cover_id}/candidates")
def cover_candidates(
    cover_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(STAFF)),
):
    """Who could take this slot, with a reason against everyone who could not."""
    cover = (
        db.query(models.SubstitutionAssignment)
        .filter(models.SubstitutionAssignment.id == cover_id)
        .first()
    )
    if not cover:
        raise HTTPException(status_code=404, detail="Cover slot not found")
    return leave_logic.available_substitutes(db, cover)


@router.post("/cover/{cover_id}/assign")
def assign_cover(
    cover_id: int,
    payload: AssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(APPROVERS)),
):
    cover = (
        db.query(models.SubstitutionAssignment)
        .filter(models.SubstitutionAssignment.id == cover_id)
        .first()
    )
    if not cover:
        raise HTTPException(status_code=404, detail="Cover slot not found")

    try:
        cover = leave_logic.assign_substitute(
            db, cover, payload.substitute_teacher_id, current_user.email
        )
    except leave_logic.LeaveError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    if payload.notes:
        cover.notes = payload.notes
        db.commit()

    names = {t.id: t.name for t in db.query(models.Teacher).all()}
    return _cover_response(cover, names)


@router.post("/cover/{cover_id}/unassign")
def unassign_cover(
    cover_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(APPROVERS)),
):
    cover = (
        db.query(models.SubstitutionAssignment)
        .filter(models.SubstitutionAssignment.id == cover_id)
        .first()
    )
    if not cover:
        raise HTTPException(status_code=404, detail="Cover slot not found")

    cover.substitute_teacher_id = None
    cover.status = "Unassigned"
    cover.assigned_by = None
    cover.assigned_at = None
    db.commit()
    db.refresh(cover)
    return _cover_response(cover)
