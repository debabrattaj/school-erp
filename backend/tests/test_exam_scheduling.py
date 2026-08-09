"""Scheduled Exam Template auto-creation: pure date math
(app/exam_scheduling.py) plus the exam-templates API (CRUD + seed-from-year).
"""

from datetime import date

import pytest


def test_exam_fire_date():
    from app.exam_scheduling import exam_fire_date
    assert exam_fire_date(date(2026, 6, 1), 45) == date(2026, 7, 16)
    assert exam_fire_date(date(2026, 6, 1), 0) == date(2026, 6, 1)


def test_is_exam_due_false_without_year_start():
    from app.exam_scheduling import is_exam_due
    assert is_exam_due(None, 10, date(2026, 8, 9)) is False


def test_is_exam_due_false_before_fire_date():
    from app.exam_scheduling import is_exam_due
    assert is_exam_due(date(2026, 8, 1), 30, date(2026, 8, 9)) is False


def test_is_exam_due_true_on_or_after_fire_date():
    from app.exam_scheduling import is_exam_due
    assert is_exam_due(date(2026, 6, 1), 45, date(2026, 7, 16)) is True
    assert is_exam_due(date(2026, 6, 1), 45, date(2026, 8, 1)) is True


def test_validate_offset_days_rejects_negative():
    from app.exam_scheduling import validate_offset_days
    with pytest.raises(ValueError):
        validate_offset_days(-1)


def test_validate_offset_days_accepts_zero_and_positive():
    from app.exam_scheduling import validate_offset_days
    validate_offset_days(0)
    validate_offset_days(200)


# --- Exam Templates API ---

def test_create_exam_template_requires_auth(client):
    resp = client.post("/exam-templates/", json={"name": "SchedExam-NoAuth", "offset_days": 10})
    assert resp.status_code in (401, 403)


def test_create_exam_template(client, auth):
    resp = client.post("/exam-templates/", json={
        "name": "SchedExam-UnitTest1",
        "exam_type": "Unit Test",
        "offset_days": 45,
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "SchedExam-UnitTest1"
    assert body["offset_days"] == 45
    assert body["is_active"] is True


def test_create_exam_template_rejects_duplicate_name(client, auth):
    client.post("/exam-templates/", json={"name": "SchedExam-Dup", "offset_days": 10}, headers=auth)
    resp = client.post("/exam-templates/", json={"name": "SchedExam-Dup", "offset_days": 20}, headers=auth)
    assert resp.status_code == 400


def test_create_exam_template_rejects_negative_offset(client, auth):
    resp = client.post("/exam-templates/", json={"name": "SchedExam-BadOffset", "offset_days": -5}, headers=auth)
    assert resp.status_code == 400


def test_list_exam_templates(client, auth):
    client.post("/exam-templates/", json={"name": "SchedExam-List1", "offset_days": 5}, headers=auth)
    resp = client.get("/exam-templates/", headers=auth)
    assert resp.status_code == 200
    names = {t["name"] for t in resp.json()}
    assert "SchedExam-List1" in names


def test_update_exam_template(client, auth):
    created = client.post("/exam-templates/", json={"name": "SchedExam-Update", "offset_days": 5}, headers=auth)
    template_id = created.json()["id"]

    resp = client.put(f"/exam-templates/{template_id}", json={"offset_days": 99, "is_active": False}, headers=auth)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["offset_days"] == 99
    assert body["is_active"] is False


def test_delete_exam_template(client, auth):
    created = client.post("/exam-templates/", json={"name": "SchedExam-Delete", "offset_days": 5}, headers=auth)
    template_id = created.json()["id"]

    resp = client.delete(f"/exam-templates/{template_id}", headers=auth)
    assert resp.status_code == 200

    listed = client.get("/exam-templates/", headers=auth)
    assert template_id not in {t["id"] for t in listed.json()}


def test_exam_generation_runs_endpoint_requires_auth(client):
    resp = client.get("/exam-templates/generation-runs")
    assert resp.status_code in (401, 403)


def test_seed_from_year_creates_templates_from_existing_exams(client, auth):
    year_resp = client.post("/academic-years/", json={
        "name": "SchedExamSeed-2026-27",
        "start_date": "2026-06-01",
    }, headers=auth)
    assert year_resp.status_code == 200, year_resp.text

    exam_resp = client.post("/exams/", json={
        "exam_name": "SchedExamSeed-HalfYearly",
        "exam_type": "Mid Term Exam",
        "exam_date": "2026-10-15",
        "academic_year": "SchedExamSeed-2026-27",
    }, headers=auth)
    assert exam_resp.status_code == 200, exam_resp.text

    seed_resp = client.post("/exam-templates/seed-from-year", json={
        "academic_year": "SchedExamSeed-2026-27",
    }, headers=auth)
    assert seed_resp.status_code == 200, seed_resp.text
    body = seed_resp.json()
    assert body["created_count"] == 1
    assert "SchedExamSeed-HalfYearly" in body["created_names"]

    templates = client.get("/exam-templates/", headers=auth).json()
    template = next(t for t in templates if t["name"] == "SchedExamSeed-HalfYearly")
    assert template["offset_days"] == 136  # Jun 1 -> Oct 15

    # Re-running the seed must not create a duplicate template.
    seed_again = client.post("/exam-templates/seed-from-year", json={
        "academic_year": "SchedExamSeed-2026-27",
    }, headers=auth)
    assert seed_again.json()["created_count"] == 0
    assert seed_again.json()["skipped_count"] == 1


def test_seed_from_year_404s_on_unknown_year(client, auth):
    resp = client.post("/exam-templates/seed-from-year", json={
        "academic_year": "SchedExamSeed-NoSuchYear",
    }, headers=auth)
    assert resp.status_code == 404
