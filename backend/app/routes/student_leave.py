"""Staff review of guardian-submitted student leave requests.

Deliberately separate from leave.py (staff HR leave): a student absence has
no quota, balance, or substitute cover to raise -- approving one only
marks Attendance "Excused" for each working day in range. Submission is
guardian-facing (POST /portal/students/{id}/leave-requests); this module is
the staff-facing review queue and the only place a request's status
actually changes.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import leave as leave_logic
from app import models, schemas
from app.database import get_db
from app.models import User
from app.security import require_roles

router = APIRouter(prefix="/student-leave-requests", tags=["Student Leave Requests"])

STAFF = ["Admin", "Principal", "Teacher"]


def _with_student(db: Session, row: models.StudentLeaveRequest) -> dict:
    """The request plus who it is for.

    One batched lookup per list, rather than leaving every client to fetch the
    whole student table to resolve student_id into a name.
    """
    student = db.query(models.Student).filter(
        models.Student.id == row.student_id
    ).first()
    name = None
    if student:
        name = f"{student.first_name or ''} {student.last_name or ''}".strip() or student.admission_no

    return {
        "id": row.id,
        "student_id": row.student_id,
        "student_name": name,
        "admission_no": student.admission_no if student else None,
        "class_name": student.class_name if student else None,
        "section": student.section if student else None,
        "from_date": row.from_date,
        "to_date": row.to_date,
        "reason": row.reason,
        "status": row.status,
        "requested_by": row.requested_by,
        "decided_by": row.decided_by,
        "decided_at": row.decided_at,
        "decision_note": row.decision_note,
    }


def _get_request_or_404(db: Session, request_id: int) -> models.StudentLeaveRequest:
    request = (
        db.query(models.StudentLeaveRequest)
        .filter(models.StudentLeaveRequest.id == request_id)
        .first()
    )
    if not request:
        raise HTTPException(status_code=404, detail="Leave request not found")
    return request


@router.get("/", response_model=list[schemas.StudentLeaveRequestResponse])
def list_requests(
    student_id: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(STAFF)),
):
    query = db.query(models.StudentLeaveRequest)
    if student_id:
        query = query.filter(models.StudentLeaveRequest.student_id == student_id)
    if status:
        query = query.filter(models.StudentLeaveRequest.status == status)

    rows = query.order_by(models.StudentLeaveRequest.id.desc()).all()
    return [_with_student(db, row) for row in rows]


@router.post("/{request_id}/approve", response_model=schemas.StudentLeaveRequestResponse)
def approve_request(
    request_id: int,
    payload: schemas.StudentLeaveDecision,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(STAFF)),
):
    """Marks Attendance Excused for every working day in range -- creating
    the row if the day hasn't been marked yet, overwriting it (and claiming
    it as Manual) if it has, since an approved leave takes precedence over
    whatever was recorded before the request was reviewed."""
    request = _get_request_or_404(db, request_id)
    if request.status != "Requested":
        raise HTTPException(
            status_code=400,
            detail=f"This request is already {request.status}.",
        )

    student = (
        db.query(models.Student)
        .filter(models.Student.id == request.student_id)
        .first()
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    work_dates = leave_logic.working_dates(db, request.from_date, request.to_date)
    existing_by_date = {
        record.attendance_date: record
        for record in db.query(models.Attendance).filter(
            models.Attendance.student_id == student.id,
            models.Attendance.attendance_date.in_(work_dates),
        ).all()
    }
    remark = f"Approved leave: {request.reason}" if request.reason else "Approved leave"

    for work_date in work_dates:
        record = existing_by_date.get(work_date)
        if record:
            record.status = "Excused"
            record.remarks = remark
            if record.source != "Manual":
                record.source = "Manual"
        else:
            db.add(
                models.Attendance(
                    student_id=student.id,
                    attendance_date=work_date,
                    class_id=student.class_id,
                    class_name_snapshot=student.class_name,
                    section_snapshot=student.section,
                    status="Excused",
                    remarks=remark,
                )
            )

    request.status = "Approved"
    request.decided_by = current_user.email
    request.decided_at = datetime.utcnow()
    request.decision_note = payload.note
    db.commit()
    db.refresh(request)
    return request


@router.post("/{request_id}/reject", response_model=schemas.StudentLeaveRequestResponse)
def reject_request(
    request_id: int,
    payload: schemas.StudentLeaveDecision,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(STAFF)),
):
    request = _get_request_or_404(db, request_id)
    if request.status != "Requested":
        raise HTTPException(
            status_code=400,
            detail=f"This request is already {request.status}.",
        )

    request.status = "Rejected"
    request.decided_by = current_user.email
    request.decided_at = datetime.utcnow()
    request.decision_note = payload.note
    db.commit()
    db.refresh(request)
    return request
