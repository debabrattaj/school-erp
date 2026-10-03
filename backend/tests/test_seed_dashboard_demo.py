from datetime import date, timedelta

from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.database import Base
from app.models import Attendance, Fee, LibraryIssue, Student
from seed_dashboard_demo import seed_dashboard


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
        assert counts == {"students": 24, "attendance": 336, "fees": 24, "books": 8, "library_issues": 8}
        assert db.query(Attendance).filter_by(student_id=original.id).count() == 0
        assert db.query(Attendance).filter_by(attendance_date=today).count() == 24
        assert db.query(LibraryIssue).filter(LibraryIssue.due_date < today).count() == 3
        assert db.query(Student).filter_by(nationality="Nepali").count() == 4
        for fee in db.query(Fee):
            assert fee.total_amount == fee.paid_amount + fee.due_amount
        assert seed_dashboard(db, today) == {}
        db.commit()
        assert seed_dashboard(db, today + timedelta(days=1)) == {"attendance": 24}
        db.commit()
        assert db.query(Student).count() == 25
    engine.dispose()
