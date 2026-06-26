from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import User, MasterData
from app.security import hash_password


def seed_default_users():
    db: Session = SessionLocal()

    try:
        default_users = [
            {
                "name": "Admin User",
                "email": "admin@school.com",
                "password": "admin123",
                "role": "Admin",
            },
            {
                "name": "Principal User",
                "email": "principal@school.com",
                "password": "principal123",
                "role": "Principal",
            },
            {
                "name": "Accounts User",
                "email": "accounts@school.com",
                "password": "accounts123",
                "role": "Accounts",
            },
            {
                "name": "Teacher User",
                "email": "teacher@school.com",
                "password": "teacher123",
                "role": "Teacher",
            },
        ]

        for item in default_users:
            existing_user = db.query(User).filter(
                User.email == item["email"]
            ).first()

            if not existing_user:
                user = User(
                    name=item["name"],
                    email=item["email"],
                    password_hash=hash_password(item["password"]),
                    role=item["role"],
                )

                db.add(user)

        db.commit()

    finally:
        db.close()


def seed_master_data():
    db: Session = SessionLocal()

    try:
        default_master_data = {
            "Department": [
                "Primary",
                "Middle School",
                "Senior School",
                "Science",
                "Mathematics",
                "Languages",
                "Humanities",
                "Commerce",
                "Sports",
                "Arts",
            ],
            "Subject": [
                "English",
                "Mathematics",
                "Science",
                "Social Science",
                "Hindi",
                "Computer Science",
                "Physics",
                "Chemistry",
                "Biology",
                "Accountancy",
                "Economics",
                "Business Studies",
                "Physical Education",
                "Art",
                "Music",
                "Other",
            ],
            "House": [
                "Red",
                "Blue",
                "Green",
                "Yellow",
            ],
            "Section": [
                "A",
                "B",
                "C",
            ],
            "FeeType": [
                "Admission Fee",
                "Tuition Fee",
                "Transport Fee",
                "Exam Fee",
                "Library Fee",
                "Hostel Fee",
                "Annual Fee",
                "Activity Fee",
                "Technology Fee",
                "Other",
            ],
            "AttendanceStatus": [
                "Present",
                "Absent",
                "Late",
                "Half Day",
                "Excused",
            ],
            "ExamType": [
                "Unit Test",
                "Mid Term Exam",
                "Final Term Exam",
                "Assessment",
                "Practical Exam",
                "Internal Assessment",
                "Board Exam",
                "Other",
            ],
            "EmploymentType": [
                "Full Time",
                "Part Time",
                "Visiting",
                "Contract",
            ],
            "Gender": [
                "Male",
                "Female",
                "Other",
            ],
            "BloodGroup": [
                "A+",
                "A-",
                "B+",
                "B-",
                "O+",
                "O-",
                "AB+",
                "AB-",
            ],
            "Nationality": [
                "Indian",
                "American",
                "British",
                "Canadian",
                "Australian",
                "Nepalese",
                "Bangladeshi",
                "Sri Lankan",
                "Other",
            ],
            "TransportRoute": [
                "Route 1",
                "Route 2",
                "Route 3",
                "Route 4",
            ],
            "SalaryGrade": [
                "Trainee",
                "Junior Faculty",
                "Faculty",
                "Senior Faculty",
                "HOD",
                "Coordinator",
            ],
            "StudentStatus": [
                "Active",
                "Graduated",
                "Transferred",
                "Suspended",
                "Alumni",
            ],
            "AcademicYear": [
                "2025-26",
                "2026-27",
                "2027-28",
            ],
        }

        for category, values in default_master_data.items():
            for index, value in enumerate(values, start=1):
                existing = db.query(MasterData).filter(
                    MasterData.category == category,
                    MasterData.value == value,
                ).first()

                if not existing:
                    item = MasterData(
                        category=category,
                        value=value,
                        is_active=True,
                        sort_order=index,
                    )

                    db.add(item)

        db.commit()

    finally:
        db.close()


def seed_all():
    seed_default_users()
    seed_master_data()