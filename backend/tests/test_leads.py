"""POST /leads/ — the unauthenticated "Book a demo" endpoint used by the
public marketing site (schoolment.com). Runs in log-only mail mode (no SMTP
configured in tests), consistent with test_admissions_public.py.
"""

import uuid

import pytest


def _payload(**overrides):
    unique = uuid.uuid4().hex[:8]
    defaults = dict(
        name=f"Demo Requester {unique}",
        school=f"Test School {unique}",
        email=f"lead-{unique}@example.com",
        phone="+919800000000",
        message="Interested in a demo",
        page_url="https://schoolment.com/modules/school-fee-management-and-online-payment-system/",
    )
    defaults.update(overrides)
    return defaults


def test_demo_request_succeeds(client):
    resp = client.post("/leads/", json=_payload())
    assert resp.status_code == 200, resp.text
    assert "team will reach out" in resp.json()["message"].lower()


def test_demo_request_honeypot_drops_silently(client, caplog):
    resp = client.post("/leads/", json=_payload(website="http://spam.example"))
    assert resp.status_code == 200, resp.text
    assert "New demo request" not in caplog.text


@pytest.mark.parametrize("field", ["name", "school", "email"])
def test_demo_request_requires_field(client, field):
    payload = _payload(**{field: "   "})
    resp = client.post("/leads/", json=payload)
    assert resp.status_code == 400


def test_demo_request_sends_email_to_info_cc_owner(client, caplog):
    import logging

    with caplog.at_level(logging.INFO, logger="mailer"):
        resp = client.post("/leads/", json=_payload(school="Cc Test School"))
    assert resp.status_code == 200, resp.text
    assert "To=info@schoolment.com" in caplog.text
    assert "Cc=debabrattaj@gmail.com" in caplog.text
    assert "Cc Test School" in caplog.text


def test_demo_request_includes_qualifying_fields_and_ip_in_email(client, caplog):
    import logging

    with caplog.at_level(logging.INFO, logger="mailer"):
        resp = client.post(
            "/leads/",
            json=_payload(
                city="Bhubaneswar",
                student_count="450",
                current_system="Excel / Google Sheets",
            ),
        )
    assert resp.status_code == 200, resp.text
    # None of these ever come back in the API response -- they only ever
    # reach the internal sales-notification email.
    assert "city" not in resp.json()
    assert "Bhubaneswar" in caplog.text
    assert "450" in caplog.text
    assert "Excel / Google Sheets" in caplog.text
    assert "Submitted from IP:" in caplog.text


def test_demo_request_qualifying_fields_are_optional(client):
    # _payload() doesn't set city/student_count/current_system at all --
    # confirms the endpoint doesn't require them.
    resp = client.post("/leads/", json=_payload())
    assert resp.status_code == 200, resp.text
