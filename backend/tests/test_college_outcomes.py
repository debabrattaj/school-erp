import uuid
import pytest

@pytest.fixture()
def student_id(client):
    from app.database import SessionLocal
    from app.models import Student
    db = SessionLocal()
    try:
        student = Student(admission_no=f"OUT-{uuid.uuid4().hex[:10]}", first_name="Ravi", last_name="Kumar")
        db.add(student); db.commit(); db.refresh(student)
        return student.id
    finally:
        db.close()

def test_results_and_placement_flow(client, auth, student_id):
    result = client.post("/college-outcomes/semester-results", headers=auth, json={"student_id": student_id, "academic_year": "2026-27", "semester": "Semester 8", "sgpa": 8.7, "cgpa": 8.3, "credits_registered": 22, "credits_earned": 22, "backlog_count": 0, "result_status": "Published"})
    assert result.status_code == 200, result.text
    assert result.json()["student_name"] == "Ravi Kumar"
    recruiter = client.post("/college-outcomes/recruiters", headers=auth, json={"company_name": f"Acme {uuid.uuid4().hex[:8]}", "industry": "Technology"})
    assert recruiter.status_code == 200, recruiter.text
    offer = client.post("/college-outcomes/offers", headers=auth, json={"student_id": student_id, "recruiter_id": recruiter.json()["id"], "role_title": "Software Engineer", "offer_type": "Placement", "ctc_lpa": 12.5, "status": "Offered"})
    assert offer.status_code == 200, offer.text
    assert offer.json()["student_name"] == "Ravi Kumar"
    assert offer.json()["recruiter_name"] == recruiter.json()["company_name"]

def test_results_reject_earned_credits_above_registered(client, auth, student_id):
    response = client.post("/college-outcomes/semester-results", headers=auth, json={"student_id": student_id, "academic_year": "2026-27", "semester": "Semester 1", "credits_registered": 20, "credits_earned": 21})
    assert response.status_code == 400
