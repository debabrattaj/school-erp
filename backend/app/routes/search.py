from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.security import require_roles
from app.models import Exam, SchoolClass, Student, Teacher, User

router = APIRouter(prefix="/search", tags=["Search"])

SEARCH_ROLES = ["Admin", "Principal", "Teacher", "Accounts"]
RESULTS_PER_MODULE = 6


@router.get("")
def global_search(
    q: str = Query(""),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(SEARCH_ROLES)),
):
    query = q.strip()
    if len(query) < 2:
        return {"results": []}

    like = f"%{query}%"
    results = []

    students = (
        db.query(Student)
        .filter(
            or_(
                Student.first_name.ilike(like),
                Student.last_name.ilike(like),
                Student.admission_no.ilike(like),
            )
        )
        .limit(RESULTS_PER_MODULE)
        .all()
    )
    for s in students:
        name = f"{s.first_name or ''} {s.last_name or ''}".strip() or "Unnamed Student"
        results.append(
            {
                "group": "Students",
                "id": s.id,
                "label": name,
                "subtitle": s.admission_no or "",
                "path": f"/students/{s.id}",
            }
        )

    teachers = (
        db.query(Teacher)
        .filter(or_(Teacher.name.ilike(like), Teacher.employee_no.ilike(like)))
        .limit(RESULTS_PER_MODULE)
        .all()
    )
    for t in teachers:
        results.append(
            {
                "group": "Teachers",
                "id": t.id,
                "label": t.name or "Unnamed Teacher",
                "subtitle": t.employee_no or t.department or "",
                "path": "/teachers",
            }
        )

    classes = (
        db.query(SchoolClass)
        .filter(or_(SchoolClass.class_name.ilike(like), SchoolClass.section.ilike(like)))
        .limit(RESULTS_PER_MODULE)
        .all()
    )
    for c in classes:
        label = f"{c.class_name} - {c.section}" if c.section else c.class_name
        results.append(
            {
                "group": "Classes",
                "id": c.id,
                "label": label,
                "subtitle": c.class_teacher or "",
                "path": f"/classes/{c.id}",
            }
        )

    exams = (
        db.query(Exam)
        .filter(Exam.exam_name.ilike(like))
        .limit(RESULTS_PER_MODULE)
        .all()
    )
    for e in exams:
        results.append(
            {
                "group": "Exams",
                "id": e.id,
                "label": e.exam_name,
                "subtitle": e.academic_year or "",
                "path": "/exams",
            }
        )

    return {"results": results}
