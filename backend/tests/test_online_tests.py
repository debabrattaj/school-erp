"""Online tests: staff authoring/results (test_online_tests.py) plus the
student-facing take/submit flow through the portal.
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


def _set_online_tests_enabled(enabled: bool):
    """Flip the online_tests entitlement the same way the Platform Console does."""
    from app.tenant import CentralSessionLocal, get_account
    from app.tenant_models import SchoolFeature

    account = get_account("default")
    db = CentralSessionLocal()
    try:
        row = (
            db.query(SchoolFeature)
            .filter(
                SchoolFeature.account_id == account["id"],
                SchoolFeature.feature_key == "online_tests",
            )
            .first()
        )
        if row:
            row.is_enabled = enabled
        else:
            db.add(SchoolFeature(
                account_id=account["id"], feature_key="online_tests", is_enabled=enabled,
            ))
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def online_tests_enabled(client):
    """Online Tests is sold separately and ships disabled, so every test in this
    module has to switch it on first -- exactly as a real school would need the
    platform owner to. test_online_tests_blocked_when_module_disabled turns it
    back off to prove the gate bites.
    """
    _set_online_tests_enabled(True)
    yield
    _set_online_tests_enabled(False)


def _make_student(db, **overrides):
    from app.models import Student
    defaults = dict(
        first_name="Quiz", last_name="Taker", class_name="QuizTest-8",
        section="A", student_status="Active", residential_type="Day Scholar",
    )
    defaults.update(overrides)
    if "admission_no" not in defaults:
        defaults["admission_no"] = f"QUIZ-{uuid.uuid4().hex[:10]}"
    student = Student(**defaults)
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


def _make_student_auth(client, db, student):
    """A Student-role user linked to the given student."""
    from app.models import User
    from app.security import hash_password

    email = f"student-{uuid.uuid4().hex[:8]}@example.com"
    user = User(name="Test Student", email=email, password_hash=hash_password("StudentPass123!"), role="Student")
    db.add(user)
    db.commit()
    db.refresh(user)

    login = client.post("/auth/login", json={"account_code": "default", "email": email, "password": "StudentPass123!"})
    assert login.status_code == 200, login.text
    auth = {"Authorization": f"Bearer {login.json()['access_token']}"}
    return user, auth


def _link(client, staff_auth, user_id, student_id):
    resp = client.post("/portal/links", json={"user_id": user_id, "student_id": student_id}, headers=staff_auth)
    assert resp.status_code == 200, resp.text


@pytest.fixture()
def linked_student(client, auth, db_session):
    student = _make_student(db_session)
    student_user, student_auth = _make_student_auth(client, db_session, student)
    _link(client, auth, student_user.id, student.id)
    return student, student_auth


def _create_published_test(client, auth, student, duration=None):
    resp = client.post("/online-tests/", json={
        "class_name": student.class_name, "section": student.section,
        "subject": "General Knowledge", "title": "Quick Quiz",
        "duration_minutes": duration,
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    test = resp.json()

    q1 = client.post(f"/online-tests/{test['id']}/questions", json={
        "question_type": "mcq_single", "question_text": "2 + 2 = ?",
        "options": ["3", "4", "5"], "correct_option": "4", "marks": 2,
    }, headers=auth)
    assert q1.status_code == 200, q1.text

    q2 = client.post(f"/online-tests/{test['id']}/questions", json={
        "question_type": "true_false", "question_text": "The sky is blue.",
        "correct_option": "True", "marks": 1,
    }, headers=auth)
    assert q2.status_code == 200, q2.text

    resp = client.put(f"/online-tests/{test['id']}", json={"status": "Published"}, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json(), [q1.json(), q2.json()]


def test_create_test_add_questions_and_publish(client, auth, linked_student):
    student, _ = linked_student
    test, questions = _create_published_test(client, auth, student)
    assert test["status"] == "Published"
    assert test["question_count"] == 2
    assert test["total_marks"] == 3


def test_question_validation_rejects_bad_correct_option(client, auth, linked_student):
    student, _ = linked_student
    resp = client.post("/online-tests/", json={"class_name": student.class_name, "title": "Bad Test"}, headers=auth)
    test_id = resp.json()["id"]

    resp = client.post(f"/online-tests/{test_id}/questions", json={
        "question_type": "mcq_single", "question_text": "Pick one",
        "options": ["A", "B"], "correct_option": "C",
    }, headers=auth)
    assert resp.status_code == 400

    resp = client.post(f"/online-tests/{test_id}/questions", json={
        "question_type": "true_false", "question_text": "T/F?",
        "correct_option": "Maybe",
    }, headers=auth)
    assert resp.status_code == 400


def test_student_take_and_submit_flow_grades_correctly(client, auth, linked_student):
    student, student_auth = linked_student
    test, questions = _create_published_test(client, auth, student)
    test_id = test["id"]
    q1_id, q2_id = questions[0]["id"], questions[1]["id"]

    # Listing shows it as open with no attempt yet.
    resp = client.get(f"/portal/students/{student.id}/online-tests", headers=student_auth)
    assert resp.status_code == 200, resp.text
    listing = next(t for t in resp.json() if t["id"] == test_id)
    assert listing["is_open"] is True
    assert listing["attempt_status"] is None

    # Starting the test creates an in-progress attempt; correct answers are hidden.
    resp = client.get(f"/portal/students/{student.id}/online-tests/{test_id}", headers=student_auth)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["attempt"]["status"] == "In Progress"
    assert all("correct_option" not in q for q in body["questions"])

    # Submit one right, one wrong answer.
    resp = client.post(f"/portal/students/{student.id}/online-tests/{test_id}/submit", json={
        "answers": [
            {"question_id": q1_id, "selected_option": "4"},
            {"question_id": q2_id, "selected_option": "False"},
        ],
    }, headers=student_auth)
    assert resp.status_code == 200, resp.text
    result = resp.json()
    assert result["status"] == "Submitted"
    assert result["score"] == 2
    assert result["max_score"] == 3

    # Re-submitting is rejected.
    resp = client.post(f"/portal/students/{student.id}/online-tests/{test_id}/submit", json={"answers": []}, headers=student_auth)
    assert resp.status_code == 400

    # Reviewing after submission reveals correct answers and per-question outcome.
    resp = client.get(f"/portal/students/{student.id}/online-tests/{test_id}", headers=student_auth)
    review = resp.json()
    q1_review = next(q for q in review["questions"] if q["id"] == q1_id)
    assert q1_review["correct_option"] == "4"
    assert q1_review["is_correct"] is True
    q2_review = next(q for q in review["questions"] if q["id"] == q2_id)
    assert q2_review["is_correct"] is False


def test_parent_cannot_start_or_submit_test(client, auth, db_session):
    """Only the Student-role account takes the test; a Parent can view listings
    but not start an attempt or submit answers on the student's behalf."""
    student = _make_student(db_session, admission_no=f"PARENTVIEW-{uuid.uuid4().hex[:8]}")
    from app.models import User
    from app.security import hash_password

    parent_email = f"parent-{uuid.uuid4().hex[:8]}@example.com"
    parent = User(name="Quiz Parent", email=parent_email, password_hash=hash_password("ParentPass123!"), role="Parent")
    db_session.add(parent)
    db_session.commit()
    db_session.refresh(parent)
    _link(client, auth, parent.id, student.id)

    login = client.post("/auth/login", json={"account_code": "default", "email": parent_email, "password": "ParentPass123!"})
    parent_auth = {"Authorization": f"Bearer {login.json()['access_token']}"}

    test, _questions = _create_published_test(client, auth, student)

    resp = client.get(f"/portal/students/{student.id}/online-tests/{test['id']}", headers=parent_auth)
    assert resp.status_code == 403

    resp = client.post(f"/portal/students/{student.id}/online-tests/{test['id']}/submit", json={"answers": []}, headers=parent_auth)
    assert resp.status_code == 403


def test_draft_test_not_visible_to_student(client, auth, linked_student):
    student, student_auth = linked_student
    resp = client.post("/online-tests/", json={"class_name": student.class_name, "title": "Still Draft"}, headers=auth)
    test_id = resp.json()["id"]

    resp = client.get(f"/portal/students/{student.id}/online-tests/{test_id}", headers=student_auth)
    assert resp.status_code == 404

    resp = client.get(f"/portal/students/{student.id}/online-tests", headers=student_auth)
    assert not any(t["id"] == test_id for t in resp.json())


def test_results_endpoint_lists_student_attempts(client, auth, linked_student):
    student, student_auth = linked_student
    test, questions = _create_published_test(client, auth, student)
    client.get(f"/portal/students/{student.id}/online-tests/{test['id']}", headers=student_auth)
    client.post(f"/portal/students/{student.id}/online-tests/{test['id']}/submit", json={
        "answers": [{"question_id": questions[0]["id"], "selected_option": "4"}],
    }, headers=student_auth)

    resp = client.get(f"/online-tests/{test['id']}/results", headers=auth)
    assert resp.status_code == 200, resp.text
    results = resp.json()
    assert len(results) == 1
    assert results[0]["student_name"] == "Quiz Taker"
    assert results[0]["status"] == "Submitted"


def test_online_test_requires_manager_role(client, db_session):
    from app.models import User
    from app.security import hash_password

    parent_email = f"parent-{uuid.uuid4().hex[:8]}@example.com"
    parent = User(name="Rando Parent", email=parent_email, password_hash=hash_password("ParentPass123!"), role="Parent")
    db_session.add(parent)
    db_session.commit()

    login = client.post("/auth/login", json={"account_code": "default", "email": parent_email, "password": "ParentPass123!"})
    parent_auth = {"Authorization": f"Bearer {login.json()['access_token']}"}

    resp = client.post("/online-tests/", json={"class_name": "X", "title": "Nope"}, headers=parent_auth)
    assert resp.status_code == 403


# ---------------- Strictness: server-side deadline, saved answers, shuffle ----------------


def _backdate_attempt(db, test_id, student_id, minutes):
    """Move an attempt's start time into the past so its deadline has passed."""
    from datetime import datetime, timedelta
    from app.models import OnlineTestAttempt

    attempt = (
        db.query(OnlineTestAttempt)
        .filter(OnlineTestAttempt.test_id == test_id, OnlineTestAttempt.student_id == student_id)
        .first()
    )
    attempt.started_at = datetime.utcnow() - timedelta(minutes=minutes)
    db.commit()
    return attempt


def test_answers_save_mid_attempt_and_survive_reload(client, auth, linked_student):
    student, student_auth = linked_student
    test, questions = _create_published_test(client, auth, student)
    test_id, q1_id = test["id"], questions[0]["id"]

    client.get(f"/portal/students/{student.id}/online-tests/{test_id}", headers=student_auth)

    resp = client.post(f"/portal/students/{student.id}/online-tests/{test_id}/answer",
                       json={"question_id": q1_id, "selected_option": "4"}, headers=student_auth)
    assert resp.status_code == 200, resp.text

    # Reloading an in-progress attempt returns what was saved, still ungraded.
    resp = client.get(f"/portal/students/{student.id}/online-tests/{test_id}", headers=student_auth)
    body = resp.json()
    assert body["attempt"]["status"] == "In Progress"
    q1 = next(q for q in body["questions"] if q["id"] == q1_id)
    assert q1["selected_option"] == "4"
    assert q1["is_correct"] is None
    assert "correct_option" not in q1


def test_late_submission_is_refused_and_graded_on_saved_answers(client, auth, linked_student, db_session):
    student, student_auth = linked_student
    test, questions = _create_published_test(client, auth, student, duration=30)
    test_id, q1_id, q2_id = test["id"], questions[0]["id"], questions[1]["id"]

    client.get(f"/portal/students/{student.id}/online-tests/{test_id}", headers=student_auth)
    # Saved in time: q1 correct (2 marks).
    client.post(f"/portal/students/{student.id}/online-tests/{test_id}/answer",
                json={"question_id": q1_id, "selected_option": "4"}, headers=student_auth)

    _backdate_attempt(db_session, test_id, student.id, minutes=45)

    # Submitting q2 after the deadline must not earn its mark.
    resp = client.post(f"/portal/students/{student.id}/online-tests/{test_id}/submit", json={
        "answers": [
            {"question_id": q1_id, "selected_option": "4"},
            {"question_id": q2_id, "selected_option": "True"},
        ],
    }, headers=student_auth)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["status"] == "Submitted"
    assert body["auto_submitted_reason"] == "time_expired"
    assert body["score"] == 2  # only the answer saved before the deadline counted
    assert body["max_score"] == 3


def test_expired_attempt_is_closed_when_reopened(client, auth, linked_student, db_session):
    student, student_auth = linked_student
    test, questions = _create_published_test(client, auth, student, duration=10)
    test_id = test["id"]

    client.get(f"/portal/students/{student.id}/online-tests/{test_id}", headers=student_auth)
    _backdate_attempt(db_session, test_id, student.id, minutes=20)

    resp = client.get(f"/portal/students/{student.id}/online-tests/{test_id}", headers=student_auth)
    assert resp.status_code == 200, resp.text
    attempt = resp.json()["attempt"]
    assert attempt["status"] == "Submitted"
    assert attempt["auto_submitted_reason"] == "time_expired"

    # And it can't be answered any more.
    resp = client.post(f"/portal/students/{student.id}/online-tests/{test_id}/answer",
                       json={"question_id": questions[0]["id"], "selected_option": "4"}, headers=student_auth)
    assert resp.status_code == 400


def test_submission_after_ends_at_is_flagged_window_closed(client, auth, linked_student, db_session):
    from datetime import datetime, timedelta

    student, student_auth = linked_student
    test, questions = _create_published_test(client, auth, student)
    test_id = test["id"]

    client.get(f"/portal/students/{student.id}/online-tests/{test_id}", headers=student_auth)

    from app.models import OnlineTest
    row = db_session.query(OnlineTest).filter(OnlineTest.id == test_id).first()
    row.ends_at = datetime.utcnow() - timedelta(hours=1)
    db_session.commit()

    resp = client.post(f"/portal/students/{student.id}/online-tests/{test_id}/submit", json={
        "answers": [{"question_id": questions[0]["id"], "selected_option": "4"}],
    }, headers=student_auth)
    assert resp.status_code == 200, resp.text
    assert resp.json()["auto_submitted_reason"] == "window_closed"
    assert resp.json()["score"] == 0


def test_untimed_test_still_submits_normally(client, auth, linked_student):
    """No duration and no ends_at means no deadline -- nothing to enforce."""
    student, student_auth = linked_student
    test, questions = _create_published_test(client, auth, student)
    test_id = test["id"]

    client.get(f"/portal/students/{student.id}/online-tests/{test_id}", headers=student_auth)
    resp = client.post(f"/portal/students/{student.id}/online-tests/{test_id}/submit", json={
        "answers": [
            {"question_id": questions[0]["id"], "selected_option": "4"},
            {"question_id": questions[1]["id"], "selected_option": "True"},
        ],
    }, headers=student_auth)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["score"] == 3
    assert body["auto_submitted_reason"] is None


def test_shuffle_is_stable_within_an_attempt(client, auth, db_session):
    student = _make_student(db_session)
    student_user, student_auth = _make_student_auth(client, db_session, student)
    _link(client, auth, student_user.id, student.id)

    resp = client.post("/online-tests/", json={
        "class_name": student.class_name, "section": student.section,
        "title": "Shuffled Quiz", "shuffle_questions": True, "shuffle_options": True,
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    test = resp.json()
    assert test["shuffle_questions"] is True
    assert test["shuffle_options"] is True

    for i in range(6):
        client.post(f"/online-tests/{test['id']}/questions", json={
            "question_type": "mcq_single", "question_text": f"Q{i}?",
            "options": [f"{i}a", f"{i}b", f"{i}c", f"{i}d"], "correct_option": f"{i}a",
        }, headers=auth)
    client.put(f"/online-tests/{test['id']}", json={"status": "Published"}, headers=auth)

    first = client.get(f"/portal/students/{student.id}/online-tests/{test['id']}", headers=student_auth).json()
    second = client.get(f"/portal/students/{student.id}/online-tests/{test['id']}", headers=student_auth).json()

    order_1 = [q["id"] for q in first["questions"]]
    order_2 = [q["id"] for q in second["questions"]]
    assert order_1 == order_2, "a reload must not reshuffle mid-attempt"
    assert sorted(order_1) == sorted(set(order_1)), "shuffle must not drop or duplicate questions"
    assert len(order_1) == 6

    opts_1 = [q["options"] for q in first["questions"]]
    opts_2 = [q["options"] for q in second["questions"]]
    assert opts_1 == opts_2
    for q in first["questions"]:
        assert sorted(q["options"]) == sorted(set(q["options"]))
        assert len(q["options"]) == 4


def test_online_tests_blocked_when_module_disabled(client, auth, linked_student):
    """With the entitlement off, the endpoints are unreachable -- not merely
    hidden in the sidebar. Covers both the staff router and the student portal.
    """
    student, student_auth = linked_student
    test, questions = _create_published_test(client, auth, student)
    test_id = test["id"]

    _set_online_tests_enabled(False)

    resp = client.get("/online-tests/", headers=auth)
    assert resp.status_code == 403, resp.text

    resp = client.post("/online-tests/", json={"class_name": student.class_name, "title": "Nope"}, headers=auth)
    assert resp.status_code == 403, resp.text

    resp = client.get(f"/online-tests/{test_id}/results", headers=auth)
    assert resp.status_code == 403, resp.text

    resp = client.get(f"/portal/students/{student.id}/online-tests", headers=student_auth)
    assert resp.status_code == 403, resp.text

    resp = client.get(f"/portal/students/{student.id}/online-tests/{test_id}", headers=student_auth)
    assert resp.status_code == 403, resp.text

    resp = client.post(f"/portal/students/{student.id}/online-tests/{test_id}/answer",
                       json={"question_id": questions[0]["id"], "selected_option": "4"}, headers=student_auth)
    assert resp.status_code == 403, resp.text

    resp = client.post(f"/portal/students/{student.id}/online-tests/{test_id}/submit",
                       json={"answers": []}, headers=student_auth)
    assert resp.status_code == 403, resp.text
