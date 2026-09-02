"""Coverage for app/routes/roles.py (prefix /roles) -- custom role/permission
CRUD -- which had no tests at all before this file. Cross-checked against
app/permissions.py (MODULE_KEYS / SYSTEM_ROLE_PERMISSIONS), the canonical
permission-key list roles.py validates against.

`roles` holds the built-in system roles too (auto-seeded by
ensure_system_roles on first GET /roles/), shared with the rest of the test
session, so this file only asserts on a uniquely-named custom role it
creates itself, plus behaviour that's true regardless of what else exists
(e.g. "Admin" is always a system role).
"""

import uuid


def _tag():
    return uuid.uuid4().hex[:8]


def test_list_roles_rejects_unauthenticated(client):
    resp = client.get("/roles/")
    assert resp.status_code in (401, 403)


def test_create_role_rejects_unauthenticated(client):
    resp = client.post("/roles/", json={"name": "X", "permissions": {}})
    assert resp.status_code in (401, 403)


def test_modules_endpoint_matches_permissions_module_keys(client, auth):
    from app.permissions import MODULE_KEYS

    resp = client.get("/roles/modules", headers=auth)
    assert resp.status_code == 200
    keys = {m["key"] for m in resp.json()}
    assert keys == MODULE_KEYS


def test_list_roles_seeds_system_roles(client, auth):
    from app.permissions import SYSTEM_ROLE_PERMISSIONS

    resp = client.get("/roles/", headers=auth)
    assert resp.status_code == 200
    roles = resp.json()
    names = {r["name"] for r in roles}
    assert set(SYSTEM_ROLE_PERMISSIONS.keys()) <= names

    admin_role = next(r for r in roles if r["name"] == "Admin")
    assert admin_role["is_system"] is True
    assert admin_role["permissions"] == {"*": "manage"}


def test_create_role_strips_unknown_and_invalid_permission_entries(client, auth):
    tag = _tag()
    name = f"AuditRole-{tag}"

    create_resp = client.post("/roles/", json={
        "name": name,
        "description": "A role created by the test suite",
        "permissions": {
            "students": "view",
            "fees": "manage",
            "not_a_real_module": "manage",
            "attendance": "bogus_level",
        },
    }, headers=auth)
    assert create_resp.status_code == 200, create_resp.text
    role = create_resp.json()
    assert role["name"] == name
    assert role["is_system"] is False
    assert role["permissions"] == {"students": "view", "fees": "manage"}
    role_id = role["id"]

    dup_resp = client.post("/roles/", json={"name": name, "permissions": {}}, headers=auth)
    assert dup_resp.status_code == 400

    empty_name_resp = client.post("/roles/", json={"name": "   ", "permissions": {}}, headers=auth)
    assert empty_name_resp.status_code == 400

    list_resp = client.get("/roles/", headers=auth)
    assert any(r["id"] == role_id for r in list_resp.json())

    update_resp = client.put(f"/roles/{role_id}", json={
        "name": "ignored on update",
        "description": "updated description",
        "permissions": {"fees": "view"},
    }, headers=auth)
    assert update_resp.status_code == 200, update_resp.text
    updated = update_resp.json()
    assert updated["description"] == "updated description"
    assert updated["permissions"] == {"fees": "view"}

    delete_resp = client.delete(f"/roles/{role_id}", headers=auth)
    assert delete_resp.status_code == 200

    list_after = client.get("/roles/", headers=auth)
    assert not any(r["id"] == role_id for r in list_after.json())


def test_system_roles_cannot_be_edited_or_deleted(client, auth):
    roles = client.get("/roles/", headers=auth).json()
    admin_role_id = next(r["id"] for r in roles if r["name"] == "Admin")

    update_resp = client.put(f"/roles/{admin_role_id}", json={
        "name": "Admin", "permissions": {"students": "view"},
    }, headers=auth)
    assert update_resp.status_code == 400

    delete_resp = client.delete(f"/roles/{admin_role_id}", headers=auth)
    assert delete_resp.status_code == 400


def test_update_and_delete_missing_role_404(client, auth):
    update_resp = client.put("/roles/99999999", json={
        "name": "X", "permissions": {},
    }, headers=auth)
    assert update_resp.status_code == 404

    delete_resp = client.delete("/roles/99999999", headers=auth)
    assert delete_resp.status_code == 404


def test_delete_role_still_in_use_is_refused(client, auth):
    tag = _tag()
    name = f"InUseRole-{tag}"

    create_resp = client.post("/roles/", json={
        "name": name, "permissions": {"students": "view"},
    }, headers=auth)
    assert create_resp.status_code == 200, create_resp.text
    role_id = create_resp.json()["id"]

    from app.database import SessionLocal
    from app.models import User
    from app.security import hash_password

    db = SessionLocal()
    try:
        db.add(User(
            name="Role User", email=f"role-user-{tag}@example.com",
            password_hash=hash_password("irrelevant123"), role=name,
        ))
        db.commit()
    finally:
        db.close()

    delete_resp = client.delete(f"/roles/{role_id}", headers=auth)
    assert delete_resp.status_code == 400
