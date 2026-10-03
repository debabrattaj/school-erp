"""Add clearly marked dashboard examples to ONE explicitly selected demo tenant.

Preview: python seed_dashboard_demo.py --account SCHOOL_CODE
Apply:   python seed_dashboard_demo.py --account SCHOOL_CODE --apply --confirm-demo SCHOOL_CODE
Use --refresh-attendance to update only marked sample attendance rows.
Other existing records are preserved. Run one instance at a time.
"""
import argparse
from collections import Counter
from datetime import date, datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))

from app.database import make_engine  # noqa: E402
from app.models import Attendance, Exam, Fee, LibraryBook, LibraryIssue, Mark, SchoolSettings, Student  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

TAG = "DASHBOARD-DEMO"


def demo_grade(score, settings):
    rules = (settings.grade_rules if settings else None) or "A+:90-100,A:80-89,B:70-79,C:60-69,D:40-59,F:0-39"
    for rule in rules.split(","):
        try:
            label, bounds = rule.split(":")
            lower, upper = map(float, bounds.split("-"))
            if lower <= score <= upper:
                return label.strip()
        except (ValueError, TypeError):
            continue
    threshold = (settings.pass_percentage if settings else None) or 40
    return "F" if score < threshold else "Pass"


def demo_attendance_status(index, day):
    # Date-based variation stays stable when the 14-day window moves forward.
    absent_counts = (2, 1, 3, 2, 4, 1, 2, 3, 1, 4, 2, 1, 3, 2)
    slot = day.toordinal() % len(absent_counts)
    absent = absent_counts[slot]
    excused = slot % 2
    late = 1 + slot % 3
    roll = (index * 7 + day.toordinal() * 3) % 24
    if roll < absent:
        return "Absent"
    if roll < absent + excused:
        return "Excused"
    if roll < absent + excused + late:
        return "Late"
    return "Present"


def seed_dashboard(db, today, refresh_attendance=False):
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
    existing = {}
    for row in db.query(Attendance).filter(
        Attendance.student_id.in_(student_ids), Attendance.period_no == 0,
        Attendance.attendance_date >= start, Attendance.attendance_date <= today,
    ):
        existing.setdefault((row.student_id, row.attendance_date), []).append(row)
    for offset in range(14):
        day = start + timedelta(days=offset)
        for index, student in enumerate(demo_students):
            status = demo_attendance_status(index, day)
            rows = existing.get((student.id, day), [])
            if rows:
                for row in rows:
                    if refresh_attendance and row.remarks == TAG and row.source == "Manual" and row.status != status:
                        row.status = status
                        counts["attendance_updated"] += 1
                continue
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

    # Completed sample exams power Grade Distribution and Top Performers.
    # Upcoming exams have no marks; results are never invented for future tests.
    settings = db.query(SchoolSettings).first()
    scores = (97, 92, 86, 84, 81, 78, 76, 74, 72, 68, 64, 55, 46, 35, 89, 82)
    classes = sorted({s.class_name for s in demo_students}, key=int)
    for class_name in classes:
        name = f"Demo Completed Assessment - Class {class_name}"
        exam = db.query(Exam).filter_by(exam_name=name, class_name=class_name,
            section="A", academic_year=academic_year, remarks=TAG).first()
        if exam is None:
            exam = Exam(exam_name=name, class_name=class_name, section="A", academic_year=academic_year,
                exam_type="Unit Test", exam_date=today - timedelta(days=10), remarks=TAG)
            db.add(exam)
            db.flush()
            counts["completed_exams"] += 1
        for index, student in enumerate(demo_students):
            if student.class_name != class_name:
                continue
            for subject_index, subject in enumerate(("English", "Mathematics", "Science")):
                if db.query(Mark.id).filter_by(student_id=student.id, exam_id=exam.id, subject=subject).first():
                    continue
                score = scores[(index * 3 + subject_index) % len(scores)]
                db.add(Mark(student_id=student.id, exam_id=exam.id, subject=subject, subject_name=subject,
                    academic_year=academic_year, class_name_snapshot=class_name, section_snapshot="A",
                    exam_name_snapshot=exam.exam_name, assessment_status="Scored", marks_obtained=score,
                    total_marks=100, max_marks=100, percentage=score, grade=demo_grade(score, settings), remarks=TAG))
                counts["marks"] += 1

    for index, class_name in enumerate(("5", "8", "10")):
        name = f"Demo Upcoming Assessment - Class {class_name}"
        if not db.query(Exam.id).filter_by(exam_name=name, class_name=class_name,
                section="A", academic_year=academic_year, remarks=TAG).first():
            db.add(Exam(exam_name=name, class_name=class_name, section="A", academic_year=academic_year,
                exam_type="Unit Test", exam_date=today + timedelta(days=7 + index * 7), remarks=TAG))
            counts["upcoming_exams"] += 1

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
    parser.add_argument("--refresh-attendance", action="store_true", help="Vary existing marked sample attendance within the last 14 days")
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
                print("Also fills 12 completed demo exams, 72 subject marks and 3 upcoming exams within 30 days.")
                if args.refresh_attendance:
                    print("Will also refresh statuses on marked demo attendance rows only.")
                return
            counts = seed_dashboard(db, today, refresh_attendance=args.refresh_attendance)
            db.commit()
            print(f"Demo record changes for {today}: {counts or 'none; already seeded'}")
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
