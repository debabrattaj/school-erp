"""Business helpers shared by staff workflows and the family portal."""
import hashlib
import json
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from fastapi import HTTPException
from sqlalchemy import func
from app import models
from app.record_controls import encode


def money(value):
    try:
        amount = Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        if not amount.is_finite():
            raise InvalidOperation
        return float(amount)
    except (InvalidOperation, ValueError, TypeError):
        raise HTTPException(400, "Enter a finite amount with at most two decimal places.")


def required_text(value, label="Reason"):
    text = str(value or "").strip()
    if not text or len(text) > 2000:
        raise HTTPException(400, f"{label} is required (up to 2000 characters).")
    return text


def row_or_404(db, cls, row_id):
    row = db.query(cls).filter(cls.id == row_id).first()
    if not row:
        raise HTTPException(404, "Record not found.")
    return row


def serialize(row):
    from app.record_controls import values
    data = values(row)
    for key in tuple(data):
        if key.endswith("_json"):
            data[key[:-5]] = json.loads(data.pop(key)) if data[key] else None
    return data


def result_data(db, student_id, exam_id):
    from app.routes.marks import build_report_card_data
    data = build_report_card_data(db, student_id, exam_id)
    exam = row_or_404(db, models.Exam, exam_id)
    data.update(exam_id=exam_id, student_id=student_id, exam_date=str(exam.exam_date))
    return data


def digest(data):
    return hashlib.sha256(encode(data).encode()).hexdigest()


def published_results(db, student_id, academic_year=None):
    rows = db.query(models.ResultRelease).filter(
        models.ResultRelease.student_id == student_id,
        models.ResultRelease.status == "Published").order_by(models.ResultRelease.version.desc()).all()
    seen, results = set(), []
    for row in rows:
        if row.exam_id in seen:
            continue
        seen.add(row.exam_id)
        data = json.loads(row.data_json)
        if academic_year and data.get("academic_year") != academic_year:
            continue
        data.update(release_id=row.id, version=row.version, published_at=row.published_at)
        results.append(data)
    return sorted(results, key=lambda r: r.get("exam_date") or "")


def portal_marks(db, student_id, academic_year=None):
    return {"exams": [{
        "exam_name": d["exam_name"], "exam_id": d["exam_id"], "exam_date": d["exam_date"],
        "academic_year": d["academic_year"], "percentage": d["percentage"],
        "total_obtained": d["total_obtained"], "total_max": d["total_max"],
        "version": d["version"], "release_id": d["release_id"], "published_at": d["published_at"],
        "subjects": [{"subject": r["subject"], "marks_obtained": r["obtained"],
                      "max_marks": r["max"], "grade": r["grade"],
                      "assessment_status": r.get("assessment_status", "Scored")} for r in d["rows"]],
    } for d in published_results(db, student_id, academic_year)]}


def report_upi(db, fee, user, reference, amount=None):
    from app.payments import outstanding_balance
    reference = required_text(reference, "Transaction reference").upper()
    previous = db.query(models.PaymentCase).filter(
        models.PaymentCase.kind == "UPI", models.PaymentCase.reference == reference).first()
    if previous:
        if previous.fee_id != fee.id:
            raise HTTPException(409, "This reference has already been reported for another fee.")
        return previous
    amount = money(outstanding_balance(fee) if amount is None else amount)
    if amount <= 0 or amount > money(outstanding_balance(fee)):
        raise HTTPException(400, "Reported amount must be positive and no greater than the balance.")
    row = models.PaymentCase(fee_id=fee.id, kind="UPI", reference=reference, amount=amount,
                             status="Pending", notes="Payment reported; verify against the bank statement before crediting.",
                             created_by=user.email)
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def recalculate_fee(fee, db):
    from app.routes.fees import calculate_fee_status, generate_receipt_no
    fee.paid_amount = money(fee.paid_amount or 0)
    fee.due_amount, fee.payment_status = calculate_fee_status(
        fee.total_amount, fee.paid_amount, fee.concession_amount, fee.late_fee_charged)
    if fee.paid_amount > 0 and not fee.receipt_no:
        fee.receipt_no = generate_receipt_no(db)
    fee.payment_date = datetime.now().date()


def notify_family(db, student, message, module, record_id):
    """Record an in-app notice; external messaging remains an explicit staff action."""
    row = models.CommunicationLog(channel="In App", category="General",
        recipient_name=student.guardian_name or student.first_name,
        recipient_email=student.guardian_email, recipient_phone=student.guardian_phone,
        related_module="Student", related_record_id=student.id,
        message_body=f"{module}: {message}", status="Sent", sent_at=datetime.utcnow())
    db.add(row)
    return row


def timetable_on_date(db, class_id, on_date):
    rows = db.query(models.OperationalSnapshot).filter(models.OperationalSnapshot.kind == "Timetable",
        models.OperationalSnapshot.scope == str(class_id), models.OperationalSnapshot.status == "Approved",
        models.OperationalSnapshot.effective_from <= on_date).order_by(models.OperationalSnapshot.version.desc()).all()
    row = next((r for r in rows if not r.effective_until or r.effective_until >= on_date), None)
    if row:
        entries = json.loads(row.data_json)["entries"]
    else:
        managed = db.query(models.OperationalSnapshot).filter(models.OperationalSnapshot.kind == "Timetable",
            models.OperationalSnapshot.scope == str(class_id), models.OperationalSnapshot.status == "Approved").first()
        entries = [] if managed else [serialize(e) for e in db.query(models.TimetableEntry).filter(
            models.TimetableEntry.class_id == class_id).all()]
    cls = row_or_404(db, models.SchoolClass, class_id)
    covers = db.query(models.SubstitutionAssignment).filter(models.SubstitutionAssignment.cover_date == on_date,
        models.SubstitutionAssignment.class_name == cls.class_name,
        models.SubstitutionAssignment.section == cls.section,
        models.SubstitutionAssignment.status == "Assigned").all()
    teachers = {t.id: t.name for t in db.query(models.Teacher).all()}
    for entry in entries:
        for cover in covers:
            if entry["day_of_week"] == on_date.strftime("%A") and entry["period_no"] == cover.period_no:
                entry["teacher_id"] = cover.substitute_teacher_id
                entry["teacher_name_snapshot"] = teachers.get(cover.substitute_teacher_id, "Substitute")
                entry["is_substitution"] = True
    return {"version": row.version if row else None, "on_date": on_date, "entries": entries}
