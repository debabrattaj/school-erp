from datetime import date, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.models import Attendance, Exam, Fee, LibraryIssue, Mark, Student
from seed_dashboard_demo import TAG, demo_attendance_status, seed_dashboard


def test_demo_seed_is_repeatable_and_preserves_other_students():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        original = Student(admission_no="EXISTING", first_name="Existing", nationality="Indian")
        db.add(original)
        db.commit()
        today = date(2026, 10, 3)
        counts = seed_dashboard(db, today)
        db.commit()
        assert counts == {"students": 24, "attendance": 336, "fees": 24, "books": 8, "library_issues": 8,
                          "completed_exams": 12, "marks": 72, "upcoming_exams": 3}
        assert db.query(Attendance).filter_by(student_id=original.id).count() == 0
        assert db.query(Attendance).filter_by(attendance_date=today).count() == 24
        assert db.query(LibraryIssue).filter(LibraryIssue.due_date < today).count() == 3
        assert db.query(Student).filter_by(nationality="Nepali").count() == 4
        upcoming = db.query(Exam).filter(Exam.exam_date > today, Exam.exam_date <= today + timedelta(days=30)).all()
        assert len(upcoming) == 3
        assert db.query(Mark).filter(Mark.exam_id.in_([e.id for e in upcoming])).count() == 0
        assert {m.grade for m in db.query(Mark)} == {"A+", "A", "B", "C", "D", "F"}
        assert db.query(Mark).filter_by(student_id=original.id).count() == 0
        for mark in db.query(Mark):
            assert 0 <= mark.marks_obtained <= mark.total_marks
            assert mark.percentage == mark.marks_obtained
        preserved_mark = db.query(Mark).first()
        preserved_mark.marks_obtained = 99
        preserved_mark.percentage = 99
        preserved_mark.grade = "A+"
        db.commit()
        for fee in db.query(Fee):
            assert fee.total_amount == fee.paid_amount + fee.due_amount
        assert seed_dashboard(db, today) == {}
        db.commit()
        assert seed_dashboard(db, today + timedelta(days=1)) == {"attendance": 24}
        db.commit()
        assert db.query(Student).count() == 25
        assert db.query(Mark).count() == 72
        assert preserved_mark.marks_obtained == 99
    engine.dispose()


def test_daily_trend_varies_and_is_stable_by_date():
    today = date(2026, 10, 3)
    percentages = []
    for offset in range(14):
        day = today - timedelta(days=offset)
        statuses = [demo_attendance_status(i, day) for i in range(24)]
        percentages.append(sum(s in ("Present", "Late") for s in statuses) / 24 * 100)
    assert len(set(percentages)) >= 4
    assert min(percentages) >= 75
    assert max(percentages) <= 100


def test_refresh_changes_only_marked_demo_rows_and_is_repeatable():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        today = date(2026, 10, 3)
        seed_dashboard(db, today)
        # Reproduce the old constant-rate data without adding duplicate rows.
        for row in db.query(Attendance):
            row.status = "Absent"
        protected = db.query(Attendance).first()
        protected.remarks = "Staff correction"
        other = Student(admission_no="OTHER", first_name="Other")
        db.add(other)
        db.flush()
        real = Attendance(student_id=other.id, attendance_date=today, period_no=0,
                          status="Absent", source="Manual", remarks=TAG)
        lesson = Attendance(student_id=protected.student_id, attendance_date=today, period_no=1,
                            status="Absent", source="Manual", remarks=TAG)
        db.add_all([real, lesson])
        db.commit()
        assert seed_dashboard(db, today, refresh_attendance=True)["attendance_updated"] > 0
        db.commit()
        assert protected.status == real.status == lesson.status == "Absent"
        assert db.query(Attendance).count() == 338
        assert seed_dashboard(db, today, refresh_attendance=True) == {}
    engine.dispose()
