"""Approval, publication, reconciliation and record-history workflows."""
import csv
import io
import json
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session
from app import models, workflows as logic
from app.database import get_db
from app.security import require_roles
from app.record_controls import encode
from app.tenant import require_feature

router = APIRouter(prefix="/workflows", tags=["School Workflows"])
LEADERS = ["Admin", "Principal"]
FINANCE = ["Admin", "Principal", "Accounts"]
ACADEMIC = ["Admin", "Principal", "Teacher"]


@router.get("/options")
def workflow_options(request: Request, db: Session = Depends(get_db), user=Depends(require_roles(FINANCE + ["Teacher"]))):
    def choices(cls, label):
        return [{"id": r.id, "label": label(r)} for r in db.query(cls).all()]
    result = {"students": choices(models.Student, lambda r: f"{r.admission_no} · {r.first_name} {r.last_name or ''}"),
              "classes": choices(models.SchoolClass, lambda r: f"{r.class_name} {r.section} · {r.academic_year or ''}")}
    if user.role in ACADEMIC:
        result["exams"] = choices(models.Exam, lambda r: f"{r.exam_name} · {r.class_name} {r.section or ''} · {r.academic_year or ''}")
    if user.role in FINANCE:
        result["fees"] = choices(models.Fee, lambda r: f"#{r.id} · student {r.student_id} · {r.fee_type} · due {r.due_amount}")
        result["owners"] = [{"id": r.id, "label": r.email} for r in db.query(models.User).filter(models.User.role.in_(FINANCE)).all()]
    if user.role in LEADERS:
        result["guardians"] = [{"id": r.id, "label": r.email} for r in db.query(models.User).filter(models.User.role == "Parent").all()]
        result["structures"] = choices(models.FeeStructure, lambda r: f"{r.fee_type} · {r.class_name or 'All classes'} · {r.academic_year} · {r.amount}")
        from app.tenant import is_feature_enabled, get_account_code_from_request
        if is_feature_enabled(get_account_code_from_request(request), "transport"):
            result["routes"] = choices(models.TransportRoute, lambda r: r.route_name)
        result["evidence"] = choices(models.ComplianceTask, lambda r: r.task_code)
        result["documents"] = choices(models.AdmissionDocument, lambda r: f"#{r.id} · enquiry {r.inquiry_id} · {r.document_type} · {r.review_status}")
    return result


class Decision(BaseModel):
    note: str = Field(min_length=1, max_length=2000)


@router.get("/history/{entity}/{entity_id}")
def record_history(entity: str, entity_id: int, db: Session = Depends(get_db),
                   user=Depends(require_roles(LEADERS))):
    rows = db.query(models.RecordRevision).filter(models.RecordRevision.entity == entity,
        models.RecordRevision.entity_id == entity_id).order_by(models.RecordRevision.id.desc()).limit(500).all()
    return [logic.serialize(r) for r in rows]


@router.get("/results")
def releases(student_id: int | None = None, exam_id: int | None = None,
             db: Session = Depends(get_db), user=Depends(require_roles(ACADEMIC))):
    q = db.query(models.ResultRelease)
    if student_id: q = q.filter(models.ResultRelease.student_id == student_id)
    if exam_id: q = q.filter(models.ResultRelease.exam_id == exam_id)
    return [logic.serialize(r) for r in q.order_by(models.ResultRelease.id.desc()).limit(500).all()]


class ResultDraft(Decision):
    student_id: int
    exam_id: int


@router.post("/results")
def prepare_result(payload: ResultDraft, db: Session = Depends(get_db),
                   user=Depends(require_roles(ACADEMIC))):
    logic.row_or_404(db, models.Student, payload.student_id)
    exam = logic.row_or_404(db, models.Exam, payload.exam_id)
    # Lock the parent row so revision numbers are serialised on server databases.
    db.query(models.Exam).filter(models.Exam.id == exam.id).with_for_update().first()
    data = logic.result_data(db, payload.student_id, payload.exam_id)
    expected = db.query(models.ClassSubject).filter(models.ClassSubject.class_id ==
        logic.row_or_404(db, models.Student, payload.student_id).class_id,
        models.ClassSubject.academic_year == exam.academic_year,
        models.ClassSubject.is_active.is_(True)).all()
    missing = {r.subject_name for r in expected} - {r["subject"] for r in data["rows"]}
    if missing:
        raise HTTPException(400, "Enter a score, Absent or Exempt for: " + ", ".join(sorted(missing)))
    version = (db.query(func.max(models.ResultRelease.version)).filter(
        models.ResultRelease.student_id == payload.student_id,
        models.ResultRelease.exam_id == payload.exam_id).scalar() or 0) + 1
    row = models.ResultRelease(student_id=payload.student_id, exam_id=payload.exam_id,
        version=version, status="Draft", data_json=encode(data), source_hash=logic.digest(data),
        reason=logic.required_text(payload.note), created_by=user.email)
    db.add(row); db.commit(); db.refresh(row)
    return logic.serialize(row)


@router.post("/results/{release_id}/review")
def review_result(release_id: int, payload: Decision, db: Session = Depends(get_db),
                  user=Depends(require_roles(ACADEMIC))):
    row = logic.row_or_404(db, models.ResultRelease, release_id)
    if row.status != "Draft": raise HTTPException(409, "Only a draft can be reviewed.")
    if row.source_hash != logic.digest(logic.result_data(db, row.student_id, row.exam_id)):
        raise HTTPException(409, "Marks changed. Prepare a new draft before reviewing.")
    db.info["change_reason"] = logic.required_text(payload.note)
    row.status = "Reviewed"; row.reviewed_by = user.email
    db.commit(); db.refresh(row)
    return logic.serialize(row)


@router.post("/results/{release_id}/publish")
def publish_result(release_id: int, payload: Decision, db: Session = Depends(get_db),
                   user=Depends(require_roles(LEADERS))):
    row = db.query(models.ResultRelease).filter(models.ResultRelease.id == release_id).with_for_update().first()
    if not row: raise HTTPException(404, "Result not found.")
    if row.status != "Reviewed": raise HTTPException(409, "Review the draft before publication.")
    if row.source_hash != logic.digest(logic.result_data(db, row.student_id, row.exam_id)):
        raise HTTPException(409, "Source records changed. Prepare and review a new version.")
    newer = db.query(models.ResultRelease).filter(models.ResultRelease.exam_id == row.exam_id,
        models.ResultRelease.student_id == row.student_id, models.ResultRelease.version > row.version,
        models.ResultRelease.status == "Published").first()
    if newer: raise HTTPException(409, "A newer version is already published.")
    db.info["change_reason"] = logic.required_text(payload.note)
    row.status = "Published"; row.published_by = user.email; row.published_at = datetime.utcnow()
    student = logic.row_or_404(db, models.Student, row.student_id)
    logic.notify_family(db, student, f"{json.loads(row.data_json)['exam_name']} version {row.version} is available in Marks.", "Results", row.id)
    db.commit(); db.refresh(row)
    return logic.serialize(row)


class CaseInput(BaseModel):
    fee_id: int
    kind: str
    reference: str = Field(min_length=1, max_length=200)
    amount: float = 0
    notes: str = Field(min_length=1, max_length=2000)
    owner_id: int | None = None
    due_date: date | None = None
    target_fee_id: int | None = None


@router.get("/payments/cases")
def payment_cases(db: Session = Depends(get_db), user=Depends(require_roles(FINANCE))):
    return [logic.serialize(r) for r in db.query(models.PaymentCase).order_by(models.PaymentCase.id.desc()).limit(1000).all()]


@router.post("/payments/cases")
def create_case(payload: CaseInput, db: Session = Depends(get_db), user=Depends(require_roles(FINANCE))):
    if payload.kind not in {"UPI", "Dispute", "Refund", "Reversal", "Adjustment", "Reassignment"}:
        raise HTTPException(400, "Invalid case type.")
    logic.row_or_404(db, models.Fee, payload.fee_id)
    if payload.owner_id:
        owner = logic.row_or_404(db, models.User, payload.owner_id)
        if owner.role not in FINANCE: raise HTTPException(400, "Choose a finance staff member as owner.")
    ref = logic.required_text(payload.reference, "Reference").upper()
    if db.query(models.PaymentCase).filter(models.PaymentCase.kind == payload.kind,
                                          models.PaymentCase.reference == ref).first():
        raise HTTPException(409, "This case reference already exists.")
    data = payload.model_dump(); data.update(reference=ref, amount=logic.money(payload.amount), created_by=user.email)
    if data["amount"] < 0: raise HTTPException(400, "Amount cannot be negative.")
    row = models.PaymentCase(**data); db.add(row); db.commit(); db.refresh(row)
    return logic.serialize(row)


class CaseUpdate(BaseModel):
    owner_id: int | None = None
    due_date: date | None = None
    notes: str = Field(min_length=1, max_length=2000)


@router.put("/payments/cases/{case_id}")
def assign_case(case_id: int, payload: CaseUpdate, db: Session = Depends(get_db), user=Depends(require_roles(FINANCE))):
    row = logic.row_or_404(db, models.PaymentCase, case_id)
    if row.status != "Pending": raise HTTPException(409, "Completed cases cannot be edited.")
    if payload.owner_id and logic.row_or_404(db, models.User, payload.owner_id).role not in FINANCE:
        raise HTTPException(400, "Choose a finance staff member.")
    row.owner_id = payload.owner_id; row.due_date = payload.due_date; row.notes = payload.notes
    db.commit(); return logic.serialize(row)


@router.post("/payments/cases/{case_id}/{action}")
def decide_case(case_id: int, action: str, payload: Decision, db: Session = Depends(get_db),
                user=Depends(require_roles(LEADERS))):
    if action not in {"approve", "reject"}: raise HTTPException(400, "Invalid decision.")
    row = db.query(models.PaymentCase).filter(models.PaymentCase.id == case_id).with_for_update().first()
    if not row: raise HTTPException(404, "Case not found.")
    if row.status != "Pending": raise HTTPException(409, "This case already has a decision.")
    note = logic.required_text(payload.note, "Verification evidence / decision note")
    fee = db.query(models.Fee).filter(models.Fee.id == row.fee_id).with_for_update().first()
    if not fee: raise HTTPException(404, "Fee not found.")
    if action == "approve":
        from app.payments import outstanding_balance
        amount = logic.money(row.amount)
        if row.kind == "UPI":
            if amount <= 0 or amount > logic.money(outstanding_balance(fee)):
                raise HTTPException(409, "The reported amount exceeds the current balance or is zero.")
            fee.paid_amount = logic.money((fee.paid_amount or 0) + amount)
        elif row.kind in {"Refund", "Reversal", "Reassignment"}:
            if amount <= 0 or amount > logic.money(fee.paid_amount or 0):
                raise HTTPException(400, "Amount must be positive and within the recorded paid balance.")
            if row.kind == "Reassignment":
                target = db.query(models.Fee).filter(models.Fee.id == row.target_fee_id).with_for_update().populate_existing().first()
                if not target: raise HTTPException(404, "Target fee not found.")
                if target.id == fee.id or target.student_id != fee.student_id:
                    raise HTTPException(400, "Reassignment must be to another fee for the same student.")
                if amount > logic.money(outstanding_balance(target)):
                    raise HTTPException(400, "Target fee has insufficient balance.")
                target.paid_amount = logic.money((target.paid_amount or 0) + amount)
                logic.recalculate_fee(target, db)
            fee.paid_amount = logic.money((fee.paid_amount or 0) - amount)
        elif row.kind == "Adjustment":
            minimum = logic.money((fee.paid_amount or 0) + (fee.concession_amount or 0) - (fee.late_fee_charged or 0))
            if amount < minimum: raise HTTPException(400, "Revised charge cannot be below the amount already covered.")
            fee.total_amount = amount
        if row.kind != "Dispute":
            logic.recalculate_fee(fee, db)
    row.status = "Approved" if action == "approve" else "Rejected"
    row.decided_by = user.email; row.decided_at = datetime.utcnow(); row.decision_note = note
    db.info["change_reason"] = f"Payment case {row.id}: {note}"
    db.commit(); db.refresh(row)
    return logic.serialize(row)


@router.get("/payments/settlements")
def settlements(db: Session = Depends(get_db), user=Depends(require_roles(FINANCE))):
    return [logic.serialize(r) for r in db.query(models.SettlementEntry).order_by(models.SettlementEntry.id.desc()).limit(2000)]


@router.post("/payments/settlements/import")
async def import_settlements(file: UploadFile = File(...), db: Session = Depends(get_db),
                             user=Depends(require_roles(FINANCE))):
    raw = await file.read(2_000_001)
    if len(raw) > 2_000_000: raise HTTPException(400, "CSV must be at most 2 MB.")
    try: reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")))
    except UnicodeError: raise HTTPException(400, "Upload a UTF-8 CSV.")
    required = {"reference", "gross_amount", "charges", "net_amount", "settlement_date"}
    if not required.issubset(reader.fieldnames or []): raise HTTPException(400, "Required columns: " + ", ".join(sorted(required)))
    imported = []
    for number, item in enumerate(reader, 2):
        if number > 2001: raise HTTPException(400, "At most 2000 settlement rows are allowed.")
        ref = logic.required_text(item["reference"], "Reference").upper()
        gross, charges, net = [logic.money(item[k]) for k in ("gross_amount", "charges", "net_amount")]
        try: day = date.fromisoformat(item["settlement_date"])
        except ValueError: raise HTTPException(400, f"Row {number}: use YYYY-MM-DD.")
        if min(gross, charges, net) < 0 or logic.money(gross - charges) != net:
            raise HTTPException(400, f"Row {number}: gross minus charges must equal net.")
        existing = db.query(models.SettlementEntry).filter(models.SettlementEntry.reference == ref).first()
        if existing:
            if (existing.gross_amount, existing.charges, existing.net_amount, existing.settlement_date) != (gross, charges, net, day):
                raise HTTPException(409, f"Row {number}: reference exists with different values.")
            continue
        order = db.query(models.PaymentOrder).filter(func.upper(models.PaymentOrder.payment_id) == ref,
            models.PaymentOrder.status == "Paid").first()
        case = db.query(models.PaymentCase).filter(models.PaymentCase.reference == ref,
            models.PaymentCase.kind == "UPI", models.PaymentCase.status == "Approved").first()
        match = order or case
        status = "Unmatched" if not match else "Matched" if logic.money(match.amount) == gross else "Amount mismatch"
        row = models.SettlementEntry(reference=ref, gross_amount=gross, charges=charges, net_amount=net,
            settlement_date=day, fee_id=match.fee_id if match else None, status=status, imported_by=user.email)
        db.add(row); db.flush(); imported.append(logic.serialize(row))
    db.commit()
    return {"imported": len(imported), "entries": imported}


class SnapshotInput(Decision):
    kind: str
    scope_id: int
    effective_from: date
    effective_until: date | None = None
    direction: str = "Both"


@router.get("/snapshots")
def snapshots(request: Request, kind: str | None = None, db: Session = Depends(get_db), user=Depends(require_roles(LEADERS))):
    q = db.query(models.OperationalSnapshot)
    from app.tenant import is_feature_enabled, get_account_code_from_request
    if not is_feature_enabled(get_account_code_from_request(request), "transport"):
        q = q.filter(models.OperationalSnapshot.kind != "Transport")
    if kind: q = q.filter(models.OperationalSnapshot.kind == kind)
    return [logic.serialize(r) for r in q.order_by(models.OperationalSnapshot.id.desc()).limit(300)]


@router.post("/snapshots")
def create_snapshot(payload: SnapshotInput, request: Request, db: Session = Depends(get_db), user=Depends(require_roles(LEADERS))):
    if payload.effective_until and payload.effective_until < payload.effective_from:
        raise HTTPException(400, "End date must be on or after the effective date.")
    if payload.kind == "Timetable":
        cls = logic.row_or_404(db, models.SchoolClass, payload.scope_id)
        rows = db.query(models.TimetableEntry).filter(models.TimetableEntry.class_id == cls.id).all()
        data = {"label": f"{cls.class_name} {cls.section}", "entries": [logic.serialize(r) for r in rows]}
    elif payload.kind == "Evidence":
        record = logic.row_or_404(db, models.ComplianceTask, payload.scope_id)
        data = {"label": record.task_code, "record": logic.serialize(record)}
        from app.evidence_archive import archive_evidence
        from app.tenant import get_account_code_from_request
        data.update(archive_evidence(record.evidence_link, get_account_code_from_request(request) or "default"))
    elif payload.kind == "Transport":
        require_feature("transport")(request)
        if payload.direction not in {"Morning", "Afternoon", "Both"}: raise HTTPException(400, "Invalid journey direction.")
        route = logic.row_or_404(db, models.TransportRoute, payload.scope_id)
        rows = db.query(models.TransportAssignment).filter(models.TransportAssignment.route_id == route.id,
            models.TransportAssignment.status == "Active").all()
        entries = []
        for row in rows:
            if row.start_date and row.start_date > payload.effective_from: continue
            if row.end_date and row.end_date < payload.effective_from: continue
            if payload.direction != "Both" and row.direction not in {"Both", payload.direction}: continue
            student = logic.row_or_404(db, models.Student, row.student_id)
            entries.append({**logic.serialize(row), "student_name": f"{student.first_name} {student.last_name or ''}"})
        data = {"label": route.route_name, "direction": payload.direction, "passengers": entries}
    else:
        raise HTTPException(400, "Choose Timetable, Evidence or Transport.")
    scope = str(payload.scope_id) + (":" + payload.direction if payload.kind == "Transport" else "")
    version = (db.query(func.max(models.OperationalSnapshot.version)).filter(
        models.OperationalSnapshot.kind == payload.kind, models.OperationalSnapshot.scope == scope).scalar() or 0) + 1
    row = models.OperationalSnapshot(kind=payload.kind, scope=scope, version=version, status="Draft",
        data_json=encode(data), reason=logic.required_text(payload.note), created_by=user.email,
        effective_from=payload.effective_from, effective_until=payload.effective_until)
    db.add(row); db.commit(); db.refresh(row)
    return logic.serialize(row)


@router.post("/snapshots/{snapshot_id}/approve")
def approve_snapshot(snapshot_id: int, payload: Decision, request: Request, db: Session = Depends(get_db),
                     user=Depends(require_roles(LEADERS))):
    row = logic.row_or_404(db, models.OperationalSnapshot, snapshot_id)
    if row.kind == "Transport": require_feature("transport")(request)
    if row.status != "Draft": raise HTTPException(409, "Only a draft can be approved.")
    db.info["change_reason"] = logic.required_text(payload.note)
    row.status = "Approved"; row.approved_by = user.email
    db.commit(); return logic.serialize(row)


@router.get("/snapshots/timetable/effective")
def effective_timetable(class_id: int, on_date: date, db: Session = Depends(get_db),
                        user=Depends(require_roles(ACADEMIC))):
    logic.row_or_404(db, models.SchoolClass, class_id)
    from app.workflows import timetable_on_date
    return timetable_on_date(db, class_id, on_date)


@router.get("/snapshots/{snapshot_id}/attachment")
def archived_attachment(snapshot_id: int, db: Session = Depends(get_db), user=Depends(require_roles(LEADERS))):
    row = logic.row_or_404(db, models.OperationalSnapshot, snapshot_id)
    data = json.loads(row.data_json)
    from app.evidence_archive import archived_file
    from fastapi.responses import FileResponse
    path = archived_file(data.get("archive_file"))
    return FileResponse(path, filename=data.get("filename") or path.name, media_type="application/octet-stream")


class RegisterInput(Decision):
    class_id: int
    attendance_date: date
    period_no: int = Field(default=0, ge=0, le=30)
    notify_absences: bool = False


@router.get("/attendance/registers")
def registers(on_date: date, period_no: int = 0, db: Session = Depends(get_db),
              user=Depends(require_roles(ACADEMIC))):
    classes = db.query(models.SchoolClass).all()
    entries = db.query(models.AttendanceRegister).filter(models.AttendanceRegister.attendance_date == on_date,
        models.AttendanceRegister.period_no == period_no).all()
    by_class = {r.class_id: r for r in entries}
    return [{"class_id": c.id, "class_name": f"{c.class_name} {c.section}",
        "status": by_class[c.id].status if c.id in by_class else "Not submitted",
        "submitted_by": by_class[c.id].submitted_by if c.id in by_class else None} for c in classes]


@router.post("/attendance/registers")
def submit_register(payload: RegisterInput, db: Session = Depends(get_db), user=Depends(require_roles(["Admin", "Teacher"]))):
    cls = logic.row_or_404(db, models.SchoolClass, payload.class_id)
    students = db.query(models.Student).filter(models.Student.class_id == cls.id,
                                              models.Student.student_status == "Active").all()
    rows = db.query(models.Attendance).filter(models.Attendance.student_id.in_([s.id for s in students]),
        models.Attendance.attendance_date == payload.attendance_date,
        models.Attendance.period_no == payload.period_no).all()
    if not students or {s.id for s in students} != {r.student_id for r in rows}:
        raise HTTPException(400, "Complete every student's attendance before submitting.")
    register = db.query(models.AttendanceRegister).filter(models.AttendanceRegister.class_id == cls.id,
        models.AttendanceRegister.attendance_date == payload.attendance_date,
        models.AttendanceRegister.period_no == payload.period_no).first()
    if register and register.status == "Submitted": raise HTTPException(409, "This register is already submitted.")
    if not register:
        register = models.AttendanceRegister(class_id=cls.id, attendance_date=payload.attendance_date,
            period_no=payload.period_no, submitted_by=user.email)
        db.add(register)
    register.status = "Submitted"; register.submitted_by = user.email; register.submitted_at = datetime.utcnow()
    db.info["change_reason"] = logic.required_text(payload.note)
    if payload.notify_absences:
        from app.workflows import notify_family
        by_id = {s.id: s for s in students}
        for row in rows:
            if row.status == "Absent":
                notify_family(db, by_id[row.student_id],
                    f"Attendance for {payload.attendance_date}, {'daily' if not payload.period_no else 'period ' + str(payload.period_no)}: Absent. Contact the class teacher if this needs correction.",
                    "Attendance", row.id)
    db.commit(); return logic.serialize(register)


class DocumentReview(Decision):
    status: str


@router.put("/admissions/documents/{document_id}/review")
def review_document(document_id: int, payload: DocumentReview, db: Session = Depends(get_db),
                    user=Depends(require_roles(LEADERS))):
    if payload.status not in {"Received", "Reviewed", "Needs clarification"}: raise HTTPException(400, "Invalid review state.")
    row = logic.row_or_404(db, models.AdmissionDocument, document_id)
    row.review_status = payload.status; row.review_note = logic.required_text(payload.note); row.reviewed_by = user.email
    db.commit(); return logic.serialize(row)


class Onboarding(Decision):
    student_id: int
    class_id: int
    guardian_user_id: int
    fee_structure_ids: list[int] = Field(default_factory=list, max_length=30)


@router.post("/admissions/onboard")
def complete_onboarding(payload: Onboarding, db: Session = Depends(get_db), user=Depends(require_roles(LEADERS))):
    student = logic.row_or_404(db, models.Student, payload.student_id)
    cls = logic.row_or_404(db, models.SchoolClass, payload.class_id)
    guardian = logic.row_or_404(db, models.User, payload.guardian_user_id)
    if guardian.role != "Parent": raise HTTPException(400, "Select an existing verified Parent account.")
    if not cls.academic_year: raise HTTPException(400, "Set the class academic year first.")
    student.class_id = cls.id; student.class_name = cls.class_name; student.section = cls.section
    enrollment = db.query(models.StudentEnrollment).filter(models.StudentEnrollment.student_id == student.id,
        models.StudentEnrollment.class_id == cls.id, models.StudentEnrollment.academic_year == cls.academic_year).first()
    if not enrollment:
        db.add(models.StudentEnrollment(student_id=student.id, class_id=cls.id, academic_year=cls.academic_year,
            class_name_snapshot=cls.class_name, section_snapshot=cls.section,
            enrollment_status="Active", start_date=student.admission_date or date.today()))
    if not db.query(models.ParentStudentLink).filter(models.ParentStudentLink.user_id == guardian.id,
        models.ParentStudentLink.student_id == student.id).first():
        db.add(models.ParentStudentLink(user_id=guardian.id, student_id=student.id))
    for structure_id in set(payload.fee_structure_ids):
        structure = logic.row_or_404(db, models.FeeStructure, structure_id)
        if structure.academic_year != cls.academic_year or (structure.class_name and structure.class_name != cls.class_name):
            raise HTTPException(400, "The fee structure must apply to the selected class and year.")
        if structure.residential_type and structure.residential_type != student.residential_type:
            raise HTTPException(400, "Fee structure residential type does not match the student.")
        marker = f"onboard-{structure.id}"
        if not db.query(models.Fee).filter(models.Fee.student_id == student.id,
            models.Fee.billing_period == marker).first():
            fee = models.Fee(student_id=student.id, fee_type=structure.fee_type, total_amount=structure.amount,
                paid_amount=0, due_amount=structure.amount, payment_status="Unpaid", academic_year=cls.academic_year,
                class_id=cls.id, class_name_snapshot=cls.class_name, section_snapshot=cls.section,
                due_date=structure.due_date, billing_period=marker)
            from app.concessions import discount_for_fee
            from app.routes.fees import calculate_fee_status
            fee.concession_amount = discount_for_fee(db, student.id, structure.amount,
                fee_type=structure.fee_type, academic_year=cls.academic_year)
            fee.due_amount, fee.payment_status = calculate_fee_status(structure.amount, 0, fee.concession_amount)
            db.add(fee)
    db.info["change_reason"] = logic.required_text(payload.note)
    db.commit()
    return {"student_id": student.id, "message": "Class, enrolment, guardian link and selected fees are ready."}
