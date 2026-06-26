from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import master_data
from app.routes import student_custom_fields
from app.routes import module_layouts
from app.database import Base, engine
from app.seed import seed_all
from app.routes import module_custom_fields
from app.routes import subjects
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


@app.get("/")
def home():
    return {
        "message": "School ERP API is running"
    }