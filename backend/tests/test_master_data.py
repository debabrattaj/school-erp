"""Coverage for app/routes/master_data.py (prefix /master-data), which had
no tests at all before this file.

The `master_data` table is shared with the rest of the test session (seeded
categories like "Class" are used by many other test files), so this file
sticks to a category ("Gender") and a uniquely-tagged value it fully owns,
and never asserts on the full unfiltered list.
"""

import uuid


def _tag():
    return uuid.uuid4().hex[:8]


def test_list_rejects_unauthenticated(client):
    resp = client.get("/master-data/")
    assert resp.status_code in (401, 403)


def test_create_rejects_unauthenticated(client):
    resp = client.post("/master-data/", json={"category": "Gender", "value": "X"})
    assert resp.status_code in (401, 403)


def test_create_rejects_unknown_category(client, auth):
    resp = client.post("/master-data/", json={
        "category": "NotARealCategory", "value": "X",
    }, headers=auth)
    assert resp.status_code == 400


def test_categories_endpoint_lists_allowed_categories(client, auth):
    resp = client.get("/master-data/categories", headers=auth)
    assert resp.status_code == 200
    categories = resp.json()["categories"]
    assert "Gender" in categories
    assert "Class" in categories


def test_master_data_full_flow(client, auth):
    tag = _tag()
    value = f"TestGender-{tag}"

    create_resp = client.post("/master-data/", json={
        "category": "Gender", "value": value, "sort_order": 5,
    }, headers=auth)
    assert create_resp.status_code == 200, create_resp.text
    item = create_resp.json()
    assert item["category"] == "Gender"
    assert item["value"] == value
    assert item["is_active"] is True
    assert item["sort_order"] == 5
    item_id = item["id"]

    dup_resp = client.post("/master-data/", json={
        "category": "Gender", "value": value,
    }, headers=auth)
    assert dup_resp.status_code == 400

    list_resp = client.get("/master-data/", headers=auth)
    assert list_resp.status_code == 200
    assert any(
        i["id"] == item_id and i["category"] == "Gender" and i["value"] == value
        for i in list_resp.json()
    )

    by_category_resp = client.get("/master-data/Gender", headers=auth)
    assert by_category_resp.status_code == 200
    body = by_category_resp.json()
    assert body["category"] == "Gender"
    assert any(v["id"] == item_id and v["value"] == value for v in body["values"])

    updated_value = f"{value}-Updated"
    update_resp = client.put(f"/master-data/{item_id}", json={
        "value": updated_value, "is_active": False,
    }, headers=auth)
    assert update_resp.status_code == 200, update_resp.text
    updated = update_resp.json()
    assert updated["value"] == updated_value
    assert updated["is_active"] is False

    # Inactive items are excluded from the default (active_only) category view.
    active_only_resp = client.get("/master-data/Gender", headers=auth)
    assert not any(v["id"] == item_id for v in active_only_resp.json()["values"])

    include_inactive_resp = client.get(
        "/master-data/Gender", headers=auth, params={"active_only": False}
    )
    assert any(v["id"] == item_id for v in include_inactive_resp.json()["values"])

    delete_resp = client.delete(f"/master-data/{item_id}", headers=auth)
    assert delete_resp.status_code == 200

    gone_resp = client.get(
        "/master-data/Gender", headers=auth, params={"active_only": False}
    )
    assert not any(v["id"] == item_id for v in gone_resp.json()["values"])


def test_update_not_found(client, auth):
    resp = client.put("/master-data/99999999", json={"value": "X"}, headers=auth)
    assert resp.status_code == 404


def test_delete_not_found(client, auth):
    resp = client.delete("/master-data/99999999", headers=auth)
    assert resp.status_code == 404


def test_get_by_unknown_category_400(client, auth):
    resp = client.get("/master-data/NotARealCategory", headers=auth)
    assert resp.status_code == 400
