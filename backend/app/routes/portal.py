from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas
from app.models import User
from app.security import require_roles

router = APIRouter(
    prefix="/portal",
    tags=["Parent/Student Portal"],
)

PORTAL_ROLES = ["Parent", "Student", "Admin", "Principal"]
ADMIN_ROLES = ["Admin", "Principal"]


def get_linked_student_ids(db: Session, user: User) -> list[int]:
    links = (
        db.query(models.ParentStudentLink)
        .filter(models.ParentStudentLink.user_id == user.id)
        .all()
    )
    return [link.student_id for link in links]


def ensure_student_access(db: Session, user: User, student_id: int) -> models.Student:
    """Hard server-side check: Parent/Student users can only access students
    they are explicitly linked to. Admin/Principal can access any student."""
    student = (
        db.query(models.Student)
        .filter(models.Student.id == student_id)
        .first()
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    if user.role in ADMIN_ROLES:
        return student

    link = (
        db.query(models.ParentStudentLink)
        .filter(
            models.ParentStudentLink.user_id == user.id,
            models.ParentStudentLink.student_id == student_id,
        )
        .first()
    )
    if not link:
        raise HTTPException(
            status_code=403,
            detail="You do not have access to this student",
        )
    return student


def serialize_student_card(student: models.Student):
    return {
        "id": student.id,
        "admission_no": student.admission_no,
        "first_name": student.first_name,
        "last_name": student.last_name,
        "full_name": " ".join(filter(None, [student.first_name, student.last_name])),
        "class_name": student.class_name,
        "section": student.section,
        "roll_no": student.roll_no,
        "photo_url": student.photo_url,
        "student_status": student.student_status,
        "house": student.house,
    }


# ---------------- Portal data endpoints ----------------


@router.get("/children")
def list_my_children(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(PORTAL_ROLES)),
):
    student_ids = get_linked_student_ids(db, current_user)
    if not student_ids:
        return []

    students = (
        db.query(models.Student)
        .filter(models.Student.id.in_(student_ids))
        .all()
    )
    return [serialize_student_card(student) for student in students]


@router.get("/students/{student_id}/summary")
def portal_student_summary(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(PORTAL_ROLES)),
):
    student = ensure_student_access(db, current_user, student_id)

    current_year = (
        db.query(models.AcademicYear)
        .filter(models.AcademicYear.is_current == True)  # noqa: E712
        .first()
    )

    current_enrollment = None
    enrollment = None
    if current_year:
        enrollment = (
            db.query(models.StudentEnrollment)
            .filter(
                models.StudentEnrollment.student_id == student_id,
                models.StudentEnrollment.enrollment_status == "Active",
                models.StudentEnrollment.academic_year == current_year.name,
            )
            .first()
        )
    if not enrollment:
        enrollment = (
            db.query(models.StudentEnrollment)
            .filter(
                models.StudentEnrollment.student_id == student_id,
                models.StudentEnrollment.enrollment_status == "Active",
            )
            .order_by(models.StudentEnrollment.academic_year.desc())
            .first()
        )
    if enrollment:
        current_enrollment = {
            "academic_year": enrollment.academic_year,
            "class_name": enrollment.class_name_snapshot,
            "section": enrollment.section_snapshot,
            "roll_no": enrollment.roll_no,
        }

    return {
        "student": serialize_student_card(student),
        "guardian": {
            "father_name": student.father_name,
            "mother_name": student.mother_name,
            "guardian_name": student.guardian_name,
        },
        "current_academic_year": current_year.name if current_year else None,
        "current_enrollment": current_enrollment,
    }


@router.get("/students/{student_id}/attendance")
def portal_student_attendance(
    student_id: int,
    academic_year: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(PORTAL_ROLES)),
):
    ensure_student_access(db, current_user, student_id)

    query = db.query(models.Attendance).filter(
        models.Attendance.student_id == student_id
    )
    if academic_year:
        query = query.filter(models.Attendance.academic_year == academic_year)

    records = query.order_by(models.Attendance.attendance_date.desc()).all()

    counts = {"Present": 0, "Absent": 0, "Late": 0, "Half Day": 0}
    for record in records:
        if record.status in counts:
            counts[record.status] += 1

    total = len(records)
    attended = counts["Present"] + counts["Late"] + counts["Half Day"] * 0.5
    percentage = round((attended / total) * 100, 1) if total else None

    return {
        "total_days": total,
        "counts": counts,
        "attendance_percentage": percentage,
        "records": [
            {
                "date": record.attendance_date,
                "status": record.status,
                "academic_year": record.academic_year,
                "remarks": record.remarks,
            }
            for record in records
        ],
    }


@router.get("/students/{student_id}/marks")
def portal_student_marks(
    student_id: int,
    academic_year: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(PORTAL_ROLES)),
):
    ensure_student_access(db, current_user, student_id)

    query = db.query(models.Mark).filter(models.Mark.student_id == student_id)
    if academic_year:
        query = query.filter(models.Mark.academic_year == academic_year)

    marks = query.all()

    exams = {}
    for mark in marks:
        exam_key = mark.exam_name_snapshot or f"Exam #{mark.exam_id}"
        group = exams.setdefault(
            exam_key,
            {
                "exam_name": exam_key,
                "academic_year": mark.academic_year,
                "subjects": [],
                "total_obtained": 0,
                "total_max": 0,
            },
        )
        max_marks = mark.max_marks or mark.total_marks or 100
        group["subjects"].append(
            {
                "subject": mark.subject_name or mark.subject or "-",
                "marks_obtained": mark.marks_obtained,
                "max_marks": max_marks,
                "grade": mark.grade,
            }
        )
        group["total_obtained"] += mark.marks_obtained or 0
        group["total_max"] += max_marks

    for group in exams.values():
        group["percentage"] = (
            round((group["total_obtained"] / group["total_max"]) * 100, 1)
            if group["total_max"]
            else None
        )

    return {"exams": list(exams.values())}


@router.get("/students/{student_id}/fees")
def portal_student_fees(
    student_id: int,
    academic_year: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(PORTAL_ROLES)),
):
    ensure_student_access(db, current_user, student_id)

    query = db.query(models.Fee).filter(models.Fee.student_id == student_id)
    if academic_year:
        query = query.filter(models.Fee.academic_year == academic_year)

    fees = query.all()

    total_amount = sum((fee.total_amount or 0) for fee in fees)
    total_paid = sum((fee.paid_amount or 0) for fee in fees)
    total_due = sum((fee.due_amount or 0) for fee in fees)

    return {
        "totals": {
            "total_amount": total_amount,
            "total_paid": total_paid,
            "total_due": total_due,
        },
        "fees": [
            {
                "id": fee.id,
                "fee_type": fee.fee_type,
                "academic_year": fee.academic_year,
                "total_amount": fee.total_amount,
                "paid_amount": fee.paid_amount,
                "due_amount": fee.due_amount,
                "payment_status": fee.payment_status,
                "payment_date": fee.payment_date,
                "receipt_no": fee.receipt_no,
                "remarks": fee.remarks,
            }
            for fee in fees
        ],
    }


@router.get("/students/{student_id}/enrollments")
def portal_student_enrollments(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(PORTAL_ROLES)),
):
    ensure_student_access(db, current_user, student_id)

    enrollments = (
        db.query(models.StudentEnrollment)
        .filter(models.StudentEnrollment.student_id == student_id)
        .order_by(models.StudentEnrollment.academic_year.desc())
        .all()
    )

    return [
        {
            "academic_year": enrollment.academic_year,
            "class_name": enrollment.class_name_snapshot,
            "section": enrollment.section_snapshot,
            "roll_no": enrollment.roll_no,
            "enrollment_status": enrollment.enrollment_status,
            "promotion_status": enrollment.promotion_status,
            "start_date": enrollment.start_date,
            "end_date": enrollment.end_date,
        }
        for enrollment in enrollments
    ]


# ---------------- Admin: manage portal links ----------------


@router.get("/links", response_model=list[schemas.PortalLinkResponse])
def list_portal_links(
    user_id: int | None = None,
    student_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(ADMIN_ROLES)),
):
    query = db.query(models.ParentStudentLink)
    if user_id:
        query = query.filter(models.ParentStudentLink.user_id == user_id)
    if student_id:
        query = query.filter(models.ParentStudentLink.student_id == student_id)

    results = []
    for link in query.all():
        user = db.query(models.User).filter(models.User.id == link.user_id).first()
        student = (
            db.query(models.Student)
            .filter(models.Student.id == link.student_id)
            .first()
        )
        results.append(
            {
                "id": link.id,
                "user_id": link.user_id,
                "student_id": link.student_id,
                "relationship": link.relationship,
                "user_name": user.name if user else None,
                "user_email": user.email if user else None,
                "user_role": user.role if user else None,
                "student_name": " ".join(
                    filter(None, [student.first_name, student.last_name])
                )
                if student
                else None,
                "admission_no": student.admission_no if student else None,
            }
        )
    return results


@router.post("/links", response_model=schemas.PortalLinkResponse)
def create_portal_link(
    payload: schemas.PortalLinkCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(ADMIN_ROLES)),
):
    user = db.query(models.User).filter(models.User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role not in ("Parent", "Student"):
        raise HTTPException(
            status_code=400,
            detail="Links can only be created for users with the Parent or Student role",
        )

    student = (
        db.query(models.Student)
        .filter(models.Student.id == payload.student_id)
        .first()
    )
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    duplicate = (
        db.query(models.ParentStudentLink)
        .filter(
            models.ParentStudentLink.user_id == payload.user_id,
            models.ParentStudentLink.student_id == payload.student_id,
        )
        .first()
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="This link already exists")

    if user.role == "Student":
        existing = (
            db.query(models.ParentStudentLink)
            .filter(models.ParentStudentLink.user_id == payload.user_id)
            .count()
        )
        if existing:
            raise HTTPException(
                status_code=400,
                detail="A Student account can only be linked to one student record",
            )

    link = models.ParentStudentLink(
        user_id=payload.user_id,
        student_id=payload.student_id,
        relationship=payload.relationship
        or ("Self" if user.role == "Student" else None),
    )
    db.add(link)
    db.commit()
    db.refresh(link)

    return {
        "id": link.id,
        "user_id": link.user_id,
        "student_id": link.student_id,
        "relationship": link.relationship,
        "user_name": user.name,
        "user_email": user.email,
        "user_role": user.role,
        "student_name": " ".join(
            filter(None, [student.first_name, student.last_name])
        ),
        "admission_no": student.admission_no,
    }


@router.delete("/links/{link_id}")
def delete_portal_link(
    link_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(ADMIN_ROLES)),
):
    link = (
        db.query(models.ParentStudentLink)
        .filter(models.ParentStudentLink.id == link_id)
        .first()
    )
    if not link:
        raise HTTPException(status_code=404, detail="Link not found")

    db.delete(link)
    db.commit()
    return {"message": "Portal link removed"}
