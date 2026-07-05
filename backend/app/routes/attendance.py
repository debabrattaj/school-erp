from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Attendance, SchoolSettings, Student, User
from app.schemas import AttendanceCreate, AttendanceUpdate, AttendanceResponse
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


@router.post("/", response_model=AttendanceResponse)
def mark_attendance(
    attendance: AttendanceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Teacher"])
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
        require_roles(["Admin", "Teacher"])
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


