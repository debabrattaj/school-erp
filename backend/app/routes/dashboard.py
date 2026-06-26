from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import Student, Teacher, SchoolClass, Fee, Attendance, Exam, Mark, User
from app.security import require_roles

router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"]
)


@router.get("/summary")
def dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Accounts", "Teacher"])
    )
):
    today = date.today()
    next_30_days = today + timedelta(days=30)

    total_students = db.query(Student).count()

    active_students = db.query(Student).filter(
        Student.student_status == "Active"
    ).count()

    international_students = db.query(Student).filter(
        Student.nationality.isnot(None),
        Student.nationality != "",
        func.lower(Student.nationality) != "indian",
        func.lower(Student.nationality) != "india"
    ).count()

    transport_users = db.query(Student).filter(
        Student.transport_route.isnot(None),
        Student.transport_route != ""
    ).count()

    total_teachers = db.query(Teacher).count()
    total_classes = db.query(SchoolClass).count()

    total_collection = db.query(func.sum(Fee.paid_amount)).scalar() or 0
    total_due = db.query(func.sum(Fee.due_amount)).scalar() or 0

    total_fee_amount = db.query(func.sum(Fee.total_amount)).scalar() or 0
    collection_percentage = 0

    if total_fee_amount:
        collection_percentage = round(
            (total_collection / total_fee_amount) * 100,
            2
        )

    today_attendance_total = db.query(Attendance).filter(
        Attendance.attendance_date == today
    ).count()

    today_present = db.query(Attendance).filter(
        Attendance.attendance_date == today,
        Attendance.status == "Present"
    ).count()

    today_absent = db.query(Attendance).filter(
        Attendance.attendance_date == today,
        Attendance.status == "Absent"
    ).count()

    today_late = db.query(Attendance).filter(
        Attendance.attendance_date == today,
        Attendance.status == "Late"
    ).count()

    today_excused = db.query(Attendance).filter(
        Attendance.attendance_date == today,
        Attendance.status == "Excused"
    ).count()

    attendance_percentage = 0

    if today_attendance_total:
        attendance_percentage = round(
            (today_present / today_attendance_total) * 100,
            2
        )

    upcoming_exams = db.query(Exam).filter(
        Exam.exam_date >= today,
        Exam.exam_date <= next_30_days
    ).order_by(Exam.exam_date.asc()).limit(10).all()

    recent_admissions = db.query(Student).order_by(
        Student.id.desc()
    ).limit(10).all()

    fee_defaulters = db.query(Fee).filter(
        Fee.due_amount > 0
    ).order_by(Fee.due_amount.desc()).limit(10).all()

    top_marks = db.query(Mark).order_by(
        Mark.marks_obtained.desc()
    ).limit(10).all()

    return {
        "total_students": total_students,
        "active_students": active_students,
        "international_students": international_students,
        "transport_users": transport_users,

        "total_teachers": total_teachers,
        "total_classes": total_classes,

        "total_collection": total_collection,
        "total_due": total_due,
        "collection_percentage": collection_percentage,

        "attendance_percentage": attendance_percentage,
        "today_present": today_present,
        "today_absent": today_absent,
        "today_late": today_late,
        "today_excused": today_excused,

        "upcoming_exams": [
            {
                "id": exam.id,
                "exam_name": exam.exam_name,
                "class_name": exam.class_name,
                "section": exam.section,
                "exam_date": exam.exam_date,
                "academic_year": exam.academic_year
            }
            for exam in upcoming_exams
        ],

        "recent_admissions": [
            {
                "id": student.id,
                "admission_no": student.admission_no,
                "student_name": f"{student.first_name} {student.last_name or ''}".strip(),
                "class_name": student.class_name,
                "section": student.section,
                "house": student.house,
                "admission_date": student.admission_date
            }
            for student in recent_admissions
        ],

        "fee_defaulters": [
            {
                "id": fee.id,
                "student_id": fee.student_id,
                "fee_type": fee.fee_type,
                "due_amount": fee.due_amount,
                "payment_status": fee.payment_status
            }
            for fee in fee_defaulters
        ],

        "top_performers": [
            {
                "id": mark.id,
                "student_id": mark.student_id,
                "exam_id": mark.exam_id,
                "subject": mark.subject,
                "marks_obtained": mark.marks_obtained,
                "total_marks": mark.total_marks,
                "grade": mark.grade
            }
            for mark in top_marks
        ]
    }