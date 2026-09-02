"""Course discussion forums: posting, visibility, locking and moderation."""

import uuid

import pytest

from tests.test_courses import (
    _make_student,
    _set_feature,
    _student_auth,
    add_lesson,
    add_section,
    make_course,
)


@pytest.fixture()
def db_session(client):
    from app.database import SessionLocal
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture(autouse=True)
def discussions_enabled(client):
    """Forums ship off -- student-visible discussion is a safeguarding
    decision, not a default -- so every test switches them on."""
    _set_feature("discussions", True)
    yield
    _set_feature("discussions", False)


@pytest.fixture()
def klass():
    return f"DSC-{uuid.uuid4().hex[:6]}"


@pytest.fixture()
def learner(client, auth, db_session, klass):
    student = _make_student(db_session, klass, name="Rae")
    return student, _student_auth(client, db_session, student, auth)


def make_topic(client, auth, **overrides):
    payload = {"title": "Why is 1/2 bigger than 1/3?"}
    payload.update(overrides)
    resp = client.post("/discussions/", json=payload, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def enrolled_course(client, auth, klass):
    course = make_course(client, auth, klass, auto_enroll_class=True, status="Draft")
    section = add_section(client, auth, course["id"])
    add_lesson(client, auth, course["id"], section["id"])
    client.put(f"/courses/{course['id']}", json={"status": "Published"}, headers=auth)
    return course


def test_topic_needs_somewhere_to_live(client, auth):
    resp = client.post("/discussions/", json={"title": "Homeless"}, headers=auth)
    assert resp.status_code == 400


def test_opening_message_is_an_ordinary_post(client, auth, klass):
    topic = make_topic(
        client, auth, class_name=klass, body="Because the pieces are bigger."
    )
    assert topic["post_count"] == 1

    thread = client.get(f"/discussions/{topic['id']}", headers=auth).json()
    assert len(thread["posts"]) == 1
    assert thread["posts"][0]["body"] == "Because the pieces are bigger."
    assert thread["posts"][0]["is_staff"] is True


def test_family_reads_and_replies_on_their_class_topic(client, auth, learner, klass):
    student, student_auth = learner
    topic = make_topic(client, auth, class_name=klass, body="Discuss.")

    listed = client.get(
        f"/portal/students/{student.id}/discussions", headers=student_auth
    ).json()
    assert [t["id"] for t in listed] == [topic["id"]]

    resp = client.post(
        f"/portal/students/{student.id}/discussions/{topic['id']}/posts",
        json={"body": "Because thirds are smaller slices."}, headers=student_auth,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_staff"] is False

    thread = client.get(
        f"/portal/students/{student.id}/discussions/{topic['id']}", headers=student_auth
    ).json()
    assert len(thread["posts"]) == 2


def test_another_classs_topic_is_invisible(client, auth, learner):
    student, student_auth = learner
    other = make_topic(client, auth, class_name=f"OTHER-{uuid.uuid4().hex[:6]}", body="Not yours")

    listed = client.get(
        f"/portal/students/{student.id}/discussions", headers=student_auth
    ).json()
    assert other["id"] not in [t["id"] for t in listed]

    assert client.get(
        f"/portal/students/{student.id}/discussions/{other['id']}", headers=student_auth
    ).status_code == 404
    assert client.post(
        f"/portal/students/{student.id}/discussions/{other['id']}/posts",
        json={"body": "Sneaking in"}, headers=student_auth,
    ).status_code == 404


def test_course_topic_needs_enrollment(client, auth, db_session, klass):
    outsider = _make_student(db_session, klass, name="Outsider")
    outsider_auth = _student_auth(client, db_session, outsider, auth)
    course = make_course(client, auth, klass)  # nobody auto-enrolled
    topic = make_topic(client, auth, course_id=course["id"], class_name=klass, body="Course chat")

    assert client.get(
        f"/portal/students/{outsider.id}/discussions/{topic['id']}", headers=outsider_auth
    ).status_code == 404


def test_enrolled_learner_sees_the_course_topic(client, auth, learner, klass):
    student, student_auth = learner
    course = enrolled_course(client, auth, klass)
    topic = make_topic(client, auth, course_id=course["id"], class_name=klass, body="Course chat")

    listed = client.get(
        f"/portal/students/{student.id}/discussions",
        params={"course_id": course["id"]}, headers=student_auth,
    ).json()
    assert [t["id"] for t in listed] == [topic["id"]]


def test_locking_stops_replies_from_the_class_but_not_staff(client, auth, learner, klass):
    student, student_auth = learner
    topic = make_topic(client, auth, class_name=klass, body="Closing this.")
    client.put(f"/discussions/{topic['id']}", json={"is_locked": True}, headers=auth)

    resp = client.post(
        f"/portal/students/{student.id}/discussions/{topic['id']}/posts",
        json={"body": "One more thing"}, headers=student_auth,
    )
    assert resp.status_code == 400

    # A teacher's closing word is usually why it was locked.
    resp = client.post(
        f"/discussions/{topic['id']}/posts", json={"body": "Final answer."}, headers=auth
    )
    assert resp.status_code == 200


def test_hiding_a_post_keeps_the_record_but_not_the_text(client, auth, learner, klass):
    student, student_auth = learner
    topic = make_topic(client, auth, class_name=klass, body="Discuss.")
    post = client.post(
        f"/portal/students/{student.id}/discussions/{topic['id']}/posts",
        json={"body": "something unkind"}, headers=student_auth,
    ).json()

    resp = client.post(
        f"/discussions/{topic['id']}/posts/{post['id']}/hide",
        json={"hidden": True, "reason": "Unkind"}, headers=auth,
    )
    assert resp.status_code == 200, resp.text

    # Staff keep the text and the reason.
    thread = client.get(f"/discussions/{topic['id']}", headers=auth).json()
    hidden = next(p for p in thread["posts"] if p["id"] == post["id"])
    assert hidden["body"] == "something unkind"
    assert hidden["hidden_reason"] == "Unkind"

    # The class sees neither the post nor its text.
    thread = client.get(
        f"/portal/students/{student.id}/discussions/{topic['id']}", headers=student_auth
    ).json()
    assert post["id"] not in [p["id"] for p in thread["posts"]]

    # And it stops counting toward the topic's activity.
    listed = client.get("/discussions/", params={"class_name": klass}, headers=auth).json()
    assert next(t for t in listed if t["id"] == topic["id"])["post_count"] == 1

    # Unhiding puts it back.
    client.post(
        f"/discussions/{topic['id']}/posts/{post['id']}/hide",
        json={"hidden": False}, headers=auth,
    )
    thread = client.get(
        f"/portal/students/{student.id}/discussions/{topic['id']}", headers=student_auth
    ).json()
    assert post["id"] in [p["id"] for p in thread["posts"]]


def test_replies_nest_only_one_level(client, auth, learner, klass):
    student, student_auth = learner
    topic = make_topic(client, auth, class_name=klass, body="Root")
    root = client.get(f"/discussions/{topic['id']}", headers=auth).json()["posts"][0]

    reply = client.post(
        f"/portal/students/{student.id}/discussions/{topic['id']}/posts",
        json={"body": "A reply", "parent_post_id": root["id"]}, headers=student_auth,
    ).json()
    assert reply["parent_post_id"] == root["id"]

    # A reply to the reply attaches to the post that started the sub-thread.
    deeper = client.post(
        f"/portal/students/{student.id}/discussions/{topic['id']}/posts",
        json={"body": "Deeper", "parent_post_id": reply["id"]}, headers=student_auth,
    ).json()
    assert deeper["parent_post_id"] == root["id"]


def test_empty_and_oversized_posts_refused(client, auth, learner, klass):
    student, student_auth = learner
    topic = make_topic(client, auth, class_name=klass, body="Discuss.")

    assert client.post(
        f"/portal/students/{student.id}/discussions/{topic['id']}/posts",
        json={"body": "   "}, headers=student_auth,
    ).status_code == 400

    assert client.post(
        f"/portal/students/{student.id}/discussions/{topic['id']}/posts",
        json={"body": "x" * 9000}, headers=student_auth,
    ).status_code == 400


def test_pinned_topics_sort_first(client, auth, klass):
    make_topic(client, auth, class_name=klass, title="Ordinary", body="a")
    pinned = make_topic(client, auth, class_name=klass, title="Read me first", body="b")
    client.put(f"/discussions/{pinned['id']}", json={"is_pinned": True}, headers=auth)

    listed = client.get("/discussions/", params={"class_name": klass}, headers=auth).json()
    assert listed[0]["id"] == pinned["id"]


def test_discussions_blocked_when_module_disabled(client, auth, learner, klass):
    student, student_auth = learner
    _set_feature("discussions", False)
    try:
        assert client.get("/discussions/", headers=auth).status_code == 403
        assert client.get(
            f"/portal/students/{student.id}/discussions", headers=student_auth
        ).status_code == 403
    finally:
        _set_feature("discussions", True)
