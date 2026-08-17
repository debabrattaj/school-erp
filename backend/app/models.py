from app.database import Base
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Text, UniqueConstraint, Float, Date, DateTime, Time
from datetime import datetime


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False)  # role name (system or custom)
    mfa_enabled = Column(Boolean, nullable=False, default=False)
    mfa_secret = Column(String, nullable=True)  # base32 TOTP secret (set during setup)


class Role(Base):
    __tablename__ = "roles"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True, index=True)
    permissions = Column(Text, nullable=True)  # JSON: {feature_key: "view"|"manage"}
    is_system = Column(Boolean, nullable=False, default=False)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


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
    upi_id = Column(String, nullable=True)

    # Online payment gateway, per school -- each collects into its own merchant
    # account, so these cannot be one platform-wide environment variable.
    # The two secrets are write-only through the API: they are set and never
    # read back, the same way biometric device tokens are handled.
    payment_provider = Column(String, nullable=True)      # razorpay
    payment_key_id = Column(String, nullable=True)
    payment_key_secret = Column(String, nullable=True)
    payment_webhook_secret = Column(String, nullable=True)
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
    day_of_week = Column(String, nullable=False, index=True)  # Monday..Sunday, or "*" for a full-row break
    period_no = Column(Integer, nullable=False)  # row order (shared by periods and breaks)
    entry_type = Column(String, nullable=False, default="period")  # period | recess | break
    label = Column(String, nullable=True)  # label for a recess/break row
    duration_min = Column(Integer, nullable=True)  # length in minutes (used by breaks/recess)
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

    # Set only on fees created by the scheduled auto-generation job, e.g.
    # "2026-08" for a monthly cycle. Null for manually-created fees. Used to
    # avoid double-billing a student for the same cycle on cron re-runs.
    billing_period = Column(String, nullable=True, index=True)


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

    # Scheduled auto-generation: when auto_generate is on, run_scheduled_fees.py
    # bills every applicable class for this structure's fee_type once
    # next_run_date arrives, then advances it per `recurrence` (or turns
    # auto_generate back off for a one-time "once" schedule).
    auto_generate = Column(Boolean, nullable=False, default=False, server_default="0")
    recurrence = Column(String, nullable=True)  # monthly | quarterly | annually | once
    next_run_date = Column(Date, nullable=True)
    last_generated_at = Column(DateTime, nullable=True)

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


class FeeGenerationRun(Base):
    """One row per (fee_structure, billing_period) the scheduler has
    attempted, for troubleshooting an unattended cron job and as a belt-and-
    braces guard against reprocessing a cycle twice."""

    __tablename__ = "fee_generation_runs"

    id = Column(Integer, primary_key=True, index=True)

    fee_structure_id = Column(Integer, ForeignKey("fee_structures.id", ondelete="SET NULL"), nullable=True)
    academic_year = Column(String, nullable=False)
    fee_type = Column(String, nullable=False)
    class_name = Column(String, nullable=True)  # structure's own class_name; null = "every class"
    billing_period = Column(String, nullable=False)

    run_at = Column(DateTime, default=datetime.utcnow)
    students_billed = Column(Integer, default=0)
    students_skipped = Column(Integer, default=0)
    status = Column(String, nullable=False)  # success | partial | failed
    error_message = Column(String, nullable=True)

    __table_args__ = (
        UniqueConstraint(
            "fee_structure_id",
            "billing_period",
            name="uq_fee_generation_run_structure_period",
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

    # Set when this Exam was auto-created by run_scheduled_exams.py from an
    # ExamTemplate, so the scheduler can tell "already generated" apart from
    # a staff member happening to create a similarly-named exam by hand.
    generated_from_template_id = Column(
        Integer, ForeignKey("exam_templates.id", ondelete="SET NULL"), nullable=True, index=True
    )

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
    unit_price = Column(Float, nullable=True, default=0)
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
    unit_cost = Column(Float, nullable=True)
    total_cost = Column(Float, nullable=True)
    remarks = Column(String, nullable=True)
    # Set for recurring student issuance (e.g. "Yearly" / "Half-Yearly" kit
    # issue) so a repeat run for the same academic year can be skipped
    # instead of double-issuing. Left blank for ad-hoc stock movements.
    cycle = Column(String, nullable=True, index=True)
    academic_year = Column(String, nullable=True, index=True)
    # Only meaningful for "Purchase" transactions (a student buying an item
    # outside the free/allotted issuance cycle); amount is stored rather
    # than recomputed so historical records aren't affected by later price
    # changes.
    unit_price = Column(Float, nullable=True)
    amount = Column(Float, nullable=True)
    payment_status = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AccountTransaction(Base):
    __tablename__ = "account_transactions"

    id = Column(Integer, primary_key=True, index=True)
    entry_date = Column(Date, nullable=False, index=True)
    entry_type = Column(String, nullable=False, index=True)  # Income, Expense
    category = Column(String, nullable=False, index=True)
    amount = Column(Float, nullable=False)
    payment_mode = Column(String, nullable=True)
    reference_no = Column(String, nullable=True)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


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


class AdmissionWorkflowStage(Base):
    __tablename__ = "admission_workflow_stages"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True, index=True)
    sort_order = Column(Integer, default=0, index=True)
    is_terminal = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


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

    # Scheduled auto-promotion: when auto_promote_enabled is on,
    # run_scheduled_promotions.py applies the same promote/detain/graduate
    # suggestions the manual "Year-End Processing" screen already computes
    # (marks vs pass percentage) to every active student in this year, once
    # auto_promote_date arrives. auto_promoted_at guards against re-running.
    auto_promote_enabled = Column(Boolean, nullable=False, default=False, server_default="0")
    auto_promote_date = Column(Date, nullable=True)
    auto_promote_to_year = Column(String, nullable=True)
    auto_promote_carry_forward_fees = Column(Boolean, nullable=False, default=False, server_default="0")
    auto_promoted_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PromotionGenerationRun(Base):
    """One row per academic year the scheduled year-end promotion job has
    attempted, for troubleshooting an unattended cron job — mirrors
    FeeGenerationRun."""

    __tablename__ = "promotion_generation_runs"

    id = Column(Integer, primary_key=True, index=True)

    from_academic_year = Column(String, nullable=False)
    to_academic_year = Column(String, nullable=True)

    run_at = Column(DateTime, default=datetime.utcnow)
    promoted_count = Column(Integer, default=0)
    detained_count = Column(Integer, default=0)
    graduated_count = Column(Integer, default=0)
    skipped_count = Column(Integer, default=0)
    status = Column(String, nullable=False)  # success | partial | failed
    error_message = Column(String, nullable=True)

    __table_args__ = (
        UniqueConstraint("from_academic_year", name="uq_promotion_run_from_year"),
    )


class ExamTemplate(Base):
    """A recurring exam type (e.g. "Unit Test 1") that auto-creates its Exam
    record once next_run_date arrives, then advances next_run_date to the
    same month/day next year — mirrors FeeStructure's next_run_date.

    Only fires for schools where the central platform's "exam_auto_generation"
    feature flag is on (see app.tenant.get_feature_map) — off by default,
    the platform owner must switch it on per school via the Platform Console."""

    __tablename__ = "exam_templates"

    id = Column(Integer, primary_key=True, index=True)

    name = Column(String, nullable=False, unique=True)
    exam_type = Column(String, nullable=True)
    next_run_date = Column(Date, nullable=True)
    # Off by default, same as FeeStructure.auto_generate and
    # AcademicYear.auto_promote_enabled — a template must be explicitly
    # switched on, not just created, before it's eligible to fire (on top
    # of the separate platform-owner "exam_auto_generation" gate).
    is_active = Column(Boolean, nullable=False, default=False, server_default="0")
    remarks = Column(String, nullable=True)
    last_generated_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ExamGenerationRun(Base):
    """One row per exam-creation attempt the scheduler has made — an audit
    log, not a dedup guard (unlike FeeGenerationRun/PromotionGenerationRun,
    idempotency here lives entirely in ExamTemplate.next_run_date advancing
    after a successful fire, since the same template can legitimately be
    retried against the same not-yet-created academic year more than once
    before it succeeds)."""

    __tablename__ = "exam_generation_runs"

    id = Column(Integer, primary_key=True, index=True)

    exam_template_id = Column(Integer, ForeignKey("exam_templates.id", ondelete="SET NULL"), nullable=True)
    academic_year = Column(String, nullable=False)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="SET NULL"), nullable=True)

    run_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, nullable=False)  # success | failed
    error_message = Column(String, nullable=True)


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


class TeacherSalaryStructure(Base):
    """One active pay structure per teacher. Generating a payslip snapshots
    these values, so later edits here never change an already-issued payslip.
    """

    __tablename__ = "teacher_salary_structures"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(
        Integer, ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False,
        unique=True, index=True,
    )

    basic_pay = Column(Float, nullable=False, default=0)
    hra = Column(Float, nullable=False, default=0)
    other_allowances = Column(Float, nullable=False, default=0)
    provident_fund = Column(Float, nullable=False, default=0)
    professional_tax = Column(Float, nullable=False, default=0)
    other_deductions = Column(Float, nullable=False, default=0)

    effective_from = Column(Date, nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Payslip(Base):
    __tablename__ = "payslips"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(
        Integer, ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    teacher_name_snapshot = Column(String, nullable=True)

    month = Column(Integer, nullable=False, index=True)  # 1-12
    year = Column(Integer, nullable=False, index=True)

    # Snapshotted from TeacherSalaryStructure at generation time.
    basic_pay = Column(Float, nullable=False, default=0)
    hra = Column(Float, nullable=False, default=0)
    other_allowances = Column(Float, nullable=False, default=0)
    gross_pay = Column(Float, nullable=False, default=0)
    provident_fund = Column(Float, nullable=False, default=0)
    professional_tax = Column(Float, nullable=False, default=0)
    other_deductions = Column(Float, nullable=False, default=0)
    total_deductions = Column(Float, nullable=False, default=0)
    net_pay = Column(Float, nullable=False, default=0)

    status = Column(String, nullable=False, default="Pending")  # Pending, Paid
    payment_date = Column(Date, nullable=True)
    remarks = Column(String, nullable=True)

    generated_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("teacher_id", "month", "year", name="uq_payslip_teacher_period"),
    )


class Assignment(Base):
    """A homework/assignment posted by a teacher for a class+section."""

    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    academic_year = Column(String, nullable=True, index=True)
    class_name = Column(String, nullable=False, index=True)
    section = Column(String, nullable=True, index=True)
    subject = Column(String, nullable=True)

    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    due_date = Column(Date, nullable=True, index=True)
    attachment_url = Column(String, nullable=True)

    teacher_id = Column(
        Integer, ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    teacher_name_snapshot = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PortalMessage(Base):
    """One flat, continuous message log per student shared by every guardian
    and staff member with access to that student — a school-office group
    chat, not per-guardian private DMs.
    """

    __tablename__ = "portal_messages"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(
        Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True
    )

    sender_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    sender_name = Column(String, nullable=False)
    sender_role = Column(String, nullable=False)  # Parent, Student, Teacher, Admin, Principal
    is_staff = Column(Boolean, nullable=False, default=False)

    body = Column(Text, nullable=False)

    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class OnlineTest(Base):
    """A teacher-authored online quiz. Only auto-gradable question types
    (mcq_single, true_false) are supported — no subjective/manual-grading
    workflow, so a submitted attempt is scored immediately with no
    "pending review" state.
    """

    __tablename__ = "online_tests"

    id = Column(Integer, primary_key=True, index=True)
    academic_year = Column(String, nullable=True, index=True)
    class_name = Column(String, nullable=False, index=True)
    section = Column(String, nullable=True, index=True)
    subject = Column(String, nullable=True)

    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    duration_minutes = Column(Integer, nullable=True)  # null = untimed

    status = Column(String, nullable=False, default="Draft", index=True)  # Draft, Published, Closed
    starts_at = Column(DateTime, nullable=True)
    ends_at = Column(DateTime, nullable=True)

    # Anti-copying: serve each student a different question/option order. The
    # order is derived from the attempt id (see portal._shuffled_for_attempt),
    # so it stays stable if a student reloads mid-attempt.
    shuffle_questions = Column(Boolean, nullable=False, default=False)
    shuffle_options = Column(Boolean, nullable=False, default=False)

    teacher_id = Column(Integer, ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True)
    teacher_name_snapshot = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class OnlineTestQuestion(Base):
    __tablename__ = "online_test_questions"

    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("online_tests.id", ondelete="CASCADE"), nullable=False, index=True)
    sort_order = Column(Integer, default=0)

    question_type = Column(String, nullable=False, default="mcq_single")  # mcq_single, true_false
    question_text = Column(Text, nullable=False)
    options = Column(Text, nullable=True)  # JSON list of option strings (mcq_single only)
    correct_option = Column(String, nullable=False)  # option text (mcq_single) or "True"/"False"
    marks = Column(Float, nullable=False, default=1)


class OnlineTestAttempt(Base):
    """One attempt per student per test — no retakes."""

    __tablename__ = "online_test_attempts"

    id = Column(Integer, primary_key=True, index=True)
    test_id = Column(Integer, ForeignKey("online_tests.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)

    started_at = Column(DateTime, default=datetime.utcnow)
    submitted_at = Column(DateTime, nullable=True)
    score = Column(Float, nullable=True)
    max_score = Column(Float, nullable=True)  # snapshotted total at submission time
    status = Column(String, nullable=False, default="In Progress")  # In Progress, Submitted

    # Why the attempt closed without the student pressing Submit: "time_expired"
    # (past duration_minutes) or "window_closed" (past the test's ends_at).
    # NULL means the student submitted normally.
    auto_submitted_reason = Column(String, nullable=True)

    __table_args__ = (
        UniqueConstraint("test_id", "student_id", name="uq_online_test_attempt_student"),
    )


class OnlineTestAnswer(Base):
    __tablename__ = "online_test_answers"

    id = Column(Integer, primary_key=True, index=True)
    attempt_id = Column(Integer, ForeignKey("online_test_attempts.id", ondelete="CASCADE"), nullable=False, index=True)
    question_id = Column(Integer, ForeignKey("online_test_questions.id", ondelete="CASCADE"), nullable=False, index=True)

    selected_option = Column(String, nullable=True)
    is_correct = Column(Boolean, nullable=True)
    marks_awarded = Column(Float, nullable=False, default=0)

    __table_args__ = (
        UniqueConstraint("attempt_id", "question_id", name="uq_online_test_answer_question"),
    )


# ---------------------------------------------------------------------------
# Biometric attendance
#
# Punches arrive from physical terminals (fingerprint / face / RFID) by one of
# three routes, all of which land in BiometricPunch:
#
#   push  - the terminal, or the vendor's middleware, POSTs to /biometric/ingest
#   pull  - run_biometric_sync.py polls a vendor cloud API on a schedule
#   agent - a script on the school's LAN reads the terminal and POSTs to the
#           same /biometric/ingest endpoint as `push`
#
# The `agent` route exists because a terminal sitting on a school network has a
# private address and cannot be dialled from this server; "pull" from our side
# only works against an internet-reachable vendor API, never the device itself.
# ---------------------------------------------------------------------------


class BiometricDevice(Base):
    """One physical terminal belonging to this school."""

    __tablename__ = "biometric_devices"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)                       # "Main Gate"
    serial_number = Column(String, nullable=False, index=True)  # device self-identifies with this
    location = Column(String, nullable=True)
    vendor = Column(String, nullable=True)                      # ZKTeco, eSSL, Mantra, ...

    # push  -> device/agent calls us and we never call it
    # pull  -> run_biometric_sync.py fetches from pull_endpoint on a schedule
    mode = Column(String, nullable=False, default="push")
    is_active = Column(Boolean, nullable=False, default=True)

    # A terminal cannot hold a login session, so it authenticates with a long
    # random bearer token instead. Only the hash is kept -- the plaintext is
    # shown once, when the device is registered or its token is rotated.
    auth_token_hash = Column(String, nullable=True)

    # mode="pull" only: where to fetch from, plus any vendor-specific settings
    # (API key, account id, device id on their side) as a JSON blob.
    pull_endpoint = Column(String, nullable=True)
    pull_config = Column(Text, nullable=True)

    last_seen_at = Column(DateTime, nullable=True)   # last successful ingest from this device
    last_sync_at = Column(DateTime, nullable=True)   # last completed pull run

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("serial_number", name="uq_biometric_device_serial"),
    )


class BiometricEnrollment(Base):
    """Maps the id a terminal knows someone by to a student or teacher.

    device_id NULL means "this mapping applies on every terminal", which is the
    common case where one enrollment roster is pushed to all devices. A row
    naming a specific device wins over a NULL one, so a single terminal that
    numbers people differently can be corrected without touching the rest.
    """

    __tablename__ = "biometric_enrollments"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("biometric_devices.id", ondelete="CASCADE"), nullable=True, index=True)
    device_user_id = Column(String, nullable=False, index=True)

    # Exactly one of these is set -- enforced in the route, since a CHECK
    # constraint across two nullable FKs is awkward to migrate on SQLite.
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=True, index=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id", ondelete="CASCADE"), nullable=True, index=True)

    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class BiometricPunch(Base):
    """One raw read from a terminal, kept verbatim.

    Punches are stored before they are interpreted, so attendance can be
    recomputed later (after fixing an enrollment mapping, say) without asking
    the device for history it may no longer hold.
    """

    __tablename__ = "biometric_punches"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("biometric_devices.id", ondelete="CASCADE"), nullable=False, index=True)
    device_user_id = Column(String, nullable=False, index=True)
    punched_at = Column(DateTime, nullable=False, index=True)
    direction = Column(String, nullable=True)  # in, out, or NULL when the device doesn't say
    raw_payload = Column(Text, nullable=True)

    # Terminals and agents retry, and a pull window usually overlaps the last
    # one, so the same punch arrives repeatedly. This key makes ingest
    # idempotent: a repeat is counted and dropped rather than double-recorded.
    dedupe_key = Column(String, nullable=False, index=True)

    # Resolved at ingest. Both NULL means no enrollment matched -- the punch is
    # still kept, and is picked up once the mapping is added.
    student_id = Column(Integer, ForeignKey("students.id", ondelete="SET NULL"), nullable=True, index=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True, index=True)

    processed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("dedupe_key", name="uq_biometric_punch_dedupe"),
    )


class BiometricSyncRun(Base):
    """Audit row per pull attempt, mirroring the *_generation_runs tables."""

    __tablename__ = "biometric_sync_runs"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("biometric_devices.id", ondelete="SET NULL"), nullable=True, index=True)
    run_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, nullable=False)  # Success, Failed
    fetched_count = Column(Integer, default=0)
    ingested_count = Column(Integer, default=0)
    duplicate_count = Column(Integer, default=0)
    unmatched_count = Column(Integer, default=0)
    error_message = Column(String, nullable=True)


class BiometricAttendanceConfig(Base):
    """How punches turn into attendance rows. One row per school."""

    __tablename__ = "biometric_attendance_config"

    id = Column(Integer, primary_key=True, index=True)

    # Turn raw punches into Attendance rows at all. Off means punches are still
    # collected and visible, but nothing is written to attendance -- useful for
    # running a terminal alongside manual marking before trusting it.
    derive_attendance = Column(Boolean, nullable=False, default=False)

    late_after = Column(Time, nullable=True)        # first punch after this -> Late
    half_day_before = Column(Time, nullable=True)   # last punch before this -> Half Day

    # Mark enrolled students with no punch at all that day as Absent. Off by
    # default: a terminal that fails silently would otherwise mark a whole
    # school absent.
    absent_if_no_punch = Column(Boolean, nullable=False, default=False)

    # Never overwrite a mark a teacher made by hand unless this is switched on.
    overwrite_manual = Column(Boolean, nullable=False, default=False)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class PaymentOrder(Base):
    """One attempt to collect a fee through the gateway.

    Kept separate from Fee so a fee can have several attempts against it (a
    failed card, then a successful UPI) without losing the history, and so a
    retried webhook can be matched to the exact order it belongs to.
    """

    __tablename__ = "payment_orders"

    id = Column(Integer, primary_key=True, index=True)
    fee_id = Column(Integer, ForeignKey("fees.id", ondelete="CASCADE"), nullable=False, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="SET NULL"), nullable=True, index=True)

    provider = Column(String, nullable=False)
    # The gateway's own id. Unique so a duplicate webhook cannot create a
    # second order row for the same collection.
    order_id = Column(String, nullable=False, index=True)
    payment_id = Column(String, nullable=True, index=True)

    amount = Column(Float, nullable=False)
    currency = Column(String, nullable=False, default="INR")
    status = Column(String, nullable=False, default="Created")  # Created, Paid, Failed
    method = Column(String, nullable=True)  # upi, card, netbanking...

    paid_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("order_id", name="uq_payment_order_gateway_id"),
    )
