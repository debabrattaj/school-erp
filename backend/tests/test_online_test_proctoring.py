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
