from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.listing import apply_listing
from app.models import Assignment, Teacher, User
from app.schemas import AssignmentCreate, AssignmentResponse, AssignmentUpdate
from app.security import require_roles

router = APIRouter(prefix="/homework", tags=["Homework"])

MANAGERS = ["Admin", "Principal", "Teacher"]


def _apply_teacher_snapshot(db: Session, assignment: Assignment) -> None:
    if assignment.teacher_id:
        teacher = db.query(Teacher).filter(Teacher.id == assignment.teacher_id).first()
        assignment.teacher_name_snapshot = teacher.name if teacher else None
    else:
        assignment.teacher_name_snapshot = None


@router.get("/", response_model=list[AssignmentResponse])
def list_assignments(
    class_name: str | None = None,
    section: str | None = None,
    academic_year: str | None = None,
    search: str | None = None,
    sort: str | None = None,
    order: str = "asc",
    limit: int | None = None,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    query = db.query(Assignment)
    if class_name:
        query = query.filter(Assignment.class_name == class_name)
    if section:
        query = query.filter(Assignment.section == section)
    if academic_year:
        query = query.filter(Assignment.academic_year == academic_year)
    return apply_listing(
        query, Assignment,
        search=search, search_fields=("title", "academic_year", "class_name", "section"),
        sort=sort, order=order, limit=limit, offset=offset,
        default_order=[Assignment.due_date.desc().nullslast(), Assignment.id.desc()],
    ).all()


@router.post("/", response_model=AssignmentResponse)
def create_assignment(
    payload: AssignmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="Title is required")

    assignment = Assignment(**payload.model_dump())
    _apply_teacher_snapshot(db, assignment)

    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return assignment


def _get_assignment_or_404(db: Session, assignment_id: int) -> Assignment:
    assignment = db.query(Assignment).filter(Assignment.id == assignment_id).first()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return assignment


@router.put("/{assignment_id}", response_model=AssignmentResponse)
def update_assignment(
    assignment_id: int,
    payload: AssignmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    assignment = _get_assignment_or_404(db, assignment_id)
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(assignment, key, value)
    if "teacher_id" in update_data:
        _apply_teacher_snapshot(db, assignment)

    db.commit()
    db.refresh(assignment)
    return assignment


@router.delete("/{assignment_id}")
def delete_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    assignment = _get_assignment_or_404(db, assignment_id)
    db.delete(assignment)
    db.commit()
    return {"message": "Assignment deleted successfully"}
