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

        mark_columns = {
            row[1]
            for row in connection.exec_driver_sql("PRAGMA table_info(marks)")
        }

        if mark_columns and "academic_year" not in mark_columns:
            connection.exec_driver_sql(
                "ALTER TABLE marks ADD COLUMN academic_year VARCHAR"
            )

        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS class_exam_mappings (
                    id INTEGER NOT NULL,
                    class_id INTEGER NOT NULL,
                    exam_id INTEGER NOT NULL,
                    academic_year VARCHAR NOT NULL,
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


@app.get("/")
def home():
    return {
        "message": "School ERP API is running"
    }
