def test_workload_summarizes_theory_and_practical_hours(client, auth):
    from app.database import SessionLocal
    from app.models import ClassSubject, SchoolClass, SubjectMaster, Teacher
    db = SessionLocal()
    try:
        teacher = Teacher(employee_no="WORKLOAD-1", name="Dr Mehta", department="Pharmacy")
        school_class = SchoolClass(class_name="B.Pharm Sem 5", section="A")
        subject = SubjectMaster(subject_code="PHR501", subject_name="Clinical Pharmacy", department="Pharmacy", credits=4, theory_hours=3, practical_hours=4)
        db.add_all([teacher, school_class, subject]); db.commit()
        db.add(ClassSubject(class_id=school_class.id, subject_id=subject.id, subject_name=subject.subject_name, academic_year="2026-27", teacher_id=teacher.id, weekly_periods=3, is_active=True)); db.commit()
    finally:
        db.close()
    response = client.get("/faculty-workload/", headers=auth, params={"academic_year": "2026-27"})
    assert response.status_code == 200, response.text
    row = next(item for item in response.json()["faculty"] if item["teacher_name"] == "Dr Mehta")
    assert row["theory_hours"] == 3
    assert row["practical_hours"] == 4
    assert row["weekly_hours"] == 7
