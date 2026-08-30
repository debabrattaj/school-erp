"""Coverage for backend/app/routes/enrichment.py (prefix /enrichment) --
clubs/sports/trips/CAS activity tracking. No tests existed for this module
before this file (site-wide zero-coverage audit).
"""

import uuid


def _payload(unique, **overrides):
    data = {
        "activity_code": f"ACT-TEST-{unique}",
        "activity_name": f"Chess Club {unique}",
        "activity_type": "Club",
        "status": "Planned",
        "capacity": 30,
        "enrolled_count": 0,
        "fee_amount": 0,
    }
    data.update(overrides)
    return data


def test_list_rejects_unauthenticated(client):
    resp = client.get("/enrichment/")
    assert resp.status_code in (401, 403)


def test_create_rejects_unauthenticated(client):
    resp = client.post("/enrichment/", json=_payload(uuid.uuid4().hex[:8]))
    assert resp.status_code in (401, 403)


def test_create_rejects_invalid_activity_type(client, auth):
    unique = uuid.uuid4().hex[:8]
    resp = client.post(
        "/enrichment/",
        json=_payload(unique, activity_type="NotAType"),
        headers=auth,
    )
    assert resp.status_code == 400, resp.text


def test_create_rejects_negative_capacity(client, auth):
    unique = uuid.uuid4().hex[:8]
    resp = client.post(
        "/enrichment/", json=_payload(unique, capacity=-5), headers=auth
    )
    assert resp.status_code == 400, resp.text


def test_full_crud_flow_for_admin(client, auth):
    unique = uuid.uuid4().hex[:8]

    create_resp = client.post("/enrichment/", json=_payload(unique), headers=auth)
    assert create_resp.status_code == 200, create_resp.text
    created = create_resp.json()
    assert created["activity_code"] == f"ACT-TEST-{unique}"
    assert created["activity_name"] == f"Chess Club {unique}"
    assert created["status"] == "Planned"
    activity_id = created["id"]

    list_resp = client.get("/enrichment/", headers=auth)
    assert list_resp.status_code == 200, list_resp.text
    ids = [a["id"] for a in list_resp.json()]
    assert activity_id in ids

    filtered_resp = client.get(
        "/enrichment/", params={"activity_type": "Club"}, headers=auth
    )
    assert filtered_resp.status_code == 200, filtered_resp.text
    assert any(a["id"] == activity_id for a in filtered_resp.json())

    update_resp = client.put(
        f"/enrichment/{activity_id}",
        json=_payload(unique, status="Open", enrolled_count=5),
        headers=auth,
    )
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["status"] == "Open"
    assert update_resp.json()["enrolled_count"] == 5

    delete_resp = client.delete(f"/enrichment/{activity_id}", headers=auth)
    assert delete_resp.status_code == 200, delete_resp.text
    assert delete_resp.json() == {"message": "Activity deleted successfully"}

    after_delete = client.get("/enrichment/", headers=auth)
    assert activity_id not in [a["id"] for a in after_delete.json()]


def test_auto_generated_activity_code_when_blank(client, auth):
    unique = uuid.uuid4().hex[:8]
    resp = client.post(
        "/enrichment/", json=_payload(unique, activity_code=""), headers=auth
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["activity_code"].startswith("ACT-")


def test_update_missing_activity_returns_404(client, auth):
    unique = uuid.uuid4().hex[:8]
    resp = client.put(
        "/enrichment/999999999", json=_payload(unique), headers=auth
    )
    assert resp.status_code == 404, resp.text


def test_delete_missing_activity_returns_404(client, auth):
    resp = client.delete("/enrichment/999999999", headers=auth)
    assert resp.status_code == 404, resp.text
