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

    # Route (split payments): parents pay into the PLATFORM's merchant account
    # and the gateway transfers this school's share to its own linked account,
    # keeping the platform's commission behind. Both fields are set by the
    # platform owner only -- a school setting its own commission would be
    # letting it decide what it pays us.
    razorpay_linked_account_id = Column(String, nullable=True)   # acc_XXXXXXXX
    platform_commission_percent = Column(Float, nullable=False, default=0)

    # late_fee_rule is a free-text description shown to parents ("₹50 per
    # week after due date") -- kept as-is for that. The three fields below
    # are what the run_late_fee_charges.py cron actually computes from; all
    # nullable/zero so a school that never touches this new UI section
    # continues to have no fine ever charged, matching current behavior.
    late_fee_rule = Column(String, nullable=True)
    late_fee_amount = Column(Float, nullable=True)
    late_fee_frequency = Column(String, nullable=True)  # One-Time, Weekly, Monthly
    late_fee_grace_days = Column(Integer, nullable=False, default=0)

    # Assessment
    pass_percentage = Column(Float, nullable=True, default=40)
    grade_rules = Column(
        String,
        nullable=True,
        default="A+:90-100,A:80-89,B:70-79,C:60-69,D:40-59,F:0-39"
    )
    # Which of the built-in report card layouts this school's PDFs use by
    # default -- "classic" | "modern" | "compact" (see app/pdf.py). A
    # download can still override this per-request; this is just the
    # starting selection shown on the Report Card page.
    report_card_template = Column(String, nullable=False, default="classic")


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

    # Who wrote this row: Manual, Biometric, Import.
    #
    # Provenance used to be inferred from remarks starting with "Biometric",
    # which meant a teacher writing "Biometric device was down, marked by
    # hand" had their own mark classified as machine-written and silently
    # overwritten by the next derivation. A person is a better witness than a
    # turnstile, so which of them made a mark cannot rest on a substring.
    source = Column(String, nullable=False, default="Manual", index=True)


class ReceiptSequence(Base):
    """A ratcheting counter per financial year, tracked independently of the
    fees table so deleting a fee (even the most-recently-numbered one)
    never rewinds it -- a number generate_receipt_no() hands out is never
    handed out again, regardless of what happens to the fee it was for."""
    __tablename__ = "receipt_sequences"

    id = Column(Integer, primary_key=True, index=True)
    financial_year = Column(String, nullable=False, unique=True, index=True)
    last_number = Column(Integer, nullable=False, default=0)


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
    # Discount granted on this fee. The amount actually payable is
    # total_amount - concession_amount; see calculate_fee_status. Defaults to
    # zero so every fee written before concessions existed is unaffected.
    concession_amount = Column(Float, nullable=False, default=0)
    # Cumulative fine from run_late_fee_charges.py, recomputed from scratch
    # each run (not incremented) so a re-run is idempotent rather than
    # compounding. Zero for every school that hasn't configured a late fee
    # rule, and for every fee predating this column.
    late_fee_charged = Column(Float, nullable=False, default=0)
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

    # The percentage grade was actually computed from: raw
    # marks_obtained/total_marks when the exam's components carry no
    # weightage, otherwise the weightage-adjusted percentage. Kept alongside
    # grade so report cards and rank calculations use the same number the
    # grade came from instead of re-deriving a (possibly different) raw
    # percentage from marks_obtained/total_marks.
    percentage = Column(Float, nullable=True)

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

    # Set once a school geocodes its stops. Without them a stop simply has no
    # geofence and its arrivals are recorded by hand -- tracking degrades to
    # manual rather than placing the bus at (0, 0), which is in the Atlantic.
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

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
    # Exactly one of student_id/staff_id is set, selected by borrower_type --
    # a book issue always has exactly one borrower, never both or neither.
    borrower_type = Column(String, nullable=False, default="Student", index=True)  # Student, Staff
    student_id = Column(
        Integer,
        ForeignKey("students.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    staff_id = Column(
        Integer,
        ForeignKey("teachers.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # The specific physical copy, when the book has barcoded copies tracked
    # individually. Null for books still tracked only by aggregate count.
    copy_id = Column(
        Integer,
        ForeignKey("library_book_copies.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    issue_date = Column(Date, nullable=False, index=True)
    due_date = Column(Date, nullable=True)
    return_date = Column(Date, nullable=True)
    status = Column(String, default="Issued", index=True)
    fine_amount = Column(Float, default=0)
    fine_paid = Column(Boolean, nullable=False, default=False)
    renewal_count = Column(Integer, nullable=False, default=0)
    # The reservation this issue fulfilled, if the borrower picked the book up
    # off a hold rather than finding it free on the shelf.
    reservation_id = Column(
        Integer,
        ForeignKey("library_reservations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    remarks = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class LibrarySettings(Base):
    """One row, like SchoolSettings -- the escalation-ladder rules (Fee/Library
    ReminderRule) get their own tables, but the numeric knobs a librarian tunes
    rarely (loan length, fine rate, borrowing caps) live together here."""

    __tablename__ = "library_settings"

    id = Column(Integer, primary_key=True, index=True)
    loan_period_days = Column(Integer, nullable=False, default=14)
    loan_period_days_staff = Column(Integer, nullable=False, default=30)
    fine_per_day = Column(Float, nullable=False, default=2)
    # Days after the due date before a fine starts accruing at all.
    fine_grace_days = Column(Integer, nullable=False, default=0)
    max_books_student = Column(Integer, nullable=False, default=3)
    max_books_staff = Column(Integer, nullable=False, default=5)
    max_renewals = Column(Integer, nullable=False, default=2)
    # A renewal is refused once another borrower is waiting for the book,
    # however many renewals remain -- reserving it is exactly the queue asking
    # for it back.
    block_renewal_if_reserved = Column(Boolean, nullable=False, default=True)
    reservation_hold_days = Column(Integer, nullable=False, default=2)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class LibraryBookCopy(Base):
    """An individual, barcoded physical copy of a LibraryBook.

    Optional and additive: a book with no rows here is still tracked the
    original way, by LibraryBook.total_copies/available_copies. A school that
    wants per-copy history (which exact copy a student has, which one is
    lost) generates copies for a title and issues reference them instead.
    """

    __tablename__ = "library_book_copies"

    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(
        Integer, ForeignKey("library_books.id", ondelete="CASCADE"), nullable=False, index=True
    )
    copy_no = Column(Integer, nullable=False, default=1)
    barcode = Column(String, nullable=False, unique=True, index=True)
    status = Column(String, default="Available", index=True)
    # Available, Issued, Reserved, Lost, Damaged, Retired
    shelf_no = Column(String, nullable=True)
    remarks = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("book_id", "copy_no", name="uq_library_copy_no"),
    )


class LibraryReservation(Base):
    """A hold placed on a book that has no available copy right now.

    Queue order is queue_position, earliest first. When a copy frees up (a
    return, or a new copy added) the earliest Waiting reservation for that
    book is promoted to Ready and gets reservation_hold_days to collect it
    before it expires and the next in line is offered the same window.
    """

    __tablename__ = "library_reservations"

    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(
        Integer, ForeignKey("library_books.id", ondelete="CASCADE"), nullable=False, index=True
    )
    borrower_type = Column(String, nullable=False, default="Student", index=True)
    student_id = Column(
        Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=True, index=True
    )
    staff_id = Column(
        Integer, ForeignKey("teachers.id", ondelete="CASCADE"), nullable=True, index=True
    )
    status = Column(String, default="Waiting", index=True)
    # Waiting, Ready, Fulfilled, Cancelled, Expired
    queue_position = Column(Integer, nullable=False, default=1)
    reserved_at = Column(DateTime, default=datetime.utcnow)
    ready_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    remarks = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class LibraryRenewal(Base):
    """Audit trail of due-date extensions -- what a renewal actually changed,
    kept even though LibraryIssue only carries the current due date and a
    running count."""

    __tablename__ = "library_renewals"

    id = Column(Integer, primary_key=True, index=True)
    issue_id = Column(
        Integer, ForeignKey("library_issues.id", ondelete="CASCADE"), nullable=False, index=True
    )
    previous_due_date = Column(Date, nullable=False)
    new_due_date = Column(Date, nullable=False)
    renewed_at = Column(DateTime, default=datetime.utcnow)
    remarks = Column(String, nullable=True)


class LibraryReminderRule(Base):
    """One rung of the overdue-book escalation ladder, mirroring
    FeeReminderRule -- offsets are days after the issue's due date, since a
    library reminder only ever chases a book that is already late."""

    __tablename__ = "library_reminder_rules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    offset_days = Column(Integer, nullable=False, default=1)
    channel = Column(String, nullable=False, default="Email")
    template_id = Column(
        Integer, ForeignKey("communication_templates.id", ondelete="SET NULL"), nullable=True
    )
    is_active = Column(Boolean, nullable=False, default=True)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("offset_days", "channel", name="uq_library_reminder_rung"),
    )


class LibraryReminderLog(Base):
    """Proof that one rung fired for one overdue issue, mirroring
    FeeReminderLog -- same unique-constraint-as-safety-net design."""

    __tablename__ = "library_reminder_logs"

    id = Column(Integer, primary_key=True, index=True)
    issue_id = Column(
        Integer, ForeignKey("library_issues.id", ondelete="CASCADE"), nullable=False, index=True
    )
    rule_id = Column(
        Integer, ForeignKey("library_reminder_rules.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=True, index=True)
    staff_id = Column(Integer, ForeignKey("teachers.id", ondelete="CASCADE"), nullable=True, index=True)

    communication_log_id = Column(
        Integer, ForeignKey("communication_logs.id", ondelete="SET NULL"), nullable=True
    )

    status = Column(String, nullable=False, default="Sent", index=True)
    # Sent, Failed, Skipped, Superseded

    skip_reason = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)

    fine_amount = Column(Float, nullable=True)
    recipient = Column(String, nullable=True)
    offset_days = Column(Integer, nullable=True)

    sent_on = Column(Date, nullable=False, index=True)
    sent_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("issue_id", "rule_id", name="uq_library_reminder_once"),
    )


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    item_name = Column(String, nullable=False, index=True)
    item_code = Column(String, nullable=True, unique=True, index=True)
    barcode = Column(String, nullable=True, unique=True, index=True)
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


# ---------------------------------------------------------------------------
# Reusable issuance kits
#
# A kit is a named, saved set of items -- "Junior Uniform Kit", "Staff ID
# Kit" -- issued together every cycle instead of an admin re-picking the same
# items from a list each time. It is scoped to one audience (Student or
# Staff) so a kit meant for teachers cannot be bulk-issued to a class by
# mistake: the two entitlements are genuinely different things, since
# students may separately buy a lost item and staff never do.
# ---------------------------------------------------------------------------


class InventoryKit(Base):
    """A named, reusable set of items issued together."""

    __tablename__ = "inventory_kits"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False, unique=True)
    applies_to = Column(String, nullable=False, index=True)  # Student, Staff
    is_active = Column(Boolean, nullable=False, default=True)
    remarks = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class InventoryKitItem(Base):
    """One item and its quantity inside a kit."""

    __tablename__ = "inventory_kit_items"

    id = Column(Integer, primary_key=True, index=True)
    kit_id = Column(Integer, ForeignKey("inventory_kits.id", ondelete="CASCADE"), nullable=False, index=True)
    # No ondelete override: an item still listed in a kit cannot be deleted
    # out from under it. The route enforces the same rule up front so the
    # error reads as a real message rather than a raw database exception.
    item_id = Column(Integer, ForeignKey("inventory_items.id"), nullable=False, index=True)
    quantity = Column(Float, nullable=False, default=1)

    __table_args__ = (
        UniqueConstraint("kit_id", "item_id", name="uq_inventory_kit_item"),
    )


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
    # Real FK for staff issuance, added alongside the free-text column above
    # rather than replacing it: issued_to_staff predates this and some rows
    # may name someone outside the Teacher table (a contractor, a vendor's
    # rep). New staff issuance should use this; issued_to_staff stays for
    # anyone who genuinely isn't in the staff directory.
    issued_to_teacher_id = Column(
        Integer,
        ForeignKey("teachers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # Which reusable kit this row came from, if any -- lets "how much of the
    # Winter Uniform Kit have we issued this year" be answered without
    # re-deriving it from item names.
    kit_id = Column(
        Integer,
        ForeignKey("inventory_kits.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
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
    # Optional link to a real staff login, alongside the free-text name above
    # (which stays editable for an owner who isn't a system user, e.g. an
    # external agent). Only a linked user has a resolvable email, so this is
    # what the reminder cron actually sends to.
    assigned_to_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    converted_student_id = Column(Integer, ForeignKey("students.id", ondelete="SET NULL"), nullable=True, index=True)
    possible_duplicate_of_id = Column(
        Integer, ForeignKey("admission_inquiries.id", ondelete="SET NULL"), nullable=True
    )
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


class AdmissionStageHistory(Base):
    """One row per stage move. The inquiry's own `stage` column is only
    ever the current value -- this is what a funnel or a "days in this
    stage" figure is actually computed from."""

    __tablename__ = "admission_stage_history"

    id = Column(Integer, primary_key=True, index=True)
    inquiry_id = Column(
        Integer, ForeignKey("admission_inquiries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_stage = Column(String, nullable=True)
    to_stage = Column(String, nullable=False, index=True)
    changed_at = Column(DateTime, default=datetime.utcnow, index=True)
    changed_by = Column(String, nullable=True)


class AdmissionStageTaskTemplate(Base):
    """A checklist item every inquiry gets when it enters a stage -- e.g.
    "Send offer letter" the moment a stage becomes Offered. Turns the tasks
    a stage always implies into something that happens by default rather
    than whatever the person moving the card remembers to do."""

    __tablename__ = "admission_stage_task_templates"

    id = Column(Integer, primary_key=True, index=True)
    stage = Column(String, nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    due_in_days = Column(Integer, nullable=False, default=2)  # due date = date entered stage + this
    sort_order = Column(Integer, default=0)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class AdmissionTask(Base):
    """A to-do against one inquiry: either stamped out from that stage's
    task templates the moment the inquiry arrives there, or added by hand
    for something template-worthy but one-off."""

    __tablename__ = "admission_tasks"

    id = Column(Integer, primary_key=True, index=True)
    inquiry_id = Column(
        Integer, ForeignKey("admission_inquiries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stage = Column(String, nullable=True, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    due_date = Column(Date, nullable=True, index=True)
    assigned_to_user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    status = Column(String, nullable=False, default="Pending", index=True)  # Pending, Done, Cancelled
    completed_at = Column(DateTime, nullable=True)
    completed_by = Column(String, nullable=True)
    source_template_id = Column(
        Integer, ForeignKey("admission_stage_task_templates.id", ondelete="SET NULL"), nullable=True
    )
    created_at = Column(DateTime, default=datetime.utcnow)


class AdmissionDocument(Base):
    """A file attached to an inquiry -- an ID proof, a report card, a
    passport photo. Mirrors InternationalDocument's shape (a free-text
    document_type plus a URL from the shared /uploads/ endpoint) rather than
    inventing a new storage mechanism."""

    __tablename__ = "admission_documents"

    id = Column(Integer, primary_key=True, index=True)
    inquiry_id = Column(
        Integer, ForeignKey("admission_inquiries.id", ondelete="CASCADE"), nullable=False, index=True
    )
    document_type = Column(String, nullable=False, index=True)
    file_name = Column(String, nullable=True)
    file_url = Column(String, nullable=False)
    uploaded_by = Column(String, nullable=True)
    remarks = Column(String, nullable=True)
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

    # Proctoring add-on (gated by the online_test_proctoring feature flag).
    # proctoring_policy_id is nullable even when enabled=True briefly during
    # setup; the session-start check in portal.py treats a missing policy the
    # same as proctoring being off (fail closed, not fail-unproctored).
    proctoring_enabled = Column(Boolean, nullable=False, default=False)
    proctoring_policy_id = Column(Integer, ForeignKey("proctoring_policies.id", ondelete="SET NULL"), nullable=True)

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
# Online exam proctoring add-on (gated by the online_test_proctoring feature
# flag — see app.tenant.DEFAULT_FEATURES). Phase 1 is browser-signal only:
# fullscreen/visibility/copy-paste events reported by the student's browser.
# ProctoringEvent.source and .confidence exist now so a future server-side-AI
# phase (webcam snapshots, live video) can land findings in the same event
# timeline with no schema change.
#
# "Who did X" fields follow this codebase's convention of storing a string
# email snapshot rather than a user_id foreign key (see AdmissionStageHistory
# .changed_by, LeaveRequest.decided_by) so the record stays legible even if
# the acting account is later deleted.
# ---------------------------------------------------------------------------


class ProctoringPolicy(Base):
    """Reusable proctoring configuration, attached to one or more OnlineTests
    via OnlineTest.proctoring_policy_id."""

    __tablename__ = "proctoring_policies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)

    require_fullscreen = Column(Boolean, nullable=False, default=True)
    block_copy_paste = Column(Boolean, nullable=False, default=True)
    max_violations_before_autosubmit = Column(Integer, nullable=False, default=5)

    # Phase 2/3 fields: stored now, not yet enforced by any Phase 1 code path.
    require_webcam = Column(Boolean, nullable=False, default=False)
    require_mic = Column(Boolean, nullable=False, default=False)
    capture_interval_seconds = Column(Integer, nullable=True)

    retention_days = Column(Integer, nullable=False, default=90)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class ProctoringConsent(Base):
    """A guardian's (or admin's) consent for a student to be proctored.
    The most recent row per student with revoked_at IS NULL is the
    "current" consent; session start requires one to exist."""

    __tablename__ = "proctoring_consents"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)

    granted_by = Column(String, nullable=False)  # email snapshot
    granted_at = Column(DateTime, default=datetime.utcnow)
    revoked_by = Column(String, nullable=True)
    revoked_at = Column(DateTime, nullable=True)

    scope = Column(String, nullable=False, default="online_test_proctoring")
    consent_text_version = Column(String, nullable=True)
    ip_address = Column(String, nullable=True)


class ProctoringSession(Base):
    """One per proctored attempt. Created only after a consent + policy
    check passes (see portal.portal_get_online_test)."""

    __tablename__ = "proctoring_sessions"

    id = Column(Integer, primary_key=True, index=True)
    attempt_id = Column(
        Integer, ForeignKey("online_test_attempts.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    consent_id = Column(Integer, ForeignKey("proctoring_consents.id", ondelete="SET NULL"), nullable=True)

    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)

    # Pending, Cleared, Flagged — set by a teacher/admin reviewing the event
    # timeline. Never auto-derived: a high violation count is a prompt for a
    # human to look, not an accusation the system makes on its own.
    review_status = Column(String, nullable=False, default="Pending", index=True)
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    reviewer_notes = Column(Text, nullable=True)

    retention_expires_at = Column(DateTime, nullable=True)


class ProctoringEvent(Base):
    """A single reported signal during a proctored attempt. occurred_at is
    always server-stamped (never trust the client's clock); severity is
    always server-computed from event_type (never trust a client-supplied
    severity) — see PROCTORING_EVENT_SEVERITY in routes/portal.py."""

    __tablename__ = "proctoring_events"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("proctoring_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    occurred_at = Column(DateTime, default=datetime.utcnow, index=True)

    # fullscreen_exit, tab_blur, copy_attempt, paste_attempt, context_menu, ...
    event_type = Column(String, nullable=False)
    severity = Column(String, nullable=False, default="warning")  # info, warning, critical

    source = Column(String, nullable=False, default="client")  # client, server_ai
    confidence = Column(Float, nullable=True)  # reserved for source=server_ai
    detail = Column(Text, nullable=True)


class ProctoringSnapshot(Base):
    """A periodic webcam frame captured during a proctored attempt (Phase 2,
    only taken when the session's policy has require_webcam=True).

    storage_path is relative to PROCTORING_UPLOAD_DIR (app.proctoring_storage)
    -- a private, tenant-scoped directory that is never mounted as a static
    path, unlike the general-purpose app.routes.uploads. Retention blanks
    storage_path and deletes the file once retention_expires_at has passed,
    but the row itself survives so "N snapshots were taken" stays answerable
    after the images are gone."""

    __tablename__ = "proctoring_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("proctoring_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    captured_at = Column(DateTime, default=datetime.utcnow, index=True)

    storage_path = Column(String, nullable=True)
    file_size = Column(Integer, nullable=True)
    content_type = Column(String, nullable=False, default="image/jpeg")


class ProctoringAccessLog(Base):
    """Records every time a staff member views a proctoring session's data,
    so "who watched a child's session" is always answerable."""

    __tablename__ = "proctoring_access_logs"

    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("proctoring_sessions.id", ondelete="CASCADE"), nullable=False, index=True)
    viewed_by = Column(String, nullable=False)  # email snapshot
    viewed_at = Column(DateTime, default=datetime.utcnow)
    action = Column(String, nullable=False, default="view")


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


# ---------------------------------------------------------------------------
# Fee concessions and scholarships
#
# Two levels on purpose. A scheme is what the school offers ("Sibling 10%",
# "Staff Ward 50%", "RTE 100%"); a grant is that scheme given to one student,
# with its own approval trail. Waiving fees is giving away money, so who
# approved what has to be answerable later.
# ---------------------------------------------------------------------------


class ConcessionScheme(Base):
    """A discount the school offers."""

    __tablename__ = "concession_schemes"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, nullable=False, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=True)  # Sibling, Staff Ward, Merit, RTE, Financial Aid

    discount_type = Column(String, nullable=False, default="percent")  # percent | fixed
    discount_value = Column(Float, nullable=False, default=0)

    # NULL means it applies to every fee type. Set it to narrow a scheme to
    # tuition only, so a transport fee isn't quietly discounted too.
    applies_to_fee_type = Column(String, nullable=True)

    is_active = Column(Boolean, nullable=False, default=True)
    remarks = Column(String, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("code", name="uq_concession_scheme_code"),
    )


class StudentConcession(Base):
    """A scheme granted to one student, with its approval trail.

    Only a grant in the Approved state ever reduces a fee. A request sitting
    unapproved must not silently discount anything, which is the whole reason
    the status column exists rather than the grant being immediate.
    """

    __tablename__ = "student_concessions"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    scheme_id = Column(Integer, ForeignKey("concession_schemes.id", ondelete="RESTRICT"), nullable=False, index=True)
    academic_year = Column(String, nullable=True, index=True)

    # Optional per-student override of the scheme's rate, for a negotiated
    # amount. NULL means "use whatever the scheme says".
    discount_type = Column(String, nullable=True)
    discount_value = Column(Float, nullable=True)

    status = Column(String, nullable=False, default="Requested", index=True)
    # Requested, Approved, Rejected, Revoked

    reason = Column(Text, nullable=True)
    requested_by = Column(String, nullable=True)
    requested_at = Column(DateTime, default=datetime.utcnow)
    decided_by = Column(String, nullable=True)
    decided_at = Column(DateTime, nullable=True)
    decision_note = Column(Text, nullable=True)

    # Optional window. Outside it the grant does not apply, so a one-year
    # scholarship stops discounting next year's fees on its own.
    valid_from = Column(Date, nullable=True)
    valid_to = Column(Date, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ---------------------------------------------------------------------------
# Staff leave and substitute cover
#
# One subsystem, not two: a class needs covering *because* its teacher is on
# leave, so approving leave is what raises the cover requirement. Keeping them
# apart would mean re-deriving "who is absent today" in a second place and
# letting the two answers drift.
# ---------------------------------------------------------------------------


class LeaveType(Base):
    """A category of leave, with its yearly entitlement."""

    __tablename__ = "leave_types"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String, nullable=False)
    name = Column(String, nullable=False)          # Casual, Sick, Earned, Unpaid
    annual_quota = Column(Float, nullable=False, default=0)

    # Unpaid leave has no quota to exhaust, so it is allowed to go negative
    # rather than being refused when the balance runs out.
    is_paid = Column(Boolean, nullable=False, default=True)
    allow_negative_balance = Column(Boolean, nullable=False, default=False)

    is_active = Column(Boolean, nullable=False, default=True)
    remarks = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("code", name="uq_leave_type_code"),)


class LeaveBalance(Base):
    """How much of one leave type a teacher has left this year.

    Stored rather than derived so an opening balance carried over from a
    previous system, or a manual adjustment, has somewhere to live.
    """

    __tablename__ = "leave_balances"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True)
    leave_type_id = Column(Integer, ForeignKey("leave_types.id", ondelete="CASCADE"), nullable=False, index=True)
    academic_year = Column(String, nullable=True, index=True)

    entitled_days = Column(Float, nullable=False, default=0)
    used_days = Column(Float, nullable=False, default=0)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("teacher_id", "leave_type_id", "academic_year", name="uq_leave_balance_scope"),
    )


class LeaveRequest(Base):
    """A teacher's application to be away.

    Only an Approved request counts against a balance or raises cover. A
    pending application must not consume entitlement, or a teacher who applies
    speculatively loses days they never took.
    """

    __tablename__ = "leave_requests"

    id = Column(Integer, primary_key=True, index=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True)
    leave_type_id = Column(Integer, ForeignKey("leave_types.id", ondelete="RESTRICT"), nullable=False, index=True)
    academic_year = Column(String, nullable=True, index=True)

    from_date = Column(Date, nullable=False, index=True)
    to_date = Column(Date, nullable=False, index=True)
    # Counted at approval and stored, so later changes to the working-day
    # calendar cannot silently re-price leave already taken.
    days = Column(Float, nullable=False, default=0)
    is_half_day = Column(Boolean, nullable=False, default=False)

    reason = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="Requested", index=True)
    # Requested, Approved, Rejected, Cancelled

    decided_by = Column(String, nullable=True)
    decided_at = Column(DateTime, nullable=True)
    decision_note = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class StudentLeaveRequest(Base):
    """A guardian's application for a child to be away.

    Deliberately not the staff LeaveRequest model reused: there is no
    quota/balance/accrual concept for a student absence, and no cover to
    raise. Approval's only effect is marking Attendance "Excused" for each
    working day in range -- the thing the staff-only leave module left with
    nothing to point at.
    """

    __tablename__ = "student_leave_requests"

    id = Column(Integer, primary_key=True, index=True)
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)

    from_date = Column(Date, nullable=False, index=True)
    to_date = Column(Date, nullable=False, index=True)
    reason = Column(Text, nullable=True)
    status = Column(String, nullable=False, default="Requested", index=True)
    # Requested, Approved, Rejected, Cancelled

    # Email snapshot of the guardian who submitted it, same convention as
    # every other "who did X" field in this app.
    requested_by = Column(String, nullable=False)

    decided_by = Column(String, nullable=True)
    decided_at = Column(DateTime, nullable=True)
    decision_note = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SubstitutionAssignment(Base):
    """Cover for one period of one absent teacher on one date.

    Raised automatically when leave is approved, from the absent teacher's
    timetable, and left unassigned until someone picks a substitute. An
    unassigned row is the point: it is the list of holes in tomorrow that
    somebody has to fill.
    """

    __tablename__ = "substitution_assignments"

    id = Column(Integer, primary_key=True, index=True)
    cover_date = Column(Date, nullable=False, index=True)

    timetable_entry_id = Column(
        Integer, ForeignKey("timetable_entries.id", ondelete="CASCADE"), nullable=True, index=True
    )
    leave_request_id = Column(
        Integer, ForeignKey("leave_requests.id", ondelete="CASCADE"), nullable=True, index=True
    )

    absent_teacher_id = Column(Integer, ForeignKey("teachers.id", ondelete="CASCADE"), nullable=False, index=True)
    substitute_teacher_id = Column(Integer, ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True, index=True)

    period_no = Column(Integer, nullable=True)
    class_name = Column(String, nullable=True)
    section = Column(String, nullable=True)
    subject = Column(String, nullable=True)
    room = Column(String, nullable=True)

    status = Column(String, nullable=False, default="Unassigned", index=True)
    # Unassigned, Assigned, Cancelled

    assigned_by = Column(String, nullable=True)
    assigned_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        # One cover row per period per absent teacher per day. Re-approving or
        # re-running the raise step must not duplicate the hole.
        UniqueConstraint(
            "cover_date", "absent_teacher_id", "period_no",
            name="uq_substitution_slot",
        ),
    )


# ---------------------------------------------------------------------------
# Gate register: visitors and gate passes
#
# One subsystem because there is one gate and one guard. The question the
# register has to answer at 3pm is "who is on campus who should not be, and
# who has left who should still be here" -- and that answer spans visitors
# who came in and students who went out. Splitting them would put half the
# answer in each of two screens.
#
# The safeguarding-critical path is a student leaving during school hours.
# It fails closed: no approval, no release; and who collected the child is
# recorded, not optional.
# ---------------------------------------------------------------------------


class BlockedVisitor(Base):
    """Someone barred from campus.

    Matched on phone and ID-proof number rather than name, because names are
    not unique and a barred person will not helpfully re-use their spelling.
    """

    __tablename__ = "blocked_visitors"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=True, index=True)
    id_proof_number = Column(String, nullable=True, index=True)

    reason = Column(Text, nullable=False)
    blocked_by = Column(String, nullable=True)
    blocked_at = Column(DateTime, default=datetime.utcnow)
    # Lifting a block is a decision with a date, not a delete: the reason the
    # person was barred is exactly what someone will want to read later.
    is_active = Column(Boolean, nullable=False, default=True)
    lifted_by = Column(String, nullable=True)
    lifted_at = Column(DateTime, nullable=True)
    lifted_note = Column(Text, nullable=True)


class VisitorPass(Base):
    """One outsider's visit, from the gate to the gate."""

    __tablename__ = "visitor_passes"

    id = Column(Integer, primary_key=True, index=True)
    pass_no = Column(String, nullable=False, index=True)

    visitor_name = Column(String, nullable=False)
    phone = Column(String, nullable=True, index=True)
    email = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    visitor_type = Column(String, nullable=True)   # Parent, Vendor, Official, Alumni, Other
    organisation = Column(String, nullable=True)

    id_proof_type = Column(String, nullable=True)  # Aadhaar, Driving Licence, ...
    id_proof_number = Column(String, nullable=True, index=True)
    photo_url = Column(String, nullable=True)

    purpose = Column(Text, nullable=True)
    party_size = Column(Integer, nullable=False, default=1)
    vehicle_number = Column(String, nullable=True)

    # Who they came to see. Exactly one of these is normally set; a visit to
    # no-one in particular (a delivery) is allowed and leaves all three null.
    host_student_id = Column(Integer, ForeignKey("students.id", ondelete="SET NULL"), nullable=True, index=True)
    host_teacher_id = Column(Integer, ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True, index=True)
    host_department = Column(String, nullable=True)

    visit_date = Column(Date, nullable=False, index=True)
    checked_in_at = Column(DateTime, nullable=True)
    checked_out_at = Column(DateTime, nullable=True)
    status = Column(String, nullable=False, default="Expected", index=True)
    # Expected, In, Out, Denied

    # Set when a visit is refused at the gate, so a denial is a record rather
    # than a missing row.
    denied_reason = Column(Text, nullable=True)

    issued_by = Column(String, nullable=True)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("pass_no", name="uq_visitor_pass_no"),)


class GatePass(Base):
    """A student or staff member leaving campus during school hours.

    Approval and release are deliberately separate columns: the person who
    authorises a child to leave is rarely the person at the gate who hands
    them over, and a register that cannot tell those two apart cannot answer
    "who let this child go" afterwards.
    """

    __tablename__ = "gate_passes"

    id = Column(Integer, primary_key=True, index=True)
    pass_no = Column(String, nullable=False, index=True)

    pass_type = Column(String, nullable=False, default="Student", index=True)  # Student, Staff
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=True, index=True)
    teacher_id = Column(Integer, ForeignKey("teachers.id", ondelete="CASCADE"), nullable=True, index=True)

    pass_date = Column(Date, nullable=False, index=True)
    reason = Column(Text, nullable=True)
    # A dental appointment comes back; going home sick does not. Stored so the
    # gate knows whether an unreturned pass at close of day is a problem.
    expected_return = Column(Boolean, nullable=False, default=False)
    expected_return_at = Column(DateTime, nullable=True)

    status = Column(String, nullable=False, default="Requested", index=True)
    # Requested, Approved, Rejected, Out, Returned, Cancelled

    approved_by = Column(String, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    decision_note = Column(Text, nullable=True)

    # Who physically took the child. Required to release a student pass.
    collected_by_name = Column(String, nullable=True)
    collected_by_relation = Column(String, nullable=True)
    collected_by_phone = Column(String, nullable=True)
    collected_by_id_proof = Column(String, nullable=True)
    # True when the guard confirmed the collector against the student's
    # recorded contacts; false means released to someone unrecognised, which
    # is allowed but is the thing an audit will look for.
    collector_matched_contact = Column(Boolean, nullable=False, default=False)

    released_by = Column(String, nullable=True)
    released_at = Column(DateTime, nullable=True)
    returned_at = Column(DateTime, nullable=True)
    returned_recorded_by = Column(String, nullable=True)

    remarks = Column(Text, nullable=True)
    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("pass_no", name="uq_gate_pass_no"),)


# ---------------------------------------------------------------------------
# Syllabus tracking and lesson plans
#
# Both hang off ClassSubject, which already ties a class, a subject, an
# academic year and a teacher together -- so a syllabus never has to restate
# any of those, and cannot disagree with the timetable about who teaches what.
#
# The output worth having is not the plan document; it is the answer to
# "which classes are behind, and by how much". Everything here is shaped to
# make that computable rather than typed in by hand.
# ---------------------------------------------------------------------------


class SyllabusUnit(Base):
    """A chapter or unit of a subject's syllabus for one class and year."""

    __tablename__ = "syllabus_units"

    id = Column(Integer, primary_key=True, index=True)
    class_subject_id = Column(
        Integer, ForeignKey("class_subjects.id", ondelete="CASCADE"), nullable=False, index=True
    )

    sequence_no = Column(Integer, nullable=False, default=1)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)

    # How long it is meant to take, and when. planned_end is what makes
    # "behind schedule" a fact rather than an opinion.
    planned_periods = Column(Integer, nullable=True)
    planned_start = Column(Date, nullable=True)
    planned_end = Column(Date, nullable=True, index=True)

    # Derived from its topics and recomputed on every change, rather than set
    # by hand -- a unit whose topics are all taught but which still reads
    # "In Progress" is exactly the drift this module exists to prevent.
    status = Column(String, nullable=False, default="Pending", index=True)
    # Pending, In Progress, Completed

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class SyllabusTopic(Base):
    """One teachable item inside a unit, and whether it has been taught."""

    __tablename__ = "syllabus_topics"

    id = Column(Integer, primary_key=True, index=True)
    unit_id = Column(
        Integer, ForeignKey("syllabus_units.id", ondelete="CASCADE"), nullable=False, index=True
    )

    sequence_no = Column(Integer, nullable=False, default=1)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    # Coverage is weighted by this, so a three-period topic counts for more
    # than a one-period topic. Defaults to 1 so an unweighted syllabus still
    # produces a sensible percentage.
    planned_periods = Column(Integer, nullable=False, default=1)

    status = Column(String, nullable=False, default="Pending", index=True)
    # Pending, In Progress, Completed

    # Stamped when the topic is first completed and kept: this is the record
    # of when the class was actually taught, not of the last edit.
    completed_on = Column(Date, nullable=True)
    completed_by = Column(String, nullable=True)
    periods_taken = Column(Integer, nullable=True)

    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class LessonPlan(Base):
    """What a teacher intends to teach in one period, and what happened.

    Linked to a syllabus topic where there is one, so marking a lesson
    delivered can move the syllabus on. The link is optional because
    revision periods, tests and activity lessons are real lessons that
    belong to no topic.
    """

    __tablename__ = "lesson_plans"

    id = Column(Integer, primary_key=True, index=True)
    class_subject_id = Column(
        Integer, ForeignKey("class_subjects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    teacher_id = Column(Integer, ForeignKey("teachers.id", ondelete="SET NULL"), nullable=True, index=True)
    topic_id = Column(
        Integer, ForeignKey("syllabus_topics.id", ondelete="SET NULL"), nullable=True, index=True
    )

    plan_date = Column(Date, nullable=False, index=True)
    period_no = Column(Integer, nullable=True)

    title = Column(String, nullable=False)
    objectives = Column(Text, nullable=True)
    teaching_method = Column(Text, nullable=True)
    resources = Column(Text, nullable=True)
    homework = Column(Text, nullable=True)

    status = Column(String, nullable=False, default="Planned", index=True)
    # Planned, Delivered, Deferred, Cancelled
    delivered_at = Column(DateTime, nullable=True)
    delivery_note = Column(Text, nullable=True)

    # Weekly lesson plans are submitted for a head of department or principal
    # to look over in most schools, so the review lives on the plan rather
    # than in a separate approval queue.
    review_status = Column(String, nullable=False, default="Pending", index=True)
    # Pending, Approved, Changes Requested
    reviewed_by = Column(String, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)
    review_note = Column(Text, nullable=True)

    created_by = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ---------------------------------------------------------------------------
# Vehicle tracking
#
# Built device-agnostic on purpose. Every tracker vendor speaks a different
# protocol, and the one thing they all manage is an HTTP POST, so ingest is
# an authenticated endpoint a tracker or an on-prem relay calls -- the same
# shape the biometric module already uses for terminals.
#
# Distances here are straight-line (haversine), not road distance. That is
# accurate enough to decide "the bus is at the stop" and is honestly labelled
# as an estimate everywhere it is used for an arrival time.
# ---------------------------------------------------------------------------


class TrackerDevice(Base):
    """A GPS unit or driver's phone reporting for one vehicle."""

    __tablename__ = "tracker_devices"

    id = Column(Integer, primary_key=True, index=True)
    device_uid = Column(String, nullable=False, index=True)  # device self-identifies with this
    label = Column(String, nullable=True)
    vendor = Column(String, nullable=True)
    model = Column(String, nullable=True)

    vehicle_id = Column(
        Integer, ForeignKey("transport_vehicles.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # A tracker cannot hold a login session, so it authenticates with a long
    # random bearer token. Only the hash is stored -- the plaintext is shown
    # once, at registration or rotation.
    auth_token_hash = Column(String, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    last_seen_at = Column(DateTime, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (UniqueConstraint("device_uid", name="uq_tracker_device_uid"),)


class VehicleTrip(Base):
    """One run of one vehicle along a route: the morning pickup, or the drop."""

    __tablename__ = "vehicle_trips"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(
        Integer, ForeignKey("transport_vehicles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    route_id = Column(
        Integer, ForeignKey("transport_routes.id", ondelete="SET NULL"), nullable=True, index=True
    )

    trip_date = Column(Date, nullable=False, index=True)
    direction = Column(String, nullable=False, default="Pickup", index=True)  # Pickup, Drop
    status = Column(String, nullable=False, default="Scheduled", index=True)
    # Scheduled, Running, Completed, Cancelled

    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    driver_name = Column(String, nullable=True)   # snapshot: drivers change
    driver_phone = Column(String, nullable=True)

    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        # One morning run per vehicle per day. Two would make "where is the
        # bus" ambiguous, which is the only question this table answers.
        UniqueConstraint("vehicle_id", "trip_date", "direction", name="uq_vehicle_trip_run"),
    )


class VehicleLocation(Base):
    """One position report.

    recorded_at is the device's clock, received_at ours. Both are kept because
    trackers buffer while out of coverage and replay later: without the
    distinction, a dump of old points would look like the bus teleporting
    backwards.
    """

    __tablename__ = "vehicle_locations"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(
        Integer, ForeignKey("transport_vehicles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    device_id = Column(
        Integer, ForeignKey("tracker_devices.id", ondelete="SET NULL"), nullable=True, index=True
    )
    trip_id = Column(
        Integer, ForeignKey("vehicle_trips.id", ondelete="SET NULL"), nullable=True, index=True
    )

    recorded_at = Column(DateTime, nullable=False, index=True)
    received_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    speed_kmph = Column(Float, nullable=True)
    heading = Column(Float, nullable=True)
    accuracy_m = Column(Float, nullable=True)

    __table_args__ = (
        # A tracker that retries a batch after a timeout must not double-log
        # the same fix.
        UniqueConstraint("vehicle_id", "recorded_at", name="uq_vehicle_location_fix"),
    )


class TripStopEvent(Base):
    """When a trip actually reached a stop, against when it was meant to."""

    __tablename__ = "trip_stop_events"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(
        Integer, ForeignKey("vehicle_trips.id", ondelete="CASCADE"), nullable=False, index=True
    )
    stop_id = Column(
        Integer, ForeignKey("transport_stops.id", ondelete="CASCADE"), nullable=False, index=True
    )

    arrived_at = Column(DateTime, nullable=True)
    departed_at = Column(DateTime, nullable=True)
    # geofence -> detected from position reports; manual -> entered by staff
    detected_by = Column(String, nullable=False, default="geofence")
    scheduled_time = Column(String, nullable=True)   # snapshot of the timetable string
    delay_minutes = Column(Integer, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("trip_id", "stop_id", name="uq_trip_stop_event"),
    )


class TransportAlert(Base):
    """Something worth telling a human about: speeding, silence, a missed stop."""

    __tablename__ = "transport_alerts"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(
        Integer, ForeignKey("transport_vehicles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    trip_id = Column(
        Integer, ForeignKey("vehicle_trips.id", ondelete="SET NULL"), nullable=True, index=True
    )

    alert_type = Column(String, nullable=False, index=True)
    # over_speed, no_signal, stop_missed, late_arrival
    severity = Column(String, nullable=False, default="Warning")   # Info, Warning, Critical
    occurred_at = Column(DateTime, nullable=False, default=datetime.utcnow, index=True)
    detail = Column(Text, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    acknowledged_by = Column(String, nullable=True)
    acknowledged_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)


class TrackingConfig(Base):
    """One row of school-wide tracking settings."""

    __tablename__ = "tracking_config"

    id = Column(Integer, primary_key=True, index=True)

    # How close counts as "at the stop". 150m is forgiving enough for consumer
    # GPS in a built-up area without merging two stops on the same street.
    geofence_radius_m = Column(Integer, nullable=False, default=150)
    over_speed_kmph = Column(Integer, nullable=False, default=60)
    # Silence past this is reported as an unknown position, never as "still
    # where we last saw it".
    stale_after_minutes = Column(Integer, nullable=False, default=10)
    # Position history is a child's movement record; it does not need keeping
    # for ever.
    retain_locations_days = Column(Integer, nullable=False, default=30)

    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ---------------------------------------------------------------------------
# Fee reminders
#
# An escalation ladder rather than a single nag: rungs fire at offsets from a
# fee's due date, and each rung fires at most once per fee. The interesting
# constraint is the catch-up case -- switching this on against a term of
# unpaid fees must not send every parent three emails at once, so only the
# furthest-along rung fires and the ones it passed are recorded as superseded.
# ---------------------------------------------------------------------------


class FeeReminderRule(Base):
    """One rung of the escalation ladder."""

    __tablename__ = "fee_reminder_rules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)          # "First reminder", "Final notice"

    # Signed, relative to the fee's due date: -3 is a courtesy note three days
    # before, +15 chases a fee a fortnight late.
    offset_days = Column(Integer, nullable=False, default=0)

    channel = Column(String, nullable=False, default="Email")   # Email, SMS, WhatsApp, In App
    template_id = Column(
        Integer, ForeignKey("communication_templates.id", ondelete="SET NULL"), nullable=True
    )

    # Chasing twelve rupees costs more in goodwill than it collects.
    min_due_amount = Column(Float, nullable=False, default=0)

    is_active = Column(Boolean, nullable=False, default=True)
    remarks = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    __table_args__ = (
        # Two rungs on the same day through the same channel is a duplicate
        # message, not a schedule.
        UniqueConstraint("offset_days", "channel", name="uq_fee_reminder_rung"),
    )


class FeeReminderLog(Base):
    """Proof that one rung fired for one fee, and what it said.

    The unique constraint is the whole point: it is what makes the cron safe
    to run every hour, and safe to re-run after a failure, without a parent
    receiving the same reminder twice.
    """

    __tablename__ = "fee_reminder_logs"

    id = Column(Integer, primary_key=True, index=True)
    fee_id = Column(Integer, ForeignKey("fees.id", ondelete="CASCADE"), nullable=False, index=True)
    rule_id = Column(
        Integer, ForeignKey("fee_reminder_rules.id", ondelete="CASCADE"), nullable=False, index=True
    )
    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=True, index=True)

    # The message itself lives in communication_logs, alongside every other
    # message the school has sent, rather than in a parallel history.
    communication_log_id = Column(
        Integer, ForeignKey("communication_logs.id", ondelete="SET NULL"), nullable=True
    )

    status = Column(String, nullable=False, default="Sent", index=True)
    # Sent, Failed, Skipped, Superseded

    # Why nothing was sent -- "no contact on file", "passed over by a later
    # rung". A silent absence is indistinguishable from a bug.
    skip_reason = Column(String, nullable=True)
    error_message = Column(Text, nullable=True)

    # What was actually owed when the reminder went out, so a later dispute
    # can be settled against the figure the parent was given.
    outstanding_amount = Column(Float, nullable=True)
    recipient = Column(String, nullable=True)
    offset_days = Column(Integer, nullable=True)   # snapshot: rules get edited

    sent_on = Column(Date, nullable=False, index=True)
    sent_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("fee_id", "rule_id", name="uq_fee_reminder_once"),
    )
