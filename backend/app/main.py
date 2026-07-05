from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from app.routes import master_data
from app.routes import student_custom_fields
from app.routes import module_layouts
from app.database import Base, engine
from app.seed import seed_all
from app.routes import module_custom_fields
from app.routes import subjects
from app.routes import student_enrollments
from app.routes import accounts
from app.routes import hostel
from app.routes import transport
from app.routes import health_infirmary
from app.routes import mess
from app.routes import library
from app.routes import inventory
from app.routes import admissions
from app.routes import international_documents
from app.routes import multi_curriculum
from app.routes import admission_assessments
from app.routes import communications
from app.routes import student_services
from app.routes import alumni_withdrawals
from app.routes import counseling
from app.routes import enrichment
from app.routes import compliance
from app.routes import exam_components
from app.routes import academic_years
from app.routes import portal
from app.routes import chatbot
from app.routes import platform
from app.tenant import init_tenant_registry
from app.routes import (
    students,
    teachers,
    classes,
    attendance,
    fees,
    exams,
    marks,
    auth,
    users,
    settings,
    dashboard,
    master_data,
)

Base.metadata.create_all(bind=engine)
init_tenant_registry()
platform.ensure_platform_owner()
platform.ensure_default_plans()


def ensure_dev_schema():
    with engine.begin() as connection:
        class_subject_columns = {
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info(class_subjects)")
        }

        if class_subject_columns and "academic_year" not in class_subject_columns:
            connection.exec_driver_sql(
                "ALTER TABLE class_subjects ADD COLUMN academic_year VARCHAR DEFAULT '2026-27'"
            )

        if class_subject_columns and "updated_at" not in class_subject_columns:
            connection.exec_driver_sql(
                "ALTER TABLE class_subjects ADD COLUMN updated_at DATETIME"
            )

        if class_subject_columns and "subject_id" not in class_subject_columns:
            connection.exec_driver_sql(
                "ALTER TABLE class_subjects ADD COLUMN subject_id INTEGER"
            )

        if class_subject_columns:
            connection.exec_driver_sql(
                """
                UPDATE class_subjects
                SET subject_id = (
                    SELECT subjects.id
                    FROM subjects
                    WHERE lower(subjects.subject_name) = lower(class_subjects.subject_name)
                    LIMIT 1
                )
                WHERE subject_id IS NULL
                  AND subject_name IS NOT NULL
                """
            )

        mark_columns = {
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info(marks)")
        }

        if mark_columns and "academic_year" not in mark_columns:
            connection.exec_driver_sql(
                "ALTER TABLE marks ADD COLUMN academic_year VARCHAR"
            )

        for column_name, column_sql in {
            "class_id": "INTEGER",
            "class_name_snapshot": "VARCHAR",
            "section_snapshot": "VARCHAR",
            "exam_name_snapshot": "VARCHAR",
        }.items():
            if mark_columns and column_name not in mark_columns:
                connection.exec_driver_sql(
                    f"ALTER TABLE marks ADD COLUMN {column_name} {column_sql}"
                )

        if mark_columns:
            connection.exec_driver_sql(
                """
                UPDATE marks
                SET subject_name = (
                    SELECT class_subjects.subject_name
                    FROM class_subjects
                    WHERE class_subjects.id = marks.class_subject_id
                    LIMIT 1
                )
                WHERE (subject_name IS NULL OR subject_name = '')
                  AND class_subject_id IS NOT NULL
                """
            )
            connection.exec_driver_sql(
                """
                UPDATE marks
                SET subject = subject_name
                WHERE (subject IS NULL OR subject = '')
                  AND subject_name IS NOT NULL
                """
            )
            connection.exec_driver_sql(
                """
                UPDATE marks
                SET academic_year = (
                    SELECT class_subjects.academic_year
                    FROM class_subjects
                    WHERE class_subjects.id = marks.class_subject_id
                    LIMIT 1
                )
                WHERE (academic_year IS NULL OR academic_year = '')
                  AND class_subject_id IS NOT NULL
                """
            )
            connection.exec_driver_sql(
                """
                UPDATE marks
                SET class_id = (
                    SELECT students.class_id
                    FROM students
                    WHERE students.id = marks.student_id
                    LIMIT 1
                )
                WHERE class_id IS NULL
                  AND student_id IS NOT NULL
                """
            )
            connection.exec_driver_sql(
                """
                UPDATE marks
                SET class_name_snapshot = (
                    SELECT students.class_name
                    FROM students
                    WHERE students.id = marks.student_id
                    LIMIT 1
                )
                WHERE (class_name_snapshot IS NULL OR class_name_snapshot = '')
                  AND student_id IS NOT NULL
                """
            )
            connection.exec_driver_sql(
                """
                UPDATE marks
                SET section_snapshot = (
                    SELECT students.section
                    FROM students
                    WHERE students.id = marks.student_id
                    LIMIT 1
                )
                WHERE (section_snapshot IS NULL OR section_snapshot = '')
                  AND student_id IS NOT NULL
                """
            )
            connection.exec_driver_sql(
                """
                UPDATE marks
                SET exam_name_snapshot = (
                    SELECT exams.exam_name
                    FROM exams
                    WHERE exams.id = marks.exam_id
                    LIMIT 1
                )
                WHERE (exam_name_snapshot IS NULL OR exam_name_snapshot = '')
                  AND exam_id IS NOT NULL
                """
            )

        exam_columns = {
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info(exams)")
        }

        if exam_columns and "exam_type" not in exam_columns:
            connection.exec_driver_sql(
                "ALTER TABLE exams ADD COLUMN exam_type VARCHAR"
            )

        attendance_columns = {
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info(attendance)")
        }

        for column_name, column_sql in {
            "academic_year": "VARCHAR",
            "class_id": "INTEGER",
            "class_name_snapshot": "VARCHAR",
            "section_snapshot": "VARCHAR",
        }.items():
            if attendance_columns and column_name not in attendance_columns:
                connection.exec_driver_sql(
                    f"ALTER TABLE attendance ADD COLUMN {column_name} {column_sql}"
                )

        if attendance_columns:
            connection.exec_driver_sql(
                """
                UPDATE attendance
                SET class_id = (
                    SELECT students.class_id
                    FROM students
                    WHERE students.id = attendance.student_id
                    LIMIT 1
                )
                WHERE class_id IS NULL
                  AND student_id IS NOT NULL
                """
            )
            connection.exec_driver_sql(
                """
                UPDATE attendance
                SET class_name_snapshot = (
                    SELECT students.class_name
                    FROM students
                    WHERE students.id = attendance.student_id
                    LIMIT 1
                )
                WHERE (class_name_snapshot IS NULL OR class_name_snapshot = '')
                  AND student_id IS NOT NULL
                """
            )
            connection.exec_driver_sql(
                """
                UPDATE attendance
                SET section_snapshot = (
                    SELECT students.section
                    FROM students
                    WHERE students.id = attendance.student_id
                    LIMIT 1
                )
                WHERE (section_snapshot IS NULL OR section_snapshot = '')
                  AND student_id IS NOT NULL
                """
            )
            connection.exec_driver_sql(
                """
                UPDATE attendance
                SET academic_year = (
                    SELECT school_settings.academic_year
                    FROM school_settings
                    LIMIT 1
                )
                WHERE academic_year IS NULL OR academic_year = ''
                """
            )

        fee_columns = {
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info(fees)")
        }

        for column_name, column_sql in {
            "academic_year": "VARCHAR",
            "class_id": "INTEGER",
            "class_name_snapshot": "VARCHAR",
            "section_snapshot": "VARCHAR",
        }.items():
            if fee_columns and column_name not in fee_columns:
                connection.exec_driver_sql(
                    f"ALTER TABLE fees ADD COLUMN {column_name} {column_sql}"
                )

        if fee_columns:
            connection.exec_driver_sql(
                """
                UPDATE fees
                SET class_id = (
                    SELECT students.class_id
                    FROM students
                    WHERE students.id = fees.student_id
                    LIMIT 1
                )
                WHERE class_id IS NULL
                  AND student_id IS NOT NULL
                """
            )
            connection.exec_driver_sql(
                """
                UPDATE fees
                SET class_name_snapshot = (
                    SELECT students.class_name
                    FROM students
                    WHERE students.id = fees.student_id
                    LIMIT 1
                )
                WHERE (class_name_snapshot IS NULL OR class_name_snapshot = '')
                  AND student_id IS NOT NULL
                """
            )
            connection.exec_driver_sql(
                """
                UPDATE fees
                SET section_snapshot = (
                    SELECT students.section
                    FROM students
                    WHERE students.id = fees.student_id
                    LIMIT 1
                )
                WHERE (section_snapshot IS NULL OR section_snapshot = '')
                  AND student_id IS NOT NULL
                """
            )
            connection.exec_driver_sql(
                """
                UPDATE fees
                SET academic_year = (
                    SELECT school_settings.academic_year
                    FROM school_settings
                    LIMIT 1
                )
                WHERE academic_year IS NULL OR academic_year = ''
                """
            )

        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS class_exam_mappings (
                    id INTEGER NOT NULL,
                    class_id INTEGER NOT NULL,
                    exam_id INTEGER NOT NULL,
                    academic_year VARCHAR NOT NULL,
                    exam_date DATE,
                    is_active BOOLEAN,
                    remarks VARCHAR,
                    created_at DATETIME,
                    updated_at DATETIME,
                    PRIMARY KEY (id),
                    FOREIGN KEY(class_id) REFERENCES classes (id) ON DELETE CASCADE,
                    FOREIGN KEY(exam_id) REFERENCES exams (id) ON DELETE CASCADE,
                    CONSTRAINT uq_class_exam_academic_year UNIQUE (
                        class_id,
                        exam_id,
                        academic_year
                    )
                )
                """
            )
        )

        class_exam_columns = {
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info(class_exam_mappings)")
        }

        if class_exam_columns and "exam_date" not in class_exam_columns:
            connection.exec_driver_sql(
                "ALTER TABLE class_exam_mappings ADD COLUMN exam_date DATE"
            )

        connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_class_exam_mappings_id "
                "ON class_exam_mappings (id)"
            )
        )
        connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_class_exam_mappings_class_id "
                "ON class_exam_mappings (class_id)"
            )
        )
        connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_class_exam_mappings_exam_id "
                "ON class_exam_mappings (exam_id)"
            )
        )
        connection.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_class_exam_mappings_academic_year "
                "ON class_exam_mappings (academic_year)"
            )
        )

        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS admission_inquiries (
                    id INTEGER NOT NULL,
                    inquiry_no VARCHAR NOT NULL,
                    student_name VARCHAR NOT NULL,
                    grade_applying VARCHAR NOT NULL,
                    academic_year VARCHAR NOT NULL,
                    guardian_name VARCHAR NOT NULL,
                    guardian_phone VARCHAR NOT NULL,
                    guardian_email VARCHAR,
                    source VARCHAR,
                    stage VARCHAR,
                    follow_up_date DATE,
                    assigned_to VARCHAR,
                    converted_student_id INTEGER,
                    notes TEXT,
                    created_at DATETIME,
                    updated_at DATETIME,
                    PRIMARY KEY (id),
                    UNIQUE (inquiry_no),
                    FOREIGN KEY(converted_student_id) REFERENCES students (id) ON DELETE SET NULL
                )
                """
            )
        )
        admission_columns = {
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info(admission_inquiries)")
        }
        if admission_columns and "converted_student_id" not in admission_columns:
            connection.execute(
                text("ALTER TABLE admission_inquiries ADD COLUMN converted_student_id INTEGER")
            )
        for column_name in [
            "id",
            "inquiry_no",
            "student_name",
            "grade_applying",
            "academic_year",
            "guardian_phone",
            "source",
            "stage",
            "follow_up_date",
            "converted_student_id",
        ]:
            connection.execute(
                text(
                    f"CREATE INDEX IF NOT EXISTS ix_admission_inquiries_{column_name} "
                    f"ON admission_inquiries ({column_name})"
                )
            )

        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS admission_follow_ups (
                    id INTEGER NOT NULL,
                    inquiry_id INTEGER NOT NULL,
                    activity_date DATE NOT NULL,
                    activity_type VARCHAR,
                    notes TEXT NOT NULL,
                    next_action VARCHAR,
                    next_follow_up_date DATE,
                    owner VARCHAR,
                    outcome VARCHAR,
                    created_at DATETIME,
                    PRIMARY KEY (id),
                    FOREIGN KEY(inquiry_id) REFERENCES admission_inquiries (id) ON DELETE CASCADE
                )
                """
            )
        )
        for column_name in [
            "id",
            "inquiry_id",
            "activity_date",
            "activity_type",
            "next_follow_up_date",
            "outcome",
        ]:
            connection.execute(
                text(
                    f"CREATE INDEX IF NOT EXISTS ix_admission_follow_ups_{column_name} "
                    f"ON admission_follow_ups ({column_name})"
                )
            )

        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS international_documents (
                    id INTEGER NOT NULL,
                    student_id INTEGER NOT NULL,
                    document_type VARCHAR NOT NULL,
                    document_no VARCHAR,
                    issue_date DATE,
                    expiry_date DATE,
                    issuing_country VARCHAR,
                    status VARCHAR,
                    file_url VARCHAR,
                    verified_by VARCHAR,
                    verified_date DATE,
                    remarks TEXT,
                    created_at DATETIME,
                    updated_at DATETIME,
                    PRIMARY KEY (id),
                    FOREIGN KEY(student_id) REFERENCES students (id) ON DELETE CASCADE
                )
                """
            )
        )
        for column_name in [
            "id",
            "student_id",
            "document_type",
            "document_no",
            "expiry_date",
            "issuing_country",
            "status",
        ]:
            connection.execute(
                text(
                    f"CREATE INDEX IF NOT EXISTS ix_international_documents_{column_name} "
                    f"ON international_documents ({column_name})"
                )
            )

        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS multi_curriculum_plans (
                    id INTEGER NOT NULL,
                    program_name VARCHAR NOT NULL,
                    curriculum_track VARCHAR NOT NULL,
                    grade_level VARCHAR NOT NULL,
                    academic_year VARCHAR NOT NULL,
                    class_id INTEGER,
                    subject_groups TEXT,
                    assessment_model VARCHAR,
                    coordinator VARCHAR,
                    status VARCHAR,
                    remarks TEXT,
                    created_at DATETIME,
                    updated_at DATETIME,
                    PRIMARY KEY (id),
                    FOREIGN KEY(class_id) REFERENCES classes (id) ON DELETE SET NULL
                )
                """
            )
        )
        for column_name in [
            "id",
            "program_name",
            "curriculum_track",
            "grade_level",
            "academic_year",
            "class_id",
            "status",
        ]:
            connection.execute(
                text(
                    f"CREATE INDEX IF NOT EXISTS ix_multi_curriculum_plans_{column_name} "
                    f"ON multi_curriculum_plans ({column_name})"
                )
            )

        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS admission_assessments (
                    id INTEGER NOT NULL,
                    inquiry_id INTEGER NOT NULL,
                    assessment_type VARCHAR NOT NULL,
                    scheduled_date DATE NOT NULL,
                    scheduled_time VARCHAR,
                    mode VARCHAR,
                    panel_members TEXT,
                    location VARCHAR,
                    status VARCHAR,
                    score FLOAT,
                    outcome VARCHAR,
                    next_follow_up_date DATE,
                    remarks TEXT,
                    created_at DATETIME,
                    updated_at DATETIME,
                    PRIMARY KEY (id),
                    FOREIGN KEY(inquiry_id) REFERENCES admission_inquiries (id) ON DELETE CASCADE
                )
                """
            )
        )
        for column_name in [
            "id",
            "inquiry_id",
            "assessment_type",
            "scheduled_date",
            "mode",
            "status",
            "outcome",
            "next_follow_up_date",
        ]:
            connection.execute(
                text(
                    f"CREATE INDEX IF NOT EXISTS ix_admission_assessments_{column_name} "
                    f"ON admission_assessments ({column_name})"
                )
            )

        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS communication_templates (
                    id INTEGER NOT NULL,
                    template_name VARCHAR NOT NULL,
                    channel VARCHAR,
                    category VARCHAR NOT NULL,
                    audience VARCHAR,
                    subject VARCHAR,
                    body TEXT NOT NULL,
                    variables VARCHAR,
                    language VARCHAR,
                    status VARCHAR,
                    remarks TEXT,
                    created_at DATETIME,
                    updated_at DATETIME,
                    PRIMARY KEY (id),
                    UNIQUE (template_name)
                )
                """
            )
        )
        for column_name in [
            "id",
            "template_name",
            "channel",
            "category",
            "audience",
            "language",
            "status",
        ]:
            connection.execute(
                text(
                    f"CREATE INDEX IF NOT EXISTS ix_communication_templates_{column_name} "
                    f"ON communication_templates ({column_name})"
                )
            )

        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS communication_logs (
                    id INTEGER NOT NULL,
                    template_id INTEGER,
                    channel VARCHAR,
                    category VARCHAR NOT NULL,
                    recipient_name VARCHAR NOT NULL,
                    recipient_phone VARCHAR,
                    recipient_email VARCHAR,
                    message_body TEXT NOT NULL,
                    related_module VARCHAR,
                    related_record_id INTEGER,
                    status VARCHAR,
                    sent_at DATETIME,
                    error_message TEXT,
                    created_at DATETIME,
                    updated_at DATETIME,
                    PRIMARY KEY (id),
                    FOREIGN KEY(template_id) REFERENCES communication_templates (id) ON DELETE SET NULL
                )
                """
            )
        )
        for column_name in [
            "id",
            "template_id",
            "channel",
            "category",
            "recipient_name",
            "recipient_phone",
            "related_module",
            "status",
        ]:
            connection.execute(
                text(
                    f"CREATE INDEX IF NOT EXISTS ix_communication_logs_{column_name} "
                    f"ON communication_logs ({column_name})"
                )
            )

        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS student_service_tickets (
                    id INTEGER NOT NULL,
                    ticket_no VARCHAR NOT NULL,
                    student_id INTEGER,
                    requester_name VARCHAR NOT NULL,
                    requester_role VARCHAR,
                    contact_phone VARCHAR,
                    contact_email VARCHAR,
                    category VARCHAR NOT NULL,
                    priority VARCHAR,
                    subject VARCHAR NOT NULL,
                    description TEXT NOT NULL,
                    assigned_to VARCHAR,
                    due_date DATE,
                    status VARCHAR,
                    resolution TEXT,
                    closed_date DATE,
                    remarks TEXT,
                    created_at DATETIME,
                    updated_at DATETIME,
                    PRIMARY KEY (id),
                    UNIQUE (ticket_no),
                    FOREIGN KEY(student_id) REFERENCES students (id) ON DELETE SET NULL
                )
                """
            )
        )
        for column_name in [
            "id",
            "ticket_no",
            "student_id",
            "requester_name",
            "requester_role",
            "contact_phone",
            "category",
            "priority",
            "subject",
            "assigned_to",
            "due_date",
            "status",
        ]:
            connection.execute(
                text(
                    f"CREATE INDEX IF NOT EXISTS ix_student_service_tickets_{column_name} "
                    f"ON student_service_tickets ({column_name})"
                )
            )

        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS alumni_withdrawal_records (
                    id INTEGER NOT NULL,
                    record_no VARCHAR NOT NULL,
                    student_id INTEGER,
                    student_name VARCHAR NOT NULL,
                    admission_no VARCHAR,
                    last_class VARCHAR,
                    record_type VARCHAR,
                    request_date DATE,
                    leaving_date DATE,
                    reason VARCHAR NOT NULL,
                    destination_school VARCHAR,
                    destination_country VARCHAR,
                    certificate_status VARCHAR,
                    alumni_email VARCHAR,
                    alumni_phone VARCHAR,
                    current_status VARCHAR,
                    approved_by VARCHAR,
                    approval_date DATE,
                    remarks TEXT,
                    created_at DATETIME,
                    updated_at DATETIME,
                    PRIMARY KEY (id),
                    UNIQUE (record_no),
                    FOREIGN KEY(student_id) REFERENCES students (id) ON DELETE SET NULL
                )
                """
            )
        )
        for column_name in [
            "id",
            "record_no",
            "student_id",
            "student_name",
            "admission_no",
            "last_class",
            "record_type",
            "request_date",
            "leaving_date",
            "reason",
            "destination_country",
            "certificate_status",
            "alumni_phone",
            "current_status",
        ]:
            connection.execute(
                text(
                    f"CREATE INDEX IF NOT EXISTS ix_alumni_withdrawal_records_{column_name} "
                    f"ON alumni_withdrawal_records ({column_name})"
                )
            )

        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS counseling_cases (
                    id INTEGER NOT NULL,
                    case_no VARCHAR NOT NULL,
                    student_id INTEGER NOT NULL,
                    concern_type VARCHAR NOT NULL,
                    risk_level VARCHAR,
                    reported_by VARCHAR,
                    counselor VARCHAR,
                    session_date DATE,
                    next_follow_up_date DATE,
                    guardian_contacted BOOLEAN,
                    action_plan TEXT,
                    confidentiality_level VARCHAR,
                    status VARCHAR,
                    outcome TEXT,
                    remarks TEXT,
                    created_at DATETIME,
                    updated_at DATETIME,
                    PRIMARY KEY (id),
                    UNIQUE (case_no),
                    FOREIGN KEY(student_id) REFERENCES students (id) ON DELETE CASCADE
                )
                """
            )
        )
        for column_name in [
            "id",
            "case_no",
            "student_id",
            "concern_type",
            "risk_level",
            "reported_by",
            "counselor",
            "session_date",
            "next_follow_up_date",
            "guardian_contacted",
            "confidentiality_level",
            "status",
        ]:
            connection.execute(
                text(
                    f"CREATE INDEX IF NOT EXISTS ix_counseling_cases_{column_name} "
                    f"ON counseling_cases ({column_name})"
                )
            )

        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS enrichment_activities (
                    id INTEGER NOT NULL,
                    activity_code VARCHAR NOT NULL,
                    activity_name VARCHAR NOT NULL,
                    activity_type VARCHAR NOT NULL,
                    category VARCHAR,
                    coordinator VARCHAR,
                    start_date DATE,
                    end_date DATE,
                    venue VARCHAR,
                    eligible_classes VARCHAR,
                    capacity INTEGER,
                    enrolled_count INTEGER,
                    fee_amount FLOAT,
                    status VARCHAR,
                    description TEXT,
                    remarks TEXT,
                    created_at DATETIME,
                    updated_at DATETIME,
                    PRIMARY KEY (id),
                    UNIQUE (activity_code)
                )
                """
            )
        )
        for column_name in [
            "id",
            "activity_code",
            "activity_name",
            "activity_type",
            "category",
            "coordinator",
            "start_date",
            "end_date",
            "status",
        ]:
            connection.execute(
                text(
                    f"CREATE INDEX IF NOT EXISTS ix_enrichment_activities_{column_name} "
                    f"ON enrichment_activities ({column_name})"
                )
            )

        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS compliance_tasks (
                    id INTEGER NOT NULL,
                    task_code VARCHAR NOT NULL,
                    accreditation_body VARCHAR NOT NULL,
                    standard_area VARCHAR NOT NULL,
                    requirement TEXT NOT NULL,
                    evidence_link VARCHAR,
                    owner VARCHAR,
                    due_date DATE,
                    review_date DATE,
                    risk_level VARCHAR,
                    status VARCHAR,
                    finding TEXT,
                    action_plan TEXT,
                    completed_date DATE,
                    remarks TEXT,
                    created_at DATETIME,
                    updated_at DATETIME,
                    PRIMARY KEY (id),
                    UNIQUE (task_code)
                )
                """
            )
        )
        for column_name in [
            "id",
            "task_code",
            "accreditation_body",
            "standard_area",
            "owner",
            "due_date",
            "review_date",
            "risk_level",
            "status",
        ]:
            connection.execute(
                text(
                    f"CREATE INDEX IF NOT EXISTS ix_compliance_tasks_{column_name} "
                    f"ON compliance_tasks ({column_name})"
                )
            )


ensure_dev_schema()
seed_all()

app = FastAPI(
    title="School ERP API",
    description="Backend API for School ERP App",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(academic_years.router)
app.include_router(portal.router)
app.include_router(chatbot.router)
app.include_router(platform.router)
app.include_router(students.router)
app.include_router(teachers.router)
app.include_router(classes.router)
app.include_router(attendance.router)
app.include_router(fees.router)
app.include_router(exams.router)
app.include_router(marks.router)
app.include_router(users.router)
app.include_router(settings.router)
app.include_router(dashboard.router)
app.include_router(master_data.router)
app.include_router(student_custom_fields.router)
app.include_router(module_layouts.router)
app.include_router(module_custom_fields.router)
app.include_router(subjects.router)
app.include_router(student_enrollments.router)
app.include_router(accounts.router)
app.include_router(hostel.router)
app.include_router(transport.router)
app.include_router(health_infirmary.router)
app.include_router(mess.router)
app.include_router(library.router)
app.include_router(inventory.router)
app.include_router(admissions.router)
app.include_router(international_documents.router)
app.include_router(multi_curriculum.router)
app.include_router(admission_assessments.router)
app.include_router(communications.router)
app.include_router(student_services.router)
app.include_router(alumni_withdrawals.router)
app.include_router(counseling.router)
app.include_router(enrichment.router)
app.include_router(compliance.router)
app.include_router(exam_components.router)


@app.get("/")
def home():
    return {
        "message": "School ERP API is running"
    }
