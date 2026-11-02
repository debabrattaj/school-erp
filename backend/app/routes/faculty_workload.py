"""Department-facing faculty workload from active course/batch mappings."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import ClassSubject, SchoolClass, SubjectMaster, Teacher, User
from app.security import require_roles
from app.tenant import require_feature

router = APIRouter(prefix="/faculty-workload", tags=["Faculty Workload"], dependencies=[Depends(require_feature("faculty_workload"))])

@router.get("/")
def faculty_workload(academic_year: str | None = None, db: Session = Depends(get_db), current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher"]))):
    query = (
        db.query(ClassSubject, Teacher, SubjectMaster, SchoolClass)
        .outerjoin(Teacher, ClassSubject.teacher_id == Teacher.id)
        .outerjoin(SubjectMaster, ClassSubject.subject_id == SubjectMaster.id)
        .outerjoin(SchoolClass, ClassSubject.class_id == SchoolClass.id)
        .filter(ClassSubject.is_active == True)
    )
    if academic_year:
        query = query.filter(ClassSubject.academic_year == academic_year)
    staff = {}
    for mapping, teacher, subject, school_class in query.all():
        teacher_id = teacher.id if teacher else None
        name = teacher.name if teacher else "Unassigned faculty"
        department = (teacher.department if teacher else None) or (subject.department if subject else None) or "Unassigned"
        theory_hours = (subject.theory_hours if subject and subject.theory_hours is not None else mapping.weekly_periods or 0)
        practical_hours = mapping.practical_hours if mapping.practical_hours is not None else (subject.practical_hours if subject and subject.practical_hours is not None else 0)
        credits = mapping.credits if mapping.credits is not None else (subject.credits if subject else None)
        key = str(teacher_id or f"unassigned-{department}")
        row = staff.setdefault(key, {"teacher_id": teacher_id, "teacher_name": name, "department": department, "theory_hours": 0, "practical_hours": 0, "weekly_hours": 0, "credits": 0, "course_count": 0, "courses": []})
        row["theory_hours"] += theory_hours; row["practical_hours"] += practical_hours; row["weekly_hours"] += theory_hours + practical_hours; row["credits"] += credits or 0; row["course_count"] += 1
        row["courses"].append({"course_code": subject.subject_code if subject else None, "course_name": mapping.subject_name, "batch": f"{school_class.class_name} {school_class.section}" if school_class else "-", "theory_hours": theory_hours, "practical_hours": practical_hours, "credits": credits})
    return {"academic_year": academic_year, "faculty": sorted(staff.values(), key=lambda row: (-row["weekly_hours"], row["teacher_name"]))}
