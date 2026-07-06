import io
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Student, SchoolSettings, User
from app.security import require_roles
from app.pdf import (
    bonafide_certificate_pdf,
    transfer_certificate_pdf,
    student_id_card_pdf,
)

# Same /students prefix so access is governed by the "students" permission.
router = APIRouter(prefix="/students", tags=["Certificates & ID Cards"])

VIEWERS = ["Admin", "Principal", "Accounts", "Teacher"]


def _get(db: Session, student_id: int):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=404, detail="Student not found")
    settings = db.query(SchoolSettings).first()
    return student, settings


def _name(student: Student) -> str:
    return (
        f"{student.first_name or ''} {student.last_name or ''}".strip()
        or student.admission_no
        or "-"
    )


def _class_label(student: Student) -> str:
    label = student.class_name or ""
    if student.section:
        label = f"{label} - {student.section}" if label else student.section
    return label or "-"


def _pdf_response(data: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"},
    )


@router.get("/{student_id}/bonafide")
def bonafide(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(VIEWERS)),
):
    student, settings = _get(db, student_id)
    pdf = bonafide_certificate_pdf({
        "school_name": settings.school_name if settings else "School",
        "logo_url": settings.logo_url if settings else None,
        "school_address": settings.address if settings else None,
        "student_name": _name(student),
        "admission_no": student.admission_no,
        "father_name": student.father_name,
        "guardian_name": student.guardian_name,
        "class_label": _class_label(student),
        "academic_year": getattr(settings, "academic_year", None) if settings else None,
        "dob": str(student.dob) if student.dob else None,
        "issue_date": str(date.today()),
    })
    return _pdf_response(pdf, f"bonafide_{student.admission_no or student.id}.pdf")


@router.get("/{student_id}/transfer-certificate")
def transfer_certificate(
    student_id: int,
    reason: str | None = None,
    conduct: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(VIEWERS)),
):
    student, settings = _get(db, student_id)
    pdf = transfer_certificate_pdf({
        "school_name": settings.school_name if settings else "School",
        "logo_url": settings.logo_url if settings else None,
        "school_address": settings.address if settings else None,
        "tc_no": f"TC-{student.admission_no or student.id}",
        "student_name": _name(student),
        "admission_no": student.admission_no,
        "father_name": student.father_name,
        "mother_name": student.mother_name,
        "dob": str(student.dob) if student.dob else None,
        "nationality": student.nationality,
        "class_label": _class_label(student),
        "academic_year": getattr(settings, "academic_year", None) if settings else None,
        "admission_date": str(student.admission_date) if student.admission_date else None,
        "leaving_date": str(date.today()),
        "reason": reason or "-",
        "conduct": conduct or "Good",
        "issue_date": str(date.today()),
    })
    return _pdf_response(pdf, f"transfer_certificate_{student.admission_no or student.id}.pdf")


@router.get("/{student_id}/id-card")
def id_card(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(VIEWERS)),
):
    student, settings = _get(db, student_id)
    pdf = student_id_card_pdf({
        "school_name": settings.school_name if settings else "School",
        "logo_url": settings.logo_url if settings else None,
        "photo_url": student.photo_url,
        "student_name": _name(student),
        "admission_no": student.admission_no,
        "class_label": _class_label(student),
        "dob": str(student.dob) if student.dob else None,
        "blood_group": student.blood_group,
        "guardian_name": student.guardian_name,
        "guardian_phone": student.guardian_phone,
    })
    return _pdf_response(pdf, f"id_card_{student.admission_no or student.id}.pdf")
