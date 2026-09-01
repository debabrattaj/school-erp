"""Learning management: study material published to a class, and homework
handed in through the portal and graded by a teacher.
"""

import uuid
from datetime import date, timedelta

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


def _set_lms_enabled(enabled: bool):
    """Flip the lms entitlement the same way the Platform Console does."""
    from app.tenant import CentralSessionLocal, get_account
    from app.tenant_models import SchoolFeature

    account = get_account("default")
    db = CentralSessionLocal()
    try:
        row = (
            db.query(SchoolFeature)
            .filter(
                SchoolFeature.account_id == account["id"],
                SchoolFeature.feature_key == "lms",
            )
            .first()
        )
        if row:
            row.is_enabled = enabled
        else:
            db.add(SchoolFeature(
                account_id=account["id"], feature_key="lms", is_enabled=enabled,
            ))
        db.commit()
    finally:
        db.close()


def _make_student(db, class_name, section="A"):
    from app.models import Student

    student = Student(
        admission_no=f"LMS-{uuid.uuid4().hex[:10]}",
        first_name="Leah", last_name="Rner",
        class_name=class_name, section=section,
        student_status="Active", residential_type="Day Scholar",
    )
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


def _student_auth(client, db, student, staff_auth):
    """A Student-role user linked to the given student."""
    from app.models import User
    from app.security import hash_password

    email = f"lms-student-{uuid.uuid4().hex[:8]}@example.com"
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
    """A student in their own class, with portal credentials."""
    class_name = f"LMS-{uuid.uuid4().hex[:6]}"
    student = _make_student(db_session, class_name)
    return student, _student_auth(client, db_session, student, auth)


# --------------------------------------------------------------------------
# Learning resources
# --------------------------------------------------------------------------


def test_resource_crud_and_publish(client, auth, learner):
    student, _ = learner

    resp = client.post("/lms/resources", json={
        "class_name": student.class_name, "section": student.section,
        "subject": "Physics", "title": "Newton's laws — notes",
        "description": "Read before Friday", "resource_type": "Document",
        "url": "/uploads/default/newton.pdf",
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    resource = resp.json()
    assert resource["status"] == "Draft"
    assert resource["published_at"] is None
    assert resource["viewer_count"] == 0

    resp = client.get("/lms/resources", params={"class_name": student.class_name}, headers=auth)
    assert resp.status_code == 200
    assert any(r["id"] == resource["id"] for r in resp.json())

    resp = client.put(f"/lms/resources/{resource['id']}", json={"status": "Published"}, headers=auth)
    assert resp.status_code == 200, resp.text
    assert resp.json()["published_at"] is not None
    published_at = resp.json()["published_at"]

    # Editing a live resource must not restamp when the class received it.
    resp = client.put(f"/lms/resources/{resource['id']}", json={"title": "Newton's laws"}, headers=auth)
    assert resp.status_code == 200
    assert resp.json()["published_at"] == published_at

    resp = client.delete(f"/lms/resources/{resource['id']}", headers=auth)
    assert resp.status_code == 200
    resp = client.get(f"/lms/resources/{resource['id']}", headers=auth)
    assert resp.status_code == 404


def test_resource_needs_somewhere_to_point(client, auth):
    resp = client.post("/lms/resources", json={
        "class_name": "LMS-Empty", "title": "Nothing here", "resource_type": "Link",
    }, headers=auth)
    assert resp.status_code == 400

    resp = client.post("/lms/resources", json={
        "class_name": "LMS-Empty", "title": "Empty note", "resource_type": "Note",
        "content": "   ",
    }, headers=auth)
    assert resp.status_code == 400

    resp = client.post("/lms/resources", json={
        "class_name": "LMS-Empty", "title": "Bad type", "resource_type": "Hologram",
        "url": "https://example.com",
    }, headers=auth)
    assert resp.status_code == 400


def _publish_resource(client, auth, student, **overrides):
    payload = {
        "class_name": student.class_name, "section": student.section,
        "subject": "Physics", "title": "Chapter 4 notes",
        "resource_type": "Link", "url": "https://example.com/notes",
        "status": "Published",
    }
    payload.update(overrides)
    resp = client.post("/lms/resources", json=payload, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_portal_only_sees_released_material(client, auth, learner):
    student, student_auth = learner

    published = _publish_resource(client, auth, student)
    draft = _publish_resource(client, auth, student, title="Still writing", status="Draft")
    scheduled = _publish_resource(
        client, auth, student, title="Next term",
        available_from=str(date.today() + timedelta(days=7)),
    )
    other_class = _publish_resource(
        client, auth, student, title="Other class", class_name=f"{student.class_name}-X",
    )

    resp = client.get(f"/portal/students/{student.id}/resources", headers=student_auth)
    assert resp.status_code == 200, resp.text
    visible = {r["id"] for r in resp.json()}
    assert published["id"] in visible
    assert draft["id"] not in visible
    assert scheduled["id"] not in visible
    assert other_class["id"] not in visible


def test_view_tracking_feeds_teacher_engagement(client, auth, learner):
    student, student_auth = learner
    resource = _publish_resource(client, auth, student)

    resp = client.get(f"/lms/resources/{resource['id']}/engagement", headers=auth)
    assert resp.status_code == 200, resp.text
    engagement = resp.json()
    assert engagement["total_students"] == 1
    assert engagement["viewed_count"] == 0
    assert engagement["not_viewed"][0]["student_id"] == student.id

    for expected_count in (1, 2):
        resp = client.post(
            f"/portal/students/{student.id}/resources/{resource['id']}/view", headers=student_auth
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["view_count"] == expected_count

    resp = client.get(f"/lms/resources/{resource['id']}/engagement", headers=auth)
    engagement = resp.json()
    assert engagement["viewed_count"] == 1
    assert engagement["not_viewed"] == []
    assert engagement["viewers"][0]["view_count"] == 2

    resp = client.get(f"/lms/resources/{resource['id']}", headers=auth)
    assert resp.json()["viewer_count"] == 1

    resp = client.get(f"/portal/students/{student.id}/resources", headers=student_auth)
    mine = next(r for r in resp.json() if r["id"] == resource["id"])
    assert mine["viewed"] is True


def test_cannot_mark_unpublished_resource_viewed(client, auth, learner):
    student, student_auth = learner
    draft = _publish_resource(client, auth, student, status="Draft")

    resp = client.post(
        f"/portal/students/{student.id}/resources/{draft['id']}/view", headers=student_auth
    )
    assert resp.status_code == 404


def test_lms_routes_blocked_when_module_disabled(client, auth, learner):
    student, student_auth = learner
    resource = _publish_resource(client, auth, student)

    _set_lms_enabled(False)
    try:
        assert client.get("/lms/resources", headers=auth).status_code == 403
        assert client.get(
            f"/portal/students/{student.id}/resources", headers=student_auth
        ).status_code == 403
        assert client.post(
            f"/portal/students/{student.id}/resources/{resource['id']}/view", headers=student_auth
        ).status_code == 403

        # Homework itself keeps working -- it is a notice board without the
        # LMS, so the drop-box fields simply are not offered.
        resp = client.get(f"/portal/students/{student.id}/homework", headers=student_auth)
        assert resp.status_code == 200
        assert all("can_submit" not in item for item in resp.json())
    finally:
        _set_lms_enabled(True)


# --------------------------------------------------------------------------
# Assignment submissions
# --------------------------------------------------------------------------


def _assignment(client, auth, student, **overrides):
    payload = {
        "class_name": student.class_name, "section": student.section,
        "subject": "Physics", "title": "Worksheet 3",
        "due_date": str(date.today() + timedelta(days=3)),
        "max_marks": 20,
    }
    payload.update(overrides)
    resp = client.post("/homework/", json=payload, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_submit_then_grade(client, auth, learner):
    student, student_auth = learner
    assignment = _assignment(client, auth, student)
    assert assignment["accepts_submissions"] is True

    resp = client.get(f"/portal/students/{student.id}/homework", headers=student_auth)
    item = next(a for a in resp.json() if a["id"] == assignment["id"])
    assert item["can_submit"] is True
    assert item["submission"] is None
    assert item["max_marks"] == 20

    resp = client.post(
        f"/portal/students/{student.id}/homework/{assignment['id']}/submit",
        json={"content": "Answers: 1a, 2c, 3b", "attachment_url": "/uploads/default/w3.pdf"},
        headers=student_auth,
    )
    assert resp.status_code == 200, resp.text
    submission = resp.json()
    assert submission["status"] == "Submitted"
    assert submission["is_late"] is False

    # Re-submitting replaces rather than piling up drafts.
    resp = client.post(
        f"/portal/students/{student.id}/homework/{assignment['id']}/submit",
        json={"content": "Answers: 1a, 2c, 3d"},
        headers=student_auth,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["id"] == submission["id"]
    assert resp.json()["content"].endswith("3d")

    resp = client.get(f"/homework/{assignment['id']}/submissions", headers=auth)
    assert resp.status_code == 200, resp.text
    board = resp.json()
    assert board["total_students"] == 1
    assert board["submitted_count"] == 1
    assert board["graded_count"] == 0
    assert board["pending_students"] == []
    assert board["submissions"][0]["admission_no"] == student.admission_no

    resp = client.put(
        f"/homework/{assignment['id']}/submissions/{submission['id']}/grade",
        json={"marks_awarded": 17, "feedback": "Neat work, check Q3."},
        headers=auth,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "Graded"
    assert resp.json()["marks_awarded"] == 17

    # The family sees the grade, and the work is now locked.
    resp = client.get(f"/portal/students/{student.id}/homework", headers=student_auth)
    item = next(a for a in resp.json() if a["id"] == assignment["id"])
    assert item["submission"]["marks_awarded"] == 17
    assert item["submission"]["feedback"] == "Neat work, check Q3."
    assert item["can_submit"] is False

    resp = client.post(
        f"/portal/students/{student.id}/homework/{assignment['id']}/submit",
        json={"content": "Actually..."}, headers=student_auth,
    )
    assert resp.status_code == 400

    resp = client.get("/homework/", params={"class_name": student.class_name}, headers=auth)
    listed = next(a for a in resp.json() if a["id"] == assignment["id"])
    assert listed["submission_count"] == 1
    assert listed["graded_count"] == 1


def test_pending_students_listed_before_they_submit(client, auth, db_session, learner):
    student, _ = learner
    classmate = _make_student(db_session, student.class_name, student.section)
    assignment = _assignment(client, auth, student)

    resp = client.get(f"/homework/{assignment['id']}/submissions", headers=auth)
    board = resp.json()
    assert board["total_students"] == 2
    assert board["submitted_count"] == 0
    assert {p["student_id"] for p in board["pending_students"]} == {student.id, classmate.id}


def test_late_submission_flagged_and_can_be_refused(client, auth, learner):
    student, student_auth = learner
    yesterday = str(date.today() - timedelta(days=1))

    late_ok = _assignment(client, auth, student, title="Late allowed", due_date=yesterday)
    resp = client.post(
        f"/portal/students/{student.id}/homework/{late_ok['id']}/submit",
        json={"content": "Sorry it's late"}, headers=student_auth,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_late"] is True

    resp = client.get(f"/homework/{late_ok['id']}/submissions", headers=auth)
    assert resp.json()["late_count"] == 1

    closed = _assignment(
        client, auth, student, title="Late refused",
        due_date=yesterday, allow_late_submission=False,
    )
    resp = client.get(f"/portal/students/{student.id}/homework", headers=student_auth)
    item = next(a for a in resp.json() if a["id"] == closed["id"])
    assert item["can_submit"] is False

    resp = client.post(
        f"/portal/students/{student.id}/homework/{closed['id']}/submit",
        json={"content": "Please?"}, headers=student_auth,
    )
    assert resp.status_code == 400


def test_assignment_with_submissions_switched_off(client, auth, learner):
    student, student_auth = learner
    assignment = _assignment(client, auth, student, accepts_submissions=False)

    resp = client.get(f"/portal/students/{student.id}/homework", headers=student_auth)
    item = next(a for a in resp.json() if a["id"] == assignment["id"])
    assert item["can_submit"] is False

    resp = client.post(
        f"/portal/students/{student.id}/homework/{assignment['id']}/submit",
        json={"content": "Here you go"}, headers=student_auth,
    )
    assert resp.status_code == 400


def test_empty_submission_rejected(client, auth, learner):
    student, student_auth = learner
    assignment = _assignment(client, auth, student)

    resp = client.post(
        f"/portal/students/{student.id}/homework/{assignment['id']}/submit",
        json={"content": "   "}, headers=student_auth,
    )
    assert resp.status_code == 400


def test_cannot_submit_to_another_classs_assignment(client, auth, db_session, learner):
    student, student_auth = learner
    outsider = _make_student(db_session, f"{student.class_name}-OTHER")
    assignment = _assignment(client, auth, outsider)

    resp = client.post(
        f"/portal/students/{student.id}/homework/{assignment['id']}/submit",
        json={"content": "Wrong class"}, headers=student_auth,
    )
    assert resp.status_code == 404


def test_grade_cannot_exceed_assignment_total(client, auth, learner):
    student, student_auth = learner
    assignment = _assignment(client, auth, student, max_marks=10)

    resp = client.post(
        f"/portal/students/{student.id}/homework/{assignment['id']}/submit",
        json={"content": "Done"}, headers=student_auth,
    )
    submission_id = resp.json()["id"]

    resp = client.put(
        f"/homework/{assignment['id']}/submissions/{submission_id}/grade",
        json={"marks_awarded": 11}, headers=auth,
    )
    assert resp.status_code == 400

    resp = client.put(
        f"/homework/{assignment['id']}/submissions/{submission_id}/grade",
        json={"marks_awarded": -1}, headers=auth,
    )
    assert resp.status_code == 400

    # Comments with no score are still a graded piece of work.
    resp = client.put(
        f"/homework/{assignment['id']}/submissions/{submission_id}/grade",
        json={"feedback": "See me"}, headers=auth,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "Graded"
    assert resp.json()["marks_awarded"] is None
