"""Gate register: visitors on campus, and students or staff leaving it.

One module because there is one gate. The question the register exists to
answer -- who is on campus who should not be, and who has left who should
still be here -- spans both halves, and deriving it in two places would let
the two answers drift.

The safeguarding path is a student leaving during school hours. Everything
here about approval, collector identity and open passes exists so that
"who let this child go, and to whom" has an answer.
"""

from datetime import date, datetime

from sqlalchemy.orm import Session

from app import models

VISITOR_STATUSES = ("Expected", "In", "Out", "Denied")
GATE_PASS_STATUSES = ("Requested", "Approved", "Rejected", "Out", "Returned", "Cancelled")

# Statuses that mean the pass is live -- it has not been refused, withdrawn,
# or closed off. Used for "still out" and for refusing a second open pass.
OPEN_GATE_STATUSES = ("Requested", "Approved", "Out")


class GateError(Exception):
    """A gate problem worth showing a human."""


def _now() -> datetime:
    return datetime.utcnow()


# ---------------------------------------------------------------------------
# Matching people
# ---------------------------------------------------------------------------


def _digits(value: str | None) -> str:
    """Just the digits of a value."""
    return "".join(ch for ch in (value or "") if ch.isdigit())


def phone_key(value: str | None) -> str:
    """A phone number reduced to something comparable.

    Stripping punctuation is not enough: "+91 98765 43210", "098765 43210" and
    "9876543210" are one person, and comparing them as written is exactly how
    a barred visitor walks back in. Indian numbers are ten digits, so the last
    ten are the identity and anything in front is a country or trunk prefix.

    Shorter values are compared whole rather than padded, so a four-digit
    extension cannot match the tail of somebody's mobile.
    """
    digits = _digits(value)
    return digits[-10:] if len(digits) >= 10 else digits


# ---------------------------------------------------------------------------
# Pass numbers
# ---------------------------------------------------------------------------


def next_pass_no(db: Session, model, prefix: str, on_date: date) -> str:
    """Sequential, human-readable, and unique per day: V-20260818-003.

    A guard reads these aloud over a radio, so they have to be short and
    speakable; the date prefix keeps the daily counter from growing forever.
    Uniqueness is also enforced in the database, so a race loses loudly
    instead of issuing the same number twice.
    """
    stamp = on_date.strftime("%Y%m%d")
    like = f"{prefix}-{stamp}-%"
    highest = 0
    for (existing,) in db.query(model.pass_no).filter(model.pass_no.like(like)).all():
        tail = (existing or "").rsplit("-", 1)[-1]
        if tail.isdigit():
            highest = max(highest, int(tail))
    return f"{prefix}-{stamp}-{highest + 1:03d}"


# ---------------------------------------------------------------------------
# Blocked visitors
# ---------------------------------------------------------------------------


def find_block(
    db: Session, phone: str | None = None, id_proof_number: str | None = None
) -> models.BlockedVisitor | None:
    """An active block matching this phone or ID number, if any.

    Name is deliberately not matched: names are not unique, and a barred
    person will not helpfully re-use their spelling.
    """
    phone_digits = phone_key(phone)
    proof = (id_proof_number or "").strip().upper()
    if not phone_digits and not proof:
        return None

    for block in db.query(models.BlockedVisitor).filter(models.BlockedVisitor.is_active == True).all():  # noqa: E712
        if phone_digits and phone_key(block.phone) == phone_digits:
            return block
        if proof and (block.id_proof_number or "").strip().upper() == proof:
            return block
    return None


# ---------------------------------------------------------------------------
# Visitors
# ---------------------------------------------------------------------------


def check_in(db: Session, visit: models.VisitorPass, by: str | None) -> models.VisitorPass:
    if visit.status == "In":
        raise GateError("This visitor is already checked in.")
    if visit.status == "Out":
        raise GateError("This pass has already been closed; issue a new one for a second visit.")
    if visit.status == "Denied":
        raise GateError("This visit was denied entry.")

    block = find_block(db, visit.phone, visit.id_proof_number)
    if block:
        raise GateError(f"{visit.visitor_name} is on the blocked list: {block.reason}")

    visit.status = "In"
    visit.checked_in_at = _now()
    visit.issued_by = visit.issued_by or by
    db.commit()
    db.refresh(visit)
    return visit


def check_out(db: Session, visit: models.VisitorPass) -> models.VisitorPass:
    if visit.status == "Out":
        raise GateError("This visitor has already been checked out.")
    if visit.status != "In":
        raise GateError("This visitor never checked in, so there is nothing to close.")

    visit.status = "Out"
    visit.checked_out_at = _now()
    db.commit()
    db.refresh(visit)
    return visit


def on_campus(db: Session) -> list[models.VisitorPass]:
    """Visitors checked in and not yet checked out, oldest first.

    Oldest first on purpose: the visit that has been open longest is the one
    someone needs to chase before the gates close.
    """
    return (
        db.query(models.VisitorPass)
        .filter(models.VisitorPass.status == "In")
        .order_by(models.VisitorPass.checked_in_at)
        .all()
    )


# ---------------------------------------------------------------------------
# Gate passes
# ---------------------------------------------------------------------------


def open_pass_for(db: Session, pass_type: str, subject_id: int) -> models.GatePass | None:
    """An existing live pass for this student or staff member, if any."""
    query = db.query(models.GatePass).filter(models.GatePass.status.in_(OPEN_GATE_STATUSES))
    if pass_type == "Staff":
        query = query.filter(models.GatePass.teacher_id == subject_id)
    else:
        query = query.filter(models.GatePass.student_id == subject_id)
    return query.first()


def known_contacts(student: models.Student) -> list[tuple[str, str]]:
    """(name, relation) pairs the school already holds for a student."""
    pairs = [
        (student.father_name, "Father"),
        (student.mother_name, "Mother"),
        (student.guardian_name, "Guardian"),
    ]
    return [(name.strip(), rel) for name, rel in pairs if (name or "").strip()]


def collector_matches_contact(
    db: Session, student: models.Student, name: str | None, phone: str | None
) -> bool:
    """Whether the collector is someone the school already has on file.

    Deliberately a flag and not a rule. Schools really do release children to
    an uncle or a driver, so blocking an unrecognised collector would just
    teach the gate to type the father's name in every time. Recording that
    the release was to someone unrecognised is the useful part -- it is what
    an audit after an incident actually looks for.
    """
    cleaned = (name or "").strip().lower()
    if not cleaned:
        return False

    for contact_name, _ in known_contacts(student):
        if contact_name.lower() == cleaned:
            return True

    phone_digits = phone_key(phone)
    if phone_digits and phone_key(student.guardian_phone) == phone_digits:
        return True

    # A parent with a portal login counts as a known contact too.
    links = (
        db.query(models.ParentStudentLink, models.User)
        .join(models.User, models.User.id == models.ParentStudentLink.user_id)
        .filter(models.ParentStudentLink.student_id == student.id)
        .all()
    )
    for _, user in links:
        if (user.name or "").strip().lower() == cleaned:
            return True

    return False


def approve_pass(db: Session, gate_pass: models.GatePass, by: str, note: str | None = None) -> models.GatePass:
    if gate_pass.status in ("Out", "Returned"):
        raise GateError("This pass has already been used.")
    if gate_pass.status == "Cancelled":
        raise GateError("This pass was cancelled.")

    gate_pass.status = "Approved"
    gate_pass.approved_by = by
    gate_pass.approved_at = _now()
    gate_pass.decision_note = note
    db.commit()
    db.refresh(gate_pass)
    return gate_pass


def release(
    db: Session,
    gate_pass: models.GatePass,
    by: str,
    collected_by_name: str | None = None,
    collected_by_relation: str | None = None,
    collected_by_phone: str | None = None,
    collected_by_id_proof: str | None = None,
) -> models.GatePass:
    """Let them out through the gate.

    Fails closed on both counts that matter: an unapproved pass does not open
    the gate, and a child is not released to an unnamed adult.
    """
    if gate_pass.status == "Out":
        raise GateError("This pass has already been used to leave.")
    if gate_pass.status == "Returned":
        raise GateError("This pass is closed.")
    if gate_pass.status != "Approved":
        raise GateError("This pass has not been approved yet.")

    if gate_pass.pass_type == "Student":
        if not (collected_by_name or "").strip():
            raise GateError("Record who is collecting the student before releasing them.")

        student = (
            db.query(models.Student).filter(models.Student.id == gate_pass.student_id).first()
        )
        if not student:
            raise GateError("Student not found.")

        block = find_block(db, collected_by_phone, collected_by_id_proof)
        if block:
            raise GateError(
                f"{collected_by_name} is on the blocked list and cannot collect a student: {block.reason}"
            )

        gate_pass.collected_by_name = collected_by_name.strip()
        gate_pass.collected_by_relation = collected_by_relation
        gate_pass.collected_by_phone = collected_by_phone
        gate_pass.collected_by_id_proof = collected_by_id_proof
        gate_pass.collector_matched_contact = collector_matches_contact(
            db, student, collected_by_name, collected_by_phone
        )

    gate_pass.status = "Out"
    gate_pass.released_by = by
    gate_pass.released_at = _now()
    db.commit()
    db.refresh(gate_pass)
    return gate_pass


def record_return(db: Session, gate_pass: models.GatePass, by: str) -> models.GatePass:
    if gate_pass.status != "Out":
        raise GateError("This pass is not currently out.")

    gate_pass.status = "Returned"
    gate_pass.returned_at = _now()
    gate_pass.returned_recorded_by = by
    db.commit()
    db.refresh(gate_pass)
    return gate_pass


def still_out(db: Session, on_date: date | None = None) -> list[models.GatePass]:
    """Passes released and not closed, for a date.

    Includes one-way passes (going home sick) as well as round trips, because
    the gate still needs the list of who is not on site -- a fire roll call
    does not care why someone left.
    """
    query = db.query(models.GatePass).filter(models.GatePass.status == "Out")
    if on_date:
        query = query.filter(models.GatePass.pass_date == on_date)
    return query.order_by(models.GatePass.released_at).all()


def overdue_returns(db: Session, as_of: datetime | None = None) -> list[models.GatePass]:
    """Round-trip passes past their expected return time and still out.

    Only passes that said they were coming back can be overdue; a student sent
    home for the day is not late.
    """
    moment = as_of or _now()
    return [
        p
        for p in still_out(db)
        if p.expected_return and p.expected_return_at and p.expected_return_at < moment
    ]
