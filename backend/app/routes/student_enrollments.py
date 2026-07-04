from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas

router = APIRouter(tags=["Student Enrollments"])


def get_student_name(student):
    first_name = getattr(student, "first_name", "") or ""
    last_name = getattr(student, "last_name", "") or ""
    student_name = getattr(student, "student_name", "") or ""

    full_name = student_name or f"{first_name} {last_name}".strip()

    return full_name or f"Student ID: {student.id}"


def get_class_display(class_record):
    if not class_record:
        return "-"

    class_name = class_record.class_name or "-"
    section = class_record.section or "-"

    return f"{class_name} - Section {section}"


def serialize_enrollment(enrollment, db: Session):
    student = (
        db.query(models.Student)
        .filter(models.Student.id == enrollment.student_id)
        .first()
    )

    class_record = None

    if enrollment.class_id:
        class_record = (
            db.query(models.SchoolClass)
            .filter(models.SchoolClass.id == enrollment.class_id)
            .first()
        )

    student_name = get_student_name(student) if student else "-"
    admission_no = getattr(student, "admission_no", None) if student else None

    class_display = (
        f"{enrollment.class_name_snapshot or '-'} - Section {enrollment.section_snapshot or '-'}"
    )

    return {
        "id": enrollment.id,
        "student_id": enrollment.student_id,
        "class_id": enrollment.class_id,
        "academic_year": enrollment.academic_year,
        "class_name_snapshot": enrollment.class_name_snapshot,
        "section_snapshot": enrollment.section_snapshot,
        "roll_no": enrollment.roll_no,
        "enrollment_status": enrollment.enrollment_status,
        "promotion_status": enrollment.promotion_status,
        "start_date": enrollment.start_date,
        "end_date": enrollment.end_date,
        "remarks": enrollment.remarks,
        "created_at": enrollment.created_at,
        "updated_at": enrollment.updated_at,
        "student_name": student_name,
        "admission_no": admission_no,
        "class_display": class_display,
    }


def validate_student(db: Session, student_id: int):
    student = db.query(models.Student).filter(models.Student.id == student_id).first()

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    return student


def validate_class(db: Session, class_id: int):
    class_record = (
        db.query(models.SchoolClass)
        .filter(models.SchoolClass.id == class_id)
        .first()
    )

    if not class_record:
        raise HTTPException(status_code=404, detail="Class not found")

    return class_record


def validate_academic_year(db: Session, academic_year: str):
    has_academic_year_master = (
        db.query(models.MasterData)
        .filter(models.MasterData.category == "AcademicYear")
        .first()
    )

    if not has_academic_year_master:
        return True

    exists = (
        db.query(models.MasterData)
        .filter(
            models.MasterData.category == "AcademicYear",
            models.MasterData.value == academic_year,
            models.MasterData.is_active == True,
        )
        .first()
    )

    if not exists:
        raise HTTPException(
            status_code=400,
            detail="Academic year is not available in Master Data",
        )

    return True


def apply_class_snapshot(enrollment, class_record):
    enrollment.class_name_snapshot = class_record.class_name
    enrollment.section_snapshot = class_record.section


@router.get(
    "/student-enrollments/",
    response_model=list[schemas.StudentEnrollmentResponse],
)
def get_student_enrollments(
    student_id: Optional[int] = None,
    class_id: Optional[int] = None,
    academic_year: Optional[str] = None,
    enrollment_status: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.StudentEnrollment)

    if student_id:
        query = query.filter(models.StudentEnrollment.student_id == student_id)

    if class_id:
        query = query.filter(models.StudentEnrollment.class_id == class_id)

    if academic_year:
        query = query.filter(models.StudentEnrollment.academic_year == academic_year)

    if enrollment_status:
        query = query.filter(
            models.StudentEnrollment.enrollment_status == enrollment_status
        )

    enrollments = query.order_by(models.StudentEnrollment.id.desc()).all()

    return [serialize_enrollment(enrollment, db) for enrollment in enrollments]


@router.post(
    "/student-enrollments/",
    response_model=schemas.StudentEnrollmentResponse,
)
def create_student_enrollment(
    payload: schemas.StudentEnrollmentCreate,
    db: Session = Depends(get_db),
):
    student = validate_student(db, payload.student_id)
    class_record = validate_class(db, payload.class_id)
    validate_academic_year(db, payload.academic_year)

    existing = (
        db.query(models.StudentEnrollment)
        .filter(
            models.StudentEnrollment.student_id == payload.student_id,
            models.StudentEnrollment.class_id == payload.class_id,
            models.StudentEnrollment.academic_year == payload.academic_year,
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Enrollment already exists for this student, class and academic year",
        )

    enrollment = models.StudentEnrollment(
        student_id=payload.student_id,
        class_id=payload.class_id,
        academic_year=payload.academic_year,
        roll_no=payload.roll_no,
        enrollment_status=payload.enrollment_status or "Active",
        promotion_status="Not Promoted",
        start_date=payload.start_date,
        end_date=payload.end_date,
        remarks=payload.remarks,
    )

    apply_class_snapshot(enrollment, class_record)

    db.add(enrollment)

    # Also keep current student profile updated
    student.class_id = class_record.id
    student.class_name = class_record.class_name
    student.section = class_record.section

    if payload.roll_no:
        student.roll_no = payload.roll_no

    db.commit()
    db.refresh(enrollment)

    return serialize_enrollment(enrollment, db)


@router.put(
    "/student-enrollments/{enrollment_id}",
    response_model=schemas.StudentEnrollmentResponse,
)
def update_student_enrollment(
    enrollment_id: int,
    payload: schemas.StudentEnrollmentUpdate,
    db: Session = Depends(get_db),
):
    enrollment = (
        db.query(models.StudentEnrollment)
        .filter(models.StudentEnrollment.id == enrollment_id)
        .first()
    )

    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    student = validate_student(db, payload.student_id)
    class_record = validate_class(db, payload.class_id)
    validate_academic_year(db, payload.academic_year)

    enrollment.student_id = payload.student_id
    enrollment.class_id = payload.class_id
    enrollment.academic_year = payload.academic_year
    enrollment.roll_no = payload.roll_no
    enrollment.enrollment_status = payload.enrollment_status or "Active"
    enrollment.promotion_status = payload.promotion_status or "Not Promoted"
    enrollment.start_date = payload.start_date
    enrollment.end_date = payload.end_date
    enrollment.remarks = payload.remarks
    enrollment.updated_at = datetime.utcnow()

    apply_class_snapshot(enrollment, class_record)

    # Update current student profile only if enrollment is active
    if enrollment.enrollment_status == "Active":
        student.class_id = class_record.id
        student.class_name = class_record.class_name
        student.section = class_record.section

        if payload.roll_no:
            student.roll_no = payload.roll_no

    db.commit()
    db.refresh(enrollment)

    return serialize_enrollment(enrollment, db)


@router.delete("/student-enrollments/{enrollment_id}")
def delete_student_enrollment(
    enrollment_id: int,
    db: Session = Depends(get_db),
):
    enrollment = (
        db.query(models.StudentEnrollment)
        .filter(models.StudentEnrollment.id == enrollment_id)
        .first()
    )

    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    db.delete(enrollment)
    db.commit()

    return {"message": "Enrollment deleted successfully"}


@router.post("/student-enrollments/sync-current")
def sync_current_student_enrollments(
    academic_year: str,
    db: Session = Depends(get_db),
):
    validate_academic_year(db, academic_year)

    students = db.query(models.Student).all()

    created_count = 0
    skipped_count = 0

    for student in students:
        if not student.class_id:
            skipped_count += 1
            continue

        class_record = validate_class(db, student.class_id)

        existing = (
            db.query(models.StudentEnrollment)
            .filter(
                models.StudentEnrollment.student_id == student.id,
                models.StudentEnrollment.class_id == student.class_id,
                models.StudentEnrollment.academic_year == academic_year,
            )
            .first()
        )

        if existing:
            skipped_count += 1
            continue

        enrollment = models.StudentEnrollment(
            student_id=student.id,
            class_id=student.class_id,
            academic_year=academic_year,
            roll_no=student.roll_no,
            enrollment_status="Active",
            promotion_status="Not Promoted",
            remarks="Created from current student profile",
        )

        apply_class_snapshot(enrollment, class_record)

        db.add(enrollment)
        created_count += 1

    db.commit()

    return {
        "message": "Current student enrollments synced successfully",
        "created": created_count,
        "skipped": skipped_count,
    }


@router.post("/student-enrollments/promote")
def promote_students(
    payload: schemas.StudentPromotionRequest,
    db: Session = Depends(get_db),
):
    validate_academic_year(db, payload.from_academic_year)
    validate_academic_year(db, payload.to_academic_year)

    from_class = validate_class(db, payload.from_class_id)
    to_class = validate_class(db, payload.to_class_id)

    promoted = []
    skipped = []

    for student_id in payload.student_ids:
        student = validate_student(db, student_id)

        existing_target = (
            db.query(models.StudentEnrollment)
            .filter(
                models.StudentEnrollment.student_id == student_id,
                models.StudentEnrollment.class_id == payload.to_class_id,
                models.StudentEnrollment.academic_year == payload.to_academic_year,
            )
            .first()
        )

        if existing_target:
            skipped.append(student_id)
            continue

        source_enrollment = (
            db.query(models.StudentEnrollment)
            .filter(
                models.StudentEnrollment.student_id == student_id,
                models.StudentEnrollment.class_id == payload.from_class_id,
                models.StudentEnrollment.academic_year == payload.from_academic_year,
            )
            .first()
        )

        if source_enrollment:
            source_enrollment.promotion_status = "Promoted"
            source_enrollment.enrollment_status = "Completed"
            source_enrollment.end_date = payload.start_date
            source_enrollment.updated_at = datetime.utcnow()

        new_enrollment = models.StudentEnrollment(
            student_id=student_id,
            class_id=payload.to_class_id,
            academic_year=payload.to_academic_year,
            roll_no=student.roll_no,
            enrollment_status="Active",
            promotion_status="Not Promoted",
            start_date=payload.start_date,
            remarks=payload.remarks or "Created by promotion",
        )

        apply_class_snapshot(new_enrollment, to_class)

        db.add(new_enrollment)

        student.class_id = to_class.id
        student.class_name = to_class.class_name
        student.section = to_class.section
        student.student_status = "Active"

        promoted.append(student_id)

    db.commit()

    return {
        "message": "Promotion completed",
        "from_class": get_class_display(from_class),
        "to_class": get_class_display(to_class),
        "from_academic_year": payload.from_academic_year,
        "to_academic_year": payload.to_academic_year,
        "promoted_count": len(promoted),
        "skipped_count": len(skipped),
        "promoted_students": promoted,
        "skipped_students": skipped,
    }
