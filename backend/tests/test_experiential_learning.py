"""College internship/project/clinical rotation workflow."""
import uuid

import pytest


@pytest.fixture()
def college_student(client):
    from app.database import SessionLocal
    from app.models import Student

    db = SessionLocal()
    try:
        student = Student(admission_no=f"COL-{uuid.uuid4().hex[:10]}", first_name="Ananya", last_name="Das")
        db.add(student)
        db.commit()
        db.refresh(student)
        return student.id
    finally:
        db.close()


def payload(student_id, **overrides):
    data = {
        "student_id": student_id,
        "academic_year": "2026-27",
        "experience_type": "Clinical Rotation",
        "title": "Community pharmacy rotation",
        "organization": "City Hospital",
        "required_hours": 120,
        "completed_hours": 24,
        "status": "In Progress",
    }
    data.update(overrides)
    return data


def test_experience_crud_and_filtering(client, auth, college_student):
    created_response = client.post("/experiential-learning/", headers=auth, json=payload(college_student))
    assert created_response.status_code == 200, created_response.text
    created = created_response.json()
    assert created["student_name"] == "Ananya Das"
    assert created["completed_hours"] == 24

    filtered = client.get("/experiential-learning/", headers=auth, params={"experience_type": "Clinical Rotation"})
    assert filtered.status_code == 200
    assert any(record["id"] == created["id"] for record in filtered.json())

    updated = client.put(
        f"/experiential-learning/{created['id']}",
        headers=auth,
        json={"completed_hours": 120, "status": "Completed", "score": 88},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["status"] == "Completed"

    deleted = client.delete(f"/experiential-learning/{created['id']}", headers=auth)
    assert deleted.status_code == 200


def test_experience_rejects_excess_completed_hours(client, auth, college_student):
    response = client.post(
        "/experiential-learning/", headers=auth,
        json=payload(college_student, completed_hours=121),
    )
    assert response.status_code == 400
    assert "cannot exceed" in response.json()["detail"]


def test_clinical_logbook_can_be_verified(client, auth, college_student):
    experience = client.post("/experiential-learning/", headers=auth, json=payload(college_student, start_date="2026-07-01", end_date="2026-07-31"))
    assert experience.status_code == 200, experience.text
    entry = client.post(f"/experiential-learning/{experience.json()['id']}/logbook", headers=auth, json={"log_date": "2026-07-04", "activity": "Medication dispensing review", "hours": 6, "verification_status": "Verified"})
    assert entry.status_code == 200, entry.text
    assert entry.json()["verified_at"] is not None
    logbook = client.get(f"/experiential-learning/{experience.json()['id']}/logbook", headers=auth)
    assert len(logbook.json()) == 1
