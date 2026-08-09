"""Scheduled year-end promotion: pure date-check logic
(app/promotion_scheduling.py) plus the academic-years API's schedule
validation.
"""

from datetime import date

import pytest


def test_is_promotion_due_false_when_disabled():
    from app.promotion_scheduling import is_promotion_due
    assert is_promotion_due(False, date(2020, 1, 1), None, date(2026, 8, 9)) is False


def test_is_promotion_due_false_without_date():
    from app.promotion_scheduling import is_promotion_due
    assert is_promotion_due(True, None, None, date(2026, 8, 9)) is False


def test_is_promotion_due_false_once_already_run():
    from app.promotion_scheduling import is_promotion_due
    ran_at = date(2026, 8, 1)
    assert is_promotion_due(True, date(2020, 1, 1), ran_at, date(2026, 8, 9)) is False


def test_is_promotion_due_false_before_date():
    from app.promotion_scheduling import is_promotion_due
    assert is_promotion_due(True, date(2027, 1, 1), None, date(2026, 8, 9)) is False


def test_is_promotion_due_true_on_or_after_date():
    from app.promotion_scheduling import is_promotion_due
    assert is_promotion_due(True, date(2026, 8, 9), None, date(2026, 8, 9)) is True
    assert is_promotion_due(True, date(2026, 1, 1), None, date(2026, 8, 9)) is True


def test_validate_promotion_schedule_noop_when_disabled():
    from app.promotion_scheduling import validate_promotion_schedule
    validate_promotion_schedule(False, None, None)  # must not raise


def test_validate_promotion_schedule_requires_date():
    from app.promotion_scheduling import validate_promotion_schedule
    with pytest.raises(ValueError):
        validate_promotion_schedule(True, None, "2027-28")


def test_validate_promotion_schedule_requires_to_year():
    from app.promotion_scheduling import validate_promotion_schedule
    with pytest.raises(ValueError):
        validate_promotion_schedule(True, date(2027, 4, 1), None)


def test_validate_promotion_schedule_accepts_valid_config():
    from app.promotion_scheduling import validate_promotion_schedule
    validate_promotion_schedule(True, date(2027, 4, 1), "2027-28")  # must not raise


# --- Academic Years API: auto-promote fields are validated end to end ---

def test_academic_year_rejects_auto_promote_without_date(client, auth):
    resp = client.post("/academic-years/", json={
        "name": "SchedPromo-2098-99",
        "auto_promote_enabled": True,
    }, headers=auth)
    assert resp.status_code == 400


def test_academic_year_rejects_auto_promote_to_unknown_year(client, auth):
    resp = client.post("/academic-years/", json={
        "name": "SchedPromo-2099-00",
        "auto_promote_enabled": True,
        "auto_promote_date": "2099-04-01",
        "auto_promote_to_year": "SchedPromo-NoSuchYear",
    }, headers=auth)
    assert resp.status_code == 400


def test_academic_year_accepts_valid_auto_promote_schedule(client, auth):
    target = client.post("/academic-years/", json={"name": "SchedPromo-2100-01"}, headers=auth)
    assert target.status_code == 200, target.text

    resp = client.post("/academic-years/", json={
        "name": "SchedPromo-2099-00-b",
        "auto_promote_enabled": True,
        "auto_promote_date": "2099-04-01",
        "auto_promote_to_year": "SchedPromo-2100-01",
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["auto_promote_enabled"] is True
    assert body["auto_promote_date"] == "2099-04-01"
    assert body["auto_promote_to_year"] == "SchedPromo-2100-01"
    assert body["auto_promoted_at"] is None


def test_promotion_runs_endpoint_requires_auth(client):
    resp = client.get("/academic-years/promotion-runs")
    assert resp.status_code in (401, 403)
