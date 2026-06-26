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


class SchoolClass(Base):
    __tablename__ = "classes"

    id = Column(Integer, primary_key=True, index=True)

    class_name = Column(String, nullable=False)
    section = Column(String, nullable=False)
    class_teacher = Column(String, nullable=True)
    room_number = Column(String, nullable=True)
    academic_year = Column(String, nullable=True)
    
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
    status = Column(String, nullable=False)  # Present, Absent, Late, Half Day
    remarks = Column(String, nullable=True)


class Fee(Base):
    __tablename__ = "fees"

    id = Column(Integer, primary_key=True, index=True)

    student_id = Column(Integer, ForeignKey("students.id"), nullable=False)
    fee_type = Column(String, nullable=False)

    total_amount = Column(Float, nullable=False)
    paid_amount = Column(Float, default=0)
    due_amount = Column(Float, default=0)

    payment_status = Column(String, default="Unpaid")  # Paid, Partial, Unpaid
    payment_date = Column(Date, nullable=True)
    receipt_no = Column(String, nullable=True)

    remarks = Column(String, nullable=True)


class Exam(Base):
    __tablename__ = "exams"

    id = Column(Integer, primary_key=True, index=True)

    exam_name = Column(String, nullable=False)
    class_name = Column(String, nullable=False)
    section = Column(String, nullable=False)
    exam_date = Column(Date, nullable=False)
    academic_year = Column(String, nullable=True)

    remarks = Column(String, nullable=True)


class Mark(Base):
    __tablename__ = "marks"

    id = Column(Integer, primary_key=True, index=True)

    student_id = Column(Integer, ForeignKey("students.id", ondelete="CASCADE"), nullable=False)
    exam_id = Column(Integer, ForeignKey("exams.id", ondelete="CASCADE"), nullable=False)

    class_subject_id = Column(Integer, ForeignKey("class_subjects.id", ondelete="SET NULL"), nullable=True, index=True)
    subject_name = Column(String, nullable=True, index=True)

    subject = Column(String, nullable=True)

    marks_obtained = Column(Float, nullable=False)
    max_marks = Column(Float, default=100)

    # keep this if your old backend already uses total_marks
    total_marks = Column(Float, default=100)

    grade = Column(String, nullable=True)
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

    subject_name = Column(String, nullable=False, index=True)

    teacher_id = Column(
        Integer,
        ForeignKey("teachers.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    weekly_periods = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "class_id",
            "subject_name",
            name="uq_class_subject_name"
        ),
    )