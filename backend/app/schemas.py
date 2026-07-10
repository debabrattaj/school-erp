from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import date


# =========================
# Auth / Users
# =========================

class LoginRequest(BaseModel):
    email: str
    password: str
    account_code: Optional[str] = "default"
    mfa_code: Optional[str] = None


class MfaCodeRequest(BaseModel):
    code: str


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


class ForgotPasswordRequest(BaseModel):
    email: str
    account_code: Optional[str] = "default"


class ResetPasswordConfirm(BaseModel):
    token: str
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
    upi_id: Optional[str] = None
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
    # "auto": server assigns the next roll number for the class/section
    # (default). "manual": the given roll_no is used as-is, after checking
    # it isn't already taken in that class/section.
    roll_no_mode: Optional[str] = "auto"
    class_name: Optional[str] = None
    section: Optional[str] = None
    house: Optional[str] = None
    admission_date: Optional[date] = None
    student_status: Optional[str] = "Active"
    residential_type: Optional[str] = "Day Scholar"
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
    # Unset (None) means "don't touch roll_no". "auto"/"manual" behave as
    # in StudentBase.
    roll_no_mode: Optional[str] = None
    class_name: Optional[str] = None
    section: Optional[str] = None
    house: Optional[str] = None
    admission_date: Optional[date] = None
    student_status: Optional[str] = None
    residential_type: Optional[str] = None
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
    academic_year: Optional[str] = None
    class_id: Optional[int] = None
    class_name_snapshot: Optional[str] = None
    section_snapshot: Optional[str] = None
    status: str
    remarks: Optional[str] = None


class AttendanceCreate(AttendanceBase):
    pass


class AttendanceUpdate(BaseModel):
    attendance_date: Optional[date] = None
    academic_year: Optional[str] = None
    class_id: Optional[int] = None
    class_name_snapshot: Optional[str] = None
    section_snapshot: Optional[str] = None
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
    academic_year: Optional[str] = None
    class_id: Optional[int] = None
    class_name_snapshot: Optional[str] = None
    section_snapshot: Optional[str] = None
    total_amount: float
    paid_amount: float = 0
    payment_date: Optional[date] = None
    due_date: Optional[date] = None
    receipt_no: Optional[str] = None
    remarks: Optional[str] = None


class FeeCreate(FeeBase):
    pass


class FeeUpdate(BaseModel):
    fee_type: Optional[str] = None
    academic_year: Optional[str] = None
    class_id: Optional[int] = None
    class_name_snapshot: Optional[str] = None
    section_snapshot: Optional[str] = None
    total_amount: Optional[float] = None
    paid_amount: Optional[float] = None
    payment_date: Optional[date] = None
    due_date: Optional[date] = None
    receipt_no: Optional[str] = None
    remarks: Optional[str] = None


class FeeResponse(FeeBase):
    id: int
    due_amount: float
    payment_status: str

    class Config:
        from_attributes = True


class FeeBulkClassCreate(BaseModel):
    class_name: str
    section: Optional[str] = None
    residential_type: Optional[str] = None
    fee_type: str
    academic_year: Optional[str] = None
    total_amount: float
    paid_amount: float = 0
    payment_date: Optional[date] = None
    due_date: Optional[date] = None
    remarks: Optional[str] = None


class FeeBulkClassResponse(BaseModel):
    created_count: int
    class_name: str
    section: Optional[str] = None
    residential_type: Optional[str] = None


# =========================
# Fee Structure
# =========================

class FeeStructureBase(BaseModel):
    academic_year: str
    class_name: Optional[str] = None
    residential_type: Optional[str] = None
    fee_type: str
    amount: float
    due_date: Optional[date] = None
    remarks: Optional[str] = None


class FeeStructureCreate(FeeStructureBase):
    pass


class FeeStructureUpdate(BaseModel):
    academic_year: Optional[str] = None
    class_name: Optional[str] = None
    residential_type: Optional[str] = None
    fee_type: Optional[str] = None
    amount: Optional[float] = None
    due_date: Optional[date] = None
    remarks: Optional[str] = None


class FeeStructureResponse(FeeStructureBase):
    id: int

    class Config:
        from_attributes = True


# =========================
# Exams
# =========================

class ExamBase(BaseModel):
    exam_name: str
    exam_type: Optional[str] = None
    class_name: Optional[str] = ""
    section: Optional[str] = ""
    exam_date: Optional[date] = None
    academic_year: Optional[str] = None
    remarks: Optional[str] = None


class ExamCreate(ExamBase):
    pass


class ExamUpdate(BaseModel):
    exam_name: Optional[str] = None
    exam_type: Optional[str] = None
    class_name: Optional[str] = None
    section: Optional[str] = None
    exam_date: Optional[date] = None
    academic_year: Optional[str] = None
    remarks: Optional[str] = None


class ExamResponse(ExamBase):
    id: int

    class Config:
        from_attributes = True


class ExamComponentBase(BaseModel):
    exam_id: int
    component_name: str
    max_marks: Optional[float] = 100
    weightage: Optional[float] = None
    sort_order: Optional[int] = 0
    is_active: Optional[bool] = True
    remarks: Optional[str] = None


class ExamComponentCreate(ExamComponentBase):
    pass


class ExamComponentUpdate(BaseModel):
    exam_id: Optional[int] = None
    component_name: Optional[str] = None
    max_marks: Optional[float] = None
    weightage: Optional[float] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None
    remarks: Optional[str] = None


class ExamComponentResponse(ExamComponentBase):
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
    academic_year: Optional[str] = None
    class_id: Optional[int] = None
    class_name_snapshot: Optional[str] = None
    section_snapshot: Optional[str] = None
    exam_name_snapshot: Optional[str] = None
    subject: Optional[str] = None

    marks_obtained: float
    max_marks: Optional[float] = 100
    total_marks: Optional[float] = 100

    grade: Optional[str] = None
    remarks: Optional[str] = None


class MarkComponentScoreBase(BaseModel):
    exam_component_id: Optional[int] = None
    component_name: str
    marks_obtained: Optional[float] = 0
    max_marks: Optional[float] = 100
    sort_order: Optional[int] = 0
    remarks: Optional[str] = None


class MarkComponentScoreCreate(MarkComponentScoreBase):
    pass


class MarkComponentScoreResponse(MarkComponentScoreBase):
    id: int
    mark_id: int

    class Config:
        from_attributes = True


class MarkCreate(MarkBase):
    component_scores: Optional[list[MarkComponentScoreCreate]] = None


class MarkResponse(MarkBase):
    id: int
    component_scores: Optional[list[MarkComponentScoreResponse]] = []

    class Config:
        from_attributes = True

class MarkUpdate(BaseModel):
    student_id: Optional[int] = None
    exam_id: Optional[int] = None
    class_subject_id: Optional[int] = None
    subject_name: Optional[str] = None
    academic_year: Optional[str] = None
    class_id: Optional[int] = None
    class_name_snapshot: Optional[str] = None
    section_snapshot: Optional[str] = None
    exam_name_snapshot: Optional[str] = None
    subject: Optional[str] = None
    marks_obtained: Optional[float] = None
    max_marks: Optional[float] = None
    total_marks: Optional[float] = None
    grade: Optional[str] = None
    remarks: Optional[str] = None
    component_scores: Optional[list[MarkComponentScoreCreate]] = None


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
    subject_id: Optional[int] = None
    subject_name: Optional[str] = None
    academic_year: str = "2026-27"
    teacher_id: Optional[int] = None
    weekly_periods: Optional[int] = 0
    is_active: Optional[bool] = True


class ClassSubjectCreate(ClassSubjectBase):
    pass


class ClassSubjectResponse(ClassSubjectBase):
    id: int

    class Config:
        from_attributes = True


class SchoolAccountCreate(BaseModel):
    school_name: str
    account_code: str
    domain: Optional[str] = None
    school_type: Optional[str] = "English Medium"
    curriculum: Optional[str] = "CBSE"
    country: Optional[str] = "India"
    timezone: Optional[str] = "Asia/Calcutta"
    database_url: Optional[str] = None
    status: Optional[str] = "Active"
    admin_name: str = "Admin User"
    admin_email: str
    admin_password: str
    features: Optional[dict[str, bool]] = None


class SchoolAccountResponse(BaseModel):
    id: int
    school_name: str
    account_code: str
    domain: Optional[str] = None
    school_type: Optional[str] = None
    curriculum: Optional[str] = None
    country: Optional[str] = None
    timezone: Optional[str] = None
    database_url: str
    status: str
    features: dict[str, bool] = {}


class SchoolFeatureUpdate(BaseModel):
    features: dict[str, bool]


class ClassExamMappingBase(BaseModel):
    class_id: int
    exam_id: int
    academic_year: str
    exam_date: Optional[date] = None
    is_active: Optional[bool] = True
    remarks: Optional[str] = None


class ClassExamMappingCreate(ClassExamMappingBase):
    pass


class ClassExamMappingResponse(ClassExamMappingBase):
    id: int

    class Config:
        from_attributes = True


class StudentEnrollmentBase(BaseModel):
    student_id: int
    class_id: int
    academic_year: str
    roll_no: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    enrollment_status: Optional[str] = "Active"
    promotion_status: Optional[str] = "Not Promoted"
    remarks: Optional[str] = None


class StudentEnrollmentCreate(StudentEnrollmentBase):
    pass


class StudentEnrollmentUpdate(StudentEnrollmentBase):
    pass


class StudentEnrollmentResponse(BaseModel):
    id: int
    student_id: int
    class_id: Optional[int] = None
    academic_year: str
    class_name_snapshot: Optional[str] = None
    section_snapshot: Optional[str] = None
    roll_no: Optional[str] = None
    enrollment_status: str
    promotion_status: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    remarks: Optional[str] = None
    created_at: Optional[Any] = None
    updated_at: Optional[Any] = None
    student_name: Optional[str] = None
    admission_no: Optional[str] = None
    class_display: Optional[str] = None

    class Config:
        from_attributes = True


class StudentPromotionRequest(BaseModel):
    student_ids: List[int]
    from_class_id: int
    to_class_id: int
    from_academic_year: str
    to_academic_year: str
    start_date: Optional[date] = None
    remarks: Optional[str] = None


class AdmissionInquiryBase(BaseModel):
    inquiry_no: str
    student_name: str
    grade_applying: str
    academic_year: str
    guardian_name: str
    guardian_phone: str
    guardian_email: Optional[str] = None
    source: Optional[str] = None
    stage: Optional[str] = "Inquiry"
    follow_up_date: Optional[date] = None
    assigned_to: Optional[str] = None
    converted_student_id: Optional[int] = None
    notes: Optional[str] = None


class AdmissionInquiryCreate(AdmissionInquiryBase):
    pass


class AdmissionInquiryUpdate(AdmissionInquiryBase):
    pass


class AdmissionInquiryResponse(AdmissionInquiryBase):
    id: int
    created_at: Optional[Any] = None
    updated_at: Optional[Any] = None

    class Config:
        from_attributes = True


class AdmissionWorkflowStageBase(BaseModel):
    name: str
    sort_order: Optional[int] = 0
    is_terminal: Optional[bool] = False


class AdmissionWorkflowStageCreate(AdmissionWorkflowStageBase):
    pass


class AdmissionWorkflowStageUpdate(BaseModel):
    name: Optional[str] = None
    sort_order: Optional[int] = None
    is_terminal: Optional[bool] = None


class AdmissionWorkflowStageResponse(AdmissionWorkflowStageBase):
    id: int
    created_at: Optional[Any] = None

    class Config:
        from_attributes = True


class AdmissionFollowUpBase(BaseModel):
    inquiry_id: int
    activity_date: date
    activity_type: Optional[str] = "Call"
    notes: str
    next_action: Optional[str] = None
    next_follow_up_date: Optional[date] = None
    owner: Optional[str] = None
    outcome: Optional[str] = None


class AdmissionFollowUpCreate(AdmissionFollowUpBase):
    pass


class AdmissionFollowUpResponse(AdmissionFollowUpBase):
    id: int
    created_at: Optional[Any] = None

    class Config:
        from_attributes = True


class AdmissionConvertToStudentRequest(BaseModel):
    admission_no: Optional[str] = None
    first_name: str
    last_name: Optional[str] = None
    class_name: Optional[str] = None
    section: Optional[str] = None
    admission_date: Optional[date] = None
    student_status: Optional[str] = "Active"
    guardian_name: Optional[str] = None
    guardian_phone: Optional[str] = None
    guardian_email: Optional[str] = None


class InternationalDocumentBase(BaseModel):
    student_id: int
    document_type: str
    document_no: Optional[str] = None
    issue_date: Optional[date] = None
    expiry_date: Optional[date] = None
    issuing_country: Optional[str] = None
    status: Optional[str] = "Pending"
    file_url: Optional[str] = None
    verified_by: Optional[str] = None
    verified_date: Optional[date] = None
    remarks: Optional[str] = None


class InternationalDocumentCreate(InternationalDocumentBase):
    pass


class InternationalDocumentUpdate(InternationalDocumentBase):
    pass


class InternationalDocumentResponse(InternationalDocumentBase):
    id: int
    student_name: Optional[str] = None
    admission_no: Optional[str] = None
    class_name: Optional[str] = None
    section: Optional[str] = None
    created_at: Optional[Any] = None
    updated_at: Optional[Any] = None

    class Config:
        from_attributes = True


class MultiCurriculumPlanBase(BaseModel):
    program_name: str
    curriculum_track: str
    grade_level: str
    academic_year: str
    class_id: Optional[int] = None
    subject_groups: Optional[str] = None
    assessment_model: Optional[str] = None
    coordinator: Optional[str] = None
    status: Optional[str] = "Draft"
    remarks: Optional[str] = None


class MultiCurriculumPlanCreate(MultiCurriculumPlanBase):
    pass


class MultiCurriculumPlanUpdate(MultiCurriculumPlanBase):
    pass


class MultiCurriculumPlanResponse(MultiCurriculumPlanBase):
    id: int
    class_name: Optional[str] = None
    section: Optional[str] = None
    class_display: Optional[str] = None
    created_at: Optional[Any] = None
    updated_at: Optional[Any] = None

    class Config:
        from_attributes = True


class AdmissionAssessmentBase(BaseModel):
    inquiry_id: int
    assessment_type: str
    scheduled_date: date
    scheduled_time: Optional[str] = None
    mode: Optional[str] = "On Campus"
    panel_members: Optional[str] = None
    location: Optional[str] = None
    status: Optional[str] = "Scheduled"
    score: Optional[float] = None
    outcome: Optional[str] = "Pending"
    next_follow_up_date: Optional[date] = None
    remarks: Optional[str] = None


class AdmissionAssessmentCreate(AdmissionAssessmentBase):
    pass


class AdmissionAssessmentUpdate(AdmissionAssessmentBase):
    pass


class AdmissionAssessmentResponse(AdmissionAssessmentBase):
    id: int
    inquiry_no: Optional[str] = None
    student_name: Optional[str] = None
    grade_applying: Optional[str] = None
    guardian_name: Optional[str] = None
    guardian_phone: Optional[str] = None
    admission_stage: Optional[str] = None
    created_at: Optional[Any] = None
    updated_at: Optional[Any] = None

    class Config:
        from_attributes = True


class CommunicationTemplateBase(BaseModel):
    template_name: str
    channel: Optional[str] = "WhatsApp"
    category: str
    audience: Optional[str] = "Parents"
    subject: Optional[str] = None
    body: str
    variables: Optional[str] = None
    language: Optional[str] = "English"
    status: Optional[str] = "Active"
    remarks: Optional[str] = None


class CommunicationTemplateCreate(CommunicationTemplateBase):
    pass


class CommunicationTemplateUpdate(CommunicationTemplateBase):
    pass


class CommunicationTemplateResponse(CommunicationTemplateBase):
    id: int
    created_at: Optional[Any] = None
    updated_at: Optional[Any] = None

    class Config:
        from_attributes = True


class CommunicationLogBase(BaseModel):
    template_id: Optional[int] = None
    channel: Optional[str] = "WhatsApp"
    category: str
    recipient_name: str
    recipient_phone: Optional[str] = None
    recipient_email: Optional[str] = None
    message_body: str
    related_module: Optional[str] = None
    related_record_id: Optional[int] = None
    status: Optional[str] = "Queued"
    error_message: Optional[str] = None


class CommunicationLogCreate(CommunicationLogBase):
    pass


class CommunicationLogResponse(CommunicationLogBase):
    id: int
    template_name: Optional[str] = None
    sent_at: Optional[Any] = None
    created_at: Optional[Any] = None
    updated_at: Optional[Any] = None

    class Config:
        from_attributes = True


class StudentServiceTicketBase(BaseModel):
    ticket_no: str
    student_id: Optional[int] = None
    requester_name: str
    requester_role: Optional[str] = "Parent"
    contact_phone: Optional[str] = None
    contact_email: Optional[str] = None
    category: str
    priority: Optional[str] = "Medium"
    subject: str
    description: str
    assigned_to: Optional[str] = None
    due_date: Optional[date] = None
    status: Optional[str] = "Open"
    resolution: Optional[str] = None
    closed_date: Optional[date] = None
    remarks: Optional[str] = None


class StudentServiceTicketCreate(StudentServiceTicketBase):
    pass


class StudentServiceTicketUpdate(StudentServiceTicketBase):
    pass


class StudentServiceTicketResponse(StudentServiceTicketBase):
    id: int
    student_name: Optional[str] = None
    admission_no: Optional[str] = None
    class_name: Optional[str] = None
    section: Optional[str] = None
    created_at: Optional[Any] = None
    updated_at: Optional[Any] = None

    class Config:
        from_attributes = True


class AlumniWithdrawalRecordBase(BaseModel):
    record_no: str
    student_id: Optional[int] = None
    student_name: str
    admission_no: Optional[str] = None
    last_class: Optional[str] = None
    record_type: Optional[str] = "Withdrawal"
    request_date: Optional[date] = None
    leaving_date: Optional[date] = None
    reason: str
    destination_school: Optional[str] = None
    destination_country: Optional[str] = None
    certificate_status: Optional[str] = "Pending"
    alumni_email: Optional[str] = None
    alumni_phone: Optional[str] = None
    current_status: Optional[str] = "Pending"
    approved_by: Optional[str] = None
    approval_date: Optional[date] = None
    remarks: Optional[str] = None


class AlumniWithdrawalRecordCreate(AlumniWithdrawalRecordBase):
    pass


class AlumniWithdrawalRecordUpdate(AlumniWithdrawalRecordBase):
    pass


class AlumniWithdrawalRecordResponse(AlumniWithdrawalRecordBase):
    id: int
    section: Optional[str] = None
    guardian_name: Optional[str] = None
    created_at: Optional[Any] = None
    updated_at: Optional[Any] = None

    class Config:
        from_attributes = True


class CounselingCaseBase(BaseModel):
    case_no: str
    student_id: int
    concern_type: str
    risk_level: Optional[str] = "Low"
    reported_by: Optional[str] = None
    counselor: Optional[str] = None
    session_date: Optional[date] = None
    next_follow_up_date: Optional[date] = None
    guardian_contacted: Optional[bool] = False
    action_plan: Optional[str] = None
    confidentiality_level: Optional[str] = "Restricted"
    status: Optional[str] = "Open"
    outcome: Optional[str] = None
    remarks: Optional[str] = None


class CounselingCaseCreate(CounselingCaseBase):
    pass


class CounselingCaseUpdate(CounselingCaseBase):
    pass


class CounselingCaseResponse(CounselingCaseBase):
    id: int
    student_name: Optional[str] = None
    admission_no: Optional[str] = None
    class_name: Optional[str] = None
    section: Optional[str] = None
    guardian_name: Optional[str] = None
    guardian_phone: Optional[str] = None
    created_at: Optional[Any] = None
    updated_at: Optional[Any] = None

    class Config:
        from_attributes = True


class EnrichmentActivityBase(BaseModel):
    activity_code: str
    activity_name: str
    activity_type: str
    category: Optional[str] = None
    coordinator: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    venue: Optional[str] = None
    eligible_classes: Optional[str] = None
    capacity: Optional[int] = None
    enrolled_count: Optional[int] = 0
    fee_amount: Optional[float] = 0
    status: Optional[str] = "Planned"
    description: Optional[str] = None
    remarks: Optional[str] = None


class EnrichmentActivityCreate(EnrichmentActivityBase):
    pass


class EnrichmentActivityUpdate(EnrichmentActivityBase):
    pass


class EnrichmentActivityResponse(EnrichmentActivityBase):
    id: int
    created_at: Optional[Any] = None
    updated_at: Optional[Any] = None

    class Config:
        from_attributes = True


class ComplianceTaskBase(BaseModel):
    task_code: str
    accreditation_body: str
    standard_area: str
    requirement: str
    evidence_link: Optional[str] = None
    owner: Optional[str] = None
    due_date: Optional[date] = None
    review_date: Optional[date] = None
    risk_level: Optional[str] = "Medium"
    status: Optional[str] = "Open"
    finding: Optional[str] = None
    action_plan: Optional[str] = None
    completed_date: Optional[date] = None
    remarks: Optional[str] = None


class ComplianceTaskCreate(ComplianceTaskBase):
    pass


class ComplianceTaskUpdate(ComplianceTaskBase):
    pass


class ComplianceTaskResponse(ComplianceTaskBase):
    id: int
    created_at: Optional[Any] = None
    updated_at: Optional[Any] = None

    class Config:
        from_attributes = True


class HostelBlockBase(BaseModel):
    block_name: str
    hostel_type: str = "Boys"
    warden_name: Optional[str] = None
    warden_phone: Optional[str] = None
    is_active: Optional[bool] = True
    remarks: Optional[str] = None


class HostelBlockCreate(HostelBlockBase):
    pass


class HostelBlockResponse(HostelBlockBase):
    id: int

    class Config:
        from_attributes = True


class HostelRoomBase(BaseModel):
    block_id: int
    room_no: str
    floor: Optional[str] = None
    capacity: int = 1
    is_active: Optional[bool] = True
    remarks: Optional[str] = None


class HostelRoomCreate(HostelRoomBase):
    pass


class HostelRoomResponse(HostelRoomBase):
    id: int
    block_name: Optional[str] = None
    occupied_beds: Optional[int] = 0
    available_beds: Optional[int] = 0


class HostelAllocationBase(BaseModel):
    student_id: int
    room_id: int
    bed_no: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: str = "Active"
    remarks: Optional[str] = None


class HostelAllocationCreate(HostelAllocationBase):
    pass


class HostelAllocationResponse(HostelAllocationBase):
    id: int
    student_name: Optional[str] = None
    admission_no: Optional[str] = None
    room_no: Optional[str] = None
    block_name: Optional[str] = None

    class Config:
        from_attributes = True


class TransportRouteBase(BaseModel):
    route_name: str
    start_point: Optional[str] = None
    end_point: Optional[str] = None
    monthly_fee: Optional[float] = 0
    is_active: Optional[bool] = True
    remarks: Optional[str] = None


class TransportRouteCreate(TransportRouteBase):
    pass


class TransportRouteResponse(TransportRouteBase):
    id: int

    class Config:
        from_attributes = True


class TransportVehicleBase(BaseModel):
    vehicle_no: str
    route_id: Optional[int] = None
    vehicle_type: Optional[str] = "Bus"
    capacity: int = 1
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    attendant_name: Optional[str] = None
    is_active: Optional[bool] = True
    remarks: Optional[str] = None


class TransportVehicleCreate(TransportVehicleBase):
    pass


class TransportVehicleResponse(TransportVehicleBase):
    id: int
    route_name: Optional[str] = None
    assigned_students: Optional[int] = 0
    available_seats: Optional[int] = 0


class TransportStopBase(BaseModel):
    route_id: int
    stop_name: str
    pickup_time: Optional[str] = None
    drop_time: Optional[str] = None
    sort_order: Optional[int] = 0
    is_active: Optional[bool] = True
    remarks: Optional[str] = None


class TransportStopCreate(TransportStopBase):
    pass


class TransportStopResponse(TransportStopBase):
    id: int
    route_name: Optional[str] = None


class TransportAssignmentBase(BaseModel):
    student_id: int
    route_id: int
    vehicle_id: Optional[int] = None
    stop_id: Optional[int] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    status: str = "Active"
    remarks: Optional[str] = None


class TransportAssignmentCreate(TransportAssignmentBase):
    pass


class TransportAssignmentResponse(TransportAssignmentBase):
    id: int
    student_name: Optional[str] = None
    admission_no: Optional[str] = None
    route_name: Optional[str] = None
    vehicle_no: Optional[str] = None
    stop_name: Optional[str] = None

    class Config:
        from_attributes = True


class HealthInfirmaryVisitBase(BaseModel):
    student_id: int
    visit_date: date
    visit_time: Optional[str] = None
    symptoms: str
    diagnosis: Optional[str] = None
    treatment: Optional[str] = None
    medicine_given: Optional[str] = None
    attended_by: Optional[str] = None
    referred_to_hospital: Optional[bool] = False
    follow_up_date: Optional[date] = None
    status: str = "Open"
    remarks: Optional[str] = None


class HealthInfirmaryVisitCreate(HealthInfirmaryVisitBase):
    pass


class HealthInfirmaryVisitResponse(HealthInfirmaryVisitBase):
    id: int
    student_name: Optional[str] = None
    admission_no: Optional[str] = None
    class_name: Optional[str] = None
    section: Optional[str] = None

    class Config:
        from_attributes = True


class MessMenuBase(BaseModel):
    menu_date: date
    meal_type: str
    menu_items: str
    nutrition_notes: Optional[str] = None
    allergen_notes: Optional[str] = None
    is_published: Optional[bool] = True
    remarks: Optional[str] = None


class MessMenuCreate(MessMenuBase):
    pass


class MessMenuResponse(MessMenuBase):
    id: int

    class Config:
        from_attributes = True


class MessAttendanceBase(BaseModel):
    student_id: int
    meal_date: date
    meal_type: str
    status: str = "Present"
    remarks: Optional[str] = None


class MessAttendanceCreate(MessAttendanceBase):
    pass


class MessAttendanceResponse(MessAttendanceBase):
    id: int
    student_name: Optional[str] = None
    admission_no: Optional[str] = None
    class_name: Optional[str] = None
    section: Optional[str] = None

    class Config:
        from_attributes = True


class LibraryBookBase(BaseModel):
    accession_no: str
    title: str
    author: Optional[str] = None
    category: Optional[str] = None
    publisher: Optional[str] = None
    isbn: Optional[str] = None
    total_copies: int = 1
    available_copies: int = 1
    shelf_no: Optional[str] = None
    status: str = "Available"
    remarks: Optional[str] = None


class LibraryBookCreate(LibraryBookBase):
    pass


class LibraryBookResponse(LibraryBookBase):
    id: int

    class Config:
        from_attributes = True


class LibraryIssueBase(BaseModel):
    book_id: int
    student_id: int
    issue_date: date
    due_date: Optional[date] = None
    return_date: Optional[date] = None
    status: str = "Issued"
    fine_amount: Optional[float] = 0
    remarks: Optional[str] = None


class LibraryIssueCreate(LibraryIssueBase):
    pass


class LibraryIssueResponse(LibraryIssueBase):
    id: int
    book_title: Optional[str] = None
    accession_no: Optional[str] = None
    student_name: Optional[str] = None
    admission_no: Optional[str] = None
    class_name: Optional[str] = None
    section: Optional[str] = None

    class Config:
        from_attributes = True


class InventoryItemBase(BaseModel):
    item_name: str
    item_code: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = "pcs"
    quantity_available: Optional[float] = 0
    reorder_level: Optional[float] = 0
    unit_price: Optional[float] = 0
    location: Optional[str] = None
    status: str = "Active"
    remarks: Optional[str] = None


class InventoryItemCreate(InventoryItemBase):
    pass


class InventoryItemResponse(InventoryItemBase):
    id: int

    class Config:
        from_attributes = True


class InventoryTransactionBase(BaseModel):
    item_id: int
    transaction_date: date
    transaction_type: str
    quantity: float
    issued_to_student_id: Optional[int] = None
    issued_to_staff: Optional[str] = None
    reference_no: Optional[str] = None
    unit_cost: Optional[float] = None
    remarks: Optional[str] = None
    cycle: Optional[str] = None
    academic_year: Optional[str] = None
    unit_price: Optional[float] = None
    payment_status: Optional[str] = None


class InventoryTransactionCreate(InventoryTransactionBase):
    pass


class InventoryTransactionResponse(InventoryTransactionBase):
    id: int
    total_cost: Optional[float] = None
    amount: Optional[float] = None
    item_name: Optional[str] = None
    item_code: Optional[str] = None
    student_name: Optional[str] = None
    admission_no: Optional[str] = None
    class_name: Optional[str] = None
    section: Optional[str] = None

    class Config:
        from_attributes = True


class InventoryBulkIssueItem(BaseModel):
    item_id: int
    quantity_per_student: float


class InventoryBulkIssueRequest(BaseModel):
    items: list[InventoryBulkIssueItem]
    student_ids: list[int]
    transaction_date: date
    cycle: str
    academic_year: str
    reference_no: Optional[str] = None
    remarks: Optional[str] = None


class InventoryBulkIssueResult(BaseModel):
    item_id: int
    item_name: str
    issued_count: int
    skipped_duplicate_count: int
    skipped_insufficient_stock: bool


class InventoryBulkIssueResponse(BaseModel):
    results: list[InventoryBulkIssueResult]
    total_issued: int


# ---------------- Accounting ----------------

class AccountTransactionBase(BaseModel):
    entry_date: date
    entry_type: str  # Income, Expense
    category: str
    amount: float
    payment_mode: Optional[str] = None
    reference_no: Optional[str] = None
    description: Optional[str] = None


class AccountTransactionCreate(AccountTransactionBase):
    pass


class AccountTransactionUpdate(BaseModel):
    entry_date: Optional[date] = None
    entry_type: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    payment_mode: Optional[str] = None
    reference_no: Optional[str] = None
    description: Optional[str] = None


class AccountTransactionResponse(AccountTransactionBase):
    id: int

    class Config:
        from_attributes = True


class LedgerEntry(BaseModel):
    date: date
    entry_type: str
    category: str
    description: str
    amount: float
    source: str
    reference_no: Optional[str] = None


class AccountingSummaryResponse(BaseModel):
    fee_income: float
    inventory_expense: float
    other_income: float
    other_expense: float
    total_income: float
    total_expense: float
    net_balance: float
    monthly: list[dict]


# ---------------- Academic Years ----------------

class AcademicYearBase(BaseModel):
    name: str
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    remarks: Optional[str] = None


class AcademicYearCreate(AcademicYearBase):
    pass


class AcademicYearUpdate(BaseModel):
    name: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    remarks: Optional[str] = None


class AcademicYearResponse(AcademicYearBase):
    id: int
    is_current: bool
    status: str

    class Config:
        from_attributes = True


# ---------------- Year-End Processing ----------------

class YearEndAction(BaseModel):
    student_id: int
    action: str  # "promote" | "detain" | "graduate"
    to_class_id: Optional[int] = None  # required for promote; ignored otherwise


class YearEndRequest(BaseModel):
    from_academic_year: str
    to_academic_year: Optional[str] = None  # not needed if all actions are graduate
    actions: List[YearEndAction]
    start_date: Optional[date] = None
    carry_forward_fees: bool = False
    remarks: Optional[str] = None


# ---------------- Parent/Student Portal ----------------

class PortalLinkCreate(BaseModel):
    user_id: int
    student_id: int
    relationship: Optional[str] = None


class PortalLinkResponse(BaseModel):
    id: int
    user_id: int
    student_id: int
    relationship: Optional[str] = None
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    user_role: Optional[str] = None
    student_name: Optional[str] = None
    admission_no: Optional[str] = None

    class Config:
        from_attributes = True


class TimetableEntryBase(BaseModel):
    academic_year: Optional[str] = None
    class_id: Optional[int] = None
    class_name_snapshot: Optional[str] = None
    section_snapshot: Optional[str] = None
    day_of_week: str
    period_no: int
    entry_type: Optional[str] = "period"
    label: Optional[str] = None
    duration_min: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    subject: Optional[str] = None
    teacher_id: Optional[int] = None
    teacher_name_snapshot: Optional[str] = None
    room: Optional[str] = None


class TimetableEntryCreate(TimetableEntryBase):
    pass


class TimetableEntryUpdate(BaseModel):
    academic_year: Optional[str] = None
    class_id: Optional[int] = None
    day_of_week: Optional[str] = None
    period_no: Optional[int] = None
    entry_type: Optional[str] = None
    label: Optional[str] = None
    duration_min: Optional[int] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    subject: Optional[str] = None
    teacher_id: Optional[int] = None
    room: Optional[str] = None


class TimetableEntryResponse(TimetableEntryBase):
    id: int

    class Config:
        from_attributes = True
