from app.database import Base
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Text, UniqueConstraint, Float, Date, DateTime
from datetime import datetime


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)  # Admin, Principal, Accounts, Teacher
    mfa_enabled = Column(Boolean, nullable=False, default=False)
    mfa_secret = Column(String, nullable=True)  # base32 TOTP secret (set during setup)


class SchoolSettings(Base):
    __tablename__ = "school_settings"

    id = Column(Integer, primary_key=True, index=True)

    # Institution profile
    school_name = Column(String, nullable=False, default="International School")
    tagline = Column(String, nullable=True)
    institution_type = Column(String, nullable=True, default="International School")
    board_affiliation = Column(String, nullable=True)
    school_code = Column(String, nullable=True)
    website = Column(String, nullable=True)
    logo_url = Column(String, nullable=True)

    # Campus
    campus_name = Column(String, nullable=True)
    campus_city = Column(String, nullable=True)
    campus_state = Column(String, nullable=True)
    campus_country = Column(String, nullable=True, default="India")

    # Contact
    address = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    email = Column(String, nullable=True)
    principal_name = Column(String, nullable=True)

    # Academic
    academic_year = Column(String, nullable=True)
    default_sections = Column(String, nullable=True, default="A,B,C")
    houses = Column(String, nullable=True, default="Red,Blue,Green,Yellow")
    working_days = Column(String, nullable=True)

    # Finance
    currency = Column(String, nullable=True, default="INR")
    receipt_prefix = Column(String, nullable=True, default="REC")
    late_fee_rule = Column(String, nullable=True)

    # Assessment
    pass_percentage = Column(Float, nullable=True, default=40)
    grade_rules = Column(
        String,
        nullable=True,
        default="A+:90-100,A:80-89,B:70-79,C:60-69,D:40-59,F:0-39"
    )


class Student(Base):
    __tablename__ = "students"

    id = Column(Integer, primary_key=True, index=True)

    # Academic
    admission_no = Column(String, unique=True, index=True, nullable=False)
    roll_no = Column(String, nullable=True)
    class_id = Column(
        Integer,
        ForeignKey("classes.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    class_name = Column(String, nullable=True)
    section = Column(String, nullable=True)
    house = Column(String, nullable=True)
    admission_date = Column(Date, nullable=True)
    student_status = Column(String, nullable=True, default="Active")
    residential_type = Column(String, nullable=True, default="Day Scholar")  # Day Scholar, Hosteller

    # Personal
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=True)
    gender = Column(String, nullable=True)
    dob = Column(Date, nullable=True)
    nationality = Column(String, nullable=True)
    blood_group = Column(String, nullable=True)
    photo_url = Column(String, nullable=True)

    # Parent / Guardian
    father_name = Column(String, nullable=True)
    mother_name = Column(String, nullable=True)
    guardian_name = Column(String, nullable=True)
    guardian_phone = Column(String, nullable=True)
    guardian_email = Column(String, nullable=True)

    # Health
    medical_notes = Column(String, nullable=True)
    allergies = Column(String, nullable=True)

    # Transport
    transport_route = Column(String, nullable=True)
    pickup_point = Column(String, nullable=True)

    # Documents
    birth_certificate = Column(String, nullable=True)
    transfer_certificate = Column(String, nullable=True)
    passport_no = Column(String, nullable=True)


class Teacher(Base):
    __tablename__ = "teachers"

    id = Column(Integer, primary_key=True, index=True)

    employee_no = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=True)
    phone = Column(String, nullable=True)
    gender = Column(String, nullable=True)

    department = Column(String, nullable=True)
    subject = Column(String, nullable=True)
    assigned_class = Column(String, nullable=True)
    qualification = Column(String, nullable=True)

    joining_date = Column(Date, nullable=True)
    employment_type = Column(String, nullable=True)  # Full Time, Part Time, Visiting
    salary_grade = Column(String, nullable=True)

    photo_url = Column(String, nullable=True)
    address = Column(String, nullable=True)

    is_class_teacher = Column(Boolean, default=False)

    class_id = Column(
        Integer,
        ForeignKey("classes.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )


class TimetableEntry(Base):
    __tablename__ = "timetable_entries"

    id = Column(Integer, primary_key=True, index=True)
    academic_year = Column(String, nullable=True, index=True)
    class_id = Column(
        Integer, ForeignKey("classes.id", ondelete="CASCADE"), nullable=True, index=True
    )
    class_name_snapshot = Column(String, nullable=True)
    section_snapshot = Column(String, nullable=True)
    day_of_week = Column(String, nullable=False, index=True)  # Monday..Sunday
    period_no = Column(Integer, nullable=False)
    start_time = Column(String, nullable=True)  # e.g. "09:00"
    end_time = Column(String, nullable=True)
    subject = Column(String, nullable=True)
    teacher_id = Column(
        Integer, ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    teacher_name_snapshot = Column(String, nullable=True)
    room = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "academic_year", "class_id", "day_of_week", "period_no",
            name="uq_timetable_slot",
        ),
    )


class SchoolClass(Base):
    __tablename__ = "classes"

    id = Column(Integer, primary_key=True, index=True)

    class_name = Column(String, nullable=False)
    section = Column(String, nullable=False)
    class_teacher = Column(String, nullable=True)
    room_number = Column(String, nullable=True)
    academic_year = Column(String, nullable=True)

    @property
    def room_no(self):
        return self.room_number

    @room_no.setter
    def room_no(self, value):
        self.room_number = value
    
    class_teacher_id = Column(
    Integer,
    ForeignKey("teachers.id", ondelete="SET NULL"),
    nullable=True,
    index=True
)


class Attendance(Base):
    __tablename__ = "attendance"

    id = Column(Integer, primary_key=True, index=True)

    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    attendance_date = Column(Date, nullable=False)
    academic_year = Column(String, nullable=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id", ondelete="SET NULL"), nullable=True, index=True)
    class_name_snapshot = Column(String, nullable=True)
    section_snapshot = Column(String, nullable=True)
    status = Column(String, nullable=False)  # Present, Absent, Late, Half Day
    remarks = Column(String, nullable=True)


class Fee(Base):
    __tablename__ = "fees"

    id = Column(Integer, primary_key=True, index=True)

    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    fee_type = Column(String, nullable=False)
    academic_year = Column(String, nullable=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id", ondelete="SET NULL"), nullable=True, index=True)
    class_name_snapshot = Column(String, nullable=True)
    section_snapshot = Column(String, nullable=True)

    total_amount = Column(Float, nullable=False)
    paid_amount = Column(Float, default=0)
    due_amount = Column(Float, default=0)

    payment_status = Column(String, default="Unpaid")  # Paid, Partial, Unpaid
    payment_date = Column(Date, nullable=True)
    due_date = Column(Date, nullable=True)
    receipt_no = Column(String, nullable=True)

    remarks = Column(String, nullable=True)


class FeeStructure(Base):
    __tablename__ = "fee_structures"

    id = Column(Integer, primary_key=True, index=True)

    academic_year = Column(String, nullable=False, index=True)
    class_name = Column(String, nullable=True, index=True)  # null = applies to every class
    residential_type = Column(String, nullable=True, index=True)  # Day Scholar, Hosteller; null = applies to both
    fee_type = Column(String, nullable=False, index=True)

    amount = Column(Float, nullable=False)
    due_date = Column(Date, nullable=True)

    remarks = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "academic_year",
            "class_name",
            "residential_type",
            "fee_type",
            name="uq_fee_structure_year_class_res_type",
        ),
    )


class Exam(Base):
    __tablename__ = "exams"

    id = Column(Integer, primary_key=True, index=True)

    exam_name = Column(String, nullable=False)
    exam_type = Column(String, nullable=True)
    class_name = Column(String, nullable=False)
    section = Column(String, nullable=False)
    exam_date = Column(Date, nullable=False)
    academic_year = Column(String, nullable=True)

    remarks = Column(String, nullable=True)


class ExamComponent(Base):
    __tablename__ = "exam_components"

    id = Column(Integer, primary_key=True, index=True)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False, index=True)
    component_name = Column(String, nullable=False, index=True)
    max_marks = Column(Float, default=100)
    weightage = Column(Float, nullable=True)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True, index=True)
    remarks = Column(String, nullable=True)


class Mark(Base):
    __tablename__ = "marks"

    id = Column(Integer, primary_key=True, index=True)

    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)

    class_subject_id = Column(Integer, ForeignKey("class_subjects.id", ondelete="SET NULL"), nullable=True, index=True)
    subject_name = Column(String, nullable=True, index=True)
    academic_year = Column(String, nullable=True, index=True)
    class_id = Column(Integer, ForeignKey("classes.id", ondelete="SET NULL"), nullable=True, index=True)
    class_name_snapshot = Column(String, nullable=True)
    section_snapshot = Column(String, nullable=True)
    exam_name_snapshot = Column(String, nullable=True)

    subject = Column(String, nullable=True)

    marks_obtained = Column(Float, nullable=False)
    max_marks = Column(Float, default=100)

    # keep this if your old backend already uses total_marks
    total_marks = Column(Float, default=100)

    grade = Column(String, nullable=True)
    remarks = Column(String, nullable=True)


class MarkComponentScore(Base):
    __tablename__ = "mark_component_scores"

    id = Column(Integer, primary_key=True, index=True)
    mark_id = Column(Integer, ForeignKey("marks.id", ondelete="CASCADE"), nullable=False, index=True)
    exam_component_id = Column(Integer, ForeignKey("exam_components.id", ondelete="SET NULL"), nullable=True, index=True)
    component_name = Column(String, nullable=False)
    marks_obtained = Column(Float, default=0)
    max_marks = Column(Float, default=100)
    sort_order = Column(Integer, default=0)
    remarks = Column(String, nullable=True)


class MasterData(Base):
    __tablename__ = "master_data"

    id = Column(Integer, primary_key=True, index=True)

    category = Column(String, nullable=False, index=True)
    value = Column(String, nullable=False)

    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)

class StudentCustomFieldValue(Base):
    __tablename__ = "student_custom_field_values"

    id = Column(Integer, primary_key=True, index=True)

    student_id = Column(
        Integer,
        ForeignKey("students.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )

    field_key = Column(String, nullable=False, index=True)
    field_label = Column(String, nullable=True)
    field_type = Column(String, nullable=True)
    field_value = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "student_id",
            "field_key",
            name="uq_student_custom_field_value"
        ),
    )

class ModuleLayout(Base):
    __tablename__ = "module_layouts"

    id = Column(Integer, primary_key=True, index=True)

    module_name = Column(String, nullable=False, unique=True, index=True)
    layout_json = Column(Text, nullable=False)

    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ModuleCustomFieldValue(Base):
    __tablename__ = "module_custom_field_values"

    id = Column(Integer, primary_key=True, index=True)

    module_name = Column(String, nullable=False, index=True)
    record_id = Column(Integer, nullable=False, index=True)

    field_key = Column(String, nullable=False, index=True)
    field_label = Column(String, nullable=True)
    field_type = Column(String, nullable=True)
    field_value = Column(Text, nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "module_name",
            "record_id",
            "field_key",
            name="uq_module_record_custom_field_value"
        ),
    )

class SubjectMaster(Base):
    __tablename__ = "subjects"

    id = Column(Integer, primary_key=True, index=True)

    subject_code = Column(String, nullable=False, unique=True, index=True)
    subject_name = Column(String, nullable=False, index=True)

    subject_type = Column(String, default="Scholastic")
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)


class ClassSubject(Base):
    __tablename__ = "class_subjects"

    id = Column(Integer, primary_key=True, index=True)

    class_id = Column(
        Integer,
        ForeignKey("classes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    subject_id = Column(
        Integer,
        ForeignKey("subjects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    subject_name = Column(String, nullable=False, index=True)
    academic_year = Column(String, nullable=False, default="2026-27", index=True)

    teacher_id = Column(
        Integer,
        ForeignKey("teachers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    weekly_periods = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "class_id",
            "academic_year",
            "subject_name",
            name="uq_class_subject_name"
        ),
    )


class ClassExamMapping(Base):
    __tablename__ = "class_exam_mappings"

    id = Column(Integer, primary_key=True, index=True)

    class_id = Column(
        Integer,
        ForeignKey("classes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    exam_id = Column(
        Integer,
        ForeignKey("exams.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    academic_year = Column(String, nullable=False, index=True)
    exam_date = Column(Date, nullable=True)
    is_active = Column(Boolean, default=True)
    remarks = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "class_id",
            "exam_id",
            "academic_year",
            name="uq_class_exam_academic_year",
        ),
    )


class StudentEnrollment(Base):
    __tablename__ = "student_enrollments"

    id = Column(Integer, primary_key=True, index=True)

    student_id = Column(
        Integer,
        ForeignKey("students.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    class_id = Column(
        Integer,
        ForeignKey("classes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    academic_year = Column(String, nullable=False, index=True)
    class_name_snapshot = Column(String, nullable=True)
    section_snapshot = Column(String, nullable=True)
    roll_no = Column(String, nullable=True)

    enrollment_status = Column(String, default="Active", index=True)
    promotion_status = Column(String, default="Not Promoted", index=True)

    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    remarks = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "student_id",
            "class_id",
            "academic_year",
            name="uq_student_enrollment_class_year",
        ),
    )


class HostelBlock(Base):
    __tablename__ = "hostel_blocks"

    id = Column(Integer, primary_key=True, index=True)
    block_name = Column(String, nullable=False, unique=True, index=True)
    hostel_type = Column(String, nullable=False, default="Boys")
    warden_name = Column(String, nullable=True)
    warden_phone = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    remarks = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class HostelRoom(Base):
    __tablename__ = "hostel_rooms"

    id = Column(Integer, primary_key=True, index=True)
    block_id = Column(
        Integer,
        ForeignKey("hostel_blocks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    room_no = Column(String, nullable=False, index=True)
    floor = Column(String, nullable=True)
    capacity = Column(Integer, nullable=False, default=1)
    is_active = Column(Boolean, default=True)
    remarks = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("block_id", "room_no", name="uq_hostel_block_room"),
    )


class HostelAllocation(Base):
    __tablename__ = "hostel_allocations"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(
        Integer,
        ForeignKey("students.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    room_id = Column(
        Integer,
        ForeignKey("hostel_rooms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    bed_no = Column(String, nullable=False)
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    status = Column(String, default="Active", index=True)
    remarks = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("room_id", "bed_no", "status", name="uq_active_hostel_bed"),
    )


class TransportRoute(Base):
    __tablename__ = "transport_routes"

    id = Column(Integer, primary_key=True, index=True)
    route_name = Column(String, nullable=False, unique=True, index=True)
    start_point = Column(String, nullable=True)
    end_point = Column(String, nullable=True)
    monthly_fee = Column(Float, default=0)
    is_active = Column(Boolean, default=True)
    remarks = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TransportVehicle(Base):
    __tablename__ = "transport_vehicles"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_no = Column(String, nullable=False, unique=True, index=True)
    route_id = Column(
        Integer,
        ForeignKey("transport_routes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    vehicle_type = Column(String, nullable=True, default="Bus")
    capacity = Column(Integer, nullable=False, default=1)
    driver_name = Column(String, nullable=True)
    driver_phone = Column(String, nullable=True)
    attendant_name = Column(String, nullable=True)
    is_active = Column(Boolean, default=True)
    remarks = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class TransportStop(Base):
    __tablename__ = "transport_stops"

    id = Column(Integer, primary_key=True, index=True)
    route_id = Column(
        Integer,
        ForeignKey("transport_routes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    stop_name = Column(String, nullable=False, index=True)
    pickup_time = Column(String, nullable=True)
    drop_time = Column(String, nullable=True)
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    remarks = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("route_id", "stop_name", name="uq_transport_route_stop"),
    )


class TransportAssignment(Base):
    __tablename__ = "transport_assignments"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(
        Integer,
        ForeignKey("students.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    route_id = Column(
        Integer,
        ForeignKey("transport_routes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    vehicle_id = Column(
        Integer,
        ForeignKey("transport_vehicles.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    stop_id = Column(
        Integer,
        ForeignKey("transport_stops.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)
    status = Column(String, default="Active", index=True)
    remarks = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class HealthInfirmaryVisit(Base):
    __tablename__ = "health_infirmary_visits"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(
        Integer,
        ForeignKey("students.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    visit_date = Column(Date, nullable=False)
    visit_time = Column(String, nullable=True)
    symptoms = Column(Text, nullable=False)
    diagnosis = Column(Text, nullable=True)
    treatment = Column(Text, nullable=True)
    medicine_given = Column(String, nullable=True)
    attended_by = Column(String, nullable=True)
    referred_to_hospital = Column(Boolean, default=False)
    follow_up_date = Column(Date, nullable=True)
    status = Column(String, default="Open", index=True)
    remarks = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class MessMenu(Base):
    __tablename__ = "mess_menus"

    id = Column(Integer, primary_key=True, index=True)
    menu_date = Column(Date, nullable=False, index=True)
    meal_type = Column(String, nullable=False, index=True)
    menu_items = Column(Text, nullable=False)
    nutrition_notes = Column(String, nullable=True)
    allergen_notes = Column(String, nullable=True)
    is_published = Column(Boolean, default=True)
    remarks = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("menu_date", "meal_type", name="uq_mess_menu_date_meal"),
    )


class MessAttendance(Base):
    __tablename__ = "mess_attendance"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(
        Integer,
        ForeignKey("students.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    meal_date = Column(Date, nullable=False, index=True)
    meal_type = Column(String, nullable=False, index=True)
    status = Column(String, default="Present", index=True)
    remarks = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "student_id",
            "meal_date",
            "meal_type",
            name="uq_mess_student_meal_attendance",
        ),
    )


class LibraryBook(Base):
    __tablename__ = "library_books"

    id = Column(Integer, primary_key=True, index=True)
    accession_no = Column(String, nullable=False, unique=True, index=True)
    title = Column(String, nullable=False, index=True)
    author = Column(String, nullable=True)
    category = Column(String, nullable=True, index=True)
    publisher = Column(String, nullable=True)
    isbn = Column(String, nullable=True)
    total_copies = Column(Integer, default=1)
    available_copies = Column(Integer, default=1)
    shelf_no = Column(String, nullable=True)
    status = Column(String, default="Available", index=True)
    remarks = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class LibraryIssue(Base):
    __tablename__ = "library_issues"

    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(
        Integer,
        ForeignKey("library_books.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    student_id = Column(
        Integer,
        ForeignKey("students.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    issue_date = Column(Date, nullable=False, index=True)
    due_date = Column(Date, nullable=True)
    return_date = Column(Date, nullable=True)
    status = Column(String, default="Issued", index=True)
    fine_amount = Column(Float, default=0)
    remarks = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    item_name = Column(String, nullable=False, index=True)
    item_code = Column(String, nullable=True, unique=True, index=True)
    category = Column(String, nullable=True, index=True)
    unit = Column(String, nullable=True, default="pcs")
    quantity_available = Column(Float, default=0)
    reorder_level = Column(Float, default=0)
    location = Column(String, nullable=True)
    status = Column(String, default="Active", index=True)
    remarks = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(
        Integer,
        ForeignKey("inventory_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    transaction_date = Column(Date, nullable=False, index=True)
    transaction_type = Column(String, nullable=False, index=True)
    quantity = Column(Float, nullable=False)
    issued_to_student_id = Column(
        Integer,
        ForeignKey("students.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    issued_to_staff = Column(String, nullable=True)
    reference_no = Column(String, nullable=True)
    remarks = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AdmissionInquiry(Base):
    __tablename__ = "admission_inquiries"

    id = Column(Integer, primary_key=True, index=True)
    inquiry_no = Column(String, nullable=False, unique=True, index=True)
    student_name = Column(String, nullable=False, index=True)
    grade_applying = Column(String, nullable=False, index=True)
    academic_year = Column(String, nullable=False, index=True)
    guardian_name = Column(String, nullable=False)
    guardian_phone = Column(String, nullable=False, index=True)
    guardian_email = Column(String, nullable=True)
    source = Column(String, nullable=True, index=True)
    stage = Column(String, default="Inquiry", index=True)
    follow_up_date = Column(Date, nullable=True, index=True)
    assigned_to = Column(String, nullable=True)
    converted_student_id = Column(Integer, ForeignKey("students.id", ondelete="SET NULL"), nullable=True, index=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AdmissionFollowUp(Base):
    __tablename__ = "admission_follow_ups"

    id = Column(Integer, primary_key=True, index=True)
    inquiry_id = Column(
        Integer,
        ForeignKey("admission_inquiries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    activity_date = Column(Date, nullable=False, index=True)
    activity_type = Column(String, default="Call", index=True)
    notes = Column(Text, nullable=False)
    next_action = Column(String, nullable=True)
    next_follow_up_date = Column(Date, nullable=True, index=True)
    owner = Column(String, nullable=True)
    outcome = Column(String, nullable=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class InternationalDocument(Base):
    __tablename__ = "international_documents"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(
        Integer,
        ForeignKey("students.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    document_type = Column(String, nullable=False, index=True)
    document_no = Column(String, nullable=True, index=True)
    issue_date = Column(Date, nullable=True)
    expiry_date = Column(Date, nullable=True, index=True)
    issuing_country = Column(String, nullable=True, index=True)
    status = Column(String, default="Pending", index=True)
    file_url = Column(String, nullable=True)
    verified_by = Column(String, nullable=True)
    verified_date = Column(Date, nullable=True)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class MultiCurriculumPlan(Base):
    __tablename__ = "multi_curriculum_plans"

    id = Column(Integer, primary_key=True, index=True)
    program_name = Column(String, nullable=False, index=True)
    curriculum_track = Column(String, nullable=False, index=True)
    grade_level = Column(String, nullable=False, index=True)
    academic_year = Column(String, nullable=False, index=True)
    class_id = Column(
        Integer,
        ForeignKey("classes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    subject_groups = Column(Text, nullable=True)
    assessment_model = Column(String, nullable=True)
    coordinator = Column(String, nullable=True)
    status = Column(String, default="Draft", index=True)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AdmissionAssessment(Base):
    __tablename__ = "admission_assessments"

    id = Column(Integer, primary_key=True, index=True)
    inquiry_id = Column(
        Integer,
        ForeignKey("admission_inquiries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    assessment_type = Column(String, nullable=False, index=True)
    scheduled_date = Column(Date, nullable=False, index=True)
    scheduled_time = Column(String, nullable=True)
    mode = Column(String, default="On Campus", index=True)
    panel_members = Column(Text, nullable=True)
    location = Column(String, nullable=True)
    status = Column(String, default="Scheduled", index=True)
    score = Column(Float, nullable=True)
    outcome = Column(String, default="Pending", index=True)
    next_follow_up_date = Column(Date, nullable=True, index=True)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CommunicationTemplate(Base):
    __tablename__ = "communication_templates"

    id = Column(Integer, primary_key=True, index=True)
    template_name = Column(String, nullable=False, unique=True, index=True)
    channel = Column(String, default="WhatsApp", index=True)
    category = Column(String, nullable=False, index=True)
    audience = Column(String, default="Parents", index=True)
    subject = Column(String, nullable=True)
    body = Column(Text, nullable=False)
    variables = Column(String, nullable=True)
    language = Column(String, default="English", index=True)
    status = Column(String, default="Active", index=True)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CommunicationLog(Base):
    __tablename__ = "communication_logs"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(
        Integer,
        ForeignKey("communication_templates.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    channel = Column(String, default="WhatsApp", index=True)
    category = Column(String, nullable=False, index=True)
    recipient_name = Column(String, nullable=False, index=True)
    recipient_phone = Column(String, nullable=True, index=True)
    recipient_email = Column(String, nullable=True)
    message_body = Column(Text, nullable=False)
    related_module = Column(String, nullable=True, index=True)
    related_record_id = Column(Integer, nullable=True)
    status = Column(String, default="Queued", index=True)
    sent_at = Column(DateTime, nullable=True)
    error_message = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StudentServiceTicket(Base):
    __tablename__ = "student_service_tickets"

    id = Column(Integer, primary_key=True, index=True)
    ticket_no = Column(String, nullable=False, unique=True, index=True)
    student_id = Column(
        Integer,
        ForeignKey("students.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    requester_name = Column(String, nullable=False, index=True)
    requester_role = Column(String, default="Parent", index=True)
    contact_phone = Column(String, nullable=True, index=True)
    contact_email = Column(String, nullable=True)
    category = Column(String, nullable=False, index=True)
    priority = Column(String, default="Medium", index=True)
    subject = Column(String, nullable=False, index=True)
    description = Column(Text, nullable=False)
    assigned_to = Column(String, nullable=True, index=True)
    due_date = Column(Date, nullable=True, index=True)
    status = Column(String, default="Open", index=True)
    resolution = Column(Text, nullable=True)
    closed_date = Column(Date, nullable=True)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AlumniWithdrawalRecord(Base):
    __tablename__ = "alumni_withdrawal_records"

    id = Column(Integer, primary_key=True, index=True)
    record_no = Column(String, nullable=False, unique=True, index=True)
    student_id = Column(
        Integer,
        ForeignKey("students.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    student_name = Column(String, nullable=False, index=True)
    admission_no = Column(String, nullable=True, index=True)
    last_class = Column(String, nullable=True, index=True)
    record_type = Column(String, default="Withdrawal", index=True)
    request_date = Column(Date, nullable=True, index=True)
    leaving_date = Column(Date, nullable=True, index=True)
    reason = Column(String, nullable=False, index=True)
    destination_school = Column(String, nullable=True)
    destination_country = Column(String, nullable=True, index=True)
    certificate_status = Column(String, default="Pending", index=True)
    alumni_email = Column(String, nullable=True)
    alumni_phone = Column(String, nullable=True, index=True)
    current_status = Column(String, default="Pending", index=True)
    approved_by = Column(String, nullable=True)
    approval_date = Column(Date, nullable=True)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class CounselingCase(Base):
    __tablename__ = "counseling_cases"

    id = Column(Integer, primary_key=True, index=True)
    case_no = Column(String, nullable=False, unique=True, index=True)
    student_id = Column(
        Integer,
        ForeignKey("students.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    concern_type = Column(String, nullable=False, index=True)
    risk_level = Column(String, default="Low", index=True)
    reported_by = Column(String, nullable=True, index=True)
    counselor = Column(String, nullable=True, index=True)
    session_date = Column(Date, nullable=True, index=True)
    next_follow_up_date = Column(Date, nullable=True, index=True)
    guardian_contacted = Column(Boolean, default=False, index=True)
    action_plan = Column(Text, nullable=True)
    confidentiality_level = Column(String, default="Restricted", index=True)
    status = Column(String, default="Open", index=True)
    outcome = Column(Text, nullable=True)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class EnrichmentActivity(Base):
    __tablename__ = "enrichment_activities"

    id = Column(Integer, primary_key=True, index=True)
    activity_code = Column(String, nullable=False, unique=True, index=True)
    activity_name = Column(String, nullable=False, index=True)
    activity_type = Column(String, nullable=False, index=True)
    category = Column(String, nullable=True, index=True)
    coordinator = Column(String, nullable=True, index=True)
    start_date = Column(Date, nullable=True, index=True)
    end_date = Column(Date, nullable=True, index=True)
    venue = Column(String, nullable=True)
    eligible_classes = Column(String, nullable=True)
    capacity = Column(Integer, nullable=True)
    enrolled_count = Column(Integer, default=0)
    fee_amount = Column(Float, default=0)
    status = Column(String, default="Planned", index=True)
    description = Column(Text, nullable=True)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ComplianceTask(Base):
    __tablename__ = "compliance_tasks"

    id = Column(Integer, primary_key=True, index=True)
    task_code = Column(String, nullable=False, unique=True, index=True)
    accreditation_body = Column(String, nullable=False, index=True)
    standard_area = Column(String, nullable=False, index=True)
    requirement = Column(Text, nullable=False)
    evidence_link = Column(String, nullable=True)
    owner = Column(String, nullable=True, index=True)
    due_date = Column(Date, nullable=True, index=True)
    review_date = Column(Date, nullable=True, index=True)
    risk_level = Column(String, default="Medium", index=True)
    status = Column(String, default="Open", index=True)
    finding = Column(Text, nullable=True)
    action_plan = Column(Text, nullable=True)
    completed_date = Column(Date, nullable=True)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AcademicYear(Base):
    __tablename__ = "academic_years"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String, unique=True, nullable=False, index=True)  # e.g. "2026-27"
    start_date = Column(Date, nullable=True)
    end_date = Column(Date, nullable=True)

    is_current = Column(Boolean, default=False, index=True)
    status = Column(String, default="Upcoming", index=True)  # Upcoming, Active, Closed

    remarks = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ParentStudentLink(Base):
    __tablename__ = "parent_student_links"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    student_id = Column(
        Integer,
        ForeignKey("students.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    relationship = Column(String, nullable=True)  # Father, Mother, Guardian, Self

    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("user_id", "student_id", name="uq_portal_link_user_student"),
    )
