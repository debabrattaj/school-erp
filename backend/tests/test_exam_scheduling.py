"""Scheduled Exam Template auto-creation: pure date math
(app/exam_scheduling.py), the exam-templates API (CRUD + seed-from-year),
and the platform feature-flag gate run_scheduled_exams.py enforces.
"""

from datetime import date

import pytest


def test_is_exam_due_false_without_next_run_date():
    from app.exam_scheduling import is_exam_due
    assert is_exam_due(None, date(2026, 8, 9)) is False


def test_is_exam_due_false_before_date():
    from app.exam_scheduling import is_exam_due
    assert is_exam_due(date(2026, 9, 1), date(2026, 8, 9)) is False


def test_is_exam_due_true_on_or_after_date():
    from app.exam_scheduling import is_exam_due
    assert is_exam_due(date(2026, 8, 9), date(2026, 8, 9)) is True
    assert is_exam_due(date(2026, 1, 1), date(2026, 8, 9)) is True


def test_advance_next_run_same_month_day_next_year():
    from app.exam_scheduling import advance_next_run
    assert advance_next_run(date(2026, 7, 16)) == date(2027, 7, 16)


def test_advance_next_run_feb29_rolls_to_feb28():
    from app.exam_scheduling import advance_next_run
    assert advance_next_run(date(2028, 2, 29)) == date(2029, 2, 28)


def test_validate_schedule_noop_when_inactive():
    from app.exam_scheduling import validate_schedule
    validate_schedule(False, None)  # must not raise


def test_validate_schedule_requires_next_run_date_when_active():
    from app.exam_scheduling import validate_schedule
    with pytest.raises(ValueError):
        validate_schedule(True, None)


def test_validate_schedule_accepts_valid_config():
    from app.exam_scheduling import validate_schedule
    validate_schedule(True, date(2027, 4, 1))  # must not raise


def test_next_occurrence_future_date_this_year():
    from app.exam_scheduling import next_occurrence
    assert next_occurrence(10, 15, date(2026, 8, 9)) == date(2026, 10, 15)


def test_next_occurrence_past_date_rolls_to_next_year():
    from app.exam_scheduling import next_occurrence
    assert next_occurrence(6, 1, date(2026, 8, 9)) == date(2027, 6, 1)


def test_next_occurrence_feb29_in_non_leap_target_year():
    from app.exam_scheduling import next_occurrence
    # 2026 isn't a leap year -> falls back to Feb 28
    assert next_occurrence(2, 29, date(2026, 1, 1)) == date(2026, 2, 28)


# --- Exam Templates API ---

def test_create_exam_template_requires_auth(client):
    resp = client.post("/exam-templates/", json={"name": "SchedExam-NoAuth", "next_run_date": "2099-01-01"})
    assert resp.status_code in (401, 403)


def test_create_exam_template(client, auth):
    resp = client.post("/exam-templates/", json={
        "name": "SchedExam-UnitTest1",
        "exam_type": "Unit Test",
        "next_run_date": "2099-09-15",
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "SchedExam-UnitTest1"
    assert body["next_run_date"] == "2099-09-15"
    assert body["is_active"] is True
    assert body["last_generated_at"] is None


def test_create_exam_template_rejects_duplicate_name(client, auth):
    client.post("/exam-templates/", json={"name": "SchedExam-Dup", "next_run_date": "2099-01-01"}, headers=auth)
    resp = client.post("/exam-templates/", json={"name": "SchedExam-Dup", "next_run_date": "2099-02-02"}, headers=auth)
    assert resp.status_code == 400


def test_create_exam_template_rejects_active_without_date(client, auth):
    resp = client.post("/exam-templates/", json={"name": "SchedExam-NoDate", "is_active": True}, headers=auth)
    assert resp.status_code == 400


def test_create_exam_template_allows_inactive_without_date(client, auth):
    resp = client.post("/exam-templates/", json={"name": "SchedExam-InactiveNoDate", "is_active": False}, headers=auth)
    assert resp.status_code == 200, resp.text


def test_list_exam_templates(client, auth):
    client.post("/exam-templates/", json={"name": "SchedExam-List1", "next_run_date": "2099-05-05"}, headers=auth)
    resp = client.get("/exam-templates/", headers=auth)
    assert resp.status_code == 200
    names = {t["name"] for t in resp.json()}
    assert "SchedExam-List1" in names


def test_update_exam_template(client, auth):
    created = client.post("/exam-templates/", json={"name": "SchedExam-Update", "next_run_date": "2099-01-01"}, headers=auth)
    template_id = created.json()["id"]

    resp = client.put(f"/exam-templates/{template_id}", json={"next_run_date": "2100-03-03", "is_active": False}, headers=auth)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["next_run_date"] == "2100-03-03"
    assert body["is_active"] is False


def test_update_exam_template_rejects_activating_without_date(client, auth):
    created = client.post("/exam-templates/", json={"name": "SchedExam-UpdActivate", "is_active": False}, headers=auth)
    template_id = created.json()["id"]

    resp = client.put(f"/exam-templates/{template_id}", json={"is_active": True}, headers=auth)
    assert resp.status_code == 400


def test_delete_exam_template(client, auth):
    created = client.post("/exam-templates/", json={"name": "SchedExam-Delete", "next_run_date": "2099-01-01"}, headers=auth)
    template_id = created.json()["id"]

    resp = client.delete(f"/exam-templates/{template_id}", headers=auth)
    assert resp.status_code == 200

    listed = client.get("/exam-templates/", headers=auth)
    assert template_id not in {t["id"] for t in listed.json()}


def test_exam_generation_runs_endpoint_requires_auth(client):
    resp = client.get("/exam-templates/generation-runs")
    assert resp.status_code in (401, 403)


def test_seed_from_year_creates_templates_with_future_next_run_date(client, auth):
    year_resp = client.post("/academic-years/", json={
        "name": "SchedExamSeed-2020-21",
        "start_date": "2020-06-01",
    }, headers=auth)
    assert year_resp.status_code == 200, year_resp.text

    exam_resp = client.post("/exams/", json={
        "exam_name": "SchedExamSeed-HalfYearly",
        "exam_type": "Mid Term Exam",
        "exam_date": "2020-10-15",
        "academic_year": "SchedExamSeed-2020-21",
    }, headers=auth)
    assert exam_resp.status_code == 200, exam_resp.text

    seed_resp = client.post("/exam-templates/seed-from-year", json={
        "academic_year": "SchedExamSeed-2020-21",
    }, headers=auth)
    assert seed_resp.status_code == 200, seed_resp.text
    body = seed_resp.json()
    assert body["created_count"] == 1
    assert "SchedExamSeed-HalfYearly" in body["created_names"]

    templates = client.get("/exam-templates/", headers=auth).json()
    template = next(t for t in templates if t["name"] == "SchedExamSeed-HalfYearly")
    # Seeded from a Oct-15-2020 exam, but next_run_date must be a *future*
    # Oct 15 (today, in these tests, is nowhere near 2020) — never the
    # original past date.
    assert template["next_run_date"] > date.today().isoformat()
    assert template["next_run_date"][5:] == "10-15"

    # Re-running the seed must not create a duplicate template.
    seed_again = client.post("/exam-templates/seed-from-year", json={
        "academic_year": "SchedExamSeed-2020-21",
    }, headers=auth)
    assert seed_again.json()["created_count"] == 0
    assert seed_again.json()["skipped_count"] == 1


def test_seed_from_year_404s_on_unknown_year(client, auth):
    resp = client.post("/exam-templates/seed-from-year", json={
        "academic_year": "SchedExamSeed-NoSuchYear",
    }, headers=auth)
    assert resp.status_code == 404


# --- Platform feature gate (app/tenant.py DEFAULT_FEATURES / get_feature_map) ---

def test_exam_auto_generation_defaults_to_disabled():
    from app.tenant import DEFAULT_FEATURES
    assert DEFAULT_FEATURES["exam_auto_generation"] is False


def test_default_account_feature_map_has_it_disabled(client):
    from app.tenant import get_account, get_feature_map
    account = get_account("default")
    features = get_feature_map(account["id"])
    assert features.get("exam_auto_generation", False) is False


def test_is_enabled_for_tenant_defaults_false_for_unknown_account():
    import run_scheduled_exams
    assert run_scheduled_exams.is_enabled_for_tenant("no-such-account") is False


def test_is_enabled_for_tenant_reflects_platform_toggle(client):
    import run_scheduled_exams
    from app.tenant import CentralSessionLocal, get_account
    from app.tenant_models import SchoolFeature

    account = get_account("default")
    assert run_scheduled_exams.is_enabled_for_tenant("default") is False

    db = CentralSessionLocal()
    try:
        row = (
            db.query(SchoolFeature)
            .filter(SchoolFeature.account_id == account["id"], SchoolFeature.feature_key == "exam_auto_generation")
            .first()
        )
        if row:
            row.is_enabled = True
        else:
            db.add(SchoolFeature(account_id=account["id"], feature_key="exam_auto_generation", is_enabled=True))
        db.commit()
    finally:
        db.close()

    try:
        assert run_scheduled_exams.is_enabled_for_tenant("default") is True
    finally:
        # Leave shared "default" account state as found, for any other test
        # (in this file or run after it) that assumes the default-off state.
        db = CentralSessionLocal()
        try:
            row = (
                db.query(SchoolFeature)
                .filter(SchoolFeature.account_id == account["id"], SchoolFeature.feature_key == "exam_auto_generation")
                .first()
            )
            if row:
                row.is_enabled = False
                db.commit()
        finally:
            db.close()
