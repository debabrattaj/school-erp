"""Coverage for backend/app/routes/platform.py (prefix /platform) -- the
platform-owner console API. This is a SEPARATE auth system from every other
route in this backend: it does not use the tenant `auth` fixture at all.
Login is POST /platform/auth/login with the dev-default PlatformAdmin
credentials auto-seeded at app startup by ensure_platform_owner() (called
from app/main.py). The response's access_token is a Bearer token scoped
"platform", accepted only by require_platform_owner.

Only safe, non-destructive, read-mostly endpoints are exercised here --
no school deletion and no backup/restore -- since `client` is a session-
scoped TestClient sharing one temp DB with every other test file.
No tests existed for this module before this file (zero-coverage audit).
"""

import pytest


PLATFORM_OWNER_EMAIL = "owner@schoolerp.com"
PLATFORM_OWNER_PASSWORD = "owner123"


@pytest.fixture(scope="module")
def platform_auth(client):
    resp = client.post(
        "/platform/auth/login",
        json={"email": PLATFORM_OWNER_EMAIL, "password": PLATFORM_OWNER_PASSWORD},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "access_token" in body
    assert body["owner"]["email"] == PLATFORM_OWNER_EMAIL
    return {"Authorization": f"Bearer {body['access_token']}"}


def test_login_rejects_wrong_password(client):
    resp = client.post(
        "/platform/auth/login",
        json={"email": PLATFORM_OWNER_EMAIL, "password": "definitely-wrong"},
    )
    assert resp.status_code == 401, resp.text


def test_login_succeeds_with_dev_default_credentials(platform_auth):
    # Fixture itself asserts a 200 + access_token; getting here means it worked.
    assert platform_auth["Authorization"].startswith("Bearer ")


def test_schools_rejects_unauthenticated(client):
    resp = client.get("/platform/schools")
    assert resp.status_code in (401, 403)


def test_schools_rejects_tenant_admin_token(client, auth):
    # A regular tenant Admin token must not work against the platform-owner
    # console -- it has no "scope": "platform" claim.
    resp = client.get("/platform/schools", headers=auth)
    assert resp.status_code in (401, 403)


def test_list_schools(client, platform_auth):
    resp = client.get("/platform/schools", headers=platform_auth)
    assert resp.status_code == 200, resp.text
    schools = resp.json()
    assert isinstance(schools, list)
    # The tenant fixtures create at least the "default" account_code school.
    assert any(s["account_code"] == "default" for s in schools)
    for field in ("id", "school_name", "account_code", "status", "features"):
        assert field in schools[0]


def test_feature_catalog(client, platform_auth):
    resp = client.get("/platform/feature-catalog", headers=platform_auth)
    assert resp.status_code == 200, resp.text
    catalog = resp.json()
    assert isinstance(catalog, list)
    assert len(catalog) > 0
    for entry in catalog:
        assert set(entry.keys()) == {"key", "label", "default_enabled"}


def test_list_plans(client, platform_auth):
    resp = client.get("/platform/plans", headers=platform_auth)
    assert resp.status_code == 200, resp.text
    plans = resp.json()
    assert isinstance(plans, list)
    # ensure_default_plans() seeds Basic/Standard/Premium at app startup.
    names = {p["name"] for p in plans}
    assert {"Basic", "Standard", "Premium"}.issubset(names)


def test_list_subscriptions(client, platform_auth):
    resp = client.get("/platform/subscriptions", headers=platform_auth)
    assert resp.status_code == 200, resp.text
    assert isinstance(resp.json(), list)


def test_billing_summary(client, platform_auth):
    resp = client.get("/platform/billing/summary", headers=platform_auth)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    for field in (
        "total_revenue",
        "active_subscriptions",
        "expired_count",
        "expiring_soon_count",
        "expiring_soon",
        "expired",
    ):
        assert field in body


def test_list_notifications(client, platform_auth):
    resp = client.get("/platform/notifications", headers=platform_auth)
    assert resp.status_code == 200, resp.text
    assert isinstance(resp.json(), list)


def test_audit_logs(client, platform_auth):
    resp = client.get("/platform/audit-logs", headers=platform_auth)
    assert resp.status_code == 200, resp.text
    assert isinstance(resp.json(), list)


def test_school_detail(client, platform_auth):
    schools = client.get("/platform/schools", headers=platform_auth).json()
    account_id = next(s["id"] for s in schools if s["account_code"] == "default")

    resp = client.get(f"/platform/schools/{account_id}", headers=platform_auth)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == account_id
    assert body["account_code"] == "default"


def test_school_detail_missing_returns_404(client, platform_auth):
    resp = client.get("/platform/schools/999999999", headers=platform_auth)
    assert resp.status_code == 404, resp.text
