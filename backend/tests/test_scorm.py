"""SCORM: package ingest, the runtime, and the guards on both."""

import io
import uuid
import zipfile

import pytest


@pytest.fixture()
def db_session(client):
    from app.database import SessionLocal
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _set_feature(key: str, enabled: bool):
    from app.tenant import CentralSessionLocal, get_account
    from app.tenant_models import SchoolFeature

    account = get_account("default")
    db = CentralSessionLocal()
    try:
        row = (
            db.query(SchoolFeature)
            .filter(
                SchoolFeature.account_id == account["id"],
                SchoolFeature.feature_key == key,
            )
            .first()
        )
        if row:
            row.is_enabled = enabled
        else:
            db.add(SchoolFeature(account_id=account["id"], feature_key=key, is_enabled=enabled))
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def scorm_enabled(client):
    """SCORM ships off, so every test here switches it on first."""
    _set_feature("scorm", True)
    yield
    _set_feature("scorm", False)


MANIFEST = """<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="COURSE-{ident}" version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>{version}</schemaversion>
  </metadata>
  <organizations default="ORG-1">
    <organization identifier="ORG-1">
      <title>Fractions</title>
      <item identifier="ITEM-1" identifierref="RES-1">
        <title>Fractions</title>
        <adlcp:masteryscore>{mastery}</adlcp:masteryscore>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="RES-1" adlcp:scormtype="sco" href="{href}">
      <file href="{href}"/>
    </resource>
  </resources>
</manifest>
"""


def build_package(version="1.2", mastery="70", href="index.html", prefix="", extra=None):
    """A minimal but genuine SCORM zip."""
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(
            f"{prefix}imsmanifest.xml",
            MANIFEST.format(ident=uuid.uuid4().hex[:8], version=version, mastery=mastery, href=href),
        )
        archive.writestr(f"{prefix}{href}", "<html><body>Fractions</body></html>")
        archive.writestr(f"{prefix}assets/style.css", "body { color: #222; }")
        for name, content in (extra or {}).items():
            archive.writestr(name, content)
    return buffer.getvalue()


def upload_package(client, auth, class_name="SCORM-8", **overrides):
    data = {
        "title": "Fractions", "class_name": class_name, "section": "A",
        "subject": "Maths",
    }
    data.update({k: v for k, v in overrides.items() if k != "content"})
    resp = client.post(
        "/scorm/packages",
        files={"file": ("course.zip", overrides.get("content", build_package()), "application/zip")},
        data=data,
        headers=auth,
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def _make_student(db, class_name="SCORM-8", section="A"):
    from app.models import Student

    student = Student(
        admission_no=f"SC-{uuid.uuid4().hex[:10]}",
        first_name="Sam", last_name="Learner",
        class_name=class_name, section=section,
        student_status="Active", residential_type="Day Scholar",
    )
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


def _student_auth(client, db, student, staff_auth):
    from app.models import User
    from app.security import hash_password

    email = f"scorm-{uuid.uuid4().hex[:8]}@example.com"
    user = User(
        name="Test Student", email=email,
        password_hash=hash_password("StudentPass123!"), role="Student",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    link = client.post(
        "/portal/links", json={"user_id": user.id, "student_id": student.id}, headers=staff_auth
    )
    assert link.status_code == 200, link.text
    login = client.post("/auth/login", json={
        "account_code": "default", "email": email, "password": "StudentPass123!",
    })
    assert login.status_code == 200, login.text
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


@pytest.fixture()
def learner(client, auth, db_session):
    student = _make_student(db_session)
    return student, _student_auth(client, db_session, student, auth)


# --------------------------------------------------------------------------
# Ingest
# --------------------------------------------------------------------------


def test_upload_reads_the_manifest(client, auth):
    package = upload_package(client, auth)
    assert package["scorm_version"] == "1.2"
    assert package["launch_url"] == "index.html"
    assert package["mastery_score"] == 70
    assert package["storage_key"]
    assert package["status"] == "Draft"


def test_upload_accepts_2004_and_a_wrapping_folder(client, auth):
    """Authoring tools routinely zip the folder rather than its contents; the
    package root is wherever the manifest is, not the top of the archive."""
    content = build_package(version="2004 3rd Edition", prefix="Fractions Course/", href="shared/launch.html")
    package = upload_package(client, auth, content=content)
    assert package["scorm_version"] == "2004"
    assert package["launch_url"] == "shared/launch.html"


def test_upload_rejects_what_is_not_a_package(client, auth):
    resp = client.post(
        "/scorm/packages",
        files={"file": ("notes.txt", b"hello", "text/plain")},
        data={"title": "Nope", "class_name": "SCORM-8"},
        headers=auth,
    )
    assert resp.status_code == 400

    resp = client.post(
        "/scorm/packages",
        files={"file": ("course.zip", b"not really a zip", "application/zip")},
        data={"title": "Nope", "class_name": "SCORM-8"},
        headers=auth,
    )
    assert resp.status_code == 400

    empty = io.BytesIO()
    with zipfile.ZipFile(empty, "w") as archive:
        archive.writestr("readme.txt", "no manifest here")
    resp = client.post(
        "/scorm/packages",
        files={"file": ("course.zip", empty.getvalue(), "application/zip")},
        data={"title": "Nope", "class_name": "SCORM-8"},
        headers=auth,
    )
    assert resp.status_code == 400
    assert "imsmanifest" in resp.json()["detail"]


def test_upload_refuses_a_traversal_path(client, auth):
    """Zip slip: a member that would be written outside the package."""
    hostile = build_package(extra={"../../escaped.txt": "pwned"})
    resp = client.post(
        "/scorm/packages",
        files={"file": ("course.zip", hostile, "application/zip")},
        data={"title": "Hostile", "class_name": "SCORM-8"},
        headers=auth,
    )
    assert resp.status_code == 400
    assert "unsafe path" in resp.json()["detail"]


def test_manifest_pointing_at_a_missing_file_is_refused(client, auth):
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(
            "imsmanifest.xml",
            MANIFEST.format(ident="X", version="1.2", mastery="70", href="missing.html"),
        )
    resp = client.post(
        "/scorm/packages",
        files={"file": ("course.zip", buffer.getvalue(), "application/zip")},
        data={"title": "Broken", "class_name": "SCORM-8"},
        headers=auth,
    )
    assert resp.status_code == 400
    assert "not in the package" in resp.json()["detail"]


# --------------------------------------------------------------------------
# Runtime
# --------------------------------------------------------------------------


def test_launch_player_and_commit(client, auth, learner):
    student, student_auth = learner
    package = upload_package(client, auth)
    client.put(f"/scorm/packages/{package['id']}", json={"status": "Published"}, headers=auth)

    resp = client.get(f"/portal/students/{student.id}/scorm", headers=student_auth)
    assert resp.status_code == 200, resp.text
    listed = next(p for p in resp.json() if p["id"] == package["id"])
    assert listed["lesson_status"] == "not attempted"

    resp = client.post(
        f"/portal/students/{student.id}/scorm/{package['id']}/launch", headers=student_auth
    )
    assert resp.status_code == 200, resp.text
    player_url = resp.json()["player_url"]
    token = player_url.split("token=")[1]

    # The player is HTML that carries the API object the content looks for.
    page = client.get(player_url)
    assert page.status_code == 200
    assert "window.API" in page.text
    assert "window.API_1484_11" in page.text

    # The content itself is served from the same origin as the player.
    content = client.get(f"/scorm/content/{package['storage_key']}/index.html")
    assert content.status_code == 200
    assert "Fractions" in content.text

    resp = client.post(
        f"/scorm/commit?token={token}",
        json={
            "lesson_status": "completed", "score_raw": 80,
            "lesson_location": "page-4", "suspend_data": "a|b|c",
            "session_time": "00:12:30", "finished": True,
        },
    )
    assert resp.status_code == 200, resp.text
    saved = resp.json()
    # A mastery score of 70 turns "completed" into a verdict.
    assert saved["lesson_status"] == "passed"
    assert saved["total_time_seconds"] == 750

    resp = client.get(f"/portal/students/{student.id}/scorm", headers=student_auth)
    listed = next(p for p in resp.json() if p["id"] == package["id"])
    assert listed["lesson_status"] == "passed"
    assert listed["score_raw"] == 80


def test_failing_the_mastery_score_is_recorded_as_failed(client, auth, learner):
    student, student_auth = learner
    package = upload_package(client, auth)
    client.put(f"/scorm/packages/{package['id']}", json={"status": "Published"}, headers=auth)

    token = client.post(
        f"/portal/students/{student.id}/scorm/{package['id']}/launch", headers=student_auth
    ).json()["player_url"].split("token=")[1]

    resp = client.post(
        f"/scorm/commit?token={token}",
        json={"lesson_status": "completed", "score_raw": 40, "finished": True},
    )
    assert resp.json()["lesson_status"] == "failed"


def test_session_time_accumulates_across_runs(client, auth, learner):
    student, student_auth = learner
    package = upload_package(client, auth)
    client.put(f"/scorm/packages/{package['id']}", json={"status": "Published"}, headers=auth)
    token = client.post(
        f"/portal/students/{student.id}/scorm/{package['id']}/launch", headers=student_auth
    ).json()["player_url"].split("token=")[1]

    client.post(f"/scorm/commit?token={token}",
                json={"session_time": "00:10:00", "lesson_status": "incomplete", "finished": True})
    # 2004 sends an ISO-8601 duration instead.
    resp = client.post(f"/scorm/commit?token={token}",
                       json={"session_time": "PT1H5M30S", "lesson_status": "incomplete", "finished": True})
    assert resp.json()["total_time_seconds"] == 600 + 3930


def test_a_login_token_cannot_drive_the_runtime(client, auth, learner, admin_token):
    """The launch token is scoped; an ordinary session token must not do."""
    student, student_auth = learner
    package = upload_package(client, auth)
    client.put(f"/scorm/packages/{package['id']}", json={"status": "Published"}, headers=auth)

    resp = client.post(
        f"/scorm/commit?token={admin_token}",
        json={"lesson_status": "passed", "score_raw": 100, "finished": True},
    )
    assert resp.status_code == 401

    resp = client.get(f"/scorm/play?token={admin_token}")
    assert resp.status_code == 401


def test_unpublished_content_cannot_be_launched(client, auth, learner):
    student, student_auth = learner
    package = upload_package(client, auth)  # left as Draft

    resp = client.post(
        f"/portal/students/{student.id}/scorm/{package['id']}/launch", headers=student_auth
    )
    assert resp.status_code == 404


def test_content_route_refuses_traversal(client, auth):
    package = upload_package(client, auth)
    resp = client.get(f"/scorm/content/{package['storage_key']}/../../../etc/passwd")
    assert resp.status_code == 404


def test_deleting_a_package_removes_its_files(client, auth):
    from app import scorm_storage

    package = upload_package(client, auth)
    assert scorm_storage.content_path("default", package["storage_key"], "index.html")

    resp = client.delete(f"/scorm/packages/{package['id']}", headers=auth)
    assert resp.status_code == 200
    assert scorm_storage.content_path("default", package["storage_key"], "index.html") is None


def test_scorm_blocked_when_module_disabled(client, auth, learner):
    student, student_auth = learner
    _set_feature("scorm", False)
    try:
        assert client.get("/scorm/packages", headers=auth).status_code == 403
        assert client.get(
            f"/portal/students/{student.id}/scorm", headers=student_auth
        ).status_code == 403
    finally:
        _set_feature("scorm", True)
