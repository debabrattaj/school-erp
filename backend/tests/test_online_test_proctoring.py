"""Online exam proctoring add-on: consent, session lifecycle, event ingestion
and auto-submit, teacher review, and the entitlement gate.
"""

import uuid

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


def _set_feature_enabled(feature_key: str, enabled: bool):
    """Flip a school entitlement the same way the Platform Console does."""
    from app.tenant import CentralSessionLocal, get_account
    from app.tenant_models import SchoolFeature

    account = get_account("default")
    db = CentralSessionLocal()
    try:
        row = (
            db.query(SchoolFeature)
            .filter(
                SchoolFeature.account_id == account["id"],
                SchoolFeature.feature_key == feature_key,
            )
            .first()
        )
        if row:
            row.is_enabled = enabled
        else:
            db.add(SchoolFeature(
                account_id=account["id"], feature_key=feature_key, is_enabled=enabled,
            ))
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def proctoring_enabled(client):
    """Both online_tests and its proctoring add-on are sold separately and
    ship disabled -- every test in this module needs both switched on."""
    _set_feature_enabled("online_tests", True)
    _set_feature_enabled("online_test_proctoring", True)
    yield
    _set_feature_enabled("online_test_proctoring", False)
    _set_feature_enabled("online_tests", False)


def _make_student(db, **overrides):
    from app.models import Student
    defaults = dict(
        first_name="Proctor", last_name="Taker", class_name="ProctorTest-8",
        section="A", student_status="Active", residential_type="Day Scholar",
    )
    defaults.update(overrides)
    if "admission_no" not in defaults:
        defaults["admission_no"] = f"PROCTOR-{uuid.uuid4().hex[:10]}"
    student = Student(**defaults)
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


def _make_user_auth(client, db, role, name="Test User"):
    from app.models import User
    from app.security import hash_password

    email = f"{role.lower()}-{uuid.uuid4().hex[:8]}@example.com"
    user = User(name=name, email=email, password_hash=hash_password("TestPass123!"), role=role)
    db.add(user)
    db.commit()
    db.refresh(user)

    login = client.post("/auth/login", json={"account_code": "default", "email": email, "password": "TestPass123!"})
    assert login.status_code == 200, login.text
    auth = {"Authorization": f"Bearer {login.json()['access_token']}"}
    return user, auth


def _link(client, staff_auth, user_id, student_id):
    resp = client.post("/portal/links", json={"user_id": user_id, "student_id": student_id}, headers=staff_auth)
    assert resp.status_code == 200, resp.text


@pytest.fixture()
def student_with_parent(client, auth, db_session):
    student = _make_student(db_session)
    student_user, student_auth = _make_user_auth(client, db_session, "Student", "Proctor Taker")
    parent_user, parent_auth = _make_user_auth(client, db_session, "Parent", "Proctor Guardian")
    _link(client, auth, student_user.id, student.id)
    _link(client, auth, parent_user.id, student.id)
    return student, student_auth, parent_auth


def _create_proctored_test(client, auth, student, policy_id=None, max_violations=None):
    payload = {
        "class_name": student.class_name, "section": student.section,
        "subject": "General Knowledge", "title": "Proctored Quiz",
        "proctoring_enabled": True,
    }
    if policy_id is not None:
        payload["proctoring_policy_id"] = policy_id
    resp = client.post("/online-tests/", json=payload, headers=auth)
    assert resp.status_code == 200, resp.text
    test = resp.json()
    assert test["proctoring_enabled"] is True

    q1 = client.post(f"/online-tests/{test['id']}/questions", json={
        "question_type": "mcq_single", "question_text": "2 + 2 = ?",
        "options": ["3", "4", "5"], "correct_option": "4", "marks": 2,
    }, headers=auth)
    assert q1.status_code == 200, q1.text

    resp = client.put(f"/online-tests/{test['id']}", json={"status": "Published"}, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json(), [q1.json()]


def test_starting_proctored_test_fails_closed_without_addon_flag(client, auth, student_with_parent):
    student, student_auth, _parent_auth = student_with_parent
    test, _questions = _create_proctored_test(client, auth, student)

    _set_feature_enabled("online_test_proctoring", False)
    resp = client.get(f"/portal/students/{student.id}/online-tests/{test['id']}", headers=student_auth)
    assert resp.status_code == 400, resp.text
    assert "not enabled" in resp.json()["detail"].lower()


def test_starting_proctored_test_fails_closed_without_consent(client, auth, student_with_parent):
    student, student_auth, _parent_auth = student_with_parent
    test, _questions = _create_proctored_test(client, auth, student)

    resp = client.get(f"/portal/students/{student.id}/online-tests/{test['id']}", headers=student_auth)
    assert resp.status_code == 403, resp.text
    assert "consent" in resp.json()["detail"].lower()


def test_student_cannot_grant_own_consent(client, auth, student_with_parent):
    student, student_auth, _parent_auth = student_with_parent
    resp = client.post(f"/portal/students/{student.id}/proctoring/consent", headers=student_auth)
    assert resp.status_code == 403, resp.text


def test_guardian_grant_and_revoke_consent_flow(client, auth, student_with_parent):
    student, student_auth, parent_auth = student_with_parent
    test, _questions = _create_proctored_test(client, auth, student)

    resp = client.get(f"/portal/students/{student.id}/proctoring/consent", headers=parent_auth)
    assert resp.status_code == 200, resp.text
    assert resp.json()["granted"] is False

    resp = client.post(f"/portal/students/{student.id}/proctoring/consent", headers=parent_auth)
    assert resp.status_code == 200, resp.text
    assert resp.json()["granted"] is True
    assert resp.json()["consent"]["granted_by"]

    resp = client.get(f"/portal/students/{student.id}/proctoring/consent", headers=parent_auth)
    assert resp.json()["granted"] is True

    # Consent granted -- starting the test now succeeds and opens a session.
    resp = client.get(f"/portal/students/{student.id}/online-tests/{test['id']}", headers=student_auth)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["proctoring"]["enabled"] is True
    assert body["proctoring"]["session_id"] is not None
    # No policy assigned -- strict defaults apply.
    assert body["proctoring"]["require_fullscreen"] is True
    assert body["proctoring"]["block_copy_paste"] is True
    assert body["proctoring"]["max_violations_before_autosubmit"] == 5

    # Revoking removes the ability to start a *new* attempt, but this
    # attempt already exists and is unaffected retroactively.
    resp = client.delete(f"/portal/students/{student.id}/proctoring/consent", headers=parent_auth)
    assert resp.status_code == 200, resp.text
    assert resp.json()["granted"] is False

    resp = client.get(f"/portal/students/{student.id}/proctoring/consent", headers=parent_auth)
    assert resp.json()["granted"] is False


def test_proctoring_policy_crud(client, auth):
    resp = client.post("/online-tests/proctoring-policies", json={
        "name": "Strict Policy", "max_violations_before_autosubmit": 3, "retention_days": 30,
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    policy = resp.json()
    assert policy["max_violations_before_autosubmit"] == 3

    resp = client.get("/online-tests/proctoring-policies", headers=auth)
    assert resp.status_code == 200, resp.text
    assert any(p["id"] == policy["id"] for p in resp.json())

    resp = client.put(f"/online-tests/proctoring-policies/{policy['id']}", json={"retention_days": 60}, headers=auth)
    assert resp.status_code == 200, resp.text
    assert resp.json()["retention_days"] == 60

    resp = client.delete(f"/online-tests/proctoring-policies/{policy['id']}", headers=auth)
    assert resp.status_code == 200, resp.text

    resp = client.get("/online-tests/proctoring-policies", headers=auth)
    assert not any(p["id"] == policy["id"] for p in resp.json())


def test_proctoring_events_logged_severity_never_trusts_client(client, auth, student_with_parent):
    student, student_auth, parent_auth = student_with_parent
    resp = client.post("/online-tests/proctoring-policies", json={
        "name": "Low Threshold", "max_violations_before_autosubmit": 100,
    }, headers=auth)
    policy_id = resp.json()["id"]
    test, questions = _create_proctored_test(client, auth, student, policy_id=policy_id)

    client.post(f"/portal/students/{student.id}/proctoring/consent", headers=parent_auth)
    resp = client.get(f"/portal/students/{student.id}/online-tests/{test['id']}", headers=student_auth)
    assert resp.status_code == 200, resp.text

    resp = client.post(
        f"/portal/students/{student.id}/online-tests/{test['id']}/proctoring/events",
        json={"events": [
            {"event_type": "fullscreen_exit", "detail": "left fullscreen"},
            {"event_type": "context_menu"},  # info severity -- not a violation
        ]},
        headers=student_auth,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["logged"] == 2
    assert body["violation_count"] == 1  # only fullscreen_exit counts; context_menu is "info"
    assert body["auto_submitted"] is False


def test_proctoring_violation_threshold_auto_submits(client, auth, student_with_parent):
    student, student_auth, parent_auth = student_with_parent
    resp = client.post("/online-tests/proctoring-policies", json={
        "name": "Trigger-happy", "max_violations_before_autosubmit": 2,
    }, headers=auth)
    policy_id = resp.json()["id"]
    test, questions = _create_proctored_test(client, auth, student, policy_id=policy_id)

    client.post(f"/portal/students/{student.id}/proctoring/consent", headers=parent_auth)
    client.get(f"/portal/students/{student.id}/online-tests/{test['id']}", headers=student_auth)

    resp = client.post(
        f"/portal/students/{student.id}/online-tests/{test['id']}/proctoring/events",
        json={"events": [
            {"event_type": "tab_blur"},
            {"event_type": "copy_attempt"},
        ]},
        headers=student_auth,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["violation_count"] == 2
    assert body["auto_submitted"] is True

    # The attempt is now closed with the proctoring reason, and answering
    # is refused just like any other closed attempt.
    resp = client.get(f"/portal/students/{student.id}/online-tests/{test['id']}", headers=student_auth)
    attempt = resp.json()["attempt"]
    assert attempt["status"] == "Submitted"
    assert attempt["auto_submitted_reason"] == "proctoring_violation"

    resp = client.post(f"/portal/students/{student.id}/online-tests/{test['id']}/answer",
                       json={"question_id": questions[0]["id"], "selected_option": "4"}, headers=student_auth)
    assert resp.status_code == 400


def test_teacher_review_endpoint_returns_timeline_and_logs_access(client, auth, student_with_parent):
    student, student_auth, parent_auth = student_with_parent
    test, questions = _create_proctored_test(client, auth, student)
    client.post(f"/portal/students/{student.id}/proctoring/consent", headers=parent_auth)
    client.get(f"/portal/students/{student.id}/online-tests/{test['id']}", headers=student_auth)
    client.post(
        f"/portal/students/{student.id}/online-tests/{test['id']}/proctoring/events",
        json={"events": [{"event_type": "paste_attempt"}]},
        headers=student_auth,
    )

    resp = client.get(f"/online-tests/{test['id']}/results", headers=auth)
    assert resp.status_code == 200, resp.text
    result_row = resp.json()[0]
    assert result_row["proctoring_flag_count"] == 1
    assert result_row["proctoring_review_status"] == "Pending"
    attempt_id = result_row["id"]

    resp = client.get(f"/online-tests/{test['id']}/results/{attempt_id}/proctoring", headers=auth)
    assert resp.status_code == 200, resp.text
    detail = resp.json()
    assert detail["flag_count"] == 1
    assert len(detail["events"]) == 1
    assert detail["events"][0]["event_type"] == "paste_attempt"
    assert detail["events"][0]["severity"] == "warning"

    resp = client.put(
        f"/online-tests/{test['id']}/results/{attempt_id}/proctoring/review",
        json={"review_status": "Cleared", "reviewer_notes": "Reviewed the timeline, looks fine."},
        headers=auth,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["review_status"] == "Cleared"

    resp = client.get(f"/online-tests/{test['id']}/results", headers=auth)
    assert resp.json()[0]["proctoring_review_status"] == "Cleared"


def test_non_proctored_attempt_has_no_proctoring_block(client, auth, student_with_parent):
    student, student_auth, _parent_auth = student_with_parent
    resp = client.post("/online-tests/", json={
        "class_name": student.class_name, "section": student.section, "title": "Plain Quiz",
    }, headers=auth)
    test = resp.json()
    client.post(f"/online-tests/{test['id']}/questions", json={
        "question_type": "true_false", "question_text": "T/F?", "correct_option": "True",
    }, headers=auth)
    client.put(f"/online-tests/{test['id']}", json={"status": "Published"}, headers=auth)

    resp = client.get(f"/portal/students/{student.id}/online-tests/{test['id']}", headers=student_auth)
    assert resp.status_code == 200, resp.text
    assert resp.json()["proctoring"] is None


def test_proctoring_endpoints_blocked_when_addon_disabled(client, auth, student_with_parent):
    """online_tests stays enabled; only the proctoring add-on is off. The
    consent, event and policy endpoints must be unreachable -- online tests
    themselves (already covered by test_online_tests.py) are unaffected."""
    student, student_auth, parent_auth = student_with_parent
    _set_feature_enabled("online_test_proctoring", False)

    resp = client.get(f"/portal/students/{student.id}/proctoring/consent", headers=parent_auth)
    assert resp.status_code == 403, resp.text

    resp = client.post(f"/portal/students/{student.id}/proctoring/consent", headers=parent_auth)
    assert resp.status_code == 403, resp.text

    resp = client.get("/online-tests/proctoring-policies", headers=auth)
    assert resp.status_code == 403, resp.text


# ---------------- Phase 2: webcam snapshots ----------------

FAKE_JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"0" * 100 + b"\xff\xd9"  # JPEG magic bytes + padding


def _start_proctored_attempt(client, auth, student_auth, parent_auth, student, require_webcam):
    resp = client.post("/online-tests/proctoring-policies", json={
        "name": f"Webcam Policy {uuid.uuid4().hex[:6]}",
        "require_webcam": require_webcam,
        "max_violations_before_autosubmit": 100,
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    policy_id = resp.json()["id"]

    test, questions = _create_proctored_test(client, auth, student, policy_id=policy_id)
    client.post(f"/portal/students/{student.id}/proctoring/consent", headers=parent_auth)

    resp = client.get(f"/portal/students/{student.id}/online-tests/{test['id']}", headers=student_auth)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["proctoring"]["require_webcam"] is require_webcam
    return test, questions


def test_snapshot_upload_rejected_without_webcam_policy(client, auth, student_with_parent):
    student, student_auth, parent_auth = student_with_parent
    test, _questions = _start_proctored_attempt(client, auth, student_auth, parent_auth, student, require_webcam=False)

    resp = client.post(
        f"/portal/students/{student.id}/online-tests/{test['id']}/proctoring/snapshot",
        files={"file": ("snap.jpg", FAKE_JPEG_BYTES, "image/jpeg")},
        headers=student_auth,
    )
    assert resp.status_code == 400, resp.text
    assert "does not require webcam" in resp.json()["detail"].lower()


def test_snapshot_upload_rejected_wrong_content_type(client, auth, student_with_parent):
    student, student_auth, parent_auth = student_with_parent
    test, _questions = _start_proctored_attempt(client, auth, student_auth, parent_auth, student, require_webcam=True)

    resp = client.post(
        f"/portal/students/{student.id}/online-tests/{test['id']}/proctoring/snapshot",
        files={"file": ("snap.png", FAKE_JPEG_BYTES, "image/png")},
        headers=student_auth,
    )
    assert resp.status_code == 400, resp.text
    assert "jpeg" in resp.json()["detail"].lower()


def test_snapshot_upload_rejected_oversized(client, auth, student_with_parent):
    student, student_auth, parent_auth = student_with_parent
    test, _questions = _start_proctored_attempt(client, auth, student_auth, parent_auth, student, require_webcam=True)

    oversized = b"\xff\xd8\xff\xe0" + b"0" * (2 * 1024 * 1024 + 1)
    resp = client.post(
        f"/portal/students/{student.id}/online-tests/{test['id']}/proctoring/snapshot",
        files={"file": ("snap.jpg", oversized, "image/jpeg")},
        headers=student_auth,
    )
    assert resp.status_code == 400, resp.text
    assert "too large" in resp.json()["detail"].lower()


def test_snapshot_upload_accepted_viewable_by_teacher_and_access_logged(client, auth, student_with_parent, db_session):
    student, student_auth, parent_auth = student_with_parent
    test, _questions = _start_proctored_attempt(client, auth, student_auth, parent_auth, student, require_webcam=True)

    resp = client.post(
        f"/portal/students/{student.id}/online-tests/{test['id']}/proctoring/snapshot",
        files={"file": ("snap.jpg", FAKE_JPEG_BYTES, "image/jpeg")},
        headers=student_auth,
    )
    assert resp.status_code == 200, resp.text
    snapshot = resp.json()
    assert snapshot["content_type"] == "image/jpeg"
    assert snapshot["captured_at"]

    resp = client.get(f"/online-tests/{test['id']}/results", headers=auth)
    attempt_id = resp.json()[0]["id"]

    resp = client.get(f"/online-tests/{test['id']}/results/{attempt_id}/proctoring", headers=auth)
    assert resp.status_code == 200, resp.text
    detail = resp.json()
    assert len(detail["snapshots"]) == 1
    assert detail["snapshots"][0]["id"] == snapshot["id"]
    assert "storage_path" not in detail["snapshots"][0]

    resp = client.get(
        f"/online-tests/{test['id']}/results/{attempt_id}/proctoring/snapshots/{snapshot['id']}",
        headers=auth,
    )
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"] == "image/jpeg"
    assert resp.content == FAKE_JPEG_BYTES

    from app.models import ProctoringAccessLog
    logs = db_session.query(ProctoringAccessLog).filter(ProctoringAccessLog.action == "view_snapshot").all()
    assert len(logs) == 1
    assert logs[0].viewed_by  # the teacher's email, snapshotted


def test_snapshot_view_blocked_for_parent(client, auth, student_with_parent):
    student, student_auth, parent_auth = student_with_parent
    test, _questions = _start_proctored_attempt(client, auth, student_auth, parent_auth, student, require_webcam=True)

    resp = client.post(
        f"/portal/students/{student.id}/online-tests/{test['id']}/proctoring/snapshot",
        files={"file": ("snap.jpg", FAKE_JPEG_BYTES, "image/jpeg")},
        headers=student_auth,
    )
    snapshot_id = resp.json()["id"]

    resp = client.get(f"/online-tests/{test['id']}/results", headers=auth)
    attempt_id = resp.json()[0]["id"]

    resp = client.get(
        f"/online-tests/{test['id']}/results/{attempt_id}/proctoring/snapshots/{snapshot_id}",
        headers=parent_auth,
    )
    assert resp.status_code == 403, resp.text


def test_retention_purges_snapshot_file_but_keeps_row(client, auth, student_with_parent, db_session):
    student, student_auth, parent_auth = student_with_parent
    test, _questions = _start_proctored_attempt(client, auth, student_auth, parent_auth, student, require_webcam=True)

    resp = client.post(
        f"/portal/students/{student.id}/online-tests/{test['id']}/proctoring/snapshot",
        files={"file": ("snap.jpg", FAKE_JPEG_BYTES, "image/jpeg")},
        headers=student_auth,
    )
    snapshot_id = resp.json()["id"]

    import os
    from datetime import datetime, timedelta
    from app import proctoring_storage
    from app.models import ProctoringSession, ProctoringSnapshot

    snapshot = db_session.query(ProctoringSnapshot).filter(ProctoringSnapshot.id == snapshot_id).first()
    absolute_path = proctoring_storage.absolute_path_for(snapshot.storage_path)
    assert os.path.isfile(absolute_path)

    session = db_session.query(ProctoringSession).filter(ProctoringSession.id == snapshot.session_id).first()
    session.retention_expires_at = datetime.utcnow() - timedelta(days=1)
    db_session.commit()

    import run_proctoring_retention as retention
    from app.tenant import DEFAULT_SCHOOL_DATABASE_URL
    result = retention.run_tenant(DEFAULT_SCHOOL_DATABASE_URL)
    assert result["snapshots_purged"] == 1

    assert not os.path.isfile(absolute_path)
    db_session.refresh(snapshot)
    assert snapshot.storage_path is None

    resp = client.get(f"/online-tests/{test['id']}/results", headers=auth)
    attempt_id = resp.json()[0]["id"]
    resp = client.get(f"/online-tests/{test['id']}/results/{attempt_id}/proctoring", headers=auth)
    assert len(resp.json()["snapshots"]) == 1  # the row survives retention

    resp = client.get(
        f"/online-tests/{test['id']}/results/{attempt_id}/proctoring/snapshots/{snapshot_id}",
        headers=auth,
    )
    assert resp.status_code == 404, resp.text


# ---------------- On-device face detection (no_face / multiple_faces) ----------------


def test_face_detection_events_get_correct_severity_and_confidence(client, auth, student_with_parent):
    """no_face/multiple_faces arrive through the same generic events endpoint
    as the browser signals -- severity is still decided server-side, and a
    client-reported confidence is stored but never influences that decision."""
    student, student_auth, parent_auth = student_with_parent
    resp = client.post("/online-tests/proctoring-policies", json={
        "name": "Face Detection Policy", "max_violations_before_autosubmit": 100,
    }, headers=auth)
    policy_id = resp.json()["id"]
    test, _questions = _create_proctored_test(client, auth, student, policy_id=policy_id)

    client.post(f"/portal/students/{student.id}/proctoring/consent", headers=parent_auth)
    client.get(f"/portal/students/{student.id}/online-tests/{test['id']}", headers=student_auth)

    resp = client.post(
        f"/portal/students/{student.id}/online-tests/{test['id']}/proctoring/events",
        json={"events": [
            {"event_type": "no_face", "confidence": 0.87},
            {"event_type": "multiple_faces", "confidence": 0.42, "detail": "2 faces detected"},
        ]},
        headers=student_auth,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["logged"] == 2
    assert body["violation_count"] == 2  # both no_face and multiple_faces count as violations

    resp = client.get(f"/online-tests/{test['id']}/results", headers=auth)
    attempt_id = resp.json()[0]["id"]
    resp = client.get(f"/online-tests/{test['id']}/results/{attempt_id}/proctoring", headers=auth)
    events = {e["event_type"]: e for e in resp.json()["events"]}

    assert events["no_face"]["severity"] == "warning"
    assert events["no_face"]["confidence"] == pytest.approx(0.87)
    assert events["multiple_faces"]["severity"] == "critical"
    assert events["multiple_faces"]["confidence"] == pytest.approx(0.42)
    assert events["multiple_faces"]["detail"] == "2 faces detected"
    assert events["no_face"]["source"] == "client"


def test_face_detection_confidence_is_clamped_to_valid_range(client, auth, student_with_parent):
    student, student_auth, parent_auth = student_with_parent
    test, _questions = _create_proctored_test(client, auth, student)

    client.post(f"/portal/students/{student.id}/proctoring/consent", headers=parent_auth)
    client.get(f"/portal/students/{student.id}/online-tests/{test['id']}", headers=student_auth)

    client.post(
        f"/portal/students/{student.id}/online-tests/{test['id']}/proctoring/events",
        json={"events": [
            {"event_type": "no_face", "confidence": 5.0},
            {"event_type": "no_face", "confidence": -1.0},
        ]},
        headers=student_auth,
    )

    resp = client.get(f"/online-tests/{test['id']}/results", headers=auth)
    attempt_id = resp.json()[0]["id"]
    resp = client.get(f"/online-tests/{test['id']}/results/{attempt_id}/proctoring", headers=auth)
    confidences = sorted(e["confidence"] for e in resp.json()["events"])
    assert confidences == [0.0, 1.0]
