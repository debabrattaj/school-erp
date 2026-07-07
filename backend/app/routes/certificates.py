import io
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Student, SchoolSettings, User, StudentEnrollment, Mark
from app.security import require_roles
from app.pdf import (
    bonafide_certificate_pdf,
    transfer_certificate_pdf,
    student_id_card_pdf,
    transcript_pdf,
)
from app.routes.marks import calculate_grade

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


@router.get("/{student_id}/transcript")
def transcript(
    student_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(VIEWERS)),
):
    student, settings = _get(db, student_id)

    enrollments = (
        db.query(StudentEnrollment)
        .filter(StudentEnrollment.student_id == student_id)
        .order_by(StudentEnrollment.academic_year)
        .all()
    )

    known_years = [e.academic_year for e in enrollments if e.academic_year]
    all_years = db.query(Mark.academic_year).filter(
        Mark.student_id == student_id, Mark.academic_year.isnot(None)
    ).distinct().all()
    for (yr,) in all_years:
        if yr not in known_years:
            known_years.append(yr)
    known_years.sort()

    class_label_by_year = {
        e.academic_year: (
            f"{e.class_name_snapshot} - {e.section_snapshot}"
            if e.class_name_snapshot and e.section_snapshot
            else (e.class_name_snapshot or "-")
        )
        for e in enrollments
        if e.academic_year
    }

    years_block = []
    for year in known_years:
        marks = (
            db.query(Mark)
            .filter(Mark.student_id == student_id, Mark.academic_year == year)
            .order_by(Mark.exam_id, Mark.subject_name)
            .all()
        )

        by_exam = {}
        for mark in marks:
            key = mark.exam_id
            by_exam.setdefault(key, {"exam_name": mark.exam_name_snapshot or "-", "marks": []})
            by_exam[key]["marks"].append(mark)

        exams = []
        for exam_info in by_exam.values():
            rows = []
            total_obtained = 0.0
            total_max = 0.0
            for mark in exam_info["marks"]:
                obtained = float(mark.marks_obtained or 0)
                maximum = float(mark.max_marks or mark.total_marks or 0)
                total_obtained += obtained
                total_max += maximum
                rows.append({
                    "subject": mark.subject_name or mark.subject or "-",
                    "obtained": obtained,
                    "max": maximum,
                    "grade": mark.grade or "-",
                })
            percentage = (total_obtained / total_max * 100) if total_max else 0.0
            overall_grade = calculate_grade(total_obtained, total_max, db) if total_max else "-"
            exams.append({
                "exam_name": exam_info["exam_name"],
                "rows": rows,
                "total_obtained": total_obtained,
                "total_max": total_max,
                "percentage": percentage,
                "overall_grade": overall_grade,
            })

        years_block.append({
            "academic_year": year,
            "class_label": class_label_by_year.get(year) or _class_label(student),
            "exams": exams,
        })

    pdf = transcript_pdf({
        "school_name": settings.school_name if settings else "School",
        "student_name": _name(student),
        "admission_no": student.admission_no,
        "dob": str(student.dob) if student.dob else None,
        "years": years_block,
    })
    return _pdf_response(pdf, f"transcript_{student.admission_no or student.id}.pdf")


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
