from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.database import get_db
from app.listing import apply_listing
from app.models import Assignment, AssignmentSubmission, Student, Teacher, User
from app.schemas import (
    AssignmentCreate,
    AssignmentResponse,
    AssignmentSubmissionBoard,
    AssignmentSubmissionGrade,
    AssignmentSubmissionResponse,
    AssignmentUpdate,
)
from app.security import require_roles

router = APIRouter(prefix="/homework", tags=["Homework"])

MANAGERS = ["Admin", "Principal", "Teacher"]


def _submission_counts(db: Session, assignment_ids: list[int]) -> dict[int, dict]:
    """Handed-in and graded totals per assignment, in one query -- the pair of
    numbers a teacher scans the homework list for."""
    if not assignment_ids:
        return {}
    rows = (
        db.query(
            AssignmentSubmission.assignment_id,
            func.count(AssignmentSubmission.id),
            func.sum(case((AssignmentSubmission.status == "Graded", 1), else_=0)),
        )
        .filter(AssignmentSubmission.assignment_id.in_(assignment_ids))
        .group_by(AssignmentSubmission.assignment_id)
        .all()
    )
    return {
        assignment_id: {"submission_count": total or 0, "graded_count": int(graded or 0)}
        for assignment_id, total, graded in rows
    }


def _with_counts(assignment: Assignment, counts: dict) -> AssignmentResponse:
    payload = AssignmentResponse.model_validate(assignment)
    payload.submission_count = counts.get("submission_count", 0)
    payload.graded_count = counts.get("graded_count", 0)
    return payload


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
    assignments = apply_listing(
        query, Assignment,
        search=search, search_fields=("title", "academic_year", "class_name", "section"),
        sort=sort, order=order, limit=limit, offset=offset,
        default_order=[Assignment.due_date.desc().nullslast(), Assignment.id.desc()],
    ).all()

    counts = _submission_counts(db, [a.id for a in assignments])
    return [_with_counts(a, counts.get(a.id, {})) for a in assignments]


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


# ---------------------------------------------------------------------------
# Submissions
#
# Students hand work in through the portal (routes/portal.py); this is the
# teacher's side of the same drop-box -- who has handed in, who has not, and
# the grade and feedback that go back to the family.
# ---------------------------------------------------------------------------


def _student_name(student: Student) -> str:
    return f"{student.first_name} {student.last_name or ''}".strip()


def _submission_response(
    submission: AssignmentSubmission, student: Student | None = None
) -> AssignmentSubmissionResponse:
    payload = AssignmentSubmissionResponse.model_validate(submission)
    if student is not None:
        payload.admission_no = student.admission_no
        # The snapshot is written at submit time; a student renamed since then
        # should still be listed under the name the register uses today.
        payload.student_name_snapshot = _student_name(student)
    return payload


@router.get("/{assignment_id}/submissions", response_model=AssignmentSubmissionBoard)
def list_submissions(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    assignment = _get_assignment_or_404(db, assignment_id)

    # Blank section on the assignment means the whole class, so it is not a
    # filter then -- the same rule the portal uses to decide who sees it.
    roster_query = db.query(Student).filter(
        Student.class_name == assignment.class_name,
        (Student.student_status == "Active") | (Student.student_status.is_(None)),
    )
    if assignment.section:
        roster_query = roster_query.filter(Student.section == assignment.section)
    roster = roster_query.order_by(Student.roll_no, Student.id).all()
    by_id = {student.id: student for student in roster}

    submissions = (
        db.query(AssignmentSubmission)
        .filter(AssignmentSubmission.assignment_id == assignment_id)
        .order_by(AssignmentSubmission.submitted_at.desc(), AssignmentSubmission.id.desc())
        .all()
    )
    submitted_ids = {s.student_id for s in submissions}

    pending = [
        {
            "student_id": student.id,
            "student_name": _student_name(student),
            "admission_no": student.admission_no,
            "roll_no": student.roll_no,
            "section": student.section,
        }
        for student in roster
        if student.id not in submitted_ids
    ]

    return AssignmentSubmissionBoard(
        assignment=_with_counts(assignment, {
            "submission_count": len(submissions),
            "graded_count": sum(1 for s in submissions if s.status == "Graded"),
        }),
        submissions=[_submission_response(s, by_id.get(s.student_id)) for s in submissions],
        pending_students=pending,
        total_students=len(roster),
        submitted_count=len(submissions),
        graded_count=sum(1 for s in submissions if s.status == "Graded"),
        late_count=sum(1 for s in submissions if s.is_late),
    )


@router.put(
    "/{assignment_id}/submissions/{submission_id}/grade",
    response_model=AssignmentSubmissionResponse,
)
def grade_submission(
    assignment_id: int,
    submission_id: int,
    payload: AssignmentSubmissionGrade,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    assignment = _get_assignment_or_404(db, assignment_id)
    submission = (
        db.query(AssignmentSubmission)
        .filter(
            AssignmentSubmission.id == submission_id,
            AssignmentSubmission.assignment_id == assignment_id,
        )
        .first()
    )
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")

    if payload.marks_awarded is not None:
        if payload.marks_awarded < 0:
            raise HTTPException(status_code=400, detail="Marks cannot be negative.")
        if assignment.max_marks is not None and payload.marks_awarded > assignment.max_marks:
            raise HTTPException(
                status_code=400,
                detail=f"Marks cannot exceed the assignment total ({assignment.max_marks}).",
            )
        submission.marks_awarded = payload.marks_awarded

    if payload.feedback is not None:
        submission.feedback = payload.feedback

    # Feedback with no score is still a graded piece of work -- plenty of
    # homework is returned with comments and no mark.
    submission.status = "Graded"
    submission.graded_by = current_user.name
    submission.graded_at = datetime.utcnow()

    db.commit()
    db.refresh(submission)
    student = db.query(Student).filter(Student.id == submission.student_id).first()
    return _submission_response(submission, student)
