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


@router.post("/student-enrollments/year-end")
def process_year_end(
    payload: schemas.YearEndRequest,
    db: Session = Depends(get_db),
):
    """Process end-of-year outcomes per student:
    - promote: close current enrollment, create new enrollment in to_class for to_year
    - detain: close current enrollment as Detained, re-enroll in the SAME class for to_year
    - graduate: close current enrollment, mark student Graduated (no new enrollment)
    Optionally carries forward unpaid fee balances into the new year.
    """
    validate_academic_year(db, payload.from_academic_year)

    needs_target_year = any(a.action in ("promote", "detain") for a in payload.actions)
    if needs_target_year:
        if not payload.to_academic_year:
            raise HTTPException(
                status_code=400,
                detail="to_academic_year is required when promoting or detaining",
            )
        if payload.to_academic_year == payload.from_academic_year:
            raise HTTPException(
                status_code=400,
                detail="Target academic year must differ from source year",
            )
        validate_academic_year(db, payload.to_academic_year)

    results = {"promoted": [], "detained": [], "graduated": [], "skipped": []}
    fees_carried = 0
    seen_students = set()

    for action_item in payload.actions:
        if action_item.student_id in seen_students:
            results["skipped"].append(
                {
                    "student_id": action_item.student_id,
                    "reason": "Duplicate student in request; only first action applied",
                }
            )
            continue
        seen_students.add(action_item.student_id)

        action = (action_item.action or "").strip().lower()
        if action not in ("promote", "detain", "graduate"):
            results["skipped"].append(
                {"student_id": action_item.student_id, "reason": f"Unknown action '{action_item.action}'"}
            )
            continue

        student = (
            db.query(models.Student)
            .filter(models.Student.id == action_item.student_id)
            .first()
        )
        if not student:
            results["skipped"].append(
                {"student_id": action_item.student_id, "reason": "Student not found"}
            )
            continue

        source_enrollment = (
            db.query(models.StudentEnrollment)
            .filter(
                models.StudentEnrollment.student_id == student.id,
                models.StudentEnrollment.academic_year == payload.from_academic_year,
                models.StudentEnrollment.enrollment_status == "Active",
            )
            .first()
        )
        if not source_enrollment:
            results["skipped"].append(
                {
                    "student_id": student.id,
                    "reason": f"No active enrollment in {payload.from_academic_year}",
                }
            )
            continue

        if action == "graduate":
            source_enrollment.enrollment_status = "Completed"
            source_enrollment.promotion_status = "Graduated"
            source_enrollment.end_date = payload.start_date
            source_enrollment.updated_at = datetime.utcnow()

            student.student_status = "Graduated"

            results["graduated"].append(student.id)
            continue

        # promote or detain both create a new-year enrollment
        if action == "promote":
            if not action_item.to_class_id:
                results["skipped"].append(
                    {"student_id": student.id, "reason": "to_class_id required for promote"}
                )
                continue
            target_class = (
                db.query(models.SchoolClass)
                .filter(models.SchoolClass.id == action_item.to_class_id)
                .first()
            )
            if not target_class:
                results["skipped"].append(
                    {"student_id": student.id, "reason": "Target class not found"}
                )
                continue
            source_status = "Promoted"
        else:  # detain -> same class again
            target_class = (
                db.query(models.SchoolClass)
                .filter(models.SchoolClass.id == source_enrollment.class_id)
                .first()
            )
            if not target_class:
                results["skipped"].append(
                    {"student_id": student.id, "reason": "Current class not found for detention"}
                )
                continue
            source_status = "Detained"

        duplicate = (
            db.query(models.StudentEnrollment)
            .filter(
                models.StudentEnrollment.student_id == student.id,
                models.StudentEnrollment.class_id == target_class.id,
                models.StudentEnrollment.academic_year == payload.to_academic_year,
            )
            .first()
        )
        if duplicate:
            results["skipped"].append(
                {
                    "student_id": student.id,
                    "reason": f"Already enrolled in {payload.to_academic_year}",
                }
            )
            continue

        source_enrollment.enrollment_status = "Completed"
        source_enrollment.promotion_status = source_status
        source_enrollment.end_date = payload.start_date
        source_enrollment.updated_at = datetime.utcnow()

        new_enrollment = models.StudentEnrollment(
            student_id=student.id,
            class_id=target_class.id,
            academic_year=payload.to_academic_year,
            roll_no=student.roll_no,
            enrollment_status="Active",
            promotion_status="Not Promoted",
            start_date=payload.start_date,
            remarks=payload.remarks
            or ("Detained - repeating class" if action == "detain" else "Created by year-end promotion"),
        )
        apply_class_snapshot(new_enrollment, target_class)
        db.add(new_enrollment)

        student.class_id = target_class.id
        student.class_name = target_class.class_name
        student.section = target_class.section
        student.student_status = "Active"

        if payload.carry_forward_fees:
            unpaid = (
                db.query(models.Fee)
                .filter(
                    models.Fee.student_id == student.id,
                    models.Fee.academic_year == payload.from_academic_year,
                    models.Fee.payment_status.in_(["Unpaid", "Partial"]),
                )
                .all()
            )
            total_due = sum((fee.due_amount or 0) for fee in unpaid)
            if total_due > 0:
                carry_fee = models.Fee(
                    student_id=student.id,
                    fee_type="Other",
                    academic_year=payload.to_academic_year,
                    class_id=target_class.id,
                    class_name_snapshot=target_class.class_name,
                    section_snapshot=target_class.section,
                    total_amount=total_due,
                    paid_amount=0,
                    due_amount=total_due,
                    payment_status="Unpaid",
                    remarks=f"Balance carried forward from {payload.from_academic_year}",
                )
                db.add(carry_fee)
                fees_carried += 1

        results["promoted" if action == "promote" else "detained"].append(student.id)

    db.commit()

    return {
        "message": "Year-end processing completed",
        "from_academic_year": payload.from_academic_year,
        "to_academic_year": payload.to_academic_year,
        "promoted_count": len(results["promoted"]),
        "detained_count": len(results["detained"]),
        "graduated_count": len(results["graduated"]),
        "skipped_count": len(results["skipped"]),
        "fees_carried_forward": fees_carried,
        "details": results,
    }


def _year_variants(academic_year: str) -> list[str]:
    """Tolerate both '2026-27' and '2026-2027' formats found in existing data."""
    variants = {academic_year}
    parts = academic_year.split("-")
    if len(parts) == 2:
        start, end = parts[0], parts[1]
        if len(start) == 4 and len(end) == 2:
            variants.add(f"{start}-{start[:2]}{end}")  # 2026-27 -> 2026-2027
        if len(start) == 4 and len(end) == 4:
            variants.add(f"{start}-{end[2:]}")         # 2026-2027 -> 2026-27
    return list(variants)


def _suggest_next_class(db: Session, current_class: models.SchoolClass):
    """If the class name is numeric, suggest the next number up
    (same section preferred). Returns (class, is_final_class)."""
    try:
        next_number = str(int(str(current_class.class_name).strip()) + 1)
    except (TypeError, ValueError):
        return None, False

    candidates = (
        db.query(models.SchoolClass)
        .filter(models.SchoolClass.class_name == next_number)
        .all()
    )
    if not candidates:
        return None, True  # numeric class with no higher class -> final class

    same_section = next(
        (c for c in candidates if c.section == current_class.section), None
    )
    return same_section or candidates[0], False


@router.get("/student-enrollments/year-end/suggestions")
def year_end_suggestions(
    academic_year: str,
    db: Session = Depends(get_db),
):
    """Suggest promote/detain/graduate per active student based on marks
    vs the school's pass percentage. Suggestions only - staff decide."""
    validate_academic_year(db, academic_year)

    settings = db.query(models.SchoolSettings).first()
    pass_percentage = (
        settings.pass_percentage
        if settings and settings.pass_percentage is not None
        else 40.0
    )

    year_matches = _year_variants(academic_year)

    enrollments = (
        db.query(models.StudentEnrollment)
        .filter(
            models.StudentEnrollment.academic_year == academic_year,
            models.StudentEnrollment.enrollment_status == "Active",
        )
        .all()
    )

    suggestions = []
    for enrollment in enrollments:
        marks = (
            db.query(models.Mark)
            .filter(
                models.Mark.student_id == enrollment.student_id,
                models.Mark.academic_year.in_(year_matches),
            )
            .all()
        )

        total_obtained = sum((m.marks_obtained or 0) for m in marks)
        total_max = sum((m.max_marks or m.total_marks or 100) for m in marks)
        percentage = (
            round((total_obtained / total_max) * 100, 1) if total_max else None
        )

        current_class = None
        if enrollment.class_id:
            current_class = (
                db.query(models.SchoolClass)
                .filter(models.SchoolClass.id == enrollment.class_id)
                .first()
            )

        suggested_class, is_final = (None, False)
        if current_class:
            suggested_class, is_final = _suggest_next_class(db, current_class)

        if percentage is None:
            suggestion, reason = None, "No marks recorded for this year"
        elif percentage < pass_percentage:
            suggestion = "detain"
            reason = f"{percentage}% is below pass mark of {pass_percentage}%"
        elif is_final:
            suggestion = "graduate"
            reason = f"Passed with {percentage}% in the final class"
        else:
            suggestion = "promote"
            reason = f"Passed with {percentage}%"

        suggestions.append(
            {
                "student_id": enrollment.student_id,
                "enrollment_id": enrollment.id,
                "percentage": percentage,
                "marks_count": len(marks),
                "suggestion": suggestion,
                "reason": reason,
                "suggested_to_class_id": suggested_class.id
                if (suggestion == "promote" and suggested_class)
                else None,
            }
        )

    return {
        "academic_year": academic_year,
        "pass_percentage": pass_percentage,
        "suggestions": suggestions,
    }
