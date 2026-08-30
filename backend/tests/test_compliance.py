"""Coverage for backend/app/routes/compliance.py (prefix /compliance) --
accreditation/compliance task tracking. No tests existed for this module
before this file (site-wide zero-coverage audit).
"""

import uuid


def _payload(unique, **overrides):
    data = {
        "task_code": f"CMP-TEST-{unique}",
        "accreditation_body": "CBSE",
        "standard_area": "Fire Safety",
        "requirement": "Conduct fire drill twice a year",
        "risk_level": "Medium",
        "status": "Open",
    }
    data.update(overrides)
    return data


def test_list_rejects_unauthenticated(client):
    resp = client.get("/compliance/")
    assert resp.status_code in (401, 403)


def test_create_rejects_unauthenticated(client):
    resp = client.post("/compliance/", json=_payload(uuid.uuid4().hex[:8]))
    assert resp.status_code in (401, 403)


def test_create_rejects_invalid_accreditation_body(client, auth):
    unique = uuid.uuid4().hex[:8]
    resp = client.post(
        "/compliance/",
        json=_payload(unique, accreditation_body="NotARealBody"),
        headers=auth,
    )
    assert resp.status_code == 400, resp.text


def test_full_crud_flow_for_admin(client, auth):
    unique = uuid.uuid4().hex[:8]

    create_resp = client.post("/compliance/", json=_payload(unique), headers=auth)
    assert create_resp.status_code == 200, create_resp.text
    created = create_resp.json()
    assert created["task_code"] == f"CMP-TEST-{unique}"
    assert created["accreditation_body"] == "CBSE"
    assert created["status"] == "Open"
    task_id = created["id"]

    list_resp = client.get("/compliance/", headers=auth)
    assert list_resp.status_code == 200, list_resp.text
    ids = [t["id"] for t in list_resp.json()]
    assert task_id in ids

    filtered_resp = client.get(
        "/compliance/", params={"accreditation_body": "CBSE"}, headers=auth
    )
    assert filtered_resp.status_code == 200, filtered_resp.text
    assert any(t["id"] == task_id for t in filtered_resp.json())

    update_resp = client.put(
        f"/compliance/{task_id}",
        json=_payload(unique, status="Completed", risk_level="Low"),
        headers=auth,
    )
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["status"] == "Completed"
    assert update_resp.json()["risk_level"] == "Low"

    delete_resp = client.delete(f"/compliance/{task_id}", headers=auth)
    assert delete_resp.status_code == 200, delete_resp.text
    assert delete_resp.json() == {"message": "Compliance task deleted successfully"}

    after_delete = client.get("/compliance/", headers=auth)
    assert task_id not in [t["id"] for t in after_delete.json()]


def test_auto_generated_task_code_when_blank(client, auth):
    unique = uuid.uuid4().hex[:8]
    resp = client.post(
        "/compliance/", json=_payload(unique, task_code=""), headers=auth
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["task_code"].startswith("CMP-")


def test_update_missing_task_returns_404(client, auth):
    unique = uuid.uuid4().hex[:8]
    resp = client.put(
        "/compliance/999999999", json=_payload(unique), headers=auth
    )
    assert resp.status_code == 404, resp.text


def test_delete_missing_task_returns_404(client, auth):
    resp = client.delete("/compliance/999999999", headers=auth)
    assert resp.status_code == 404, resp.text
