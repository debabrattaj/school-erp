"""Admissions CRM: stage-linked tasks, duplicate detection, funnel analytics
and the reminder cron.

Covers what's new on top of the existing inquiry/follow-up CRUD: a stage
change stamps out that stage's default task checklist and logs the
transition, a soft duplicate match flags without ever blocking a real
submission, the funnel/source numbers add up to what the underlying
inquiries and history actually contain, and the once-open staff endpoints
now require auth.
"""

import uuid
from datetime import date, timedelta

import pytest


@pytest.fixture()
def db_session(client):
    from app.database import SessionLocal
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _inquiry_payload(**overrides):
    unique = uuid.uuid4().hex[:8]
    defaults = dict(
        inquiry_no="",
        student_name=f"CRM Applicant {unique}",
        grade_applying="5",
        academic_year="2026-27",
        guardian_name="Test Guardian",
        guardian_phone=f"+9198{unique}",
        guardian_email=f"crm-{unique}@example.com",
        source="Referral",
    )
    defaults.update(overrides)
    return defaults


def _create_inquiry(client, auth, **overrides):
    resp = client.post("/admissions/", json=_inquiry_payload(**overrides), headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


_UPDATE_FIELDS = (
    "inquiry_no", "student_name", "grade_applying", "academic_year",
    "guardian_name", "guardian_phone", "guardian_email", "source",
    "stage", "follow_up_date", "assigned_to", "assigned_to_user_id",
    "converted_student_id", "notes",
)


def _move_stage(client, auth, inquiry, stage):
    payload = {k: inquiry.get(k) for k in _UPDATE_FIELDS}
    payload["stage"] = stage
    resp = client.put(f"/admissions/{inquiry['id']}", json=payload, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _admin_user(client, auth):
    users = client.get("/users/", headers=auth).json()
    return next(u for u in users if u["email"] == "admin@school.com")


# ---------------- stage-change hook ----------------


def test_stage_change_creates_tasks_from_template_and_logs_history(client, auth):
    stages = client.get("/admission-workflow-stages/", headers=auth).json()
    offered = next(s for s in stages if s["name"] == "Offered")
    resp = client.post(
        f"/admission-workflow-stages/{offered['id']}/task-templates",
        json={"stage": "Offered", "title": "Send offer letter", "due_in_days": 1},
        headers=auth,
    )
    assert resp.status_code == 200, resp.text
    template = resp.json()

    inquiry = _create_inquiry(client, auth)
    inquiry = _move_stage(client, auth, inquiry, "Contacted")
    _move_stage(client, auth, inquiry, "Offered")

    tasks = client.get(f"/admissions/{inquiry['id']}/tasks", headers=auth).json()
    assert any(
        t["title"] == "Send offer letter" and t["source_template_id"] == template["id"]
        for t in tasks
    )
    matching = next(t for t in tasks if t["source_template_id"] == template["id"])
    assert matching["due_date"] == str(date.today() + timedelta(days=1))

    history = client.get(f"/admissions/{inquiry['id']}/stage-history", headers=auth).json()
    assert [h["to_stage"] for h in history] == ["Inquiry", "Contacted", "Offered"]


def test_resaving_same_stage_does_not_recreate_tasks(client, auth):
    stages = client.get("/admission-workflow-stages/", headers=auth).json()
    contacted = next(s for s in stages if s["name"] == "Contacted")
    client.post(
        f"/admission-workflow-stages/{contacted['id']}/task-templates",
        json={"stage": "Contacted", "title": "Call guardian"},
        headers=auth,
    )

    inquiry = _create_inquiry(client, auth)
    inquiry = _move_stage(client, auth, inquiry, "Contacted")
    first_count = len(client.get(f"/admissions/{inquiry['id']}/tasks", headers=auth).json())
    assert first_count == 1

    _move_stage(client, auth, inquiry, "Contacted")
    second_count = len(client.get(f"/admissions/{inquiry['id']}/tasks", headers=auth).json())
    assert second_count == 1


def test_stage_rename_keeps_task_templates_attached(client, auth):
    name = f"Custom-{uuid.uuid4().hex[:6]}"
    resp = client.post("/admission-workflow-stages/", json={"name": name}, headers=auth)
    assert resp.status_code == 200, resp.text
    stage = resp.json()

    client.post(
        f"/admission-workflow-stages/{stage['id']}/task-templates",
        json={"stage": stage["name"], "title": "Do the custom thing"},
        headers=auth,
    )

    new_name = f"{name}-Renamed"
    resp = client.put(f"/admission-workflow-stages/{stage['id']}", json={"name": new_name}, headers=auth)
    assert resp.status_code == 200, resp.text

    templates = client.get(f"/admission-workflow-stages/{stage['id']}/task-templates", headers=auth).json()
    assert len(templates) == 1
    assert templates[0]["stage"] == new_name


# ---------------- task CRUD ----------------


def test_task_crud_and_completion(client, auth):
    inquiry = _create_inquiry(client, auth)
    resp = client.post(
        f"/admissions/{inquiry['id']}/tasks",
        json={"title": "Collect documents", "due_date": str(date.today())},
        headers=auth,
    )
    assert resp.status_code == 200, resp.text
    task = resp.json()
    assert task["status"] == "Pending"
    assert task["inquiry_no"] == inquiry["inquiry_no"]

    resp = client.put(f"/admissions/tasks/{task['id']}", json={"status": "Done"}, headers=auth)
    assert resp.status_code == 200, resp.text
    done = resp.json()
    assert done["status"] == "Done"
    assert done["completed_at"] is not None
    assert done["completed_by"] == "admin@school.com"

    resp = client.delete(f"/admissions/tasks/{task['id']}", headers=auth)
    assert resp.status_code == 200, resp.text

    remaining = client.get(f"/admissions/{inquiry['id']}/tasks", headers=auth).json()
    assert not any(t["id"] == task["id"] for t in remaining)


def test_task_queue_filters_by_assignee_and_due_date(client, auth):
    admin_user = _admin_user(client, auth)
    inquiry = _create_inquiry(client, auth)
    overdue_due = str(date.today() - timedelta(days=2))
    future_due = str(date.today() + timedelta(days=10))

    client.post(
        f"/admissions/{inquiry['id']}/tasks",
        json={"title": f"Overdue-{inquiry['id']}", "due_date": overdue_due, "assigned_to_user_id": admin_user["id"]},
        headers=auth,
    )
    client.post(
        f"/admissions/{inquiry['id']}/tasks",
        json={"title": f"Future-{inquiry['id']}", "due_date": future_due, "assigned_to_user_id": admin_user["id"]},
        headers=auth,
    )

    queue = client.get(
        "/admissions/tasks/queue", params={"assigned_to_user_id": admin_user["id"]}, headers=auth
    ).json()
    titles = {t["title"] for t in queue}
    assert f"Overdue-{inquiry['id']}" in titles
    assert f"Future-{inquiry['id']}" in titles

    queue_due_today = client.get(
        "/admissions/tasks/queue",
        params={"assigned_to_user_id": admin_user["id"], "due_before": str(date.today())},
        headers=auth,
    ).json()
    titles_due = {t["title"] for t in queue_due_today}
    assert f"Overdue-{inquiry['id']}" in titles_due
    assert f"Future-{inquiry['id']}" not in titles_due


# ---------------- duplicate detection ----------------


def test_duplicate_detection_flags_matching_phone(client, auth):
    phone = f"+9199{uuid.uuid4().hex[:8]}"
    first = _create_inquiry(client, auth, guardian_phone=phone)
    assert first["possible_duplicate_of_id"] is None

    second = _create_inquiry(client, auth, guardian_phone=phone)
    assert second["possible_duplicate_of_id"] == first["id"]

    candidates = client.get("/admissions/check-duplicate", params={"phone": phone}, headers=auth).json()
    assert any(c["id"] == second["id"] and c["matched_on"] == "phone" for c in candidates)


def test_duplicate_detection_ignores_closed_inquiries(client, auth):
    phone = f"+9198{uuid.uuid4().hex[:8]}"
    first = _create_inquiry(client, auth, guardian_phone=phone)
    _move_stage(client, auth, first, "Lost")

    second = _create_inquiry(client, auth, guardian_phone=phone)
    assert second["possible_duplicate_of_id"] is None


def test_public_submission_flags_duplicate_without_blocking(client, auth, db_session):
    from app.models import AdmissionInquiry

    phone = f"+9197{uuid.uuid4().hex[:8]}"
    first = _create_inquiry(client, auth, guardian_phone=phone)

    resp = client.post("/admissions/public", json={
        "student_name": "Public Duplicate Test", "grade_applying": "3", "academic_year": "2026-27",
        "guardian_name": "Guardian", "guardian_phone": phone,
    })
    assert resp.status_code == 200, resp.text

    second = (
        db_session.query(AdmissionInquiry)
        .filter(AdmissionInquiry.inquiry_no == resp.json()["inquiry_no"])
        .first()
    )
    assert second.possible_duplicate_of_id == first["id"]


# ---------------- analytics ----------------


def test_funnel_reports_current_and_ever_reached_counts(client, auth):
    year = f"FUN-{uuid.uuid4().hex[:6]}"
    a = _create_inquiry(client, auth, academic_year=year)
    _create_inquiry(client, auth, academic_year=year)  # b stays in Inquiry
    a = _move_stage(client, auth, a, "Contacted")
    _move_stage(client, auth, a, "Offered")

    funnel = client.get("/admissions/analytics/funnel", params={"academic_year": year}, headers=auth).json()
    assert funnel["total_inquiries"] == 2

    by_stage = {s["stage"]: s for s in funnel["stages"]}
    assert by_stage["Inquiry"]["ever_reached"] == 2
    assert by_stage["Inquiry"]["current_count"] == 1
    assert by_stage["Contacted"]["ever_reached"] == 1
    assert by_stage["Contacted"]["conversion_from_previous"] == 50.0
    assert by_stage["Offered"]["ever_reached"] == 1
    assert by_stage["Offered"]["current_count"] == 1
    # Conversion is measured against the immediately preceding stage in
    # workflow order, not wherever an inquiry actually came from. This test
    # jumps straight from Contacted to Offered, skipping Visit Scheduled and
    # Assessment, so Offered's "previous" stage (Assessment) has nobody in
    # it -- reporting a made-up rate off a zero denominator would be worse
    # than reporting nothing.
    assert by_stage["Assessment"]["ever_reached"] == 0
    assert by_stage["Offered"]["conversion_from_previous"] is None
    assert by_stage["Inquiry"]["avg_days_in_stage"] is not None
    assert by_stage["Inquiry"]["avg_days_in_stage"] >= 0


def test_sources_reports_conversion_rate(client, auth):
    year = f"SRC-{uuid.uuid4().hex[:6]}"
    a = _create_inquiry(client, auth, academic_year=year, source="Referral")
    _create_inquiry(client, auth, academic_year=year, source="Referral")
    _create_inquiry(client, auth, academic_year=year, source="Website")

    resp = client.post(
        f"/admissions/{a['id']}/convert",
        json={"first_name": "Conv", "admission_no": f"ADMTEST{uuid.uuid4().hex[:6]}"},
        headers=auth,
    )
    assert resp.status_code == 200, resp.text

    sources = client.get("/admissions/analytics/sources", params={"academic_year": year}, headers=auth).json()
    referral = next(s for s in sources if s["source"] == "Referral")
    assert referral["inquiries"] == 2
    assert referral["converted"] == 1
    assert referral["conversion_rate"] == 50.0


# ---------------- auth (regression guard) ----------------


def test_admissions_endpoints_require_auth(client):
    assert client.get("/admissions/").status_code in (401, 403)
    assert client.post("/admissions/", json=_inquiry_payload()).status_code in (401, 403)


# ---------------- reminder cron ----------------


def test_reminder_dry_run_reports_due_items_without_sending(client, auth, db_session):
    from app import admission_reminders

    admin_user = _admin_user(client, auth)
    inquiry = _create_inquiry(client, auth)
    payload = {k: inquiry.get(k) for k in _UPDATE_FIELDS}
    payload["follow_up_date"] = str(date.today() - timedelta(days=1))
    payload["assigned_to_user_id"] = admin_user["id"]
    resp = client.put(f"/admissions/{inquiry['id']}", json=payload, headers=auth)
    assert resp.status_code == 200, resp.text

    result = admission_reminders.run_reminders(db_session, dry_run=True)
    assert result["considered"] >= 1
    assert result["sent"] >= 1

    # A dry run must not have written anything.
    from app.models import CommunicationLog
    sent_logs = (
        db_session.query(CommunicationLog)
        .filter(CommunicationLog.category == "Admission Reminder")
        .count()
    )
    assert sent_logs == 0
