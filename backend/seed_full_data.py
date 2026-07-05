"""
One-off comprehensive demo-data seeder for the default school tenant.

Run after the schema + baseline (app.seed.seed_all) has already been applied
(that happens automatically on backend startup). This script layers on
realistic, internally-consistent sample data across every module so the app
demos well end-to-end, instead of the ad hoc/inconsistent data that had
accumulated from manual UI testing over time.

Usage (from backend/, with venv activated, backend server STOPPED):
    python3 seed_full_data.py
"""

import random
from datetime import date, datetime, timedelta

from app.database import SessionLocal
from app.security import hash_password
from app.models import (
    AcademicYear,
    AdmissionAssessment,
    AdmissionFollowUp,
    AdmissionInquiry,
    AlumniWithdrawalRecord,
    Attendance,
    ClassExamMapping,
    ClassSubject,
    CommunicationLog,
    CommunicationTemplate,
    ComplianceTask,
    CounselingCase,
    EnrichmentActivity,
    Exam,
    ExamComponent,
    Fee,
    HealthInfirmaryVisit,
    HostelAllocation,
    HostelBlock,
    HostelRoom,
    InternationalDocument,
    InventoryItem,
    InventoryTransaction,
    LibraryBook,
    LibraryIssue,
    Mark,
    MessAttendance,
    MessMenu,
    MultiCurriculumPlan,
    ParentStudentLink,
    SchoolClass,
    Student,
    StudentEnrollment,
    StudentServiceTicket,
    SubjectMaster,
    Teacher,
    TransportAssignment,
    TransportRoute,
    TransportStop,
    TransportVehicle,
    User,
)

random.seed(42)

TODAY = date(2026, 7, 5)

db = SessionLocal()

# ---------------------------------------------------------------------------
# Reference pools
# ---------------------------------------------------------------------------

GRADE_LEVELS = ["Nursery", "LKG", "UKG", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"]
SECTIONS = ["A", "B"]
CURRENT_YEAR = "2026-27"
PREVIOUS_YEAR = "2025-26"

FIRST_NAMES_MALE = [
    "Aarav", "Vihaan", "Advik", "Reyansh", "Arjun", "Kabir", "Ishaan", "Aryan",
    "Dhruv", "Rohan", "Aditya", "Krishna", "Sai", "Vivaan", "Karan", "Yash",
    "Liam", "Noah", "Ethan", "Mason", "James", "Lucas", "Oliver", "Daniel",
    "Rayyan", "Zain", "Hamza", "Farhan", "Wei", "Haruto",
]
FIRST_NAMES_FEMALE = [
    "Aanya", "Diya", "Ira", "Myra", "Anika", "Saanvi", "Kiara", "Riya",
    "Ananya", "Navya", "Ishita", "Prisha", "Sara", "Zoya", "Meera", "Tara",
    "Emma", "Olivia", "Ava", "Sophia", "Isabella", "Mia", "Charlotte", "Amelia",
    "Fatima", "Aisha", "Layla", "Mei", "Yui", "Priya",
]
LAST_NAMES = [
    "Sharma", "Verma", "Gupta", "Iyer", "Nair", "Reddy", "Menon", "Kapoor",
    "Malhotra", "Chatterjee", "Bose", "Das", "Joshi", "Rao", "Pillai",
    "Khan", "Sheikh", "Ahmed", "Ali",
    "Smith", "Johnson", "Williams", "Brown", "Miller", "Wilson", "Anderson",
    "Chen", "Tanaka", "Kim", "Singh",
]

DEPARTMENTS = ["Primary", "Middle School", "Senior School", "Science", "Mathematics", "Languages", "Humanities", "Commerce", "Sports", "Arts"]
EMPLOYMENT_TYPES = ["Full Time", "Full Time", "Full Time", "Part Time", "Visiting"]
SALARY_GRADES = ["Trainee", "Junior Faculty", "Faculty", "Senior Faculty", "HOD", "Coordinator"]
QUALIFICATIONS = ["B.Ed, M.A.", "M.Sc, B.Ed", "M.A. English", "M.Com, B.Ed", "Ph.D", "B.A. B.Ed", "M.Sc Mathematics", "M.A. Economics"]

HOUSES = ["Red", "Blue", "Green", "Yellow"]
BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]
NATIONALITIES = ["Indian", "American", "British", "Canadian", "Australian", "Nepalese", "Bangladeshi", "Sri Lankan"]
TRANSPORT_ROUTE_NAMES = ["Route 1", "Route 2", "Route 3", "Route 4"]

SUBJECTS = [
    ("EN", "English", "Scholastic"),
    ("MA", "Mathematics", "Scholastic"),
    ("SC", "Science", "Scholastic"),
    ("SST", "Social Science", "Scholastic"),
    ("HI", "Hindi", "Scholastic"),
    ("CS", "Computer Science", "Scholastic"),
    ("PHY", "Physics", "Scholastic"),
    ("CHE", "Chemistry", "Scholastic"),
    ("BIO", "Biology", "Scholastic"),
    ("ECO", "Economics", "Scholastic"),
    ("BST", "Business Studies", "Scholastic"),
    ("ACC", "Accountancy", "Scholastic"),
    ("EVS", "Environmental Studies", "Scholastic"),
    ("PE", "Physical Education", "Co-Scholastic"),
    ("ART", "Art", "Co-Scholastic"),
    ("MUS", "Music", "Co-Scholastic"),
]

FEE_TYPE_AMOUNTS = {
    "Tuition Fee": (40000, 85000),
    "Transport Fee": (6000, 12000),
    "Activity Fee": (3000, 5000),
    "Library Fee": (1000, 2000),
}


def class_label(class_name, section):
    return f"{class_name} - {section}"


def random_name(gender):
    first = random.choice(FIRST_NAMES_MALE if gender == "Male" else FIRST_NAMES_FEMALE)
    last = random.choice(LAST_NAMES)
    return first, last


def subjects_for_grade(grade):
    if grade in ("Nursery", "LKG", "UKG"):
        return ["English", "Mathematics", "Environmental Studies", "Art", "Music", "Physical Education"]
    if grade in ("1", "2", "3", "4", "5"):
        return ["English", "Mathematics", "Environmental Studies", "Hindi", "Computer Science", "Art", "Physical Education"]
    if grade in ("6", "7", "8"):
        return ["English", "Mathematics", "Science", "Social Science", "Hindi", "Computer Science", "Physical Education"]
    if grade in ("9", "10"):
        return ["English", "Mathematics", "Science", "Social Science", "Hindi", "Computer Science", "Physical Education"]
    # 11/12: alternate Science vs Commerce stream by section
    return None  # decided per-section in caller


def grade_from_marks(pct, grade_rules="A+:90-100,A:80-89,B:70-79,C:60-69,D:40-59,F:0-39"):
    for rule in grade_rules.split(","):
        label, span = rule.split(":")
        lo, hi = span.split("-")
        if float(lo) <= pct <= float(hi):
            return label
    return "F"


print("Seeding academic years...")
year_defs = [
    ("2024-25", date(2024, 4, 1), date(2025, 3, 31), "Closed", False),
    ("2025-26", date(2025, 4, 1), date(2026, 3, 31), "Closed", False),
    ("2026-27", date(2026, 4, 1), date(2027, 3, 31), "Active", True),
    ("2027-28", date(2027, 4, 1), date(2028, 3, 31), "Upcoming", False),
    ("2028-29", date(2028, 4, 1), date(2029, 3, 31), "Upcoming", False),
]
for name, start, end, status, is_current in year_defs:
    db.add(AcademicYear(name=name, start_date=start, end_date=end, status=status, is_current=is_current))
db.commit()

print("Seeding subjects...")
subject_by_name = {}
for code, name, subject_type in SUBJECTS:
    subj = SubjectMaster(subject_code=code, subject_name=name, subject_type=subject_type, is_active=True)
    db.add(subj)
    db.flush()
    subject_by_name[name] = subj
db.commit()

print("Seeding classes...")
classes = []
room_counter = 101
for grade in GRADE_LEVELS:
    for section in SECTIONS:
        cls = SchoolClass(
            class_name=grade,
            section=section,
            room_number=str(room_counter),
            academic_year=CURRENT_YEAR,
        )
        db.add(cls)
        db.flush()
        classes.append(cls)
        room_counter += 1
db.commit()

print("Seeding teachers...")
teachers = []
used_emails = set()
for i in range(1, 41):
    gender = random.choice(["Male", "Female"])
    first, last = random_name(gender)
    email_base = f"{first.lower()}.{last.lower()}"
    email = f"{email_base}@school.edu"
    suffix = 1
    while email in used_emails:
        suffix += 1
        email = f"{email_base}{suffix}@school.edu"
    used_emails.add(email)

    subject_name = SUBJECTS[i % len(SUBJECTS)][1]
    teacher = Teacher(
        employee_no=f"EMP2026{i:03d}",
        name=f"{first} {last}",
        email=email,
        phone=f"9{random.randint(100000000, 999999999)}",
        gender=gender,
        department=random.choice(DEPARTMENTS),
        subject=subject_name,
        qualification=random.choice(QUALIFICATIONS),
        joining_date=TODAY - timedelta(days=random.randint(180, 3650)),
        employment_type=random.choice(EMPLOYMENT_TYPES),
        salary_grade=random.choice(SALARY_GRADES),
        is_class_teacher=False,
    )
    db.add(teacher)
    db.flush()
    teachers.append(teacher)
db.commit()

print("Assigning class teachers...")
for cls, teacher in zip(classes, teachers):  # 30 classes, first 30 of 40 teachers
    teacher.is_class_teacher = True
    teacher.class_id = cls.id
    teacher.assigned_class = class_label(cls.class_name, cls.section)
    cls.class_teacher = teacher.name
    cls.class_teacher_id = teacher.id
db.commit()

print("Seeding class subjects...")
teachers_by_subject = {}
for t in teachers:
    teachers_by_subject.setdefault(t.subject, []).append(t)


def pick_teacher_for(subject_name):
    pool = teachers_by_subject.get(subject_name) or teachers
    return random.choice(pool)


for cls in classes:
    if cls.class_name in ("11", "12"):
        if cls.section == "A":
            subj_names = ["English", "Mathematics", "Physics", "Chemistry", "Biology", "Computer Science", "Physical Education"]
        else:
            subj_names = ["English", "Economics", "Business Studies", "Accountancy", "Mathematics", "Computer Science", "Physical Education"]
    else:
        subj_names = subjects_for_grade(cls.class_name)

    for subj_name in subj_names:
        subj = subject_by_name.get(subj_name)
        teacher = pick_teacher_for(subj_name)
        db.add(ClassSubject(
            class_id=cls.id,
            subject_id=subj.id if subj else None,
            subject_name=subj_name,
            academic_year=CURRENT_YEAR,
            teacher_id=teacher.id if teacher else None,
            weekly_periods=random.choice([4, 5, 6]),
            is_active=True,
        ))
db.commit()

print("Seeding students...")
students = []
grade_age_start = {  # approx age at academic year start (2026-04-01)
    "Nursery": 3, "LKG": 4, "UKG": 5, "1": 6, "2": 7, "3": 8, "4": 9, "5": 10,
    "6": 11, "7": 12, "8": 13, "9": 14, "10": 15, "11": 16, "12": 17,
}
STUDENT_STATUS_WEIGHTS = [("Active", 92), ("Alumni", 3), ("Transferred", 3), ("Suspended", 2)]


def weighted_choice(pairs):
    population = [p[0] for p in pairs]
    weights = [p[1] for p in pairs]
    return random.choices(population, weights=weights, k=1)[0]


# distribute 100 students across 30 classes (~3-4 each)
class_cycle = classes * 4  # 120 slots, we'll only use 100
random.shuffle(class_cycle)
chosen_classes = class_cycle[:100]

for i in range(1, 101):
    cls = chosen_classes[i - 1]
    gender = random.choice(["Male", "Female"])
    first, last = random_name(gender)
    age_years = grade_age_start[cls.class_name]
    dob = date(2026, 4, 1) - timedelta(days=age_years * 365 + random.randint(-120, 120))
    status = weighted_choice(STUDENT_STATUS_WEIGHTS)
    house = HOUSES[i % len(HOUSES)]
    has_transport = random.random() < 0.4
    guardian_email = f"guardian.{first.lower()}{i}@family.com"

    student = Student(
        admission_no=f"ADM2026{i:03d}",
        roll_no=str(((i - 1) % 40) + 1),
        class_id=cls.id,
        class_name=cls.class_name,
        section=cls.section,
        house=house,
        admission_date=TODAY - timedelta(days=random.randint(30, 900)),
        student_status=status,
        first_name=first,
        last_name=last,
        gender=gender,
        dob=dob,
        nationality=random.choice(NATIONALITIES),
        blood_group=random.choice(BLOOD_GROUPS),
        father_name=f"{random.choice(LAST_NAMES)} {last}".split()[0] + f" {last}",
        mother_name=f"Mrs. {last}",
        guardian_name=f"Mr./Mrs. {last}",
        guardian_phone=f"9{random.randint(100000000, 999999999)}",
        guardian_email=guardian_email,
        transport_route=random.choice(TRANSPORT_ROUTE_NAMES) if has_transport else None,
        pickup_point=f"Stop {random.randint(1, 8)}" if has_transport else None,
    )
    db.add(student)
    db.flush()
    students.append(student)
db.commit()

active_students = [s for s in students if s.student_status == "Active"]

print("Seeding student enrollments...")
for s in students:
    db.add(StudentEnrollment(
        student_id=s.id,
        class_id=s.class_id,
        academic_year=CURRENT_YEAR,
        class_name_snapshot=s.class_name,
        section_snapshot=s.section,
        roll_no=s.roll_no,
        enrollment_status="Active" if s.student_status == "Active" else s.student_status,
        promotion_status="Promoted",
        start_date=date(2026, 4, 1),
    ))
    # previous-year history for students not in the entry-level grade
    if s.class_name != "Nursery" and s.admission_date < date(2025, 4, 1):
        idx = GRADE_LEVELS.index(s.class_name)
        prev_grade = GRADE_LEVELS[idx - 1]
        db.add(StudentEnrollment(
            student_id=s.id,
            class_id=None,
            academic_year=PREVIOUS_YEAR,
            class_name_snapshot=prev_grade,
            section_snapshot=s.section,
            roll_no=s.roll_no,
            enrollment_status="Completed",
            promotion_status="Promoted",
            start_date=date(2025, 4, 1),
            end_date=date(2026, 3, 31),
        ))
db.commit()

print("Seeding attendance (last 20 school days)...")
school_days = []
d = TODAY
while len(school_days) < 20:
    if d.weekday() < 5:  # Mon-Fri
        school_days.append(d)
    d -= timedelta(days=1)

ATTENDANCE_WEIGHTS = [("Present", 88), ("Absent", 7), ("Late", 4), ("Half Day", 1)]
for s in active_students:
    for day in school_days:
        db.add(Attendance(
            student_id=s.id,
            attendance_date=day,
            academic_year=CURRENT_YEAR,
            class_id=s.class_id,
            class_name_snapshot=s.class_name,
            section_snapshot=s.section,
            status=weighted_choice(ATTENDANCE_WEIGHTS),
        ))
db.commit()

print("Seeding fees...")
for s in active_students:
    fee_types = ["Tuition Fee"]
    fee_types.append("Transport Fee" if s.transport_route else "Activity Fee")
    for fee_type in fee_types:
        lo, hi = FEE_TYPE_AMOUNTS[fee_type]
        total = float(random.randint(lo, hi))
        roll = random.random()
        if roll < 0.7:
            paid = total
            status = "Paid"
        elif roll < 0.9:
            paid = round(total * random.uniform(0.3, 0.7), 2)
            status = "Partial"
        else:
            paid = 0.0
            status = "Unpaid"
        due = round(total - paid, 2)
        db.add(Fee(
            student_id=s.id,
            fee_type=fee_type,
            academic_year=CURRENT_YEAR,
            class_id=s.class_id,
            class_name_snapshot=s.class_name,
            section_snapshot=s.section,
            total_amount=total,
            paid_amount=paid,
            due_amount=due,
            payment_status=status,
            payment_date=(TODAY - timedelta(days=random.randint(1, 90))) if paid > 0 else None,
            receipt_no=f"REC2026{random.randint(1000, 9999)}" if paid > 0 else None,
        ))
db.commit()

print("Seeding exams, exam components, class-exam mappings and marks...")
exam_students_by_class = {}
for s in active_students:
    exam_students_by_class.setdefault(s.class_id, []).append(s)

exam_dates = {
    "Unit Test 1": date(2026, 5, 15),
    "Mid Term Exam": date(2026, 6, 20),
    "Unit Test 2": date(2026, 7, 1),
}

for cls in classes:
    class_subjects = db.query(ClassSubject).filter(ClassSubject.class_id == cls.id).all()
    for exam_name, exam_date in exam_dates.items():
        exam_type = "Unit Test" if "Unit Test" in exam_name else "Mid Term Exam"
        exam = Exam(
            exam_name=exam_name,
            exam_type=exam_type,
            class_name=cls.class_name,
            section=cls.section,
            exam_date=exam_date,
            academic_year=CURRENT_YEAR,
        )
        db.add(exam)
        db.flush()
        db.add(ExamComponent(exam_id=exam.id, component_name="Theory", max_marks=100, weightage=100, sort_order=1))
        db.add(ClassExamMapping(
            class_id=cls.id, exam_id=exam.id, academic_year=CURRENT_YEAR,
            exam_date=exam_date, is_active=True,
        ))

        if exam_name == "Unit Test 1":  # only the completed exam gets marks
            for s in exam_students_by_class.get(cls.id, []):
                for cs in class_subjects:
                    pct = max(30, min(100, int(random.gauss(72, 15))))
                    db.add(Mark(
                        student_id=s.id,
                        exam_id=exam.id,
                        class_subject_id=cs.id,
                        subject_name=cs.subject_name,
                        subject=cs.subject_name,
                        academic_year=CURRENT_YEAR,
                        class_id=cls.id,
                        class_name_snapshot=cls.class_name,
                        section_snapshot=cls.section,
                        exam_name_snapshot=exam_name,
                        marks_obtained=float(pct),
                        max_marks=100,
                        total_marks=100,
                        grade=grade_from_marks(pct),
                    ))
db.commit()

print("Seeding hostel...")
hostel_blocks = []
for block_name, hostel_type in [("Boys Block A", "Boys"), ("Boys Block B", "Boys"), ("Girls Block A", "Girls"), ("Girls Block B", "Girls")]:
    warden_gender = "Male" if hostel_type == "Boys" else "Female"
    wf, wl = random_name(warden_gender)
    block = HostelBlock(block_name=block_name, hostel_type=hostel_type, warden_name=f"{wf} {wl}", warden_phone=f"9{random.randint(100000000, 999999999)}")
    db.add(block)
    db.flush()
    hostel_blocks.append(block)
db.commit()

hostel_rooms = []
for block in hostel_blocks:
    for floor in range(1, 4):
        for room_num in range(1, 4):
            room = HostelRoom(block_id=block.id, room_no=f"{floor}0{room_num}", floor=str(floor), capacity=random.choice([2, 3, 4]))
            db.add(room)
            db.flush()
            hostel_rooms.append(room)
db.commit()

hostel_pool = {
    "Boys": [s for s in active_students if s.gender == "Male"],
    "Girls": [s for s in active_students if s.gender == "Female"],
}
allocated = 0
for block in hostel_blocks:
    candidates = hostel_pool[block.hostel_type][:]
    random.shuffle(candidates)
    rooms_for_block = [r for r in hostel_rooms if r.block_id == block.id]
    for room in rooms_for_block:
        for bed in range(1, min(room.capacity, 2) + 1):  # fill up to 2 beds per room, leave room for realism
            if not candidates or allocated >= 20:
                break
            student = candidates.pop()
            db.add(HostelAllocation(student_id=student.id, room_id=room.id, bed_no=str(bed), start_date=date(2026, 4, 5), status="Active"))
            allocated += 1
db.commit()

print("Seeding transport...")
transport_routes = []
for idx, route_name in enumerate(TRANSPORT_ROUTE_NAMES, start=1):
    lo, hi = FEE_TYPE_AMOUNTS["Transport Fee"]
    route = TransportRoute(route_name=route_name, start_point=f"City Point {idx}", end_point="School Campus", monthly_fee=float(random.randint(lo, hi)))
    db.add(route)
    db.flush()
    transport_routes.append(route)
db.commit()

vehicles = []
for idx, route in enumerate(transport_routes, start=1):
    df, dl = random_name("Male")
    vehicle = TransportVehicle(
        vehicle_no=f"SCH-{100 + idx}", route_id=route.id, vehicle_type="Bus", capacity=40,
        driver_name=f"{df} {dl}", driver_phone=f"9{random.randint(100000000, 999999999)}",
    )
    db.add(vehicle)
    db.flush()
    vehicles.append(vehicle)
db.commit()

stops_by_route = {}
for route in transport_routes:
    stops = []
    for i in range(1, 4):
        stop = TransportStop(route_id=route.id, stop_name=f"Stop {i} - {route.route_name}", pickup_time=f"0{6 + i}:30", drop_time=f"1{4 + i}:30", sort_order=i)
        db.add(stop)
        db.flush()
        stops.append(stop)
    stops_by_route[route.id] = stops
db.commit()

for s in active_students:
    if not s.transport_route:
        continue
    route = next((r for r in transport_routes if r.route_name == s.transport_route), None)
    if not route:
        continue
    vehicle = next((v for v in vehicles if v.route_id == route.id), None)
    stop = random.choice(stops_by_route[route.id])
    db.add(TransportAssignment(student_id=s.id, route_id=route.id, vehicle_id=vehicle.id if vehicle else None, stop_id=stop.id, start_date=date(2026, 4, 5), status="Active"))
db.commit()

print("Seeding health infirmary visits...")
SYMPTOMS = ["Fever", "Headache", "Stomach ache", "Minor injury during PE", "Cough and cold", "Allergic reaction", "Dizziness"]
for _ in range(25):
    s = random.choice(active_students)
    db.add(HealthInfirmaryVisit(
        student_id=s.id,
        visit_date=TODAY - timedelta(days=random.randint(0, 120)),
        visit_time=f"{random.randint(9, 15)}:00",
        symptoms=random.choice(SYMPTOMS),
        diagnosis="Observed and treated symptomatically",
        treatment="Rest and first aid administered",
        attended_by="School Nurse",
        status=random.choice(["Open", "Resolved", "Resolved", "Resolved"]),
    ))
db.commit()

print("Seeding mess menus and attendance...")
MEAL_ITEMS = {
    "Breakfast": "Idli, Sambar, Chutney, Milk",
    "Lunch": "Rice, Dal, Vegetable Curry, Roti, Curd",
    "Snacks": "Sandwich, Fruit, Juice",
}
mess_days = [TODAY - timedelta(days=i) for i in range(14)]
for day in mess_days:
    for meal_type, items in MEAL_ITEMS.items():
        db.add(MessMenu(menu_date=day, meal_type=meal_type, menu_items=items, is_published=True))
db.commit()

mess_students = random.sample(active_students, min(20, len(active_students)))
for s in mess_students:
    for day in mess_days[:7]:
        db.add(MessAttendance(student_id=s.id, meal_date=day, meal_type="Lunch", status="Present"))
db.commit()

print("Seeding library...")
BOOK_TITLES = [
    ("Fiction", "The Adventures of Tom Sawyer", "Mark Twain"),
    ("Fiction", "Charlotte's Web", "E. B. White"),
    ("Fiction", "Matilda", "Roald Dahl"),
    ("Science", "A Brief History of Time", "Stephen Hawking"),
    ("Science", "The Elements", "Theodore Gray"),
    ("Reference", "Encyclopaedia Britannica Vol 1", "Editorial Board"),
    ("Literature", "Complete Works of Shakespeare", "William Shakespeare"),
    ("Mathematics", "Higher Engineering Mathematics", "B.S. Grewal"),
    ("History", "A Brief History of India", "Alain Danielou"),
    ("Fiction", "Harry Potter and the Philosopher's Stone", "J.K. Rowling"),
]
library_books = []
for i in range(1, 61):
    category, base_title, author = BOOK_TITLES[i % len(BOOK_TITLES)]
    book = LibraryBook(
        accession_no=f"LIB{i:04d}",
        title=base_title if i < len(BOOK_TITLES) else f"{base_title} (Copy {i})",
        author=author,
        category=category,
        total_copies=random.randint(1, 5),
        available_copies=random.randint(0, 3),
        shelf_no=f"S{(i % 10) + 1}",
        status="Available",
    )
    db.add(book)
    db.flush()
    library_books.append(book)
db.commit()

for _ in range(40):
    book = random.choice(library_books)
    s = random.choice(active_students)
    issue_date = TODAY - timedelta(days=random.randint(1, 60))
    returned = random.random() < 0.6
    db.add(LibraryIssue(
        book_id=book.id, student_id=s.id, issue_date=issue_date,
        due_date=issue_date + timedelta(days=14),
        return_date=issue_date + timedelta(days=random.randint(5, 20)) if returned else None,
        status="Returned" if returned else "Issued",
    ))
db.commit()

print("Seeding inventory...")
INVENTORY_ITEMS = [
    ("Notebooks", "Stationery", "pcs"), ("Whiteboard Markers", "Stationery", "pcs"),
    ("Footballs", "Sports", "pcs"), ("Basketballs", "Sports", "pcs"),
    ("Microscopes", "Lab Equipment", "pcs"), ("Beakers", "Lab Equipment", "pcs"),
    ("School Uniforms (Summer)", "Uniform", "pcs"), ("School Uniforms (Winter)", "Uniform", "pcs"),
    ("Projectors", "Electronics", "pcs"), ("Desks", "Furniture", "pcs"),
]
inventory_items = []
for i, (name, category, unit) in enumerate(INVENTORY_ITEMS * 3, start=1):
    item = InventoryItem(
        item_name=name, item_code=f"INV{i:04d}", category=category, unit=unit,
        quantity_available=float(random.randint(10, 200)),
        reorder_level=float(random.randint(5, 20)),
        location=f"Store Room {random.randint(1, 3)}",
    )
    db.add(item)
    db.flush()
    inventory_items.append(item)
db.commit()

for _ in range(50):
    item = random.choice(inventory_items)
    transaction_type = random.choice(["Purchase", "Issue", "Issue", "Return"])
    db.add(InventoryTransaction(
        item_id=item.id,
        transaction_date=TODAY - timedelta(days=random.randint(1, 180)),
        transaction_type=transaction_type,
        quantity=float(random.randint(1, 20)),
        issued_to_staff="Admin Office" if transaction_type != "Issue" else None,
        issued_to_student_id=random.choice(active_students).id if transaction_type == "Issue" else None,
    ))
db.commit()

print("Seeding admissions pipeline...")
SOURCES = ["Website", "Referral", "Walk-in", "Education Fair", "Social Media", "Agency"]
STAGES_WEIGHTED = [("Inquiry", 30), ("Contacted", 20), ("Visit Scheduled", 15), ("Assessment", 15), ("Offered", 10), ("Enrolled", 5), ("Lost", 5)]
inquiries = []
for i in range(1, 101):
    gender = random.choice(["Male", "Female"])
    first, last = random_name(gender)
    stage = weighted_choice(STAGES_WEIGHTED)
    inquiry = AdmissionInquiry(
        inquiry_no=f"INQ2026{i:03d}",
        student_name=f"{first} {last}",
        grade_applying=random.choice(GRADE_LEVELS),
        academic_year=random.choice([CURRENT_YEAR, "2027-28"]),
        guardian_name=f"Mr./Mrs. {last}",
        guardian_phone=f"9{random.randint(100000000, 999999999)}",
        guardian_email=f"inquiry.{first.lower()}{i}@family.com",
        source=random.choice(SOURCES),
        stage=stage,
        follow_up_date=TODAY + timedelta(days=random.randint(-10, 30)),
        assigned_to=random.choice(teachers).name,
    )
    db.add(inquiry)
    db.flush()
    inquiries.append(inquiry)
db.commit()

print("Seeding admission follow-ups and assessments...")
ACTIVITY_TYPES = ["Call", "Email", "Campus Visit", "Assessment", "Document Review", "Meeting"]
for inquiry in random.sample(inquiries, 80):
    for _ in range(random.randint(1, 3)):
        db.add(AdmissionFollowUp(
            inquiry_id=inquiry.id,
            activity_date=TODAY - timedelta(days=random.randint(1, 60)),
            activity_type=random.choice(ACTIVITY_TYPES),
            notes="Follow-up conducted as part of admissions pipeline.",
            outcome=random.choice(["Open", "Positive", "No Response"]),
        ))
db.commit()

assessment_candidates = [inq for inq in inquiries if inq.stage in ("Assessment", "Offered", "Enrolled")]
for inquiry in assessment_candidates:
    db.add(AdmissionAssessment(
        inquiry_id=inquiry.id,
        assessment_type="Entrance Assessment",
        scheduled_date=TODAY - timedelta(days=random.randint(1, 30)),
        scheduled_time="10:00",
        mode="On Campus",
        status="Completed",
        score=float(random.randint(55, 95)),
        outcome="Recommended" if random.random() < 0.8 else "Not Recommended",
    ))
db.commit()

print("Seeding international documents...")
DOC_TYPES = ["Passport", "Visa", "Birth Certificate (Apostille)", "Transfer Certificate"]
intl_students = random.sample(active_students, min(30, len(active_students)))
for s in intl_students:
    for doc_type in random.sample(DOC_TYPES, 2):
        db.add(InternationalDocument(
            student_id=s.id,
            document_type=doc_type,
            document_no=f"DOC{random.randint(100000, 999999)}",
            issue_date=TODAY - timedelta(days=random.randint(200, 1000)),
            expiry_date=TODAY + timedelta(days=random.randint(200, 2000)),
            issuing_country=s.nationality,
            status=random.choice(["Verified", "Pending"]),
        ))
db.commit()

print("Seeding multi-curriculum plans...")
CURRICULA = ["IB", "Cambridge IGCSE", "CBSE", "State Board"]
for i, curriculum in enumerate(CURRICULA):
    for grade in ["6", "9", "11"]:
        cls = next((c for c in classes if c.class_name == grade and c.section == "A"), None)
        db.add(MultiCurriculumPlan(
            program_name=f"{curriculum} Track - Grade {grade}",
            curriculum_track=curriculum,
            grade_level=grade,
            academic_year=CURRENT_YEAR,
            class_id=cls.id if cls else None,
            assessment_model="Continuous + Terminal",
            coordinator=random.choice(teachers).name,
            status="Active",
        ))
db.commit()

print("Seeding communication templates and logs...")
TEMPLATES = [
    ("Fee Reminder", "Fees", "Dear Parent, this is a reminder that fees for {student_name} are due."),
    ("Attendance Alert", "Attendance", "Dear Parent, {student_name} was marked absent today."),
    ("Exam Schedule", "Academics", "Dear Parent, the exam schedule for {student_name} has been published."),
    ("PTM Reminder", "Events", "Dear Parent, please attend the Parent-Teacher Meeting on the scheduled date."),
    ("Holiday Notice", "General", "Dear Parent, the school will remain closed for the upcoming holiday."),
]
templates = []
for name, category, body in TEMPLATES:
    tmpl = CommunicationTemplate(template_name=name, channel="WhatsApp", category=category, body=body)
    db.add(tmpl)
    db.flush()
    templates.append(tmpl)
db.commit()

for _ in range(100):
    s = random.choice(active_students)
    tmpl = random.choice(templates)
    db.add(CommunicationLog(
        template_id=tmpl.id,
        channel="WhatsApp",
        category=tmpl.category,
        recipient_name=s.guardian_name or "Parent",
        recipient_phone=s.guardian_phone,
        recipient_email=s.guardian_email,
        message_body=tmpl.body.replace("{student_name}", f"{s.first_name} {s.last_name}"),
        related_module="Students",
        related_record_id=s.id,
        status="Sent",
        sent_at=datetime.combine(TODAY - timedelta(days=random.randint(0, 60)), datetime.min.time()),
    ))
db.commit()

print("Seeding student service tickets...")
TICKET_CATEGORIES = ["ID Card Reissue", "Bonafide Certificate", "Transport Change", "Fee Receipt Request", "Locker Issue"]
for i in range(1, 41):
    s = random.choice(active_students)
    status = random.choice(["Open", "In Progress", "Resolved", "Resolved"])
    db.add(StudentServiceTicket(
        ticket_no=f"TCK2026{i:03d}",
        student_id=s.id,
        requester_name=s.guardian_name or "Parent",
        requester_role="Parent",
        contact_phone=s.guardian_phone,
        category=random.choice(TICKET_CATEGORIES),
        priority=random.choice(["Low", "Medium", "High"]),
        subject=f"Request regarding {s.first_name}",
        description="Routine student service request.",
        status=status,
        closed_date=TODAY - timedelta(days=random.randint(1, 20)) if status == "Resolved" else None,
    ))
db.commit()

print("Seeding alumni / withdrawal records...")
non_active = [s for s in students if s.student_status != "Active"]
for i, s in enumerate(non_active, start=1):
    is_alumni = s.student_status == "Alumni"
    db.add(AlumniWithdrawalRecord(
        record_no=f"AW2026{i:03d}",
        student_id=s.id,
        student_name=f"{s.first_name} {s.last_name}",
        admission_no=s.admission_no,
        last_class=class_label(s.class_name, s.section),
        record_type="Graduation" if is_alumni else "Withdrawal",
        request_date=TODAY - timedelta(days=random.randint(30, 300)),
        leaving_date=TODAY - timedelta(days=random.randint(1, 30)),
        reason="Completed schooling" if is_alumni else "Family relocation",
        current_status="Completed",
        certificate_status="Issued",
    ))
db.commit()

print("Seeding counseling cases...")
CONCERN_TYPES = ["Academic Stress", "Peer Conflict", "Attendance Concern", "Behavioral", "Career Guidance"]
for i, s in enumerate(random.sample(active_students, 15), start=1):
    db.add(CounselingCase(
        case_no=f"CNS2026{i:03d}",
        student_id=s.id,
        concern_type=random.choice(CONCERN_TYPES),
        risk_level=random.choice(["Low", "Low", "Medium", "High"]),
        reported_by="Class Teacher",
        counselor="School Counselor",
        session_date=TODAY - timedelta(days=random.randint(1, 90)),
        guardian_contacted=random.choice([True, False]),
        confidentiality_level="Restricted",
        status=random.choice(["Open", "Closed", "Closed"]),
    ))
db.commit()

print("Seeding enrichment activities...")
ACTIVITIES = ["Robotics Club", "Debate Society", "Basketball Team", "Art Club", "Music Band", "Chess Club", "Coding Club", "Eco Club", "Model UN", "Swimming Squad", "Dance Troupe", "Photography Club", "Theatre Group", "Yearbook Committee", "Science Olympiad Prep"]
for i, activity_name in enumerate(ACTIVITIES, start=1):
    db.add(EnrichmentActivity(
        activity_code=f"ACT{i:03d}",
        activity_name=activity_name,
        activity_type=random.choice(["Club", "Sport", "Academic"]),
        category=random.choice(["Arts", "Sports", "Academics", "Technology"]),
        coordinator=random.choice(teachers).name,
        start_date=date(2026, 4, 15),
        capacity=random.randint(15, 40),
        enrolled_count=random.randint(10, 35),
        status="Active",
    ))
db.commit()

print("Seeding compliance tasks...")
ACCREDITATION_BODIES = ["CBSE", "IB", "Cambridge Assessment", "State Education Board"]
STANDARD_AREAS = ["Safety", "Curriculum", "Faculty Qualification", "Infrastructure", "Fire Safety", "Health & Hygiene"]
for i in range(1, 16):
    db.add(ComplianceTask(
        task_code=f"CMP{i:03d}",
        accreditation_body=random.choice(ACCREDITATION_BODIES),
        standard_area=random.choice(STANDARD_AREAS),
        requirement="Maintain documented compliance evidence per accreditation standard.",
        owner=random.choice(teachers).name,
        due_date=TODAY + timedelta(days=random.randint(-30, 120)),
        risk_level=random.choice(["Low", "Medium", "High"]),
        status=random.choice(["Open", "In Progress", "Completed"]),
    ))
db.commit()

print("Seeding parent/student portal logins...")
portal_students = random.sample(active_students, 20)
parent_count = 0
for idx, s in enumerate(portal_students):
    if idx < 3 and idx + 1 < len(portal_students):
        continue  # handled as sibling pairs below
    parent_count += 1
    user = User(
        name=s.guardian_name or f"Parent of {s.first_name}",
        email=s.guardian_email,
        password_hash=hash_password("parent123"),
        role="Parent",
    )
    db.add(user)
    db.flush()
    db.add(ParentStudentLink(user_id=user.id, student_id=s.id, relationship="Father"))
db.commit()

# 3 sibling pairs sharing one parent login
for pair_start in range(0, 6, 2):
    s1, s2 = portal_students[pair_start], portal_students[pair_start + 1]
    user = User(
        name=s1.guardian_name or "Parent",
        email=f"sibling.parent{pair_start}@family.com",
        password_hash=hash_password("parent123"),
        role="Parent",
    )
    db.add(user)
    db.flush()
    db.add(ParentStudentLink(user_id=user.id, student_id=s1.id, relationship="Mother"))
    db.add(ParentStudentLink(user_id=user.id, student_id=s2.id, relationship="Mother"))
db.commit()

student_login_pool = random.sample(active_students, 10)
for i, s in enumerate(student_login_pool, start=1):
    user = User(
        name=f"{s.first_name} {s.last_name}",
        email=f"student{i}@school.edu",
        password_hash=hash_password("student123"),
        role="Student",
    )
    db.add(user)
    db.flush()
    db.add(ParentStudentLink(user_id=user.id, student_id=s.id, relationship="Self"))
db.commit()

db.close()
print("Done.")
