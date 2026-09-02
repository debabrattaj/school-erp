"""Coverage for app/routes/accounts.py (prefix /accounts), which had no
tests at all before this file.

Two very different auth schemes live under this one prefix:
- GET /accounts/me uses the normal tenant `get_current_user` dependency, so
  the regular `auth` (tenant Admin) fixture works there.
- GET/POST /accounts/ and PUT /accounts/{code}/features use
  `require_platform_owner`, a *separate* JWT scope ("scope": "platform")
  issued by POST /platform/auth/login -- a tenant Admin token is rejected
  there (403), so this file logs in as the seeded platform owner
  (owner@schoolerp.com / owner123, see app.routes.platform.ensure_platform_owner)
  to exercise those endpoints.
"""

import uuid

import pytest


def _tag():
    return uuid.uuid4().hex[:8]


@pytest.fixture()
def platform_auth(client):
    resp = client.post("/platform/auth/login", json={
        "email": "owner@schoolerp.com", "password": "owner123",
    })
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_me_rejects_unauthenticated(client):
    resp = client.get("/accounts/me")
    assert resp.status_code in (401, 403)


def test_list_accounts_rejects_unauthenticated(client):
    resp = client.get("/accounts/")
    assert resp.status_code in (401, 403)


def test_list_accounts_rejects_tenant_admin_token(client, auth):
    """A tenant Admin token has no "platform" scope, so it must not pass
    require_platform_owner -- these two auth schemes are meant to be
    completely separate."""
    resp = client.get("/accounts/", headers=auth)
    assert resp.status_code == 403


def test_me_works_for_authenticated_tenant_admin(client, auth):
    resp = client.get("/accounts/me", headers=auth)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["account"]["account_code"] == "default"
    assert "database_url" not in body["account"]
    assert body["user"]["email"] == "admin@school.com"
    assert body["user"]["role"] == "Admin"
    assert isinstance(body["features"], dict)


def test_school_account_full_flow(client, platform_auth):
    tag = _tag()
    code = f"audit{tag}"

    create_resp = client.post("/accounts/", json={
        "school_name": f"Audit School {tag}",
        "account_code": code,
        "admin_email": f"admin-{tag}@example.com",
        "admin_password": "auditpassword123",
    }, headers=platform_auth)
    assert create_resp.status_code == 200, create_resp.text
    created = create_resp.json()
    assert created["account_code"] == code
    assert created["status"] == "Active"
    assert isinstance(created["features"], dict)

    list_resp = client.get("/accounts/", headers=platform_auth)
    assert list_resp.status_code == 200
    assert any(a["account_code"] == code for a in list_resp.json())

    dup_resp = client.post("/accounts/", json={
        "school_name": "Dup",
        "account_code": code,
        "admin_email": f"admin2-{tag}@example.com",
        "admin_password": "auditpassword123",
    }, headers=platform_auth)
    assert dup_resp.status_code == 400

    features_resp = client.put(f"/accounts/{code}/features", json={
        "features": {"fees": False, "library": True},
    }, headers=platform_auth)
    assert features_resp.status_code == 200, features_resp.text
    updated_features = features_resp.json()["features"]
    assert updated_features["fees"] is False
    assert updated_features["library"] is True


def test_update_features_for_unknown_account_404(client, platform_auth):
    resp = client.put("/accounts/does-not-exist-account/features", json={
        "features": {"fees": True},
    }, headers=platform_auth)
    assert resp.status_code == 404
