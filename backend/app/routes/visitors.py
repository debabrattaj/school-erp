"""Gate register: visitors on campus, and students or staff leaving it.

Both halves live behind /gate because there is one gate and one person
working it. Releasing a student fails closed -- no approval and no named
collector, no release.
"""

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import gatepass as gate_logic
from app import models
from app.database import get_db
from app.models import User
from app.security import require_roles

router = APIRouter(prefix="/gate", tags=["Gate Register"])

# The gate is normally staffed by a custom "Security" or "Front Desk" role
# granted `gate_register`, which require_roles resolves through the permission
# map. The system roles listed here are the ones that always have it.
DESK = ["Admin", "Principal"]
READERS = ["Admin", "Principal", "Teacher"]
# A class teacher authorising their own student to leave early is ordinary,
# so approval is wider than the desk itself.
APPROVERS = ["Admin", "Principal", "Teacher"]


# ---------------- payloads ----------------


class VisitorCreate(BaseModel):
    visitor_name: str
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    visitor_type: str | None = None
    organisation: str | None = None
    id_proof_type: str | None = None
    id_proof_number: str | None = None
    photo_url: str | None = None
    purpose: str | None = None
    party_size: int = 1
    vehicle_number: str | None = None
    host_student_id: int | None = None
    host_teacher_id: int | None = None
    host_department: str | None = None
    visit_date: date | None = None
    remarks: str | None = None
    # A walk-in is registered and admitted in one action; a pre-registered
    # appointment is created ahead of time and checked in when they arrive.
    check_in_now: bool = True


class BlockCreate(BaseModel):
    name: str
    reason: str
    phone: str | None = None
    id_proof_number: str | None = None


class Note(BaseModel):
    note: str | None = None


class GatePassCreate(BaseModel):
    pass_type: str = "Student"
    student_id: int | None = None
    teacher_id: int | None = None
    pass_date: date | None = None
    reason: str | None = None
    expected_return: bool = False
    expected_return_at: datetime | None = None
    remarks: str | None = None


class ReleaseRequest(BaseModel):
    collected_by_name: str | None = None
    collected_by_relation: str | None = None
    collected_by_phone: str | None = None
    collected_by_id_proof: str | None = None


# ---------------- responses ----------------


def _visitor_response(v: models.VisitorPass, names: dict | None = None) -> dict:
    names = names or {}
    return {
        "id": v.id, "pass_no": v.pass_no, "visitor_name": v.visitor_name,
        "phone": v.phone, "email": v.email, "address": v.address,
        "visitor_type": v.visitor_type, "organisation": v.organisation,
        "id_proof_type": v.id_proof_type, "id_proof_number": v.id_proof_number,
        "photo_url": v.photo_url, "purpose": v.purpose,
        "party_size": v.party_size, "vehicle_number": v.vehicle_number,
        "host_student_id": v.host_student_id,
        "host_student": names.get(("student", v.host_student_id)),
        "host_teacher_id": v.host_teacher_id,
        "host_teacher": names.get(("teacher", v.host_teacher_id)),
        "host_department": v.host_department,
        "visit_date": v.visit_date, "checked_in_at": v.checked_in_at,
        "checked_out_at": v.checked_out_at, "status": v.status,
        "denied_reason": v.denied_reason, "issued_by": v.issued_by,
        "remarks": v.remarks,
    }


def _pass_response(p: models.GatePass, names: dict | None = None) -> dict:
    names = names or {}
    return {
        "id": p.id, "pass_no": p.pass_no, "pass_type": p.pass_type,
        "student_id": p.student_id, "student": names.get(("student", p.student_id)),
        "teacher_id": p.teacher_id, "teacher": names.get(("teacher", p.teacher_id)),
        "pass_date": p.pass_date, "reason": p.reason,
        "expected_return": bool(p.expected_return),
        "expected_return_at": p.expected_return_at,
        "status": p.status,
        "approved_by": p.approved_by, "approved_at": p.approved_at,
        "decision_note": p.decision_note,
        "collected_by_name": p.collected_by_name,
        "collected_by_relation": p.collected_by_relation,
        "collected_by_phone": p.collected_by_phone,
        "collected_by_id_proof": p.collected_by_id_proof,
        "collector_matched_contact": bool(p.collector_matched_contact),
        "released_by": p.released_by, "released_at": p.released_at,
        "returned_at": p.returned_at,
        "returned_recorded_by": p.returned_recorded_by,
        "remarks": p.remarks, "created_by": p.created_by,
    }


def _block_response(b: models.BlockedVisitor) -> dict:
    return {
        "id": b.id, "name": b.name, "phone": b.phone,
        "id_proof_number": b.id_proof_number, "reason": b.reason,
        "blocked_by": b.blocked_by, "blocked_at": b.blocked_at,
        "is_active": bool(b.is_active), "lifted_by": b.lifted_by,
        "lifted_at": b.lifted_at, "lifted_note": b.lifted_note,
    }


def _name_map(db: Session) -> dict:
    names = {}
    for s in db.query(models.Student).all():
        names[("student", s.id)] = " ".join(filter(None, [s.first_name, s.last_name]))
    for t in db.query(models.Teacher).all():
        names[("teacher", t.id)] = t.name
    return names


# ---------------- blocked list ----------------


@router.get("/blocked")
def list_blocked(
    include_lifted: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(READERS)),
):
    query = db.query(models.BlockedVisitor)
    if not include_lifted:
        query = query.filter(models.BlockedVisitor.is_active == True)  # noqa: E712
    return [_block_response(b) for b in query.order_by(models.BlockedVisitor.id.desc()).all()]


@router.post("/blocked")
def add_block(
    payload: BlockCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(DESK)),
):
    if not payload.name.strip() or not payload.reason.strip():
        raise HTTPException(status_code=400, detail="A name and a reason are required.")
    if not (payload.phone or "").strip() and not (payload.id_proof_number or "").strip():
        raise HTTPException(
            status_code=400,
            detail="A phone number or ID number is required — a block on a name alone cannot be matched at the gate.",
        )

    block = models.BlockedVisitor(
        name=payload.name.strip(), phone=payload.phone,
        id_proof_number=payload.id_proof_number, reason=payload.reason.strip(),
        blocked_by=current_user.email, is_active=True,
    )
    db.add(block)
    db.commit()
    db.refresh(block)
    return _block_response(block)


@router.post("/blocked/{block_id}/lift")
def lift_block(
    block_id: int,
    payload: Note,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(DESK)),
):
    """Lift a block. Kept as a record rather than deleted, because why someone
    was barred is exactly what a later reader wants."""
    block = db.query(models.BlockedVisitor).filter(models.BlockedVisitor.id == block_id).first()
    if not block:
        raise HTTPException(status_code=404, detail="Blocked visitor not found")

    block.is_active = False
    block.lifted_by = current_user.email
    block.lifted_at = datetime.utcnow()
    block.lifted_note = payload.note
    db.commit()
    db.refresh(block)
    return _block_response(block)


# ---------------- visitors ----------------


@router.get("/visitors/on-campus")
def visitors_on_campus(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(READERS)),
):
    """Who is inside right now, longest visit first."""
    names = _name_map(db)
    return [_visitor_response(v, names) for v in gate_logic.on_campus(db)]


@router.get("/visitors")
def list_visitors(
    on_date: date | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(READERS)),
):
    query = db.query(models.VisitorPass)
    query = query.filter(models.VisitorPass.visit_date == (on_date or date.today()))
    if status:
        query = query.filter(models.VisitorPass.status == status)

    names = _name_map(db)
    rows = query.order_by(models.VisitorPass.id.desc()).all()
    return [_visitor_response(v, names) for v in rows]


@router.post("/visitors")
def create_visitor(
    payload: VisitorCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(DESK)),
):
    if not payload.visitor_name.strip():
        raise HTTPException(status_code=400, detail="Visitor name is required.")
    if payload.party_size < 1:
        raise HTTPException(status_code=400, detail="Party size must be at least one.")

    if payload.host_student_id and not db.query(models.Student).filter(
        models.Student.id == payload.host_student_id
    ).first():
        raise HTTPException(status_code=404, detail="Student not found")
    if payload.host_teacher_id and not db.query(models.Teacher).filter(
        models.Teacher.id == payload.host_teacher_id
    ).first():
        raise HTTPException(status_code=404, detail="Teacher not found")

    # Refuse at registration rather than at check-in, so a barred person is
    # turned away at the desk instead of being handed a pass first.
    block = gate_logic.find_block(db, payload.phone, payload.id_proof_number)
    if block:
        raise HTTPException(
            status_code=400,
            detail=f"{payload.visitor_name} is on the blocked list: {block.reason}",
        )

    visit_date = payload.visit_date or date.today()
    visit = models.VisitorPass(
        pass_no=gate_logic.next_pass_no(db, models.VisitorPass, "V", visit_date),
        visitor_name=payload.visitor_name.strip(), phone=payload.phone,
        email=payload.email, address=payload.address,
        visitor_type=payload.visitor_type, organisation=payload.organisation,
        id_proof_type=payload.id_proof_type, id_proof_number=payload.id_proof_number,
        photo_url=payload.photo_url, purpose=payload.purpose,
        party_size=payload.party_size, vehicle_number=payload.vehicle_number,
        host_student_id=payload.host_student_id,
        host_teacher_id=payload.host_teacher_id,
        host_department=payload.host_department,
        visit_date=visit_date, status="Expected",
        issued_by=current_user.email, remarks=payload.remarks,
    )
    db.add(visit)
    db.commit()
    db.refresh(visit)

    if payload.check_in_now:
        try:
            visit = gate_logic.check_in(db, visit, current_user.email)
        except gate_logic.GateError as exc:
            raise HTTPException(status_code=400, detail=str(exc))

    return _visitor_response(visit, _name_map(db))


def _get_visit(db, visit_id: int) -> models.VisitorPass:
    visit = db.query(models.VisitorPass).filter(models.VisitorPass.id == visit_id).first()
    if not visit:
        raise HTTPException(status_code=404, detail="Visitor pass not found")
    return visit


@router.post("/visitors/{visit_id}/check-in")
def visitor_check_in(
    visit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(DESK)),
):
    try:
        visit = gate_logic.check_in(db, _get_visit(db, visit_id), current_user.email)
    except gate_logic.GateError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _visitor_response(visit, _name_map(db))


@router.post("/visitors/{visit_id}/check-out")
def visitor_check_out(
    visit_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(DESK)),
):
    try:
        visit = gate_logic.check_out(db, _get_visit(db, visit_id))
    except gate_logic.GateError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _visitor_response(visit, _name_map(db))


@router.post("/visitors/{visit_id}/deny")
def visitor_deny(
    visit_id: int,
    payload: Note,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(DESK)),
):
    """Refuse entry. A denial is a record, not a missing row."""
    visit = _get_visit(db, visit_id)
    if visit.status == "In":
        raise HTTPException(
            status_code=400,
            detail="This visitor is already inside — check them out instead.",
        )
    visit.status = "Denied"
    visit.denied_reason = payload.note
    db.commit()
    db.refresh(visit)
    return _visitor_response(visit, _name_map(db))


# ---------------- gate passes ----------------


@router.get("/passes/still-out")
def passes_still_out(
    on_date: date | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(READERS)),
):
    """Who has left and not come back. The roll-call list."""
    names = _name_map(db)
    overdue = {p.id for p in gate_logic.overdue_returns(db)}
    out = []
    for p in gate_logic.still_out(db, on_date):
        row = _pass_response(p, names)
        row["overdue"] = p.id in overdue
        out.append(row)
    return out


@router.get("/passes")
def list_passes(
    on_date: date | None = None,
    status: str | None = None,
    student_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(READERS)),
):
    query = db.query(models.GatePass)
    if student_id:
        query = query.filter(models.GatePass.student_id == student_id)
    else:
        query = query.filter(models.GatePass.pass_date == (on_date or date.today()))
    if status:
        query = query.filter(models.GatePass.status == status)

    names = _name_map(db)
    return [_pass_response(p, names) for p in query.order_by(models.GatePass.id.desc()).all()]


@router.post("/passes")
def create_pass(
    payload: GatePassCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(READERS)),
):
    pass_type = payload.pass_type if payload.pass_type in ("Student", "Staff") else "Student"

    if pass_type == "Student":
        if not payload.student_id:
            raise HTTPException(status_code=400, detail="A student is required for a student pass.")
        if not db.query(models.Student).filter(models.Student.id == payload.student_id).first():
            raise HTTPException(status_code=404, detail="Student not found")
        subject_id = payload.student_id
    else:
        if not payload.teacher_id:
            raise HTTPException(status_code=400, detail="A staff member is required for a staff pass.")
        if not db.query(models.Teacher).filter(models.Teacher.id == payload.teacher_id).first():
            raise HTTPException(status_code=404, detail="Teacher not found")
        subject_id = payload.teacher_id

    # Two live passes for one person means the register cannot say whether
    # they are on site, which is the one thing it is for.
    existing = gate_logic.open_pass_for(db, pass_type, subject_id)
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"There is already an open gate pass ({existing.pass_no}) for this person.",
        )

    pass_date = payload.pass_date or date.today()
    gate_pass = models.GatePass(
        pass_no=gate_logic.next_pass_no(db, models.GatePass, "G", pass_date),
        pass_type=pass_type,
        student_id=payload.student_id if pass_type == "Student" else None,
        teacher_id=payload.teacher_id if pass_type == "Staff" else None,
        pass_date=pass_date, reason=payload.reason,
        expected_return=payload.expected_return,
        expected_return_at=payload.expected_return_at,
        status="Requested", remarks=payload.remarks,
        created_by=current_user.email,
    )
    db.add(gate_pass)
    db.commit()
    db.refresh(gate_pass)
    return _pass_response(gate_pass, _name_map(db))


def _get_pass(db, pass_id: int) -> models.GatePass:
    gate_pass = db.query(models.GatePass).filter(models.GatePass.id == pass_id).first()
    if not gate_pass:
        raise HTTPException(status_code=404, detail="Gate pass not found")
    return gate_pass


@router.post("/passes/{pass_id}/approve")
def approve_pass(
    pass_id: int,
    payload: Note,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(APPROVERS)),
):
    try:
        gate_pass = gate_logic.approve_pass(db, _get_pass(db, pass_id), current_user.email, payload.note)
    except gate_logic.GateError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _pass_response(gate_pass, _name_map(db))


@router.post("/passes/{pass_id}/reject")
def reject_pass(
    pass_id: int,
    payload: Note,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(APPROVERS)),
):
    gate_pass = _get_pass(db, pass_id)
    if gate_pass.status in ("Out", "Returned"):
        raise HTTPException(status_code=400, detail="This pass has already been used.")

    gate_pass.status = "Rejected"
    gate_pass.approved_by = current_user.email
    gate_pass.approved_at = datetime.utcnow()
    gate_pass.decision_note = payload.note
    db.commit()
    db.refresh(gate_pass)
    return _pass_response(gate_pass, _name_map(db))


@router.post("/passes/{pass_id}/cancel")
def cancel_pass(
    pass_id: int,
    payload: Note,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(READERS)),
):
    gate_pass = _get_pass(db, pass_id)
    if gate_pass.status in ("Out", "Returned"):
        raise HTTPException(
            status_code=400,
            detail="They have already left; record their return instead of cancelling.",
        )
    gate_pass.status = "Cancelled"
    gate_pass.decision_note = payload.note
    db.commit()
    db.refresh(gate_pass)
    return _pass_response(gate_pass, _name_map(db))


@router.post("/passes/{pass_id}/release")
def release_pass(
    pass_id: int,
    payload: ReleaseRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(DESK)),
):
    """Open the gate. Refuses without an approval, and without a named
    collector for a student."""
    try:
        gate_pass = gate_logic.release(
            db, _get_pass(db, pass_id), current_user.email,
            collected_by_name=payload.collected_by_name,
            collected_by_relation=payload.collected_by_relation,
            collected_by_phone=payload.collected_by_phone,
            collected_by_id_proof=payload.collected_by_id_proof,
        )
    except gate_logic.GateError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _pass_response(gate_pass, _name_map(db))


@router.post("/passes/{pass_id}/return")
def return_pass(
    pass_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(DESK)),
):
    try:
        gate_pass = gate_logic.record_return(db, _get_pass(db, pass_id), current_user.email)
    except gate_logic.GateError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _pass_response(gate_pass, _name_map(db))


# ---------------- summary ----------------


@router.get("/summary")
def summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(READERS)),
):
    """The numbers a head of school wants at a glance."""
    today = date.today()
    visitors_today = (
        db.query(models.VisitorPass).filter(models.VisitorPass.visit_date == today).count()
    )
    out_passes = gate_logic.still_out(db)
    return {
        "date": today,
        "visitors_today": visitors_today,
        "visitors_on_campus": len(gate_logic.on_campus(db)),
        "students_out": len([p for p in out_passes if p.pass_type == "Student"]),
        "staff_out": len([p for p in out_passes if p.pass_type == "Staff"]),
        "overdue_returns": len(gate_logic.overdue_returns(db)),
        "active_blocks": db.query(models.BlockedVisitor)
        .filter(models.BlockedVisitor.is_active == True)  # noqa: E712
        .count(),
    }
