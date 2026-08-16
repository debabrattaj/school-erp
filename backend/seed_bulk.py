"""Top up every module to N records of demo data (default 100).

Distinct from seed_full_data.py, which is a one-shot script that builds one
internally-consistent demo school. This one is idempotent and additive: it
counts what a table already has and creates only the shortfall, so running it
twice does not double anything, and running it against a database that already
has real data leaves that data alone.

Every row it creates is tagged with SEED_TAG in a text column, so --purge can
remove exactly what this script made and nothing else.

    python seed_bulk.py --count 100 --yes     # top every module up to 100
    python seed_bulk.py --dry-run             # report what it would create
    python seed_bulk.py --purge --yes         # delete only seeded rows

SAFETY: this writes hundreds of fake rows. It refuses to run without --yes,
and always prints the database it resolved first -- check that line before
confirming. Do not point it at a tenant that has real students in it.
"""

import argparse
import os
import random
import sys
from datetime import date, datetime, time, timedelta

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv  # noqa: E402
load_dotenv()

from app import models  # noqa: E402
from app.database import DATABASE_URL, SessionLocal  # noqa: E402

# Stamped into a text column on every generated row. Also what --purge matches
# on, so it must stay stable and stay unlikely to occur in real data.
SEED_TAG = "[bulk-seed]"

random.seed(20260816)  # reproducible runs

FIRST_NAMES = [
    "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun", "Reyansh", "Ayaan", "Krishna",
    "Ishaan", "Rudra", "Ananya", "Diya", "Saanvi", "Aadhya", "Kiara", "Myra",
    "Anika", "Navya", "Riya", "Ira", "Kabir", "Advik", "Dhruv", "Kian",
]
LAST_NAMES = [
    "Sharma", "Verma", "Patel", "Reddy", "Nair", "Iyer", "Das", "Bose",
    "Jena", "Mohanty", "Sahu", "Panda", "Mishra", "Rout", "Behera", "Kar",
]
SUBJECTS = [
    "Mathematics", "Science", "English", "Hindi", "Social Studies", "Computer Science",
    "Physics", "Chemistry", "Biology", "History", "Geography", "Economics",
]
GRADES = [str(g) for g in range(1, 13)]
# A-C is what a real school runs; the rest exist only so a 100-record
# target is reachable for Classes like every other module.
SECTIONS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"]


def person_name():
    return random.choice(FIRST_NAMES), random.choice(LAST_NAMES)


def recent_date(max_days_back=180):
    return date.today() - timedelta(days=random.randint(0, max_days_back))


def existing_count(db, model):
    return db.query(model).count()


def shortfall(db, model, target):
    return max(0, target - existing_count(db, model))


# ---------------------------------------------------------------------------
# Seeders. Each takes (db, target, ctx) and returns how many rows it created.
# ctx carries the parent rows later seeders need, so students/teachers/classes
# are built first and everything downstream references real ids.
# ---------------------------------------------------------------------------


def seed_classes(db, target, ctx):
    made = 0
    existing = {(c.class_name, c.section) for c in db.query(models.SchoolClass).all()}
    for grade in GRADES:
        for section in SECTIONS:
            if len(existing) >= target:
                break
            if (grade, section) in existing:
                continue
            db.add(models.SchoolClass(
                class_name=grade, section=section, academic_year="2026-27",
                room_no=f"R{grade}{section}",
            ))
            existing.add((grade, section))
            made += 1
    db.commit()
    ctx["classes"] = db.query(models.SchoolClass).all()
    return made


def seed_subjects(db, target, ctx):
    made = 0
    have = {s.subject_code for s in db.query(models.SubjectMaster).all()}
    for i in range(target):
        base = SUBJECTS[i % len(SUBJECTS)]
        code = f"SB{i + 1:03d}"
        if code in have:
            continue
        name = base if i < len(SUBJECTS) else f"{base} {i // len(SUBJECTS) + 1}"
        db.add(models.SubjectMaster(
            subject_code=code, subject_name=name,
            subject_type="Scholastic", is_active=True,
        ))
        made += 1
        if existing_count(db, models.SubjectMaster) + made >= target:
            break
    db.commit()
    return made


def seed_teachers(db, target, ctx):
    n = shortfall(db, models.Teacher, target)
    start = existing_count(db, models.Teacher)
    for i in range(n):
        first, last = person_name()
        db.add(models.Teacher(
            employee_no=f"SEED-T{start + i + 1:04d}",
            name=f"{first} {last}",
            email=f"seed.teacher{start + i + 1}@example.com",
            phone=f"9{random.randint(100000000, 999999999)}",
            gender=random.choice(["Male", "Female"]),
            department=random.choice(["Science", "Humanities", "Languages", "Mathematics"]),
            subject=random.choice(SUBJECTS),
            qualification=random.choice(["B.Ed", "M.Ed", "M.Sc", "M.A", "Ph.D"]),
            joining_date=recent_date(2000),
            employment_type=random.choice(["Permanent", "Contract"]),
            address=f"{SEED_TAG} {random.randint(1, 200)} Demo Street",
        ))
    db.commit()
    ctx["teachers"] = db.query(models.Teacher).all()
    return n


def seed_students(db, target, ctx):
    n = shortfall(db, models.Student, target)
    start = existing_count(db, models.Student)
    classes = ctx["classes"]
    for i in range(n):
        gender = random.choice(["Male", "Female"])
        first, last = person_name()
        klass = random.choice(classes) if classes else None
        father_first, _ = person_name()
        db.add(models.Student(
            admission_no=f"SEED-S{start + i + 1:05d}",
            roll_no=str((start + i) % 40 + 1),
            class_name=klass.class_name if klass else "1",
            section=klass.section if klass else "A",
            class_id=klass.id if klass else None,
            first_name=first, last_name=last, gender=gender,
            dob=date(2010, 1, 1) + timedelta(days=random.randint(0, 2500)),
            admission_date=recent_date(1200),
            student_status="Active",
            residential_type=random.choice(["Day Scholar", "Hosteller"]),
            father_name=f"{father_first} {last}",
            mother_name=f"{random.choice(FIRST_NAMES)} {last}",
            guardian_name=f"{father_first} {last}",
            guardian_phone=f"9{random.randint(100000000, 999999999)}",
            guardian_email=f"seed.guardian{start + i + 1}@example.com",
            medical_notes=SEED_TAG,
        ))
    db.commit()
    ctx["students"] = db.query(models.Student).all()
    return n


def seed_academic_years(db, target, ctx):
    n = shortfall(db, models.AcademicYear, target)
    have = {y.name for y in db.query(models.AcademicYear).all()}
    made = 0
    year = 2000
    while made < n and year < 2000 + target * 2:
        name = f"{year}-{str(year + 1)[2:]}"
        if name not in have:
            db.add(models.AcademicYear(
                name=name,
                start_date=date(year, 4, 1), end_date=date(year + 1, 3, 31),
                remarks=SEED_TAG,
            ))
            made += 1
        year += 1
    db.commit()
    return made


def seed_attendance(db, target, ctx):
    """One row per student per day, walking back day by day to stay unique."""
    n = shortfall(db, models.Attendance, target)
    students = ctx["students"]
    if not students:
        return 0
    seen = {
        (a.student_id, a.attendance_date)
        for a in db.query(models.Attendance.student_id, models.Attendance.attendance_date).all()
    }
    made, day_offset = 0, 0
    while made < n and day_offset < 400:
        on = date.today() - timedelta(days=day_offset)
        for student in students:
            if made >= n:
                break
            if (student.id, on) in seen:
                continue
            db.add(models.Attendance(
                student_id=student.id, attendance_date=on,
                academic_year="2026-27", class_id=student.class_id,
                class_name_snapshot=student.class_name, section_snapshot=student.section,
                status=random.choices(
                    ["Present", "Absent", "Late", "Half Day"], weights=[85, 8, 5, 2]
                )[0],
                remarks=SEED_TAG,
            ))
            seen.add((student.id, on))
            made += 1
        day_offset += 1
    db.commit()
    return made


def seed_fees(db, target, ctx):
    n = shortfall(db, models.Fee, target)
    students = ctx["students"]
    if not students:
        return 0
    for i in range(n):
        student = students[i % len(students)]
        total = random.choice([2500, 5000, 7500, 12000])
        paid = random.choice([0, total // 2, total])
        db.add(models.Fee(
            student_id=student.id, class_id=student.class_id,
            fee_type=random.choice(["Tuition", "Transport", "Hostel", "Exam", "Library"]),
            total_amount=total, paid_amount=paid, due_date=recent_date(90),
            academic_year="2026-27", remarks=SEED_TAG,
        ))
    db.commit()
    return n


def seed_fee_structures(db, target, ctx):
    n = shortfall(db, models.FeeStructure, target)
    for i in range(n):
        db.add(models.FeeStructure(
            academic_year="2026-27",
            class_name=random.choice(GRADES),
            fee_type=random.choice(["Tuition", "Transport", "Hostel", "Exam", "Library"]),
            amount=random.choice([2500, 5000, 7500, 12000]),
            remarks=SEED_TAG,
        ))
    db.commit()
    return n


def seed_exams(db, target, ctx):
    n = shortfall(db, models.Exam, target)
    start = existing_count(db, models.Exam)
    for i in range(n):
        db.add(models.Exam(
            exam_name=f"{SEED_TAG} Exam {start + i + 1}",
            class_name=random.choice(GRADES), section=random.choice(SECTIONS[:3]),
            exam_date=recent_date(200), academic_year="2026-27",
            exam_type=random.choice(["Unit Test", "Midterm", "Final"]),
        ))
    db.commit()
    ctx["exams"] = db.query(models.Exam).all()
    return n


def seed_marks(db, target, ctx):
    n = shortfall(db, models.Mark, target)
    students, exams = ctx["students"], ctx.get("exams") or []
    if not students or not exams:
        return 0
    for i in range(n):
        student = students[i % len(students)]
        exam = exams[i % len(exams)]
        db.add(models.Mark(
            student_id=student.id, exam_id=exam.id, class_id=student.class_id,
            marks_obtained=random.randint(25, 100), max_marks=100, total_marks=100,
            subject_name=random.choice(SUBJECTS), subject=random.choice(SUBJECTS),
            class_name_snapshot=student.class_name, section_snapshot=student.section,
            exam_name_snapshot=exam.exam_name, academic_year="2026-27",
            remarks=SEED_TAG,
        ))
    db.commit()
    return n


def seed_admissions(db, target, ctx):
    n = shortfall(db, models.AdmissionInquiry, target)
    start = existing_count(db, models.AdmissionInquiry)
    for i in range(n):
        first, last = person_name()
        db.add(models.AdmissionInquiry(
            inquiry_no=f"SEED-INQ{start + i + 1:05d}",
            student_name=f"{first} {last}",
            grade_applying=random.choice(GRADES), academic_year="2026-27",
            guardian_name=f"{random.choice(FIRST_NAMES)} {last}",
            guardian_phone=f"9{random.randint(100000000, 999999999)}",
            guardian_email=f"seed.applicant{start + i + 1}@example.com",
            stage=random.choice(["New", "Contacted", "Assessment", "Admitted", "Lost"]),
            source=random.choice(["Walk-in", "Website", "Referral", "Phone"]),
            notes=SEED_TAG,
        ))
    db.commit()
    ctx["inquiries"] = db.query(models.AdmissionInquiry).all()
    return n


def seed_library(db, target, ctx):
    n = shortfall(db, models.LibraryBook, target)
    start = existing_count(db, models.LibraryBook)
    for i in range(n):
        db.add(models.LibraryBook(
            accession_no=f"SEED-BK{start + i + 1:05d}",
            title=f"{random.choice(SUBJECTS)} Reader Volume {start + i + 1}",
            author=f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}",
            category=random.choice(["Textbook", "Reference", "Fiction", "Non-fiction"]),
            total_copies=random.randint(1, 10), available_copies=random.randint(0, 5),
            remarks=SEED_TAG,
        ))
    db.commit()
    return n


def seed_inventory(db, target, ctx):
    n = shortfall(db, models.InventoryItem, target)
    start = existing_count(db, models.InventoryItem)
    for i in range(n):
        db.add(models.InventoryItem(
            item_name=f"{random.choice(['Chair', 'Desk', 'Projector', 'Whiteboard', 'Laptop'])} #{start + i + 1}",
            item_code=f"SEED-IT{start + i + 1:05d}",
            category=random.choice(["Furniture", "Electronics", "Stationery", "Sports"]),
            quantity_available=random.randint(1, 200), unit=random.choice(["pcs", "box", "set"]),
            reorder_level=random.randint(1, 20), unit_price=random.randint(50, 50000),
            location=random.choice(["Store A", "Store B", "Lab"]), status="Active",
            remarks=SEED_TAG,
        ))
    db.commit()
    return n


def seed_transport(db, target, ctx):
    made = 0
    n_routes = shortfall(db, models.TransportRoute, target)
    start = existing_count(db, models.TransportRoute)
    for i in range(n_routes):
        db.add(models.TransportRoute(
            route_name=f"Route {start + i + 1}",
            start_point="School Campus",
            end_point=f"Sector {random.randint(1, 40)}",
            remarks=SEED_TAG,
        ))
        made += 1
    db.commit()

    routes = db.query(models.TransportRoute).all()
    n_vehicles = shortfall(db, models.TransportVehicle, target)
    vstart = existing_count(db, models.TransportVehicle)
    for i in range(n_vehicles):
        db.add(models.TransportVehicle(
            vehicle_no=f"OD-{random.randint(10, 35)}-SEED-{vstart + i + 1:04d}",
            vehicle_type=random.choice(["Bus", "Van", "Minibus"]),
            capacity=random.choice([20, 30, 40, 50]),
            route_id=random.choice(routes).id if routes else None,
            driver_name=f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}",
            remarks=SEED_TAG,
        ))
        made += 1
    db.commit()
    return made


def seed_hostel(db, target, ctx):
    blocks = db.query(models.HostelBlock).all()
    if not blocks:
        for name in ("Seed Block A", "Seed Block B"):
            db.add(models.HostelBlock(block_name=name, remarks=SEED_TAG))
        db.commit()
        blocks = db.query(models.HostelBlock).all()

    n = shortfall(db, models.HostelRoom, target)
    start = existing_count(db, models.HostelRoom)
    for i in range(n):
        db.add(models.HostelRoom(
            block_id=random.choice(blocks).id,
            room_no=f"S{start + i + 1:04d}",
            capacity=random.choice([2, 3, 4]),
            floor=random.randint(0, 4), is_active=True,
            remarks=SEED_TAG,
        ))
    db.commit()
    return n


def seed_health(db, target, ctx):
    n = shortfall(db, models.HealthInfirmaryVisit, target)
    students = ctx["students"]
    if not students:
        return 0
    for i in range(n):
        db.add(models.HealthInfirmaryVisit(
            student_id=students[i % len(students)].id,
            visit_date=recent_date(120),
            visit_time=f"{random.randint(8, 16):02d}:{random.choice(['00', '15', '30', '45'])}",
            symptoms=random.choice(["Headache", "Fever", "Stomach ache", "Minor cut", "Cough"]),
            diagnosis=random.choice(["Viral", "Minor injury", "Indigestion", "Observation"]),
            treatment=random.choice(["Rest", "Paracetamol", "Dressing", "Sent home"]),
            attended_by="School Nurse", status="Closed",
            remarks=SEED_TAG,
        ))
    db.commit()
    return n


def seed_mess(db, target, ctx):
    n = shortfall(db, models.MessMenu, target)
    have = {(m.menu_date, m.meal_type) for m in db.query(models.MessMenu.menu_date, models.MessMenu.meal_type).all()}
    meals = ["Breakfast", "Lunch", "Snacks", "Dinner"]
    made, offset = 0, 0
    while made < n and offset < 400:
        on = date.today() - timedelta(days=offset)
        for meal in meals:
            if made >= n:
                break
            if (on, meal) in have:
                continue
            db.add(models.MessMenu(
                menu_date=on, meal_type=meal,
                menu_items=random.choice(["Rice, Dal, Sabzi", "Roti, Paneer", "Idli, Sambar", "Poha, Tea"]),
                remarks=SEED_TAG,
            ))
            have.add((on, meal))
            made += 1
        offset += 1
    db.commit()
    return made


def seed_counseling(db, target, ctx):
    n = shortfall(db, models.CounselingCase, target)
    students = ctx["students"]
    start = existing_count(db, models.CounselingCase)
    if not students:
        return 0
    for i in range(n):
        db.add(models.CounselingCase(
            case_no=f"SEED-CC{start + i + 1:05d}",
            student_id=students[i % len(students)].id,
            concern_type=random.choice(["Academic", "Behavioural", "Emotional", "Peer"]),
            risk_level=random.choice(["Low", "Medium", "High"]),
            counselor="School Counselor", session_date=recent_date(120),
            status=random.choice(["Open", "In Progress", "Closed"]),
            confidentiality_level=random.choice(["Standard", "Restricted"]),
            remarks=SEED_TAG,
        ))
    db.commit()
    return n


def seed_enrichment(db, target, ctx):
    n = shortfall(db, models.EnrichmentActivity, target)
    start = existing_count(db, models.EnrichmentActivity)
    for i in range(n):
        db.add(models.EnrichmentActivity(
            activity_code=f"SEED-EA{start + i + 1:04d}",
            activity_name=f"{random.choice(['Chess', 'Debate', 'Robotics', 'Choir', 'Athletics'])} Club {start + i + 1}",
            activity_type=random.choice(["Club", "Sport", "Competition", "Workshop"]),
            description=SEED_TAG,
        ))
    db.commit()
    return n


def seed_compliance(db, target, ctx):
    n = shortfall(db, models.ComplianceTask, target)
    start = existing_count(db, models.ComplianceTask)
    for i in range(n):
        db.add(models.ComplianceTask(
            task_code=f"SEED-CT{start + i + 1:04d}",
            accreditation_body=random.choice(["CBSE", "NAAC", "ICSE", "State Board"]),
            standard_area=random.choice(["Curriculum", "Infrastructure", "Governance", "Safety"]),
            requirement=f"{SEED_TAG} Demo requirement {start + i + 1}",
            status=random.choice(["Pending", "In Progress", "Complete"]),
        ))
    db.commit()
    return n


def seed_service_tickets(db, target, ctx):
    n = shortfall(db, models.StudentServiceTicket, target)
    students = ctx["students"]
    start = existing_count(db, models.StudentServiceTicket)
    for i in range(n):
        student = students[i % len(students)] if students else None
        db.add(models.StudentServiceTicket(
            ticket_no=f"SEED-TK{start + i + 1:05d}",
            student_id=student.id if student else None,
            requester_name=f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}",
            category=random.choice(["Transport", "Fees", "Certificate", "IT", "Other"]),
            subject=f"Demo request {start + i + 1}",
            description=f"{SEED_TAG} auto-generated ticket",
            status=random.choice(["Open", "In Progress", "Resolved"]),
        ))
    db.commit()
    return n


def seed_alumni(db, target, ctx):
    n = shortfall(db, models.AlumniWithdrawalRecord, target)
    students = ctx["students"]
    start = existing_count(db, models.AlumniWithdrawalRecord)
    for i in range(n):
        student = students[i % len(students)] if students else None
        first, last = person_name()
        db.add(models.AlumniWithdrawalRecord(
            record_no=f"SEED-AW{start + i + 1:05d}",
            student_id=student.id if student else None,
            student_name=f"{student.first_name} {student.last_name}" if student else f"{first} {last}",
            reason=random.choice(["Relocation", "Graduated", "Transfer", "Personal"]),
            remarks=SEED_TAG,
        ))
    db.commit()
    return n


def seed_intl_documents(db, target, ctx):
    n = shortfall(db, models.InternationalDocument, target)
    students = ctx["students"]
    if not students:
        return 0
    for i in range(n):
        db.add(models.InternationalDocument(
            student_id=students[i % len(students)].id,
            document_type=random.choice(["Passport", "Visa", "Residence Permit", "Transfer Certificate"]),
            document_no=f"SEED-DOC{i + 1:06d}",
            issue_date=recent_date(1500), issuing_country="India", status="Valid",
            expiry_date=date.today() + timedelta(days=random.randint(30, 1500)),
            remarks=SEED_TAG,
        ))
    db.commit()
    return n


def seed_communication(db, target, ctx):
    n = shortfall(db, models.CommunicationLog, target)
    for i in range(n):
        db.add(models.CommunicationLog(
            category=random.choice(["Announcement", "Fee Reminder", "Attendance", "Exam"]),
            recipient_name=f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}",
            recipient_phone=f"9{random.randint(100000000, 999999999)}",
            recipient_email=f"seed.contact{i + 1}@example.com",
            channel=random.choice(["Email", "SMS", "WhatsApp"]),
            message_body=f"{SEED_TAG} demo message {i + 1}",
            status=random.choice(["Sent", "Queued", "Failed"]),
        ))
    db.commit()
    return n


def seed_timetable(db, target, ctx):
    n = shortfall(db, models.TimetableEntry, target)
    classes, teachers = ctx["classes"], ctx["teachers"]
    if not classes:
        return 0
    days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    have = {
        (t.class_id, t.day_of_week, t.period_no)
        for t in db.query(
            models.TimetableEntry.class_id,
            models.TimetableEntry.day_of_week,
            models.TimetableEntry.period_no,
        ).all()
    }
    made = 0
    for klass in classes:
        for day in days:
            for period in range(1, 9):
                if made >= n:
                    break
                if (klass.id, day, period) in have:
                    continue
                db.add(models.TimetableEntry(
                    class_id=klass.id, day_of_week=day, period_no=period,
                    academic_year="2026-27",
                    class_name_snapshot=klass.class_name, section_snapshot=klass.section,
                    entry_type="Class", subject=random.choice(SUBJECTS), duration_min=40,
                    label=SEED_TAG,
                    teacher_id=random.choice(teachers).id if teachers else None,
                    room=f"R{period}",
                ))
                have.add((klass.id, day, period))
                made += 1
    db.commit()
    return made


def seed_assignments(db, target, ctx):
    n = shortfall(db, models.Assignment, target)
    teachers, classes = ctx["teachers"], ctx["classes"]
    start = existing_count(db, models.Assignment)
    for i in range(n):
        klass = random.choice(classes) if classes else None
        db.add(models.Assignment(
            class_name=klass.class_name if klass else "1",
            section=klass.section if klass else "A",
            subject=random.choice(SUBJECTS),
            title=f"Homework {start + i + 1}",
            description=f"{SEED_TAG} demo assignment",
            due_date=date.today() + timedelta(days=random.randint(-30, 30)),
            teacher_id=random.choice(teachers).id if teachers else None,
            academic_year="2026-27",
        ))
    db.commit()
    return n


def seed_portal_messages(db, target, ctx):
    n = shortfall(db, models.PortalMessage, target)
    students = ctx["students"]
    if not students:
        return 0
    for i in range(n):
        db.add(models.PortalMessage(
            student_id=students[i % len(students)].id,
            sender_name="Demo Teacher", sender_role="Teacher",
            body=f"{SEED_TAG} demo portal message {i + 1}",
        ))
    db.commit()
    return n


def seed_online_tests(db, target, ctx):
    n = shortfall(db, models.OnlineTest, target)
    teachers, classes = ctx["teachers"], ctx["classes"]
    start = existing_count(db, models.OnlineTest)
    for i in range(n):
        klass = random.choice(classes) if classes else None
        test = models.OnlineTest(
            class_name=klass.class_name if klass else "1",
            section=klass.section if klass else "A",
            subject=random.choice(SUBJECTS),
            title=f"{SEED_TAG} Quiz {start + i + 1}",
            description="Auto-generated demo quiz",
            duration_minutes=random.choice([None, 15, 30, 45]),
            status=random.choice(["Draft", "Published", "Closed"]),
            teacher_id=random.choice(teachers).id if teachers else None,
            academic_year="2026-27",
            shuffle_questions=random.choice([True, False]),
            shuffle_options=random.choice([True, False]),
        )
        db.add(test)
        db.flush()
        # A quiz with no questions isn't usable in the UI, so give each a few.
        for q in range(random.randint(3, 5)):
            options = ["Option A", "Option B", "Option C", "Option D"]
            db.add(models.OnlineTestQuestion(
                test_id=test.id, sort_order=q, question_type="mcq_single",
                question_text=f"Demo question {q + 1}?",
                options=__import__("json").dumps(options),
                correct_option=random.choice(options), marks=1,
            ))
    db.commit()
    return n


def seed_biometric_devices(db, target, ctx):
    n = shortfall(db, models.BiometricDevice, target)
    start = existing_count(db, models.BiometricDevice)
    for i in range(n):
        db.add(models.BiometricDevice(
            name=f"{SEED_TAG} Terminal {start + i + 1}",
            serial_number=f"SEED-DEV-{start + i + 1:05d}",
            location=random.choice(["Main Gate", "Reception", "Block A", "Hostel Gate"]),
            vendor=random.choice(["ZKTeco", "eSSL", "Mantra"]),
            mode="push", is_active=True,
        ))
    db.commit()
    return n


def seed_accounts(db, target, ctx):
    n = shortfall(db, models.AccountTransaction, target)
    for i in range(n):
        db.add(models.AccountTransaction(
            entry_date=recent_date(365),
            entry_type=random.choice(["Income", "Expense"]),
            category=random.choice(["Salary", "Utilities", "Maintenance", "Fees", "Supplies"]),
            amount=random.randint(500, 90000),
            description=f"{SEED_TAG} demo entry {i + 1}",
            payment_mode=random.choice(["Cash", "Bank", "UPI", "Cheque"]),
        ))
    db.commit()
    return n


def seed_payroll(db, target, ctx):
    made = 0
    teachers = ctx["teachers"]
    if not teachers:
        return 0

    have_structures = {s.teacher_id for s in db.query(models.TeacherSalaryStructure.teacher_id).all()}
    for teacher in teachers:
        if existing_count(db, models.TeacherSalaryStructure) + made >= target:
            break
        if teacher.id in have_structures:
            continue
        basic = random.choice([20000, 28000, 35000, 45000])
        db.add(models.TeacherSalaryStructure(
            teacher_id=teacher.id, basic_pay=basic,
            hra=basic * 0.2, other_allowances=basic * 0.1,
            provident_fund=basic * 0.12, professional_tax=200,
            other_deductions=0, effective_from=date(2026, 4, 1),
        ))
        made += 1
    db.commit()

    n_slips = shortfall(db, models.Payslip, target)
    have_slips = {
        (p.teacher_id, p.month, p.year)
        for p in db.query(models.Payslip.teacher_id, models.Payslip.month, models.Payslip.year).all()
    }
    slips = 0
    for month_back in range(24):
        ref = date.today() - timedelta(days=30 * month_back)
        for teacher in teachers:
            if slips >= n_slips:
                break
            key = (teacher.id, ref.month, ref.year)
            if key in have_slips:
                continue
            basic = random.choice([20000, 28000, 35000, 45000])
            hra, allow = basic * 0.2, basic * 0.1
            gross = basic + hra + allow
            pf, ptax = basic * 0.12, 200
            db.add(models.Payslip(
                teacher_id=teacher.id, teacher_name_snapshot=teacher.name,
                month=ref.month, year=ref.year,
                basic_pay=basic, hra=hra, other_allowances=allow, gross_pay=gross,
                provident_fund=pf, professional_tax=ptax, other_deductions=0,
                total_deductions=pf + ptax, net_pay=gross - pf - ptax,
                status=random.choice(["Draft", "Finalised", "Paid"]),
                remarks=SEED_TAG,
            ))
            have_slips.add(key)
            slips += 1
    db.commit()
    return made + slips


def seed_enrollments(db, target, ctx):
    n = shortfall(db, models.StudentEnrollment, target)
    students = ctx["students"]
    if not students:
        return 0
    have = {
        (e.student_id, e.academic_year)
        for e in db.query(models.StudentEnrollment.student_id, models.StudentEnrollment.academic_year).all()
    }
    made = 0
    for year in ("2026-27", "2025-26", "2024-25"):
        for student in students:
            if made >= n:
                break
            if (student.id, year) in have:
                continue
            db.add(models.StudentEnrollment(
                student_id=student.id, academic_year=year, class_id=student.class_id,
                class_name_snapshot=student.class_name, section_snapshot=student.section,
                roll_no=student.roll_no, enrollment_status="Active",
                remarks=SEED_TAG,
            ))
            have.add((student.id, year))
            made += 1
    db.commit()
    return made


SEEDERS = [
    # Order matters: parents before the rows that reference them.
    ("Classes", seed_classes),
    ("Subjects", seed_subjects),
    ("Teachers", seed_teachers),
    ("Students", seed_students),
    ("Academic Years", seed_academic_years),
    ("Student Enrollments", seed_enrollments),
    ("Attendance", seed_attendance),
    ("Fees", seed_fees),
    ("Fee Structures", seed_fee_structures),
    ("Exams", seed_exams),
    ("Marks", seed_marks),
    ("Admissions", seed_admissions),
    ("Library", seed_library),
    ("Inventory", seed_inventory),
    ("Transport", seed_transport),
    ("Hostel", seed_hostel),
    ("Health / Infirmary", seed_health),
    ("Mess", seed_mess),
    ("Counseling", seed_counseling),
    ("Enrichment", seed_enrichment),
    ("Compliance", seed_compliance),
    ("Student Services", seed_service_tickets),
    ("Alumni / Withdrawals", seed_alumni),
    ("International Documents", seed_intl_documents),
    ("Communication", seed_communication),
    ("Timetable", seed_timetable),
    ("Homework", seed_assignments),
    ("Portal Messages", seed_portal_messages),
    ("Online Tests", seed_online_tests),
    ("Biometric Devices", seed_biometric_devices),
    ("Accounting", seed_accounts),
    ("Payroll", seed_payroll),
]

# Tables --purge clears, newest-dependency-first so FKs don't block deletes.
# Tables --purge clears, newest-dependency-first so FKs don't block deletes.
PURGE_ORDER = [
    models.OnlineTestAnswer, models.OnlineTestAttempt, models.OnlineTestQuestion, models.OnlineTest,
    models.BiometricPunch, models.BiometricEnrollment, models.BiometricSyncRun, models.BiometricDevice,
    models.Payslip, models.TeacherSalaryStructure, models.PortalMessage, models.Assignment,
    models.TimetableEntry, models.CommunicationLog, models.InternationalDocument,
    models.AlumniWithdrawalRecord, models.StudentServiceTicket, models.ComplianceTask,
    models.EnrichmentActivity, models.CounselingCase, models.MessMenu, models.HealthInfirmaryVisit,
    models.HostelRoom, models.HostelBlock, models.TransportVehicle, models.TransportRoute,
    models.InventoryItem, models.LibraryBook, models.AdmissionInquiry, models.Mark, models.Exam,
    models.FeeStructure, models.Fee, models.Attendance, models.StudentEnrollment,
    models.AccountTransaction, models.AcademicYear, models.Student, models.Teacher,
]

# (child, parent, fk attribute). These tables carry no free-text column to tag,
# so they are cleared by following the link to a parent that has gone -- SQLite
# does not enforce ON DELETE CASCADE unless PRAGMA foreign_keys is on, so the
# database will not do it for us.
ORPHAN_SWEEP = [
    (models.OnlineTestQuestion, models.OnlineTest, "test_id"),
    (models.OnlineTestAttempt, models.OnlineTest, "test_id"),
    (models.TeacherSalaryStructure, models.Teacher, "teacher_id"),
    (models.Payslip, models.Teacher, "teacher_id"),
]


def _text_attributes(model):
    """Attribute names backed by a text column.

    Iterates the mapper rather than the table, because an attribute can be
    named differently from its column (SchoolClass.room_no -> "room_number"),
    and querying by the column name would raise.
    """
    names = []
    for attr in model.__mapper__.column_attrs:
        column = attr.columns[0]
        if str(column.type).upper().startswith(("VARCHAR", "TEXT", "STRING")):
            names.append(attr.key)
    return names


def purge(db):
    """Delete only rows this script created, matched on SEED_TAG."""
    total = 0
    for model in PURGE_ORDER:
        removed = 0
        for name in _text_attributes(model):
            removed += (
                db.query(model)
                .filter(getattr(model, name).like(f"%{SEED_TAG}%"))
                .delete(synchronize_session=False)
            )
        if removed:
            print(f"  {model.__tablename__:<32} -{removed}")
            total += removed
        db.commit()

    for child, parent, fk in ORPHAN_SWEEP:
        alive = db.query(parent.id).subquery()
        removed = (
            db.query(child)
            .filter(~getattr(child, fk).in_(db.query(alive.c.id)))
            .delete(synchronize_session=False)
        )
        if removed:
            print(f"  {child.__tablename__:<32} -{removed} (orphaned)")
            total += removed
        db.commit()

    print("\nClasses and Subjects are reference data, not generated content —")
    print("purge leaves them in place, and a re-seed reuses them.")
    return total


def main() -> int:
    parser = argparse.ArgumentParser(description="Top every module up to N demo records")
    parser.add_argument("--count", type=int, default=100, help="target rows per module (default 100)")
    parser.add_argument("--yes", action="store_true", help="required to actually write")
    parser.add_argument("--dry-run", action="store_true", help="report current counts, change nothing")
    parser.add_argument("--purge", action="store_true", help="delete rows this script created")
    args = parser.parse_args()

    print(f"Target database: {DATABASE_URL}")
    print(f"Seed tag:        {SEED_TAG}\n")

    if not args.dry_run and not args.yes:
        print("Refusing to run without --yes. Check the database line above first.")
        print("Use --dry-run to preview, or --yes to proceed.")
        return 1

    db = SessionLocal()
    try:
        if args.purge:
            print("Purging seeded rows...")
            print(f"\nRemoved {purge(db)} row(s).")
            return 0

        if args.dry_run:
            print(f"{'Module':<28} {'have':>6} {'target':>7} {'to add':>7}")
            print("-" * 52)
            # Counts only; the seeders themselves are not run.
            probe = [
                ("Classes", models.SchoolClass), ("Subjects", models.SubjectMaster),
                ("Teachers", models.Teacher), ("Students", models.Student),
                ("Academic Years", models.AcademicYear), ("Attendance", models.Attendance),
                ("Fees", models.Fee), ("Exams", models.Exam), ("Marks", models.Mark),
                ("Admissions", models.AdmissionInquiry), ("Library", models.LibraryBook),
                ("Inventory", models.InventoryItem), ("Online Tests", models.OnlineTest),
                ("Biometric Devices", models.BiometricDevice),
            ]
            for label, model in probe:
                have = existing_count(db, model)
                print(f"{label:<28} {have:>6} {args.count:>7} {max(0, args.count - have):>7}")
            return 0

        ctx = {"classes": [], "teachers": [], "students": [], "exams": []}
        print(f"{'Module':<28} {'created':>8}")
        print("-" * 38)
        total = 0
        for label, fn in SEEDERS:
            try:
                made = fn(db, args.count, ctx)
            except Exception as exc:
                db.rollback()
                print(f"{label:<28} {'FAILED':>8}  {exc}")
                continue
            total += made
            print(f"{label:<28} {made:>8}")

        print("-" * 38)
        print(f"{'TOTAL':<28} {total:>8}")
        print("\nSingle-row modules (Institution Settings, Biometric Attendance Rules)")
        print("are configuration, not lists — deliberately left as one row each.")
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
