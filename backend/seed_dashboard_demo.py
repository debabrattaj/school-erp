"""Add clearly marked dashboard examples to ONE explicitly selected demo tenant.

Preview: python seed_dashboard_demo.py --account SCHOOL_CODE
Apply:   python seed_dashboard_demo.py --account SCHOOL_CODE --apply --confirm-demo SCHOOL_CODE
No existing records are overwritten. Run one instance at a time.
"""
import argparse
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

from app.database import make_engine  # noqa: E402
from app.models import Attendance, Fee, LibraryBook, LibraryIssue, Student  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

TAG = "DASHBOARD-DEMO"


def seed_dashboard(db, today):
    """Stage changes; the caller commits or rolls back the entire transaction."""
    counts = Counter()
    start_year = today.year if today.month >= 4 else today.year - 1
    academic_year = f"{start_year}-{str(start_year + 1)[-2:]}"
    demo_students = []
    for index in range(24):
        admission = f"{TAG}-{index + 1:03d}"
        student = db.query(Student).filter_by(admission_no=admission).first()
        if student is None:
            student = Student(
                admission_no=admission, first_name="Demo", last_name=f"Student {index + 1:02d}",
                class_name=str(1 + index % 12), section="A", student_status="Active",
                admission_date=today - timedelta(days=index),
                nationality="Nepali" if index < 4 else "Indian",
                transport_route="Demo Route A" if index % 3 == 0 else None,
            )
            db.add(student)
            db.flush()
            counts["students"] += 1
        demo_students.append(student)

    # Seed only dedicated sample pupils; never manufacture attendance for other students.
    student_ids = [s.id for s in demo_students]
    start = today - timedelta(days=13)
    existing = {(row.student_id, row.attendance_date) for row in db.query(Attendance).filter(
        Attendance.student_id.in_(student_ids), Attendance.period_no == 0,
        Attendance.attendance_date >= start, Attendance.attendance_date <= today,
    )}
    for offset in range(14):
        day = start + timedelta(days=offset)
        for index, student in enumerate(demo_students):
            if (student.id, day) in existing:
                continue
            roll = (index * 7 + offset * 3) % 24
            status = "Absent" if roll < 2 else "Late" if roll == 2 else "Excused" if roll == 3 else "Present"
            db.add(Attendance(student_id=student.id, attendance_date=day, period_no=0,
                academic_year=academic_year, class_name_snapshot=student.class_name,
                section_snapshot=student.section, status=status, source="Manual", remarks=TAG))
            counts["attendance"] += 1

    for index, student in enumerate(demo_students):
        if not db.query(Fee.id).filter_by(student_id=student.id, remarks=TAG).first():
            paid = [5000.0, 5000.0, 3500.0, 0.0][index % 4]
            db.add(Fee(student_id=student.id, fee_type="Demo Tuition Fee", academic_year=academic_year,
                class_name_snapshot=student.class_name, section_snapshot=student.section,
                total_amount=5000, concession_amount=0, late_fee_charged=0,
                paid_amount=paid, due_amount=5000-paid,
                payment_status="Paid" if paid == 5000 else "Partial" if paid else "Unpaid",
                payment_date=today if paid else None, due_date=today - timedelta(days=7), remarks=TAG))
            counts["fees"] += 1

    for index in range(8):
        accession = f"{TAG}-BOOK-{index + 1:02d}"
        book = db.query(LibraryBook).filter_by(accession_no=accession).first()
        if book is not None:
            continue
        book = LibraryBook(accession_no=accession, title=f"Demo Learning Book {index + 1}",
            author="Sample Author", category="Demo", total_copies=1, available_copies=0,
            status="Issued", remarks=TAG)
        db.add(book)
        db.flush()
        db.add(LibraryIssue(book_id=book.id, student_id=demo_students[index].id,
            borrower_type="Student", issue_date=today - timedelta(days=14),
            due_date=today + timedelta(days=-3 if index < 3 else 7), status="Issued",
            fine_amount=0, fine_paid=False, renewal_count=0, remarks=TAG))
        counts["books"] += 1
        counts["library_issues"] += 1
    db.flush()
    return dict(counts)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--account", required=True, help="Exact demo school account code")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--confirm-demo", help="Repeat the account code to confirm it is a demo tenant")
    args = parser.parse_args()
    if args.apply and args.confirm_demo != args.account:
        parser.error("To write dummy data, repeat the demo account code with --confirm-demo.")

    from app.tenant import CentralSessionLocal
    from app.tenant_models import SchoolAccount
    with CentralSessionLocal() as registry:
        account = registry.query(SchoolAccount).filter_by(account_code=args.account).first()
        if account is None:
            parser.error("School account not found. No data was changed.")
        print(f"Target school: {account.school_name} (code: {account.account_code})")
        url = account.database_url
        timezone = account.timezone or "Asia/Calcutta"
    today = datetime.now(ZoneInfo(timezone)).date()
    engine = make_engine(url)
    try:
        with Session(engine) as db:
            if not args.apply:
                # Truly read-only preview: PostgreSQL sequence counters also stay unchanged.
                sample_count = db.query(Student).filter(Student.admission_no.like(f"{TAG}-%")).count()
                print(f"Preview only. Date: {today}. Existing sample students: {sample_count}.")
                print("Will fill missing demo records: up to 24 sample pupils, 14 days of attendance, 24 fees and 8 library loans.")
                print("Includes 4 international pupils, 8 transport users and 3 overdue loans. Existing records are preserved.")
                return
            counts = seed_dashboard(db, today)
            db.commit()
            print(f"Added demo records for {today}: {counts or 'none; already seeded'}")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
