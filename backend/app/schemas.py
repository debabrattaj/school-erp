from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import date


# =========================
# Auth / Users
# =========================

class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: dict


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str


class UserUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None


class PasswordResetRequest(BaseModel):
    new_password: str


class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    role: str

    class Config:
        from_attributes = True


# =========================
# School Settings
# =========================

class SchoolSettingsBase(BaseModel):
    school_name: str
    tagline: Optional[str] = None
    institution_type: Optional[str] = "International School"
    board_affiliation: Optional[str] = None
    school_code: Optional[str] = None
    website: Optional[str] = None
    logo_url: Optional[str] = None

    campus_name: Optional[str] = None
    campus_city: Optional[str] = None
    campus_state: Optional[str] = None
    campus_country: Optional[str] = "India"

    address: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    principal_name: Optional[str] = None

    academic_year: Optional[str] = None
    default_sections: Optional[str] = "A,B,C"
    houses: Optional[str] = "Red,Blue,Green,Yellow"
    working_days: Optional[str] = None

    currency: Optional[str] = "INR"
    receipt_prefix: Optional[str] = "REC"
    late_fee_rule: Optional[str] = None

    pass_percentage: Optional[float] = 40
    grade_rules: Optional[str] = (
        "A+:90-100,A:80-89,B:70-79,C:60-69,D:40-59,F:0-39"
    )


class SchoolSettingsUpdate(SchoolSettingsBase):
    pass


class SchoolSettingsResponse(SchoolSettingsBase):
    id: int

    class Config:
        from_attributes = True


# =========================
# Students
# =========================

class StudentBase(BaseModel):
    admission_no: str
    roll_no: Optional[str] = None
    class_name: Optional[str] = None
    section: Optional[str] = None
    house: Optional[str] = None
    admission_date: Optional[date] = None
    student_status: Optional[str] = "Active"
    class_id: Optional[int] = None
    first_name: str
    last_name: Optional[str] = None
    gender: Optional[str] = None
    dob: Optional[date] = None
    nationality: Optional[str] = None
    blood_group: Optional[str] = None
    photo_url: Optional[str] = None

    father_name: Optional[str] = None
    mother_name: Optional[str] = None
    guardian_name: Optional[str] = None
    guardian_phone: Optional[str] = None
    guardian_email: Optional[str] = None

    medical_notes: Optional[str] = None
    allergies: Optional[str] = None

    transport_route: Optional[str] = None
    pickup_point: Optional[str] = None

    birth_certificate: Optional[str] = None
    transfer_certificate: Optional[str] = None
    passport_no: Optional[str] = None


class StudentCreate(StudentBase):
    pass


class StudentUpdate(BaseModel):
    admission_no: Optional[str] = None
    roll_no: Optional[str] = None
    class_name: Optional[str] = None
    section: Optional[str] = None
    house: Optional[str] = None
    admission_date: Optional[date] = None
    student_status: Optional[str] = None
    class_id: Optional[int] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    gender: Optional[str] = None
    dob: Optional[date] = None
    nationality: Optional[str] = None
    blood_group: Optional[str] = None
    photo_url: Optional[str] = None

    father_name: Optional[str] = None
    mother_name: Optional[str] = None
    guardian_name: Optional[str] = None
    guardian_phone: Optional[str] = None
    guardian_email: Optional[str] = None

    medical_notes: Optional[str] = None
    allergies: Optional[str] = None

    transport_route: Optional[str] = None
    pickup_point: Optional[str] = None

    birth_certificate: Optional[str] = None
    transfer_certificate: Optional[str] = None
    passport_no: Optional[str] = None


class StudentResponse(StudentBase):
    id: int
    class_id: Optional[int] = None
    class Config:
        from_attributes = True


# =========================
# Teachers
# =========================

class TeacherBase(BaseModel):
    employee_no: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    gender: Optional[str] = None

    department: Optional[str] = None
    subject: Optional[str] = None
    assigned_class: Optional[str] = None
    qualification: Optional[str] = None

    joining_date: Optional[date] = None
    employment_type: Optional[str] = None
    salary_grade: Optional[str] = None

    photo_url: Optional[str] = None
    address: Optional[str] = None

    is_class_teacher: Optional[bool] = False
    class_id: Optional[int] = None


class TeacherCreate(TeacherBase):
    pass


class TeacherUpdate(BaseModel):
    employee_no: Optional[str] = None
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    gender: Optional[str] = None

    department: Optional[str] = None
    subject: Optional[str] = None
    assigned_class: Optional[str] = None
    qualification: Optional[str] = None

    joining_date: Optional[date] = None
    employment_type: Optional[str] = None
    salary_grade: Optional[str] = None

    photo_url: Optional[str] = None
    address: Optional[str] = None


class TeacherResponse(TeacherBase):
    id: int

    class Config:
        from_attributes = True


# =========================
# Classes
# =========================

class SchoolClassBase(BaseModel):
    class_name: str
    section: str
    class_teacher: Optional[str] = None
    class_teacher_id: Optional[int] = None
    academic_year: Optional[str] = None
    room_no: Optional[str] = None


class SchoolClassCreate(SchoolClassBase):
    pass


class SchoolClassUpdate(BaseModel):
    class_name: Optional[str] = None
    section: Optional[str] = None
    class_teacher: Optional[str] = None
    room_number: Optional[str] = None
    academic_year: Optional[str] = None
    room_no: Optional[str] = None


class SchoolClassResponse(SchoolClassBase):
    id: int

    class Config:
        from_attributes = True


# =========================
# Attendance
# =========================

class AttendanceBase(BaseModel):
    student_id: int
    attendance_date: date
    status: str
    remarks: Optional[str] = None


class AttendanceCreate(AttendanceBase):
    pass


class AttendanceUpdate(BaseModel):
    attendance_date: Optional[date] = None
    status: Optional[str] = None
    remarks: Optional[str] = None


class AttendanceResponse(AttendanceBase):
    id: int

    class Config:
        from_attributes = True


# =========================
# Fees
# =========================

class FeeBase(BaseModel):
    student_id: int
    fee_type: str
    total_amount: float
    paid_amount: float = 0
    payment_date: Optional[date] = None
    receipt_no: Optional[str] = None
    remarks: Optional[str] = None


class FeeCreate(FeeBase):
    pass


class FeeUpdate(BaseModel):
    fee_type: Optional[str] = None
    total_amount: Optional[float] = None
    paid_amount: Optional[float] = None
    payment_date: Optional[date] = None
    receipt_no: Optional[str] = None
    remarks: Optional[str] = None


class FeeResponse(FeeBase):
    id: int
    due_amount: float
    payment_status: str

    class Config:
        from_attributes = True


# =========================
# Exams
# =========================

class ExamBase(BaseModel):
    exam_name: str
    class_name: str
    section: str
    exam_date: date
    academic_year: Optional[str] = None
    remarks: Optional[str] = None


class ExamCreate(ExamBase):
    pass


class ExamUpdate(BaseModel):
    exam_name: Optional[str] = None
    class_name: Optional[str] = None
    section: Optional[str] = None
    exam_date: Optional[date] = None
    academic_year: Optional[str] = None
    remarks: Optional[str] = None


class ExamResponse(ExamBase):
    id: int

    class Config:
        from_attributes = True


# =========================
# Marks
# =========================

class MarkBase(BaseModel):
    student_id: int
    exam_id: int

    class_subject_id: Optional[int] = None
    subject_name: Optional[str] = None
    subject: Optional[str] = None

    marks_obtained: float
    max_marks: Optional[float] = 100
    total_marks: Optional[float] = 100

    grade: Optional[str] = None
    remarks: Optional[str] = None


class MarkCreate(MarkBase):
    pass


class MarkResponse(MarkBase):
    id: int

    class Config:
        from_attributes = True

class MarkUpdate(BaseModel):
    subject: Optional[str] = None
    marks_obtained: Optional[float] = None
    total_marks: Optional[float] = None
    remarks: Optional[str] = None


# =========================
# Master Data
# =========================

class MasterDataCreate(BaseModel):
    category: str
    value: str
    is_active: Optional[bool] = True
    sort_order: Optional[int] = 0


class MasterDataUpdate(BaseModel):
    category: Optional[str] = None
    value: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class MasterDataResponse(BaseModel):
    id: int
    category: str
    value: str
    is_active: bool
    sort_order: int

    class Config:
        from_attributes = True

from typing import List, Optional
from pydantic import BaseModel


class StudentCustomFieldValueCreate(BaseModel):
    field_key: str
    field_label: Optional[str] = None
    field_type: Optional[str] = None
    field_value: Optional[str] = None


class StudentCustomFieldValueResponse(BaseModel):
    id: int
    student_id: int
    field_key: str
    field_label: Optional[str] = None
    field_type: Optional[str] = None
    field_value: Optional[str] = None

class Config:
    from_attributes = True


class StudentCustomFieldBulkSave(BaseModel):
    values: List[StudentCustomFieldValueCreate]

class ModuleLayoutSave(BaseModel):
    layout_json: Any


class ModuleLayoutResponse(BaseModel):
    id: int
    module_name: str
    layout_json: Any
    is_active: bool

class Config:
    from_attributes = True


class ModuleCustomFieldValueCreate(BaseModel):
    field_key: str
    field_label: Optional[str] = None
    field_type: Optional[str] = None
    field_value: Optional[str] = None


class ModuleCustomFieldValueResponse(BaseModel):
    id: int
    module_name: str
    record_id: int
    field_key: str
    field_label: Optional[str] = None
    field_type: Optional[str] = None
    field_value: Optional[str] = None

    class Config:
        from_attributes = True


class ModuleCustomFieldBulkSave(BaseModel):
    values: List[ModuleCustomFieldValueCreate]


class ClassBase(BaseModel):
    class_name: str
    section: str
    class_teacher: Optional[str] = None
    class_teacher_id: Optional[int] = None
    room_no: Optional[str] = None


class ClassCreate(ClassBase):
    pass


class ClassResponse(ClassBase):
    id: int

    class Config:
        from_attributes = True


class SubjectBase(BaseModel):
    subject_code: str
    subject_name: str
    subject_type: Optional[str] = "Scholastic"
    is_active: Optional[bool] = True


class SubjectCreate(SubjectBase):
    pass


class SubjectResponse(SubjectBase):
    id: int

    class Config:
        from_attributes = True


class ClassSubjectBase(BaseModel):
    class_id: int
    subject_name: str
    teacher_id: Optional[int] = None
    weekly_periods: Optional[int] = 0
    is_active: Optional[bool] = True


class ClassSubjectCreate(ClassSubjectBase):
    pass


class ClassSubjectResponse(ClassSubjectBase):
    id: int

    class Config:
        from_attributes = True