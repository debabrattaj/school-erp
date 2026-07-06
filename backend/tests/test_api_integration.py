"""API integration tests driving the real FastAPI app against temp databases."""

import io


def test_login_success_and_me(client, admin_token):
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "admin@school.com"


def test_login_wrong_password(client):
    resp = client.post("/auth/login", json={
        "account_code": "default", "email": "admin@school.com", "password": "nope",
    })
    assert resp.status_code == 401


def test_protected_requires_auth(client):
    assert client.get("/auth/me").status_code in (401, 403)
    assert client.get("/students/").status_code in (401, 403)


def test_students_list_authorized(client, auth):
    resp = client.get("/students/", headers=auth)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_upload_rejects_bad_type(client, auth):
    files = {"file": ("evil.exe", io.BytesIO(b"MZ"), "application/octet-stream")}
    resp = client.post("/uploads/", headers=auth, files=files)
    assert resp.status_code == 400


def test_upload_accepts_image_and_serves(client, auth):
    png = bytes.fromhex(
        "89504e470d0a1a0a0000000d494844520000000100000001080200000090"
        "7753de0000000c49444154789c6360000002000100ff ff03000006000557"
        "bfabd40000000049454e44ae426082".replace(" ", "")
    )
    files = {"file": ("pic.png", io.BytesIO(png), "image/png")}
    resp = client.post("/uploads/", headers=auth, files=files)
    assert resp.status_code == 200
    url = resp.json()["url"]
    assert url.startswith("/uploads/")
    served = client.get(url)
    assert served.status_code == 200
    assert served.headers["content-type"].startswith("image/")


def test_password_policy_enforced_on_user_create(client, auth):
    # too-short password rejected
    weak = client.post("/users/", headers=auth, json={
        "name": "Temp", "email": "policytest@x.com", "password": "abc", "role": "Teacher",
    })
    assert weak.status_code == 400
    # valid password accepted
    ok = client.post("/users/", headers=auth, json={
        "name": "Temp", "email": "policytest@x.com", "password": "abcd1234", "role": "Teacher",
    })
    assert ok.status_code in (200, 201)


def test_payment_config_disabled_by_default(client, auth):
    resp = client.get("/fees/payment/config", headers=auth)
    assert resp.status_code == 200
    assert resp.json()["enabled"] is False


def test_mfa_setup_and_status(client, auth):
    status = client.get("/auth/mfa/status", headers=auth)
    assert status.status_code == 200
    assert status.json()["mfa_enabled"] is False
    setup = client.post("/auth/mfa/setup", headers=auth)
    assert setup.status_code == 200
    body = setup.json()
    assert body["secret"] and body["otpauth_uri"].startswith("otpauth://")
