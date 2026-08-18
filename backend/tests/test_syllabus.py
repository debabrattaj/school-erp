"""Syllabus tracking and lesson plans.

The document is the easy part; the tests here are about the number a head of
school acts on. Coverage has to be weighted by how long topics were meant to
take, it must not be inflatable by ticking off future lessons, and a copied
syllabus must not arrive carrying last year's progress.
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


def _class_subject(db, subject_name="Mathematics", academic_year="2026-27", teacher_id=None):
    from app.models import ClassSubject, SchoolClass
    school_class = SchoolClass(
        class_name=f"Class {uuid.uuid4().hex[:4]}", section="A", academic_year=academic_year,
    )
    db.add(school_class)
    db.commit()
    db.refresh(school_class)

    class_subject = ClassSubject(
        class_id=school_class.id, subject_name=subject_name,
        academic_year=academic_year, teacher_id=teacher_id, weekly_periods=5,
    )
    db.add(class_subject)
    db.commit()
    db.refresh(class_subject)
    return class_subject


def _unit(client, auth, class_subject_id, title="Algebra", **overrides):
    payload = {"class_subject_id": class_subject_id, "title": title}
    payload.update(overrides)
    resp = client.post("/syllabus/units", json=payload, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _topic(client, auth, unit_id, title="Linear equations", periods=1):
    resp = client.post(f"/syllabus/units/{unit_id}/topics",
                       json={"title": title, "planned_periods": periods}, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _mark(client, auth, topic_id, status, **extra):
    return client.post(f"/syllabus/topics/{topic_id}/mark",
                       json={"status": status, **extra}, headers=auth)


def _coverage(client, auth, class_subject_id, **params):
    query = "".join(f"&{k}={v}" for k, v in params.items())
    resp = client.get(f"/syllabus/coverage?class_subject_id={class_subject_id}{query}",
                      headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


# --------------------------------------------------------------------------
# Coverage arithmetic
# --------------------------------------------------------------------------


def test_coverage_is_weighted_by_planned_periods(client, auth, db_session):
    """A three-period topic is worth three times a one-period topic. Counting
    topics instead would let a teacher lead on coverage by teaching the short
    ones first."""
    cs = _class_subject(db_session)
    unit = _unit(client, auth, cs.id)
    short = _topic(client, auth, unit["id"], "Short topic", periods=1)
    _topic(client, auth, unit["id"], "Long topic", periods=3)

    _mark(client, auth, short["id"], "Completed")
    assert _coverage(client, auth, cs.id)["percent_covered"] == 25.0


def test_an_unweighted_syllabus_still_produces_a_percentage(client, auth, db_session):
    cs = _class_subject(db_session)
    unit = _unit(client, auth, cs.id)
    first = _topic(client, auth, unit["id"], "One")
    _topic(client, auth, unit["id"], "Two")

    _mark(client, auth, first["id"], "Completed")
    assert _coverage(client, auth, cs.id)["percent_covered"] == 50.0


def test_full_coverage_is_exactly_one_hundred(client, auth, db_session):
    cs = _class_subject(db_session)
    unit = _unit(client, auth, cs.id)
    for i in range(3):
        topic = _topic(client, auth, unit["id"], f"Topic {i}", periods=i + 1)
        _mark(client, auth, topic["id"], "Completed")

    body = _coverage(client, auth, cs.id)
    assert body["percent_covered"] == 100.0
    assert body["units_completed"] == 1


def test_an_empty_syllabus_reports_zero_rather_than_erroring(client, auth, db_session):
    cs = _class_subject(db_session)
    body = _coverage(client, auth, cs.id)
    assert body["percent_covered"] == 0.0
    assert body["units"] == 0


def test_units_are_weighted_against_each_other(client, auth, db_session):
    """A ten-period unit outweighs a two-period one, so finishing the small
    unit is not most of the syllabus."""
    cs = _class_subject(db_session)
    big = _unit(client, auth, cs.id, title="Big unit", planned_periods=10)
    small = _unit(client, auth, cs.id, title="Small unit", planned_periods=2)
    _topic(client, auth, big["id"], "Big topic")
    small_topic = _topic(client, auth, small["id"], "Small topic")

    _mark(client, auth, small_topic["id"], "Completed")
    # 2 of 12 planned periods.
    assert _coverage(client, auth, cs.id)["percent_covered"] == 16.7


# --------------------------------------------------------------------------
# Unit status is derived, not typed
# --------------------------------------------------------------------------


def test_unit_status_follows_its_topics(client, auth, db_session):
    cs = _class_subject(db_session)
    unit = _unit(client, auth, cs.id)
    first = _topic(client, auth, unit["id"], "One")
    second = _topic(client, auth, unit["id"], "Two")

    def status():
        units = client.get(f"/syllabus/units?class_subject_id={cs.id}", headers=auth).json()
        return units[0]["status"]

    assert status() == "Pending"
    _mark(client, auth, first["id"], "In Progress")
    assert status() == "In Progress"
    _mark(client, auth, first["id"], "Completed")
    _mark(client, auth, second["id"], "Completed")
    assert status() == "Completed"


def test_a_hand_set_unit_status_cannot_outrank_its_topics(client, auth, db_session):
    """Otherwise a unit reads Completed while half its topics are untaught,
    which is exactly the drift the module exists to catch."""
    cs = _class_subject(db_session)
    unit = _unit(client, auth, cs.id)
    _topic(client, auth, unit["id"], "Untaught")

    resp = client.put(f"/syllabus/units/{unit['id']}",
                      json={"status": "Completed"}, headers=auth)
    assert resp.status_code == 200
    assert resp.json()["status"] == "Pending"


def test_a_unit_with_no_topics_keeps_the_status_it_is_given(client, auth, db_session):
    cs = _class_subject(db_session)
    unit = _unit(client, auth, cs.id, title="Project work")

    resp = client.put(f"/syllabus/units/{unit['id']}",
                      json={"status": "Completed"}, headers=auth)
    assert resp.json()["status"] == "Completed"
    assert _coverage(client, auth, cs.id)["percent_covered"] == 100.0


# --------------------------------------------------------------------------
# The completion stamp
# --------------------------------------------------------------------------


def test_completing_records_who_taught_it_and_when(client, auth, db_session):
    cs = _class_subject(db_session)
    unit = _unit(client, auth, cs.id)
    topic = _topic(client, auth, unit["id"])
    taught_on = (date.today() - timedelta(days=5)).isoformat()

    body = _mark(client, auth, topic["id"], "Completed", on_date=taught_on,
                 periods_taken=2).json()
    assert body["completed_on"] == taught_on
    assert body["completed_by"] == "admin@school.com"
    assert body["periods_taken"] == 2


def test_re_saving_a_completed_topic_keeps_the_original_date(client, auth, db_session):
    """The stamp is the record of when the class was taught, not of the last
    time somebody opened the form."""
    cs = _class_subject(db_session)
    unit = _unit(client, auth, cs.id)
    topic = _topic(client, auth, unit["id"])
    taught_on = (date.today() - timedelta(days=10)).isoformat()

    _mark(client, auth, topic["id"], "Completed", on_date=taught_on)
    again = _mark(client, auth, topic["id"], "Completed", notes="tidied up").json()
    assert again["completed_on"] == taught_on


def test_reopening_a_topic_clears_the_completion_stamp(client, auth, db_session):
    cs = _class_subject(db_session)
    unit = _unit(client, auth, cs.id)
    topic = _topic(client, auth, unit["id"])

    _mark(client, auth, topic["id"], "Completed")
    reopened = _mark(client, auth, topic["id"], "In Progress").json()
    assert reopened["completed_on"] is None
    assert reopened["completed_by"] is None


def test_a_topic_cannot_be_taught_in_the_future(client, auth, db_session):
    cs = _class_subject(db_session)
    unit = _unit(client, auth, cs.id)
    topic = _topic(client, auth, unit["id"])

    ahead = (date.today() + timedelta(days=3)).isoformat()
    resp = _mark(client, auth, topic["id"], "Completed", on_date=ahead)
    assert resp.status_code == 400
    assert "future date" in resp.json()["detail"]


# --------------------------------------------------------------------------
# Behind schedule
# --------------------------------------------------------------------------


def test_a_unit_past_its_planned_end_is_reported_late(client, auth, db_session):
    cs = _class_subject(db_session)
    overdue_by = 7
    unit = _unit(client, auth, cs.id, title="Late unit",
                 planned_end=(date.today() - timedelta(days=overdue_by)).isoformat())
    _topic(client, auth, unit["id"], "Untaught")

    body = _coverage(client, auth, cs.id)
    assert body["on_schedule"] is False
    assert body["overdue_units"][0]["days_late"] == overdue_by

    behind = client.get("/syllabus/behind", headers=auth).json()
    assert any(r["class_subject_id"] == cs.id for r in behind)


def test_a_finished_unit_is_never_late(client, auth, db_session):
    cs = _class_subject(db_session)
    unit = _unit(client, auth, cs.id, title="Done early",
                 planned_end=(date.today() - timedelta(days=20)).isoformat())
    topic = _topic(client, auth, unit["id"])
    _mark(client, auth, topic["id"], "Completed")

    body = _coverage(client, auth, cs.id)
    assert body["on_schedule"] is True
    assert body["overdue_units"] == []


def test_a_syllabus_with_no_dates_reports_unknown_not_on_track(client, auth, db_session):
    """Saying "on schedule" about a plan with no schedule would be a made-up
    reassurance."""
    cs = _class_subject(db_session)
    unit = _unit(client, auth, cs.id)
    _topic(client, auth, unit["id"])

    assert _coverage(client, auth, cs.id)["on_schedule"] is None


def test_expected_percent_is_none_without_year_dates(client, auth, db_session):
    cs = _class_subject(db_session, academic_year=f"YR-{uuid.uuid4().hex[:4]}")
    assert _coverage(client, auth, cs.id)["expected_percent"] is None


def test_expected_percent_tracks_the_academic_year(client, auth, db_session):
    from app.models import AcademicYear
    name = f"YR-{uuid.uuid4().hex[:4]}"
    db_session.add(AcademicYear(
        name=name,
        start_date=date.today() - timedelta(days=100),
        end_date=date.today() + timedelta(days=100),
    ))
    db_session.commit()

    cs = _class_subject(db_session, academic_year=name)
    assert _coverage(client, auth, cs.id)["expected_percent"] == 50.0


# --------------------------------------------------------------------------
# Lesson plans
# --------------------------------------------------------------------------


def test_delivering_a_lesson_starts_its_topic(client, auth, db_session):
    cs = _class_subject(db_session)
    unit = _unit(client, auth, cs.id)
    topic = _topic(client, auth, unit["id"])

    plan = client.post("/syllabus/lesson-plans", json={
        "class_subject_id": cs.id, "plan_date": date.today().isoformat(),
        "title": "Intro to equations", "topic_id": topic["id"],
    }, headers=auth).json()

    resp = client.post(f"/syllabus/lesson-plans/{plan['id']}/deliver", json={}, headers=auth)
    assert resp.status_code == 200
    assert resp.json()["status"] == "Delivered"

    units = client.get(f"/syllabus/units?class_subject_id={cs.id}", headers=auth).json()
    assert units[0]["topics"][0]["status"] == "In Progress"


def test_delivering_does_not_complete_a_topic_unless_asked(client, auth, db_session):
    """One topic usually spans several periods, so auto-completing on the
    first lesson would over-report coverage."""
    cs = _class_subject(db_session)
    unit = _unit(client, auth, cs.id)
    topic = _topic(client, auth, unit["id"], periods=3)

    plan = client.post("/syllabus/lesson-plans", json={
        "class_subject_id": cs.id, "plan_date": date.today().isoformat(),
        "title": "Lesson one", "topic_id": topic["id"],
    }, headers=auth).json()
    client.post(f"/syllabus/lesson-plans/{plan['id']}/deliver", json={}, headers=auth)

    assert _coverage(client, auth, cs.id)["percent_covered"] == 0.0


def test_completing_the_topic_from_the_lesson_credits_coverage(client, auth, db_session):
    cs = _class_subject(db_session)
    unit = _unit(client, auth, cs.id)
    topic = _topic(client, auth, unit["id"])

    plan = client.post("/syllabus/lesson-plans", json={
        "class_subject_id": cs.id, "plan_date": date.today().isoformat(),
        "title": "Final lesson", "topic_id": topic["id"],
    }, headers=auth).json()
    resp = client.post(f"/syllabus/lesson-plans/{plan['id']}/deliver",
                       json={"complete_topic": True, "periods_taken": 2}, headers=auth)
    assert resp.status_code == 200
    assert _coverage(client, auth, cs.id)["percent_covered"] == 100.0


def test_a_future_lesson_cannot_be_marked_delivered(client, auth, db_session):
    """Otherwise coverage becomes a plan rather than a record."""
    cs = _class_subject(db_session)
    plan = client.post("/syllabus/lesson-plans", json={
        "class_subject_id": cs.id,
        "plan_date": (date.today() + timedelta(days=7)).isoformat(),
        "title": "Next week",
    }, headers=auth).json()

    resp = client.post(f"/syllabus/lesson-plans/{plan['id']}/deliver", json={}, headers=auth)
    assert resp.status_code == 400
    assert "future" in resp.json()["detail"]


def test_delivering_twice_is_refused(client, auth, db_session):
    cs = _class_subject(db_session)
    plan = client.post("/syllabus/lesson-plans", json={
        "class_subject_id": cs.id, "plan_date": date.today().isoformat(),
        "title": "Once only",
    }, headers=auth).json()
    client.post(f"/syllabus/lesson-plans/{plan['id']}/deliver", json={}, headers=auth)

    resp = client.post(f"/syllabus/lesson-plans/{plan['id']}/deliver", json={}, headers=auth)
    assert resp.status_code == 400


def test_a_lesson_cannot_point_at_another_classes_syllabus(client, auth, db_session):
    """It would quietly credit coverage to the wrong class."""
    mine = _class_subject(db_session)
    theirs = _class_subject(db_session)
    their_unit = _unit(client, auth, theirs.id)
    their_topic = _topic(client, auth, their_unit["id"])

    resp = client.post("/syllabus/lesson-plans", json={
        "class_subject_id": mine.id, "plan_date": date.today().isoformat(),
        "title": "Wrong link", "topic_id": their_topic["id"],
    }, headers=auth)
    assert resp.status_code == 400
    assert "different class subject" in resp.json()["detail"]


def test_a_delivered_lesson_cannot_be_deleted(client, auth, db_session):
    cs = _class_subject(db_session)
    plan = client.post("/syllabus/lesson-plans", json={
        "class_subject_id": cs.id, "plan_date": date.today().isoformat(),
        "title": "Taught",
    }, headers=auth).json()
    client.post(f"/syllabus/lesson-plans/{plan['id']}/deliver", json={}, headers=auth)

    resp = client.delete(f"/syllabus/lesson-plans/{plan['id']}", headers=auth)
    assert resp.status_code == 400


def test_review_records_the_decision(client, auth, db_session):
    cs = _class_subject(db_session)
    plan = client.post("/syllabus/lesson-plans", json={
        "class_subject_id": cs.id, "plan_date": date.today().isoformat(),
        "title": "For review",
    }, headers=auth).json()

    resp = client.post(f"/syllabus/lesson-plans/{plan['id']}/review",
                       json={"review_status": "Changes Requested",
                             "note": "Add an assessment step"}, headers=auth)
    assert resp.status_code == 200
    assert resp.json()["review_status"] == "Changes Requested"
    assert resp.json()["reviewed_by"] == "admin@school.com"


# --------------------------------------------------------------------------
# Reuse and deletion
# --------------------------------------------------------------------------


def test_cloning_copies_the_plan_but_not_the_progress(client, auth, db_session):
    """Carrying last year's coverage over would claim work nobody has done."""
    source = _class_subject(db_session)
    unit = _unit(client, auth, source.id, planned_periods=6,
                 planned_end=(date.today() - timedelta(days=30)).isoformat())
    topic = _topic(client, auth, unit["id"], "Taught last year", periods=6)
    _mark(client, auth, topic["id"], "Completed")

    target = _class_subject(db_session)
    resp = client.post("/syllabus/clone", json={
        "source_class_subject_id": source.id, "target_class_subject_id": target.id,
    }, headers=auth)
    assert resp.status_code == 200
    assert resp.json()["units_copied"] == 1

    copied = client.get(f"/syllabus/units?class_subject_id={target.id}", headers=auth).json()
    assert copied[0]["title"] == unit["title"]
    assert copied[0]["planned_periods"] == 6
    assert copied[0]["status"] == "Pending"
    assert copied[0]["topics"][0]["status"] == "Pending"
    assert copied[0]["topics"][0]["completed_on"] is None
    # Last year's deadline would report the new class as a month behind on
    # day one.
    assert copied[0]["planned_end"] is None
    assert _coverage(client, auth, target.id)["percent_covered"] == 0.0


def test_cloning_onto_an_existing_syllabus_is_refused(client, auth, db_session):
    source = _class_subject(db_session)
    _unit(client, auth, source.id)
    target = _class_subject(db_session)
    _unit(client, auth, target.id, title="Already here")

    resp = client.post("/syllabus/clone", json={
        "source_class_subject_id": source.id, "target_class_subject_id": target.id,
    }, headers=auth)
    assert resp.status_code == 400
    assert "double every unit" in resp.json()["detail"]


def test_a_unit_that_has_been_taught_from_cannot_be_deleted(client, auth, db_session):
    cs = _class_subject(db_session)
    unit = _unit(client, auth, cs.id)
    topic = _topic(client, auth, unit["id"])
    _mark(client, auth, topic["id"], "Completed")

    resp = client.delete(f"/syllabus/units/{unit['id']}", headers=auth)
    assert resp.status_code == 400
    assert "erase the record" in resp.json()["detail"]


def test_an_untouched_unit_can_be_deleted(client, auth, db_session):
    cs = _class_subject(db_session)
    unit = _unit(client, auth, cs.id, title="Dropped from the syllabus")
    _topic(client, auth, unit["id"])

    assert client.delete(f"/syllabus/units/{unit['id']}", headers=auth).status_code == 200
    assert client.get(f"/syllabus/units?class_subject_id={cs.id}", headers=auth).json() == []


def test_a_unit_cannot_end_before_it_starts(client, auth, db_session):
    cs = _class_subject(db_session)
    resp = client.post("/syllabus/units", json={
        "class_subject_id": cs.id, "title": "Backwards",
        "planned_start": date.today().isoformat(),
        "planned_end": (date.today() - timedelta(days=5)).isoformat(),
    }, headers=auth)
    assert resp.status_code == 400


# --------------------------------------------------------------------------
# Deleting leaves nothing behind
#
# SQLite ignores ON DELETE CASCADE unless foreign keys are enforced, and this
# codebase queries explicitly rather than using ORM relationships, so nothing
# removes children on its own. Orphans matter here because SQLite reuses row
# ids: a topic left behind by a deleted unit can re-attach itself to the next
# unit created and report coverage for a class never taught it.
# --------------------------------------------------------------------------


def test_deleting_a_unit_takes_its_topics_with_it(client, auth, db_session):
    from app.models import SyllabusTopic

    cs = _class_subject(db_session)
    unit = _unit(client, auth, cs.id)
    topic = _topic(client, auth, unit["id"])

    assert client.delete(f"/syllabus/units/{unit['id']}", headers=auth).status_code == 200
    db_session.expire_all()
    assert db_session.query(SyllabusTopic).filter(
        SyllabusTopic.id == topic["id"]
    ).first() is None


def test_deleting_a_topic_unlinks_its_lessons_but_keeps_them(client, auth, db_session):
    """The lesson happened; only the pointer goes."""
    cs = _class_subject(db_session)
    unit = _unit(client, auth, cs.id)
    topic = _topic(client, auth, unit["id"])
    plan = client.post("/syllabus/lesson-plans", json={
        "class_subject_id": cs.id, "plan_date": date.today().isoformat(),
        "title": "Taught this topic", "topic_id": topic["id"],
    }, headers=auth).json()

    assert client.delete(f"/syllabus/topics/{topic['id']}", headers=auth).status_code == 200

    plans = client.get(f"/syllabus/lesson-plans?class_subject_id={cs.id}", headers=auth).json()
    kept = next(p for p in plans if p["id"] == plan["id"])
    assert kept["topic_id"] is None


def test_deleting_the_class_subject_clears_its_syllabus(client, auth, db_session):
    from app.models import LessonPlan, SyllabusTopic, SyllabusUnit

    # Read the id up front: the row is gone by the time we assert, and the
    # session would try to refresh a deleted instance.
    cs_id = _class_subject(db_session).id
    unit = _unit(client, auth, cs_id)
    topic = _topic(client, auth, unit["id"])
    client.post("/syllabus/lesson-plans", json={
        "class_subject_id": cs_id, "plan_date": date.today().isoformat(),
        "title": "Doomed", "topic_id": topic["id"],
    }, headers=auth)

    assert client.delete(f"/class-subjects/{cs_id}", headers=auth).status_code == 200

    db_session.expire_all()
    assert db_session.query(SyllabusUnit).filter(
        SyllabusUnit.class_subject_id == cs_id).count() == 0
    assert db_session.query(SyllabusTopic).filter(
        SyllabusTopic.id == topic["id"]).first() is None
    assert db_session.query(LessonPlan).filter(
        LessonPlan.class_subject_id == cs_id).count() == 0
