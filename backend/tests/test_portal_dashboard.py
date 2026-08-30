"""Portal "Dashboard" tab: a parent/student builds their own view of the
linked child's performance (attendance %, marks % by exam) out of already
access-controlled portal data.

Two things this locks in:
- GET /portal/students/{id}/marks now returns each exam's date, sorted
  chronologically, so the frontend can plot a "marks over time" trend
  without guessing an order.
- GET/PUT /dashboard/layout (the same per-user saved-widget-layout endpoint
  the staff Dashboard builder uses) has no role restriction, so a Parent's
  own portal widget picks can be saved there without any backend change --
  this is the assumption the whole "create your own view" feature rests on.
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
        first_name="Dash", last_name="Kid", class_name="DashTest-7",
        section="A", student_status="Active", residential_type="Day Scholar",
    )
    defaults.update(overrides)
    if "admission_no" not in defaults:
        defaults["admission_no"] = f"DASH-{uuid.uuid4().hex[:10]}"
    student = Student(**defaults)
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


def _make_parent_auth(client, db):
    from app.models import User
    from app.security import hash_password

    email = f"parent-{uuid.uuid4().hex[:8]}@example.com"
    user = User(name="Test Parent", email=email, password_hash=hash_password("ParentPass123!"), role="Parent")
    db.add(user)
    db.commit()
    db.refresh(user)

    login = client.post("/auth/login", json={"account_code": "default", "email": email, "password": "ParentPass123!"})
    assert login.status_code == 200, login.text
    return user, {"Authorization": f"Bearer {login.json()['access_token']}"}


def _link(client, auth, user_id, student_id):
    resp = client.post("/portal/links", json={"user_id": user_id, "student_id": student_id}, headers=auth)
    assert resp.status_code == 200, resp.text


@pytest.fixture()
def linked_parent(client, auth, db_session):
    student = _make_student(db_session)
    parent_user, parent_auth = _make_parent_auth(client, db_session)
    _link(client, auth, parent_user.id, student.id)
    return student, parent_auth


def _create_exam(client, auth, exam_name, exam_date):
    resp = client.post("/exams/", json={"exam_name": exam_name, "exam_date": exam_date}, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _mark(client, auth, student_id, exam_id, subject, obtained, max_marks=100):
    resp = client.post("/marks/", json={
        "student_id": student_id,
        "exam_id": exam_id,
        "subject_name": subject,
        "marks_obtained": obtained,
        "total_marks": max_marks,
    }, headers=auth)
    assert resp.status_code == 200, resp.text


def test_portal_marks_include_exam_date_sorted_chronologically(client, auth, linked_parent):
    student, parent_auth = linked_parent

    later_exam = _create_exam(client, auth, "Dash-Final", "2026-06-01")
    earlier_exam = _create_exam(client, auth, "Dash-Midterm", "2026-02-01")

    # Created out of chronological order on purpose -- the response must
    # still come back oldest-first.
    _mark(client, auth, student.id, later_exam, "Maths", 90)
    _mark(client, auth, student.id, earlier_exam, "Maths", 70)

    resp = client.get(f"/portal/students/{student.id}/marks", headers=parent_auth)
    assert resp.status_code == 200, resp.text
    exams = resp.json()["exams"]

    assert [e["exam_name"] for e in exams] == ["Dash-Midterm", "Dash-Final"]
    assert exams[0]["exam_date"] == "2026-02-01"
    assert exams[1]["exam_date"] == "2026-06-01"
    assert exams[0]["percentage"] == 70.0
    assert exams[1]["percentage"] == 90.0


def test_portal_marks_exam_without_records_returns_empty_list(client, linked_parent):
    student, parent_auth = linked_parent

    resp = client.get(f"/portal/students/{student.id}/marks", headers=parent_auth)
    assert resp.status_code == 200, resp.text
    assert resp.json()["exams"] == []


def test_dashboard_layout_is_open_to_parent_role_and_scoped_per_user(client, linked_parent):
    _, parent_auth = linked_parent

    widgets = [{"id": "attendance_trend", "kind": "attendance_trend"}]
    resp = client.put("/dashboard/layout", json={"widgets": widgets}, headers=parent_auth)
    assert resp.status_code == 200, resp.text

    resp = client.get("/dashboard/layout", headers=parent_auth)
    assert resp.status_code == 200, resp.text
    assert resp.json()["widgets"] == widgets


def test_dashboard_layout_defaults_to_null_widgets_for_a_fresh_user(client, db_session):
    _, parent_auth = _make_parent_auth(client, db_session)

    resp = client.get("/dashboard/layout", headers=parent_auth)
    assert resp.status_code == 200, resp.text
    assert resp.json()["widgets"] is None
