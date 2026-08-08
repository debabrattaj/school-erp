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
