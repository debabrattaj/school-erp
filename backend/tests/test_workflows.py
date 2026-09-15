"""Workflow acceptance: publication boundaries, money integrity and retained versions."""
from datetime import date
import json
import uuid
import pytest


@pytest.fixture
def school(client):
    from app.database import SessionLocal
    from app import models as m
    from app.security import create_access_token
    db = SessionLocal()
    tag = uuid.uuid4().hex[:10]
    cls = m.SchoolClass(class_name=tag, section="A", academic_year="2026-27")
    other_class = m.SchoolClass(class_name=tag, section="B", academic_year="2026-27")
    db.add_all([cls, other_class]); db.flush()
    student = m.Student(admission_no=tag, first_name="Workflow", class_id=cls.id,
        class_name=cls.class_name, section="A", student_status="Active", residential_type="Day Scholar")
    other = m.Student(admission_no=tag+"-B", first_name="Other", class_id=other_class.id,
        class_name=cls.class_name, section="B", student_status="Active")
    teacher = m.Teacher(employee_no=tag, name="Teacher", email=tag+"Teacher@example.com", class_id=cls.id)
    db.add_all([student, other, teacher]); db.flush()
    exam = m.Exam(exam_name="Workflow exam", exam_date=date(2026,9,1), academic_year="2026-27", class_name=cls.class_name, section="A")
    fee = m.Fee(student_id=student.id, fee_type="Tuition", total_amount=1000, paid_amount=0, due_amount=1000, payment_status="Unpaid")
    db.add_all([exam, fee]); db.flush()
    headers = {}
    users = {}
    for role in ["Parent", "Teacher", "Accounts"]:
        user = m.User(name=role, email=tag+role+"@example.com", password_hash="test-only", role=role)
        db.add(user); db.flush(); users[role] = user
        headers[role] = {"Authorization": "Bearer " + create_access_token({"sub": user.email, "role": role, "account_code": "default", "account_id": 1})}
    db.add(m.ParentStudentLink(user_id=users["Parent"].id, student_id=student.id)); db.commit()
    yield db, m, student, other, cls, exam, fee, headers, users
    db.rollback(); db.close()


def ok(response):
    assert response.status_code == 200, response.text
    return response.json()


def mark(client, auth, student, exam, subject="Maths", status="Scored", obtained=80):
    return ok(client.post("/marks/", headers=auth, json={"student_id": student.id, "exam_id": exam.id,
        "subject_name": subject, "marks_obtained": obtained, "total_marks": 100, "assessment_status": status}))


def draft(client, auth, student, exam):
    return ok(client.post("/workflows/results", headers=auth, json={"student_id": student.id, "exam_id": exam.id, "note": "Prepared for review"}))


def test_results_stay_private_until_reviewed_and_published(client, auth, school):
    db, m, student, other, cls, exam, fee, headers, users = school
    row = mark(client, auth, student, exam)
    released = draft(client, auth, student, exam)
    path = f"/workflows/results/{released['id']}"
    assert client.post(path+"/publish", headers=auth, json={"note": "Premature"}).status_code == 409
    assert ok(client.get(f"/portal/students/{student.id}/marks", headers=headers["Parent"]))["exams"] == []
    ok(client.post(path+"/review", headers=auth, json={"note": "Checked"}))
    assert client.post(path+"/publish", headers=headers["Teacher"], json={"note": "Checked"}).status_code == 403
    ok(client.post(path+"/publish", headers=auth, json={"note": "Approved"}))
    ok(client.put(f"/marks/{row['id']}", headers=auth, json={"marks_obtained": 95}))
    published = ok(client.get(f"/portal/students/{student.id}/marks", headers=headers["Parent"]))["exams"][0]
    assert published["percentage"] == 80
    assert published["version"] == 1
    pdf = client.get(f"/portal/students/{student.id}/results/{released['id']}/pdf", headers=headers["Parent"])
    assert pdf.status_code == 200, pdf.text
    assert pdf.content.startswith(b"%PDF")
    assert client.get(f"/portal/students/{other.id}/results/{released['id']}/pdf", headers=headers["Parent"]).status_code == 403
    second = draft(client, auth, student, exam)
    assert second["version"] == 2
    history = ok(client.get(f"/workflows/history/marks/{row['id']}", headers=auth))
    correction = next(r for r in history if r["action"] == "Updated")
    assert correction["before"]["marks_obtained"] == 80
    assert correction["after"]["marks_obtained"] == 95


def test_result_review_rejects_changed_source(client, auth, school):
    _, _, student, _, _, exam, *_ = school
    row = mark(client, auth, student, exam)
    released = draft(client, auth, student, exam)
    ok(client.put(f"/marks/{row['id']}", headers=auth, json={"marks_obtained": 91}))
    assert client.post(f"/workflows/results/{released['id']}/review", headers=auth, json={"note": "Checked"}).status_code == 409


def test_absent_and_exempt_are_distinct_in_totals(client, auth, school):
    _, _, student, _, _, exam, *_ = school
    mark(client, auth, student, exam)
    mark(client, auth, student, exam, subject="Science", status="Exempt")
    mark(client, auth, student, exam, subject="English", status="Absent")
    report = draft(client, auth, student, exam)["data"]
    assert report["total_obtained"] == 80
    assert report["total_max"] == 200
    assert report["percentage"] == 40


def test_teacher_cannot_read_or_write_other_class(client, auth, school):
    db, m, student, other, cls, exam, fee, headers, users = school
    visible = ok(client.get("/students/", headers=headers["Teacher"]))
    assert student.id in [s["id"] for s in visible]
    assert other.id not in [s["id"] for s in visible]
    response = client.post("/attendance/bulk", headers=headers["Teacher"], json={"attendance_date": "2026-09-10", "class_id": cls.id,
        "entries": [{"student_id": other.id, "status": "Present"}]})
    assert response.status_code in {403, 404}
    assert db.query(m.Attendance).filter(m.Attendance.student_id == other.id).count() == 0
    own = client.post("/attendance/bulk", headers=headers["Teacher"], json={"attendance_date": "2026-09-10", "class_id": cls.id,
        "entries": [{"student_id": student.id, "status": "Present"}]})
    ok(own)


def test_upi_report_is_pending_until_approved_and_not_credited_twice(client, auth, school):
    db, m, student, other, cls, exam, fee, headers, users = school
    ref = uuid.uuid4().hex
    path = f"/portal/students/{student.id}/fees/{fee.id}/payment/upi/confirm"
    case = ok(client.post(path, headers=headers["Parent"], json={"reference": ref}))["case"]
    db.refresh(fee); assert fee.paid_amount == 0
    assert ok(client.post(path, headers=headers["Parent"], json={"reference": ref}))["case"]["id"] == case["id"]
    approve = f"/workflows/payments/cases/{case['id']}/approve"
    assert client.post(approve, headers=headers["Accounts"], json={"note": "Checked"}).status_code == 403
    ok(client.post(approve, headers=auth, json={"note": "Matched bank credit and payer"}))
    assert client.post(approve, headers=auth, json={"note": "Retry"}).status_code == 409
    db.refresh(fee); assert fee.paid_amount == 1000 and fee.due_amount == 0
    statement = f"reference,gross_amount,charges,net_amount,settlement_date\n{ref},1000,10,990,2026-09-10\n"
    imported = ok(client.post("/workflows/payments/settlements/import", headers=auth, files={"file": ("bank.csv", statement, "text/csv")}))
    assert imported["entries"][0]["status"] == "Matched"
    assert ok(client.post("/workflows/payments/settlements/import", headers=auth, files={"file": ("bank.csv", statement, "text/csv")}))["imported"] == 0
    db.refresh(fee); assert fee.paid_amount == 1000


def test_register_corrections_reopen_and_periods_do_not_change_daily_summary(client, auth, school):
    db, m, student, other, cls, exam, fee, headers, users = school
    body = {"attendance_date": "2026-09-10", "class_id": cls.id, "period_no": 0,
            "entries": [{"student_id": student.id, "status": "Absent"}]}
    ok(client.post("/attendance/bulk", headers=auth, json=body))
    submission = {"attendance_date": body["attendance_date"], "class_id": cls.id, "note": "Roster checked", "notify_absences": True}
    ok(client.post("/workflows/attendance/registers", headers=auth, json=submission))
    notices = ok(client.get(f"/portal/students/{student.id}/notices", headers=headers["Parent"]))
    assert len(notices) == 1
    ok(client.post(f"/portal/students/{student.id}/notices/{notices[0]['id']}/acknowledge", headers=headers["Parent"]))
    assert ok(client.get(f"/portal/students/{student.id}/notices", headers=headers["Parent"]))[0]["acknowledged"]
    body["entries"][0]["status"] = "Present"
    ok(client.post("/attendance/bulk", headers=auth, json=body))
    rows = ok(client.get("/workflows/attendance/registers?on_date=2026-09-10", headers=auth))
    assert next(r for r in rows if r["class_id"] == cls.id)["status"] == "Needs review"
    body["period_no"] = 1; body["entries"][0]["status"] = "Absent"
    ok(client.post("/attendance/bulk", headers=auth, json=body))
    report = ok(client.get(f"/portal/students/{student.id}/attendance", headers=headers["Parent"]))
    assert len(report["records"]) == 1 and report["records"][0]["status"] == "Present"


def test_workflow_options_and_onboarding_repeat(client, auth, school):
    db, m, student, other, cls, exam, fee, headers, users = school
    options = ok(client.get("/workflows/options", headers=auth))
    assert student.id in [r["id"] for r in options["students"]]
    structure = m.FeeStructure(fee_type="Admission", amount=120, class_name=cls.class_name, academic_year=cls.academic_year)
    db.add(structure); db.commit()
    payload = {"student_id": student.id, "class_id": cls.id, "guardian_user_id": users["Parent"].id,
               "fee_structure_ids": [structure.id], "note": "Admission checked"}
    ok(client.post("/workflows/admissions/onboard", headers=auth, json=payload))
    ok(client.post("/workflows/admissions/onboard", headers=auth, json=payload))
    assert db.query(m.StudentEnrollment).filter(m.StudentEnrollment.student_id == student.id).count() == 1
    assert db.query(m.Fee).filter(m.Fee.student_id == student.id, m.Fee.billing_period == f"onboard-{structure.id}").count() == 1


def test_timetable_snapshot_does_not_follow_master_edits(client, auth, school):
    db, m, student, other, cls, exam, fee, headers, users = school
    entry = m.TimetableEntry(class_id=cls.id, academic_year="2026-27", day_of_week="Thursday", period_no=1, subject="Maths")
    db.add(entry); db.commit()
    version = ok(client.post("/workflows/snapshots", headers=auth, json={"kind": "Timetable", "scope_id": cls.id,
        "effective_from": "2026-09-01", "note": "Opening timetable"}))
    ok(client.post(f"/workflows/snapshots/{version['id']}/approve", headers=auth, json={"note": "Checked"}))
    entry.subject = "Science"; db.commit()
    result = ok(client.get(f"/workflows/snapshots/timetable/effective?class_id={cls.id}&on_date=2026-09-10", headers=auth))
    assert result["version"] == 1 and result["entries"][0]["subject"] == "Maths"


def test_evidence_copies_bytes_and_rejects_other_school_paths(client, auth, school, tmp_path, monkeypatch):
    db, m, *_ = school
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path / "uploads"))
    monkeypatch.setenv("EVIDENCE_ARCHIVE_DIR", str(tmp_path / "private"))
    source = tmp_path / "uploads" / "default" / "evidence.txt"
    source.parent.mkdir(parents=True); source.write_bytes(b"Original submission")
    record = m.ComplianceTask(task_code=uuid.uuid4().hex, accreditation_body="Internal",
        standard_area="Records", requirement="Keep evidence", evidence_link="/uploads/default/evidence.txt")
    db.add(record); db.commit()
    version = ok(client.post("/workflows/snapshots", headers=auth, json={"kind": "Evidence", "scope_id": record.id,
        "effective_from": "2026-09-01", "note": "Submission copy"}))
    source.write_bytes(b"Changed later")
    response = client.get(f"/workflows/snapshots/{version['id']}/attachment", headers=auth)
    assert response.status_code == 200 and response.content == b"Original submission"
    from app.evidence_archive import local_upload
    assert local_upload("/uploads/another-school/evidence.txt", "default") is None
    assert local_upload("/uploads/default/../evidence.txt", "default") is None
    assert local_upload("https://example.com/evidence.txt", "default") is None


def test_document_review_is_visible_in_admissions(client, auth, school):
    db, m, *_ = school
    inquiry = m.AdmissionInquiry(inquiry_no=uuid.uuid4().hex, student_name="Example", grade_applying="7", academic_year="2026-27",
        guardian_name="Example Parent", guardian_phone="0000000000")
    db.add(inquiry); db.flush()
    doc = m.AdmissionDocument(inquiry_id=inquiry.id, document_type="Report card", file_url="/uploads/default/example.pdf")
    db.add(doc); db.commit()
    ok(client.put(f"/workflows/admissions/documents/{doc.id}/review", headers=auth,
                  json={"status": "Needs clarification", "note": "Please provide the complete page"}))
    rows = ok(client.get(f"/admissions/{inquiry.id}/documents", headers=auth))
    assert rows[0]["review_status"] == "Needs clarification"
    assert rows[0]["review_note"] == "Please provide the complete page"
    assert any(r["id"] == doc.id for r in ok(client.get("/workflows/options", headers=auth))["documents"])


def test_transport_seats_are_counted_per_direction_and_date(school):
    _, m, *_ = school
    from app.routes.transport import peak_passengers
    rows = [m.TransportAssignment(direction="Morning", start_date=date(2026,9,1), end_date=date(2026,9,10)),
            m.TransportAssignment(direction="Afternoon", start_date=date(2026,9,1), end_date=date(2026,9,10)),
            m.TransportAssignment(direction="Both", start_date=date(2026,9,11), end_date=date(2026,9,30))]
    assert peak_passengers(rows) == 1


def test_refund_cannot_remove_more_than_recorded_payment(client, auth, school):
    db, m, student, other, cls, exam, fee, headers, users = school
    case = ok(client.post("/workflows/payments/cases", headers=auth, json={"fee_id": fee.id,
        "kind": "Refund", "reference": uuid.uuid4().hex, "amount": 100, "notes": "External refund request"}))
    response = client.post(f"/workflows/payments/cases/{case['id']}/approve", headers=auth, json={"note": "Checked"})
    assert response.status_code == 400
    db.refresh(fee); assert fee.paid_amount == 0
    assert db.query(m.PaymentCase).filter(m.PaymentCase.id == case['id']).first().status == "Pending"
