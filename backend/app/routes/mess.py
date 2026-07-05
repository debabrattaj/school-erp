from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import MessAttendance, MessMenu, Student, User
from app.schemas import (
    MessAttendanceCreate,
    MessAttendanceResponse,
    MessMenuCreate,
    MessMenuResponse,
)
from app.security import require_roles

router = APIRouter(prefix="/mess", tags=["Mess Management"])


def get_or_404(db: Session, model, record_id: int, label: str):
    record = db.query(model).filter(model.id == record_id).first()

    if not record:
        raise HTTPException(status_code=404, detail=f"{label} not found")

    return record


def get_student_name(student: Student):
    name = (
        getattr(student, "student_name", None)
        or f"{student.first_name or ''} {student.last_name or ''}".strip()
    )
    return name or f"Student ID: {student.id}"


def serialize_attendance(record: MessAttendance, db: Session):
    student = db.query(Student).filter(Student.id == record.student_id).first()

    return {
        "id": record.id,
        "student_id": record.student_id,
        "meal_date": record.meal_date,
        "meal_type": record.meal_type,
        "status": record.status,
        "remarks": record.remarks,
        "student_name": get_student_name(student) if student else "-",
        "admission_no": student.admission_no if student else None,
        "class_name": student.class_name if student else None,
        "section": student.section if student else None,
    }


def save_with_duplicate_handling(db: Session, duplicate_message: str):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=duplicate_message)


@router.get("/menus/", response_model=list[MessMenuResponse])
def get_menus(
    menu_date: str | None = None,
    meal_type: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts", "Teacher"])),
):
    query = db.query(MessMenu)

    if menu_date:
        query = query.filter(MessMenu.menu_date == menu_date)

    if meal_type:
        query = query.filter(MessMenu.meal_type == meal_type)

    return query.order_by(MessMenu.menu_date.desc(), MessMenu.meal_type.asc()).all()


@router.post("/menus/", response_model=MessMenuResponse)
def create_menu(
    payload: MessMenuCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts"])),
):
    if not payload.menu_items.strip():
        raise HTTPException(status_code=400, detail="Menu items are required")

    menu = MessMenu(**payload.model_dump())
    db.add(menu)
    save_with_duplicate_handling(db, "Menu already exists for this date and meal")
    db.refresh(menu)
    return menu


@router.put("/menus/{menu_id}", response_model=MessMenuResponse)
def update_menu(
    menu_id: int,
    payload: MessMenuCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts"])),
):
    menu = get_or_404(db, MessMenu, menu_id, "Mess menu")

    if not payload.menu_items.strip():
        raise HTTPException(status_code=400, detail="Menu items are required")

    for key, value in payload.model_dump().items():
        setattr(menu, key, value)

    save_with_duplicate_handling(db, "Menu already exists for this date and meal")
    db.refresh(menu)
    return menu


@router.delete("/menus/{menu_id}")
def delete_menu(
    menu_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    menu = get_or_404(db, MessMenu, menu_id, "Mess menu")
    db.delete(menu)
    db.commit()
    return {"message": "Mess menu deleted successfully"}


@router.get("/attendance/", response_model=list[MessAttendanceResponse])
def get_attendance(
    meal_date: str | None = None,
    meal_type: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts", "Teacher"])),
):
    query = db.query(MessAttendance)

    if meal_date:
        query = query.filter(MessAttendance.meal_date == meal_date)

    if meal_type:
        query = query.filter(MessAttendance.meal_type == meal_type)

    if status:
        query = query.filter(MessAttendance.status == status)

    records = query.order_by(MessAttendance.meal_date.desc(), MessAttendance.id.desc()).all()
    return [serialize_attendance(record, db) for record in records]


@router.post("/attendance/", response_model=MessAttendanceResponse)
def create_attendance(
    payload: MessAttendanceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts", "Teacher"])),
):
    get_or_404(db, Student, payload.student_id, "Student")

    record = MessAttendance(**payload.model_dump())
    db.add(record)
    save_with_duplicate_handling(db, "Attendance already exists for this student and meal")
    db.refresh(record)
    return serialize_attendance(record, db)


@router.put("/attendance/{attendance_id}", response_model=MessAttendanceResponse)
def update_attendance(
    attendance_id: int,
    payload: MessAttendanceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Accounts", "Teacher"])),
):
    record = get_or_404(db, MessAttendance, attendance_id, "Mess attendance")
    get_or_404(db, Student, payload.student_id, "Student")

    for key, value in payload.model_dump().items():
        setattr(record, key, value)

    save_with_duplicate_handling(db, "Attendance already exists for this student and meal")
    db.refresh(record)
    return serialize_attendance(record, db)


@router.delete("/attendance/{attendance_id}")
def delete_attendance(
    attendance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin"])),
):
    record = get_or_404(db, MessAttendance, attendance_id, "Mess attendance")
    db.delete(record)
    db.commit()
    return {"message": "Mess attendance deleted successfully"}
