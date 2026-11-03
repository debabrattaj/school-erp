import uuid

import pytest


@pytest.fixture()
def activity_payload(client):
    from app.database import SessionLocal
    from app.models import Student
    with SessionLocal() as db:
        student = Student(admission_no=f"ACT-{uuid.uuid4().hex[:10]}", first_name="Asha", last_name="Rao")
        db.add(student)
        db.commit()
        db.refresh(student)
        return {
            "student_id": student.id, "academic_year": "2026-27", "semester": "Semester 6",
            "activity_type": "Pharmacy Practical", "title": "Pharmaceutics practical assessment",
            "programme": "BPharm", "supervisor": "Dr Rao", "max_score": 50,
        }


@pytest.mark.parametrize("activity_type", ["Capstone Project", "Research Dissertation", "Engineering Practical", "Pharmacy Practical"])
def test_activity_lifecycle(client, auth, activity_payload, activity_type):
    payload = {**activity_payload, "activity_type": activity_type}
    created = client.post("/academic-activities", headers=auth, json=payload)
    assert created.status_code == 201, created.text
    row = created.json()
    assert row["student_name"] == "Asha Rao"
    options = client.get("/academic-activities/student-options", headers=auth)
    assert any(student["id"] == payload["student_id"] for student in options.json())
    updated = client.put(f"/academic-activities/{row['id']}", headers=auth, json={
        **payload, "version": row["version"], "progress": 100, "status": "Completed", "score": 43,
    })
    assert updated.status_code == 200, updated.text
    assert updated.json()["version"] > row["version"]
    listing = client.get("/academic-activities", headers=auth)
    assert any(item["id"] == row["id"] and item["score"] == 43 for item in listing.json())
    assert client.delete(f"/academic-activities/{row['id']}", headers=auth).status_code == 200


def test_retries_and_stale_updates(client, auth, activity_payload):
    row = client.post("/academic-activities", headers=auth, json=activity_payload).json()
    assert client.post("/academic-activities", headers=auth, json=activity_payload).status_code == 409
    update = {**activity_payload, "version": row["version"], "progress": 25}
    endpoint = f"/academic-activities/{row['id']}"
    assert client.put(endpoint, headers=auth, json=update).status_code == 200
    assert client.put(endpoint, headers=auth, json={**update, "progress": 50}).status_code == 409


@pytest.mark.parametrize("changes", [
    {"score": 51}, {"score": -1}, {"max_score": 0}, {"progress": 101},
    {"status": "Completed", "progress": 100},
    {"status": "Completed", "progress": 99, "score": 40},
    {"title": "   "}, {"activity_type": "Unknown"},
])
def test_invalid_assessments(client, auth, activity_payload, changes):
    result = client.post("/academic-activities", headers=auth, json={**activity_payload, **changes})
    assert result.status_code == 422, result.text


def test_missing_student_and_feature_gate(client, auth, activity_payload, monkeypatch):
    assert client.post("/academic-activities", headers=auth, json={**activity_payload, "student_id": 2147483647}).status_code == 404
    monkeypatch.setattr("app.tenant.is_feature_enabled", lambda account, feature: False)
    assert client.get("/academic-activities", headers=auth).status_code == 403


def test_student_cannot_access_staff_activities(client, activity_payload):
    from app.main import app
    from app.models import User
    from app.security import get_current_user
    app.dependency_overrides[get_current_user] = lambda: User(id=999, role="Student")
    try:
        assert client.get("/academic-activities").status_code == 403
        assert client.post("/academic-activities", json=activity_payload).status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_teacher_can_assess_but_cannot_delete(client, auth, activity_payload):
    from app.main import app
    from app.models import User
    from app.security import get_current_user
    row = client.post("/academic-activities", headers=auth, json=activity_payload).json()
    app.dependency_overrides[get_current_user] = lambda: User(id=999, role="Teacher")
    try:
        updated = client.put(f"/academic-activities/{row['id']}", headers=auth, json={
            **activity_payload, "version": row["version"], "progress": 50,
        })
        assert updated.status_code == 200
        assert client.delete(f"/academic-activities/{row['id']}", headers=auth).status_code == 403
    finally:
        app.dependency_overrides.pop(get_current_user, None)


def test_migration_handles_existing_and_new_table(tmp_path):
    import importlib.util
    from pathlib import Path
    import sqlalchemy as sa
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    path = Path(__file__).parents[1] / "alembic/versions/fc1d2e3f4a5b_add_academic_activities.py"
    spec = importlib.util.spec_from_file_location("activity_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = sa.create_engine(f"sqlite:///{tmp_path / 'migration.db'}")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE students (id INTEGER PRIMARY KEY)"))
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        migration.upgrade()
        assert sa.inspect(connection).has_table("academic_activities")
        assert "version" in {column["name"] for column in sa.inspect(connection).get_columns("academic_activities")}
        migration.downgrade()
        assert not sa.inspect(connection).has_table("academic_activities")
    engine.dispose()


def test_academic_migration_is_single_head():
    from pathlib import Path
    from alembic.config import Config
    from alembic.script import ScriptDirectory
    config = Config()
    config.set_main_option("script_location", str(Path(__file__).parents[1] / "alembic"))
    assert ScriptDirectory.from_config(config).get_heads() == ["fd2e3f4a5b6c"]


def test_milestone_review_and_completion(client, auth, activity_payload):
    activity = client.post("/academic-activities", headers=auth, json=activity_payload).json()
    endpoint = f"/academic-activities/{activity['id']}"
    milestone = {"title": "Prototype review", "due_date": "2026-11-30"}
    created = client.post(f"{endpoint}/milestones", headers=auth, json=milestone)
    assert created.status_code == 201, created.text
    row = created.json()
    assert client.post(f"{endpoint}/milestones", headers=auth, json=milestone).status_code == 409
    completion = {**activity_payload, "version": activity["version"], "status": "Completed", "progress": 100, "score": 45}
    assert client.put(endpoint, headers=auth, json=completion).status_code == 400
    approved = client.put(f"{endpoint}/milestones/{row['id']}", headers=auth, json={**milestone, "version": row["version"], "status": "Approved", "feedback": "Review accepted"})
    assert approved.status_code == 200, approved.text
    assert approved.json()["reviewed_by"]
    assert approved.json()["reviewed_at"]
    assert client.put(f"{endpoint}/milestones/{row['id']}", headers=auth, json={**milestone, "version": row["version"]}).status_code == 409
    assert client.put(endpoint, headers=auth, json=completion).status_code == 200
    assert client.post(f"{endpoint}/milestones", headers=auth, json={"title": "Extra"}).status_code == 409
    assert client.get(f"{endpoint}/milestones", headers=auth).json()[0]["feedback"] == "Review accepted"
    assert client.delete(endpoint, headers=auth).status_code == 200
    from app.database import SessionLocal
    from app.models import AcademicMilestone
    with SessionLocal() as db:
        assert db.query(AcademicMilestone).filter_by(activity_id=activity["id"]).count() == 0


def test_milestone_rejects_wrong_parent_and_invalid_status(client, auth, activity_payload):
    first = client.post("/academic-activities", headers=auth, json=activity_payload).json()
    second = client.post("/academic-activities", headers=auth, json={**activity_payload, "title": "Second activity"}).json()
    row = client.post(f"/academic-activities/{first['id']}/milestones", headers=auth, json={"title": "Review"}).json()
    wrong_parent = f"/academic-activities/{second['id']}/milestones/{row['id']}"
    assert client.put(wrong_parent, headers=auth, json={"title": "Review", "version": row["version"]}).status_code == 404
    assert client.delete(wrong_parent, headers=auth).status_code == 404
    assert client.post(f"/academic-activities/{first['id']}/milestones", headers=auth, json={"title": "Review", "status": "Unknown"}).status_code == 422


def test_milestone_evidence_and_review_attribution(client, auth, activity_payload):
    activity = client.post("/academic-activities", headers=auth, json=activity_payload).json()
    endpoint = f"/academic-activities/{activity['id']}/milestones"
    invalid = client.post(endpoint, headers=auth, json={"title": "Evidence", "evidence_url": "javascript:alert(1)"})
    assert invalid.status_code == 422
    result = client.post(endpoint, headers=auth, json={
        "title": "Evidence", "evidence_url": "https://example.com/report.pdf", "status": "Approved",
        "reviewed_by": "Spoofed reviewer",
    })
    assert result.status_code == 201, result.text
    row = result.json()
    assert row["reviewed_by"] != "Spoofed reviewer"
    assert row["reviewed_at"]
    changed = client.put(f"{endpoint}/{row['id']}", headers=auth, json={"title": "Evidence", "status": "Pending", "version": row["version"]})
    assert changed.status_code == 200
    assert changed.json()["reviewed_by"] is None
    assert changed.json()["reviewed_at"] is None
