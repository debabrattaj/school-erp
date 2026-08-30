"""Coverage for app/routes/settings.py (prefix /settings), which had no
tests at all before this file.

`school_settings` is a singleton row shared with the rest of the test
session (other test files create their own SchoolSettings rows directly via
the DB, and GET always returns whatever row `.first()` finds), so this file
avoids asserting on any specific pre-existing value and instead PUTs a
uniquely-tagged value and immediately reads it back within the same test.
"""

import uuid


def _tag():
    return uuid.uuid4().hex[:8]


def test_get_settings_rejects_unauthenticated(client):
    resp = client.get("/settings/")
    assert resp.status_code in (401, 403)


def test_update_settings_rejects_unauthenticated(client):
    resp = client.put("/settings/", json={"school_name": "X"})
    assert resp.status_code in (401, 403)


def test_get_settings_works_for_authenticated_admin(client, auth):
    resp = client.get("/settings/", headers=auth)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "id" in body
    assert isinstance(body["school_name"], str) and body["school_name"]


def test_update_and_read_back_settings(client, auth):
    tag = _tag()
    school_name = f"Audit School {tag}"

    update_resp = client.put("/settings/", json={
        "school_name": school_name,
        "currency": "USD",
        "receipt_prefix": f"RCPT-{tag}",
        "pass_percentage": 33,
    }, headers=auth)
    assert update_resp.status_code == 200, update_resp.text
    updated = update_resp.json()
    assert updated["school_name"] == school_name
    assert updated["currency"] == "USD"
    assert updated["receipt_prefix"] == f"RCPT-{tag}"
    assert updated["pass_percentage"] == 33

    get_resp = client.get("/settings/", headers=auth)
    assert get_resp.status_code == 200
    fetched = get_resp.json()
    assert fetched["school_name"] == school_name
    assert fetched["id"] == updated["id"]
