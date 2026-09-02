"""Courses: outline, enrollment, sequencing, prerequisites and progress.

Progress here is derived from the modules that own the work -- submitting
homework or finishing a SCORM package moves the course on by itself -- so
most of these tests do the underlying thing and then assert the course
agrees, rather than poking course state directly.
"""

import uuid
from datetime import date, timedelta

import pytest

from tests.test_scorm import build_package


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


def _make_student(db, class_name, section="A", name="Ada"):
    from app.models import Student

    student = Student(
        admission_no=f"CO-{uuid.uuid4().hex[:10]}",
        first_name=name, last_name="Learner",
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

    email = f"course-{uuid.uuid4().hex[:8]}@example.com"
    user = User(
        name="Test Student", email=email,
        password_hash=hash_password("StudentPass123!"), role="Student",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    assert client.post(
        "/portal/links", json={"user_id": user.id, "student_id": student.id}, headers=staff_auth
    ).status_code == 200
    login = client.post("/auth/login", json={
        "account_code": "default", "email": email, "password": "StudentPass123!",
    })
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


@pytest.fixture()
def klass():
    return f"CRS-{uuid.uuid4().hex[:6]}"


@pytest.fixture()
def learner(client, auth, db_session, klass):
    student = _make_student(db_session, klass)
    return student, _student_auth(client, db_session, student, auth)


def make_course(client, auth, klass, **overrides):
    payload = {
        "title": "Introduction to Fractions",
        "class_name": klass, "section": "A", "subject": "Maths",
        "course_type": "self_paced", "status": "Published",
    }
    payload.update(overrides)
    resp = client.post("/courses/", json=payload, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def add_section(client, auth, course_id, title="Unit 1"):
    resp = client.post(
        f"/courses/{course_id}/sections", json={"title": title}, headers=auth
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


def add_lesson(client, auth, course_id, section_id, **overrides):
    payload = {"title": "Reading", "content_type": "text", "content": "Read this."}
    payload.update(overrides)
    resp = client.post(
        f"/courses/{course_id}/sections/{section_id}/lessons", json=payload, headers=auth
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# --------------------------------------------------------------------------
# Outline
# --------------------------------------------------------------------------


def test_course_outline_crud(client, auth, klass):
    course = make_course(client, auth, klass, status="Draft")
    assert course["published_at"] is None

    section = add_section(client, auth, course["id"])
    first = add_lesson(client, auth, course["id"], section["id"], title="Lesson 1")
    second = add_lesson(client, auth, course["id"], section["id"], title="Lesson 2")
    # Sequence numbers are handed out in order without the client tracking them.
    assert (first["sequence_no"], second["sequence_no"]) == (1, 2)

    resp = client.get(f"/courses/{course['id']}", headers=auth)
    assert resp.status_code == 200, resp.text
    detail = resp.json()
    assert detail["lesson_count"] == 2
    assert [lesson["title"] for lesson in detail["sections"][0]["lessons"]] == ["Lesson 1", "Lesson 2"]

    resp = client.put(
        f"/courses/{course['id']}/lessons/{second['id']}", json={"title": "Lesson two"}, headers=auth
    )
    assert resp.json()["title"] == "Lesson two"

    assert client.delete(
        f"/courses/{course['id']}/lessons/{second['id']}", headers=auth
    ).status_code == 200
    assert client.get(f"/courses/{course['id']}", headers=auth).json()["lesson_count"] == 1


def test_lesson_must_have_something_in_it(client, auth, klass):
    course = make_course(client, auth, klass)
    section = add_section(client, auth, course["id"])

    resp = client.post(
        f"/courses/{course['id']}/sections/{section['id']}/lessons",
        json={"title": "Empty", "content_type": "text"}, headers=auth,
    )
    assert resp.status_code == 400

    resp = client.post(
        f"/courses/{course['id']}/sections/{section['id']}/lessons",
        json={"title": "Nowhere", "content_type": "video"}, headers=auth,
    )
    assert resp.status_code == 400

    # A pointer lesson naming nothing, and one naming something absent.
    resp = client.post(
        f"/courses/{course['id']}/sections/{section['id']}/lessons",
        json={"title": "Quiz", "content_type": "online_test"}, headers=auth,
    )
    assert resp.status_code == 400
    resp = client.post(
        f"/courses/{course['id']}/sections/{section['id']}/lessons",
        json={"title": "Quiz", "content_type": "online_test", "online_test_id": 999999}, headers=auth,
    )
    assert resp.status_code == 400

    resp = client.post(
        f"/courses/{course['id']}/sections/{section['id']}/lessons",
        json={"title": "Scored", "content_type": "text", "content": "x", "completion_rule": "score"},
        headers=auth,
    )
    assert resp.status_code == 400


def test_a_course_cannot_be_its_own_prerequisite(client, auth, klass):
    course = make_course(client, auth, klass)
    resp = client.put(
        f"/courses/{course['id']}", json={"prerequisite_course_id": course["id"]}, headers=auth
    )
    assert resp.status_code == 400


def test_duplicate_course_code_refused(client, auth, klass):
    code = f"C-{uuid.uuid4().hex[:6]}"
    make_course(client, auth, klass, code=code)
    resp = client.post(
        "/courses/", json={"title": "Clash", "class_name": klass, "code": code}, headers=auth
    )
    assert resp.status_code == 400


# --------------------------------------------------------------------------
# Enrollment
# --------------------------------------------------------------------------


def test_auto_enroll_the_whole_class_on_publish(client, auth, db_session, klass):
    _make_student(db_session, klass, name="One")
    _make_student(db_session, klass, name="Two")

    course = make_course(client, auth, klass, status="Draft", auto_enroll_class=True)
    board = client.get(f"/courses/{course['id']}/enrollments", headers=auth).json()
    assert board["enrolled_count"] == 0
    assert len(board["not_enrolled"]) == 2

    client.put(f"/courses/{course['id']}", json={"status": "Published"}, headers=auth)
    board = client.get(f"/courses/{course['id']}/enrollments", headers=auth).json()
    assert board["enrolled_count"] == 2
    assert board["not_enrolled"] == []
    assert all(e["enrolled_via"] == "class_auto" for e in board["enrollments"])

    # Re-publishing must not double-enroll anyone.
    client.put(f"/courses/{course['id']}", json={"status": "Published"}, headers=auth)
    assert client.get(
        f"/courses/{course['id']}/enrollments", headers=auth
    ).json()["enrolled_count"] == 2


def test_self_enrollment_only_when_the_course_allows_it(client, auth, learner, klass):
    student, student_auth = learner
    closed = make_course(client, auth, klass, title="Closed")
    open_course = make_course(client, auth, klass, title="Open", allow_self_enrollment=True)

    listed = client.get(f"/portal/students/{student.id}/courses", headers=student_auth).json()
    by_id = {c["id"]: c for c in listed}
    assert by_id[closed["id"]]["can_self_enroll"] is False
    assert by_id[open_course["id"]]["can_self_enroll"] is True

    resp = client.post(
        f"/portal/students/{student.id}/courses/{closed['id']}/enroll", headers=student_auth
    )
    assert resp.status_code == 400

    resp = client.post(
        f"/portal/students/{student.id}/courses/{open_course['id']}/enroll", headers=student_auth
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["enrolled"] is True


def test_course_prerequisite_blocks_enrollment_until_completed(client, auth, learner, klass):
    student, student_auth = learner

    basics = make_course(client, auth, klass, title="Basics", allow_self_enrollment=True)
    basics_section = add_section(client, auth, basics["id"])
    basics_lesson = add_lesson(client, auth, basics["id"], basics_section["id"])

    advanced = make_course(
        client, auth, klass, title="Advanced",
        allow_self_enrollment=True, prerequisite_course_id=basics["id"],
    )

    # Nomination obeys the prerequisite too -- it is a rule about the learner.
    resp = client.post(
        f"/courses/{advanced['id']}/enrollments",
        json={"student_ids": [student.id]}, headers=auth,
    )
    assert resp.json()["enrolled"] == 0
    assert resp.json()["skipped_prerequisite"]

    resp = client.post(
        f"/portal/students/{student.id}/courses/{advanced['id']}/enroll", headers=student_auth
    )
    assert resp.status_code == 400

    # Finish the prerequisite, and the door opens.
    client.post(f"/portal/students/{student.id}/courses/{basics['id']}/enroll", headers=student_auth)
    resp = client.post(
        f"/portal/students/{student.id}/courses/{basics['id']}/lessons/{basics_lesson['id']}/complete",
        headers=student_auth,
    )
    assert resp.json()["status"] == "Completed"

    resp = client.post(
        f"/portal/students/{student.id}/courses/{advanced['id']}/enroll", headers=student_auth
    )
    assert resp.status_code == 200, resp.text


# --------------------------------------------------------------------------
# Sequencing and progress
# --------------------------------------------------------------------------


def test_lessons_unlock_in_order(client, auth, learner, klass):
    student, student_auth = learner
    course = make_course(client, auth, klass, auto_enroll_class=True)
    section = add_section(client, auth, course["id"])
    one = add_lesson(client, auth, course["id"], section["id"], title="One")
    two = add_lesson(client, auth, course["id"], section["id"], title="Two")
    three = add_lesson(client, auth, course["id"], section["id"], title="Three")
    client.put(f"/courses/{course['id']}", json={"status": "Published"}, headers=auth)

    detail = client.get(
        f"/portal/students/{student.id}/courses/{course['id']}", headers=student_auth
    ).json()
    lessons = {lesson["title"]: lesson for lesson in detail["sections"][0]["lessons"]}
    assert lessons["One"]["locked"] is False
    assert lessons["Two"]["locked"] is True
    # A locked lesson still announces itself, but not its content.
    assert "content" not in lessons["Two"]

    resp = client.post(
        f"/portal/students/{student.id}/courses/{course['id']}/lessons/{two['id']}/complete",
        headers=student_auth,
    )
    assert resp.status_code == 400

    client.post(
        f"/portal/students/{student.id}/courses/{course['id']}/lessons/{one['id']}/complete",
        headers=student_auth,
    )
    detail = client.get(
        f"/portal/students/{student.id}/courses/{course['id']}", headers=student_auth
    ).json()
    lessons = {lesson["title"]: lesson for lesson in detail["sections"][0]["lessons"]}
    assert lessons["One"]["completed"] is True
    assert lessons["Two"]["locked"] is False
    assert lessons["Three"]["locked"] is True
    assert detail["enrollment"]["progress_percent"] == pytest.approx(33.3, abs=0.1)


def test_order_can_be_switched_off(client, auth, learner, klass):
    student, student_auth = learner
    course = make_course(
        client, auth, klass, auto_enroll_class=True, enforce_lesson_order=False, status="Draft",
    )
    section = add_section(client, auth, course["id"])
    add_lesson(client, auth, course["id"], section["id"], title="One")
    add_lesson(client, auth, course["id"], section["id"], title="Two")
    client.put(f"/courses/{course['id']}", json={"status": "Published"}, headers=auth)

    detail = client.get(
        f"/portal/students/{student.id}/courses/{course['id']}", headers=student_auth
    ).json()
    assert all(not lesson["locked"] for lesson in detail["sections"][0]["lessons"])


def test_explicit_prerequisite_gates_a_later_lesson(client, auth, learner, klass):
    student, student_auth = learner
    course = make_course(
        client, auth, klass, auto_enroll_class=True, enforce_lesson_order=False, status="Draft",
    )
    section = add_section(client, auth, course["id"])
    reading = add_lesson(client, auth, course["id"], section["id"], title="Reading")
    exercise = add_lesson(
        client, auth, course["id"], section["id"], title="Exercise",
        prerequisite_lesson_id=reading["id"],
    )
    client.put(f"/courses/{course['id']}", json={"status": "Published"}, headers=auth)

    detail = client.get(
        f"/portal/students/{student.id}/courses/{course['id']}", headers=student_auth
    ).json()
    lessons = {lesson["title"]: lesson for lesson in detail["sections"][0]["lessons"]}
    assert lessons["Exercise"]["locked"] is True

    client.post(
        f"/portal/students/{student.id}/courses/{course['id']}/lessons/{reading['id']}/complete",
        headers=student_auth,
    )
    detail = client.get(
        f"/portal/students/{student.id}/courses/{course['id']}", headers=student_auth
    ).json()
    lessons = {lesson["title"]: lesson for lesson in detail["sections"][0]["lessons"]}
    assert lessons["Exercise"]["locked"] is False


def test_optional_lessons_do_not_block_or_count(client, auth, learner, klass):
    student, student_auth = learner
    course = make_course(client, auth, klass, auto_enroll_class=True, status="Draft")
    section = add_section(client, auth, course["id"])
    add_lesson(client, auth, course["id"], section["id"], title="Extension", is_required=False)
    required = add_lesson(client, auth, course["id"], section["id"], title="Core")
    client.put(f"/courses/{course['id']}", json={"status": "Published"}, headers=auth)

    detail = client.get(
        f"/portal/students/{student.id}/courses/{course['id']}", headers=student_auth
    ).json()
    lessons = {lesson["title"]: lesson for lesson in detail["sections"][0]["lessons"]}
    assert lessons["Core"]["locked"] is False

    resp = client.post(
        f"/portal/students/{student.id}/courses/{course['id']}/lessons/{required['id']}/complete",
        headers=student_auth,
    )
    # The optional lesson is untouched, and the course is still finished.
    assert resp.json()["progress_percent"] == 100
    assert resp.json()["status"] == "Completed"


def test_submitting_homework_advances_the_course(client, auth, learner, klass):
    """The point of pointer lessons: work handed in through Homework moves
    the course without the learner doing anything twice."""
    student, student_auth = learner

    assignment = client.post("/homework/", json={
        "class_name": klass, "section": "A", "title": "Worksheet",
        "max_marks": 10, "due_date": str(date.today() + timedelta(days=5)),
    }, headers=auth).json()

    course = make_course(client, auth, klass, auto_enroll_class=True, status="Draft")
    section = add_section(client, auth, course["id"])
    add_lesson(
        client, auth, course["id"], section["id"], title="Hand in the worksheet",
        content_type="assignment", assignment_id=assignment["id"], completion_rule="submit",
    )
    client.put(f"/courses/{course['id']}", json={"status": "Published"}, headers=auth)

    detail = client.get(
        f"/portal/students/{student.id}/courses/{course['id']}", headers=student_auth
    ).json()
    assert detail["enrollment"]["progress_percent"] == 0

    resp = client.post(
        f"/portal/students/{student.id}/homework/{assignment['id']}/submit",
        json={"content": "Done"}, headers=student_auth,
    )
    assert resp.status_code == 200, resp.text

    detail = client.get(
        f"/portal/students/{student.id}/courses/{course['id']}", headers=student_auth
    ).json()
    assert detail["enrollment"]["progress_percent"] == 100
    assert detail["enrollment"]["status"] == "Completed"


def test_a_scored_lesson_needs_the_mark_not_just_the_attempt(client, auth, learner, klass):
    student, student_auth = learner

    assignment = client.post("/homework/", json={
        "class_name": klass, "section": "A", "title": "Scored worksheet", "max_marks": 10,
    }, headers=auth).json()

    course = make_course(client, auth, klass, auto_enroll_class=True, status="Draft")
    section = add_section(client, auth, course["id"])
    add_lesson(
        client, auth, course["id"], section["id"], title="Score at least 6",
        content_type="assignment", assignment_id=assignment["id"],
        completion_rule="score", min_score=6,
    )
    client.put(f"/courses/{course['id']}", json={"status": "Published"}, headers=auth)

    submission = client.post(
        f"/portal/students/{student.id}/homework/{assignment['id']}/submit",
        json={"content": "Attempt"}, headers=student_auth,
    ).json()
    detail = client.get(
        f"/portal/students/{student.id}/courses/{course['id']}", headers=student_auth
    ).json()
    assert detail["enrollment"]["progress_percent"] == 0

    client.put(
        f"/homework/{assignment['id']}/submissions/{submission['id']}/grade",
        json={"marks_awarded": 4}, headers=auth,
    )
    detail = client.get(
        f"/portal/students/{student.id}/courses/{course['id']}", headers=student_auth
    ).json()
    assert detail["enrollment"]["progress_percent"] == 0

    # Regrading upward finishes it.
    client.put(
        f"/homework/{assignment['id']}/submissions/{submission['id']}/grade",
        json={"marks_awarded": 8}, headers=auth,
    )
    detail = client.get(
        f"/portal/students/{student.id}/courses/{course['id']}", headers=student_auth
    ).json()
    assert detail["enrollment"]["progress_percent"] == 100


def test_scorm_lesson_completes_from_the_runtime(client, auth, db_session, klass):
    _set_feature("scorm", True)
    try:
        student = _make_student(db_session, klass, name="Scorm")
        student_auth = _student_auth(client, db_session, student, auth)

        package = client.post(
            "/scorm/packages",
            files={"file": ("course.zip", build_package(), "application/zip")},
            data={"title": "Fractions", "class_name": klass, "section": "A"},
            headers=auth,
        ).json()
        client.put(f"/scorm/packages/{package['id']}", json={"status": "Published"}, headers=auth)

        course = make_course(client, auth, klass, auto_enroll_class=True, status="Draft")
        section = add_section(client, auth, course["id"])
        add_lesson(
            client, auth, course["id"], section["id"], title="Play the module",
            content_type="scorm", scorm_package_id=package["id"], completion_rule="submit",
        )
        client.put(f"/courses/{course['id']}", json={"status": "Published"}, headers=auth)

        token = client.post(
            f"/portal/students/{student.id}/scorm/{package['id']}/launch", headers=student_auth
        ).json()["player_url"].split("token=")[1]
        client.post(
            f"/scorm/commit?token={token}",
            json={"lesson_status": "completed", "score_raw": 90, "finished": True},
        )

        detail = client.get(
            f"/portal/students/{student.id}/courses/{course['id']}", headers=student_auth
        ).json()
        assert detail["enrollment"]["progress_percent"] == 100
    finally:
        _set_feature("scorm", False)


def test_progress_reverts_when_a_grade_no_longer_qualifies(client, auth, learner, klass):
    """A completion with nothing behind it is worse than a step backwards, so
    a regrade below the bar takes the tick away again."""
    student, student_auth = learner
    assignment = client.post("/homework/", json={
        "class_name": klass, "section": "A", "title": "Worksheet", "max_marks": 10,
    }, headers=auth).json()

    course = make_course(client, auth, klass, auto_enroll_class=True, status="Draft")
    section = add_section(client, auth, course["id"])
    add_lesson(
        client, auth, course["id"], section["id"], title="Score at least 6",
        content_type="assignment", assignment_id=assignment["id"],
        completion_rule="score", min_score=6,
    )
    client.put(f"/courses/{course['id']}", json={"status": "Published"}, headers=auth)

    submission = client.post(
        f"/portal/students/{student.id}/homework/{assignment['id']}/submit",
        json={"content": "Done"}, headers=student_auth,
    ).json()
    client.put(
        f"/homework/{assignment['id']}/submissions/{submission['id']}/grade",
        json={"marks_awarded": 9}, headers=auth,
    )
    detail = client.get(
        f"/portal/students/{student.id}/courses/{course['id']}", headers=student_auth
    ).json()
    assert detail["enrollment"]["progress_percent"] == 100
    assert detail["enrollment"]["status"] == "Completed"

    # The teacher corrects the mark downward: the course must follow.
    client.put(
        f"/homework/{assignment['id']}/submissions/{submission['id']}/grade",
        json={"marks_awarded": 3}, headers=auth,
    )
    detail = client.get(
        f"/portal/students/{student.id}/courses/{course['id']}", headers=student_auth
    ).json()
    assert detail["enrollment"]["progress_percent"] == 0
    assert detail["enrollment"]["status"] != "Completed"


def test_teacher_sees_the_class_board(client, auth, db_session, klass):
    one = _make_student(db_session, klass, name="One")
    _make_student(db_session, klass, name="Two")
    course = make_course(client, auth, klass, auto_enroll_class=True, status="Draft")
    section = add_section(client, auth, course["id"])
    lesson = add_lesson(client, auth, course["id"], section["id"])
    client.put(f"/courses/{course['id']}", json={"status": "Published"}, headers=auth)

    one_auth = _student_auth(client, db_session, one, auth)
    client.post(
        f"/portal/students/{one.id}/courses/{course['id']}/lessons/{lesson['id']}/complete",
        headers=one_auth,
    )

    board = client.get(f"/courses/{course['id']}/enrollments", headers=auth).json()
    assert board["enrolled_count"] == 2
    assert board["completed_count"] == 1
    assert board["average_progress"] == 50

    finished = next(e for e in board["enrollments"] if e["student_id"] == one.id)
    detail = client.get(
        f"/courses/{course['id']}/enrollments/{finished['id']}/lessons", headers=auth
    ).json()
    assert detail["lessons"][0]["completed"] is True


# --------------------------------------------------------------------------
# Blended courses
# --------------------------------------------------------------------------


def test_attendance_completes_a_session_lesson(client, auth, learner, klass):
    student, student_auth = learner
    course = make_course(
        client, auth, klass, course_type="blended", auto_enroll_class=True, status="Draft",
    )
    session = client.post(f"/courses/{course['id']}/sessions", json={
        "title": "Workshop", "mode": "classroom", "venue": "Lab 2",
    }, headers=auth).json()
    section = add_section(client, auth, course["id"])
    add_lesson(
        client, auth, course["id"], section["id"], title="Attend the workshop",
        content_type="session", session_id=session["id"],
    )
    client.put(f"/courses/{course['id']}", json={"status": "Published"}, headers=auth)

    register = client.get(
        f"/courses/{course['id']}/sessions/{session['id']}/attendance", headers=auth
    ).json()
    assert register["rows"][0]["attended"] is None

    enrollment_id = register["rows"][0]["enrollment_id"]
    resp = client.post(
        f"/courses/{course['id']}/sessions/{session['id']}/attendance",
        json={"marks": [{"enrollment_id": enrollment_id, "attended": True}]}, headers=auth,
    )
    assert resp.json()["marked"] == 1

    detail = client.get(
        f"/portal/students/{student.id}/courses/{course['id']}", headers=student_auth
    ).json()
    assert detail["enrollment"]["progress_percent"] == 100
    assert detail["sessions"][0]["venue"] == "Lab 2"


def test_session_cannot_end_before_it_starts(client, auth, klass):
    course = make_course(client, auth, klass, course_type="blended")
    resp = client.post(f"/courses/{course['id']}/sessions", json={
        "title": "Backwards", "mode": "online",
        "starts_at": "2027-03-01T10:00:00", "ends_at": "2027-03-01T09:00:00",
    }, headers=auth)
    assert resp.status_code == 400


# --------------------------------------------------------------------------
# Feedback and notes
# --------------------------------------------------------------------------


def test_feedback_and_private_notes(client, auth, learner, klass):
    student, student_auth = learner
    course = make_course(client, auth, klass, auto_enroll_class=True, status="Draft")
    add_section(client, auth, course["id"])
    client.put(f"/courses/{course['id']}", json={"status": "Published"}, headers=auth)

    resp = client.post(
        f"/portal/students/{student.id}/courses/{course['id']}/feedback",
        json={"rating": 6}, headers=student_auth,
    )
    assert resp.status_code == 400

    resp = client.post(
        f"/portal/students/{student.id}/courses/{course['id']}/feedback",
        json={"rating": 5, "comment": "Clear and well paced."}, headers=student_auth,
    )
    assert resp.status_code == 200, resp.text

    staff_view = client.get(f"/courses/{course['id']}/feedback", headers=auth).json()
    assert staff_view["average_rating"] == 5
    assert staff_view["feedback"][0]["comment"] == "Clear and well paced."

    note = client.post(
        f"/portal/students/{student.id}/courses/{course['id']}/notes",
        json={"body": "Remember: denominator is the bottom."}, headers=student_auth,
    ).json()
    notes = client.get(
        f"/portal/students/{student.id}/courses/{course['id']}/notes", headers=student_auth
    ).json()
    assert [n["id"] for n in notes] == [note["id"]]

    assert client.delete(
        f"/portal/students/{student.id}/courses/{course['id']}/notes/{note['id']}",
        headers=student_auth,
    ).status_code == 200


def test_not_enrolled_means_no_access_to_the_inside_of_a_course(client, auth, db_session, klass):
    outsider = _make_student(db_session, klass, name="Outsider")
    outsider_auth = _student_auth(client, db_session, outsider, auth)
    course = make_course(client, auth, klass)

    assert client.get(
        f"/portal/students/{outsider.id}/courses/{course['id']}", headers=outsider_auth
    ).status_code == 404
    assert client.post(
        f"/portal/students/{outsider.id}/courses/{course['id']}/notes",
        json={"body": "x"}, headers=outsider_auth,
    ).status_code == 404


def test_courses_blocked_when_module_disabled(client, auth, learner):
    student, student_auth = learner
    _set_feature("courses", False)
    try:
        assert client.get("/courses/", headers=auth).status_code == 403
        assert client.get(
            f"/portal/students/{student.id}/courses", headers=student_auth
        ).status_code == 403
    finally:
        _set_feature("courses", True)
