"""Test configuration: run the API against throwaway temp databases so tests
never touch real data. Env must be set before app.main is imported.
"""

import os
import tempfile

import pytest

_tmp = tempfile.mkdtemp(prefix="erp_test_")
os.environ["DEFAULT_SCHOOL_DATABASE_URL"] = f"sqlite:///{_tmp}/school.db"
os.environ["CENTRAL_DATABASE_URL"] = f"sqlite:///{_tmp}/central.db"
os.environ.setdefault("SECRET_KEY", "test-secret-key-please-change")
os.environ["UPLOAD_DIR"] = f"{_tmp}/uploads"
os.environ["PROCTORING_UPLOAD_DIR"] = f"{_tmp}/uploads_private/proctoring"
# Keep the login limiter from tripping across the whole test session.
os.environ["LOGIN_MAX_ATTEMPTS"] = "50"
# SEED_DEMO_USERS defaults to off in production; the test suite's admin_token
# fixture below logs in as the seeded demo admin, so tests opt back in
# explicitly rather than relying on the code default.
os.environ.setdefault("SEED_DEMO_USERS", "true")


@pytest.fixture(scope="session")
def client():
    # Import inside the fixture so the temp-DB env above is already set.
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


@pytest.fixture()
def admin_token(client):
    resp = client.post("/auth/login", json={
        "account_code": "default",
        "email": "admin@school.com",
        "password": "admin123",
    })
    assert resp.status_code == 200, resp.text
    return resp.json()["access_token"]


@pytest.fixture()
def auth(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}
