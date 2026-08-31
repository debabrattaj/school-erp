from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Attendance, SchoolSettings, Student, User
from app.schemas import (
    AttendanceBulkCreate,
    AttendanceCreate,
    AttendanceRosterEntry,
    AttendanceUpdate,
    AttendanceResponse,
)
from app.security import require_roles

router = APIRouter(
    prefix="/attendance",
    tags=["Attendance & Discipline"]
)


VALID_ATTENDANCE_STATUS = [
    "Present",
    "Absent",
    "Late",
    "Half Day",
    "Excused"
]


def get_default_academic_year(db: Session):
    settings = db.query(SchoolSettings).first()
    return settings.academic_year if settings else None


def get_student_snapshot(student: Student):
    return {
        "class_id": student.class_id,
        "class_name_snapshot": student.class_name,
        "section_snapshot": student.section,
    }


# Principal is granted attendance:manage in SYSTEM_ROLE_PERMISSIONS -- the map
# the roles UI shows and the one that authorizes custom roles -- but the write
# routes below listed only Admin and Teacher, so a Principal could read
# attendance and never record any, on either client. Delete stays Admin-only.
@router.post("/", response_model=AttendanceResponse)
def mark_attendance(
    attendance: AttendanceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Teacher"])
    )
):
    student = db.query(Student).filter(
        Student.id == attendance.student_id
    ).first()

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found"
        )

    if attendance.status not in VALID_ATTENDANCE_STATUS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Allowed: {', '.join(VALID_ATTENDANCE_STATUS)}"
        )

    existing_attendance = db.query(Attendance).filter(
        Attendance.student_id == attendance.student_id,
        Attendance.attendance_date == attendance.attendance_date
    ).first()

    if existing_attendance:
        raise HTTPException(
            status_code=400,
            detail="Attendance already marked for this student on this date"
        )

    new_attendance = Attendance(
        student_id=attendance.student_id,
        attendance_date=attendance.attendance_date,
        academic_year=attendance.academic_year or get_default_academic_year(db),
        class_id=attendance.class_id or student.class_id,
        class_name_snapshot=attendance.class_name_snapshot or student.class_name,
        section_snapshot=attendance.section_snapshot or student.section,
        status=attendance.status,
        remarks=attendance.remarks
    )

    db.add(new_attendance)
    db.commit()
    db.refresh(new_attendance)

    return new_attendance


@router.get("/", response_model=list[AttendanceResponse])
def get_attendance(
    academic_year: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Teacher"])
    )
):
    query = db.query(Attendance)

    if academic_year:
        query = query.filter(Attendance.academic_year == academic_year)

    records = query.order_by(
        Attendance.attendance_date.desc(),
        Attendance.id.desc()
    ).all()

    return records


@router.get("/student/{student_id}", response_model=list[AttendanceResponse])
def get_student_attendance(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Teacher"])
    )
):
    student = db.query(Student).filter(
        Student.id == student_id
    ).first()

    if not student:
        raise HTTPException(
            status_code=404,
            detail="Student not found"
        )

    records = db.query(Attendance).filter(
        Attendance.student_id == student_id
    ).order_by(
        Attendance.attendance_date.desc(),
        Attendance.id.desc()
    ).all()

    return records


@router.get("/metadata/statuses")
def get_attendance_statuses(
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Teacher"])
    )
):
    return {
        "statuses": VALID_ATTENDANCE_STATUS
    }


@router.get("/roster", response_model=list[AttendanceRosterEntry])
def get_class_roster(
    class_id: int,
    attendance_date: date,
    section: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Teacher"])
    )
):
    """A class's student list for one day, each row carrying whatever
    attendance is already marked -- what the class-wide marking grid loads
    to prefill itself."""
    query = db.query(Student).filter(
        Student.class_id == class_id,
        Student.student_status == "Active",
    )

    if section:
        query = query.filter(Student.section == section)

    students = query.order_by(
        Student.roll_no.asc(),
        Student.first_name.asc(),
    ).all()

    student_ids = [student.id for student in students]

    existing_by_student = {}
    if student_ids:
        existing_records = db.query(Attendance).filter(
            Attendance.student_id.in_(student_ids),
            Attendance.attendance_date == attendance_date,
        ).all()
        existing_by_student = {
            record.student_id: record for record in existing_records
        }

    roster = []
    for student in students:
        record = existing_by_student.get(student.id)
        student_name = (
            f"{student.first_name or ''} {student.last_name or ''}".strip()
            or student.admission_no
        )

        roster.append(
            AttendanceRosterEntry(
                student_id=student.id,
                student_name=student_name,
                roll_no=student.roll_no,
                attendance_id=record.id if record else None,
                status=record.status if record else None,
                remarks=record.remarks if record else None,
                source=record.source if record else None,
            )
        )

    return roster


@router.post("/bulk", response_model=list[AttendanceResponse])
def bulk_mark_attendance(
    payload: AttendanceBulkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Teacher"])
    )
):
    """Mark or correct a whole class's attendance for one day in a single
    call. Unlike the single-record POST, re-submitting an already-marked
    student here updates it instead of 400ing -- a teacher re-opening the
    day's roster to fix a mistake is the expected use, not an error."""
    if not payload.entries:
        raise HTTPException(
            status_code=400,
            detail="At least one student entry is required"
        )

    for entry in payload.entries:
        if entry.status not in VALID_ATTENDANCE_STATUS:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Invalid status '{entry.status}' for student {entry.student_id}. "
                    f"Allowed: {', '.join(VALID_ATTENDANCE_STATUS)}"
                )
            )

    student_ids = [entry.student_id for entry in payload.entries]
    students = db.query(Student).filter(Student.id.in_(student_ids)).all()
    student_by_id = {student.id: student for student in students}

    missing_ids = [sid for sid in student_ids if sid not in student_by_id]
    if missing_ids:
        raise HTTPException(
            status_code=404,
            detail=f"Student not found: {missing_ids[0]}"
        )

    existing_records = db.query(Attendance).filter(
        Attendance.student_id.in_(student_ids),
        Attendance.attendance_date == payload.attendance_date,
    ).all()
    existing_by_student = {
        record.student_id: record for record in existing_records
    }

    academic_year = payload.academic_year or get_default_academic_year(db)
    saved_records = []

    for entry in payload.entries:
        student = student_by_id[entry.student_id]
        record = existing_by_student.get(entry.student_id)

        if record:
            record.status = entry.status
            record.remarks = entry.remarks
            # Same claim-on-edit rule as the single-record update: a human
            # touching this row now owns it.
            if record.source != "Manual":
                record.source = "Manual"
        else:
            record = Attendance(
                student_id=entry.student_id,
                attendance_date=payload.attendance_date,
                academic_year=academic_year,
                class_id=payload.class_id or student.class_id,
                class_name_snapshot=student.class_name,
                section_snapshot=student.section,
                status=entry.status,
                remarks=entry.remarks,
            )
            db.add(record)

        saved_records.append(record)

    db.commit()

    for record in saved_records:
        db.refresh(record)

    return saved_records


@router.get("/{attendance_id}", response_model=AttendanceResponse)
def get_attendance_by_id(
    attendance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Teacher"])
    )
):
    record = db.query(Attendance).filter(
        Attendance.id == attendance_id
    ).first()

    if not record:
        raise HTTPException(
            status_code=404,
            detail="Attendance record not found"
        )

    return record


@router.put("/{attendance_id}", response_model=AttendanceResponse)
def update_attendance(
    attendance_id: int,
    attendance_data: AttendanceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Teacher"])
    )
):
    record = db.query(Attendance).filter(
        Attendance.id == attendance_id
    ).first()

    if not record:
        raise HTTPException(
            status_code=404,
            detail="Attendance record not found"
        )

    update_data = attendance_data.model_dump(
        exclude_unset=True
    )

    if "status" in update_data and update_data["status"]:
        if update_data["status"] not in VALID_ATTENDANCE_STATUS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid status. Allowed: {', '.join(VALID_ATTENDANCE_STATUS)}"
            )

    # A human editing a derived row claims it. Without this the next
    # derivation would treat it as its own and quietly overwrite the
    # correction -- which is precisely what a teacher fixing a bad punch is
    # trying to prevent.
    if record.source != "Manual" and update_data:
        record.source = "Manual"

    if "student_id" in update_data:
        raise HTTPException(
            status_code=400,
            detail="Student cannot be changed for an existing attendance record"
        )

    student = db.query(Student).filter(Student.id == record.student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    update_data["academic_year"] = (
        update_data.get("academic_year")
        or record.academic_year
        or get_default_academic_year(db)
    )
    update_data["class_id"] = update_data.get("class_id") or record.class_id or student.class_id
    update_data["class_name_snapshot"] = (
        update_data.get("class_name_snapshot")
        or record.class_name_snapshot
        or student.class_name
    )
    update_data["section_snapshot"] = (
        update_data.get("section_snapshot")
        or record.section_snapshot
        or student.section
    )

    for key, value in update_data.items():
        setattr(record, key, value)

    db.commit()
    db.refresh(record)

    return record


@router.delete("/{attendance_id}")
def delete_attendance(
    attendance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin"])
    )
):
    record = db.query(Attendance).filter(
        Attendance.id == attendance_id
    ).first()

    if not record:
        raise HTTPException(
            status_code=404,
            detail="Attendance record not found"
        )

    db.delete(record)
    db.commit()

    return {
        "message": "Attendance record deleted successfully"
    }


