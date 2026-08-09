"""Staff payroll: per-teacher salary structures and monthly payslip runs.

Generating payroll for a month snapshots each teacher's current salary
structure into a Payslip row — so editing a structure later never rewrites
history, same principle as Fee auto-generation snapshotting billing_period.
"""

import io

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.csv_import import csv_template_response, read_csv_upload
from app.database import get_db
from app.models import Payslip, Teacher, TeacherSalaryStructure, User
from app.pdf import payslip_pdf
from app.routes.fees import get_settings
from app.schemas import (
    GeneratePayrollRequest,
    PayslipMarkPaid,
    PayslipResponse,
    SalaryStructureResponse,
    SalaryStructureUpdate,
)
from app.security import require_roles

router = APIRouter(prefix="/payroll", tags=["Payroll"])

MANAGERS = ["Admin", "Accounts"]
VIEWERS = ["Admin", "Accounts", "Principal"]

SALARY_BULK_IMPORT_COLUMNS = [
    "employee_no",
    "basic_pay",
    "hra",
    "other_allowances",
    "provident_fund",
    "professional_tax",
    "other_deductions",
    "effective_from",
]


def _get_teacher_or_404(db: Session, teacher_id: int) -> Teacher:
    teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
    if not teacher:
        raise HTTPException(status_code=404, detail="Teacher not found")
    return teacher


@router.get("/salary-structures", response_model=list[SalaryStructureResponse])
def list_salary_structures(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(VIEWERS)),
):
    return db.query(TeacherSalaryStructure).all()


@router.get("/salary-structures/bulk-import-template")
def bulk_import_salary_structures_template(
    current_user: User = Depends(require_roles(MANAGERS)),
):
    return csv_template_response(
        SALARY_BULK_IMPORT_COLUMNS,
        {
            "employee_no": "EMP2026101",
            "basic_pay": "30000",
            "hra": "8000",
            "other_allowances": "2000",
            "provident_fund": "1800",
            "professional_tax": "200",
            "other_deductions": "0",
            "effective_from": "2026-04-01",
        },
        "payroll_salary_structures_import_template.csv",
    )


@router.post("/salary-structures/bulk-import")
def bulk_import_salary_structures(
    file: UploadFile = File(...),
    dry_run: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """Upserts one salary structure per teacher — re-uploading an updated
    sheet for the same employee_no replaces that teacher's figures, same as
    editing them one at a time via the PUT endpoint."""
    rows, unknown_columns = read_csv_upload(file, SALARY_BULK_IMPORT_COLUMNS)

    teacher_lookup = {
        teacher.employee_no: teacher.id
        for teacher in db.query(Teacher).all()
    }
    existing_teacher_ids = {
        row.teacher_id
        for row in db.query(TeacherSalaryStructure.teacher_id).all()
    }

    seen = set()
    errors = []
    to_upsert = []  # (teacher_id, validated) pairs

    NUMERIC_FIELDS = ["basic_pay", "hra", "other_allowances", "provident_fund", "professional_tax", "other_deductions"]

    for row_index, cleaned in rows:
        employee_no = cleaned.get("employee_no")
        if not employee_no:
            errors.append({"row": row_index, "error": "employee_no is required"})
            continue

        teacher_id = teacher_lookup.get(employee_no)
        if teacher_id is None:
            errors.append({"row": row_index, "error": f"No teacher found with employee_no {employee_no!r}"})
            continue

        if employee_no in seen:
            errors.append({"row": row_index, "error": f"Duplicate employee_no in file: {employee_no}"})
            continue

        try:
            numeric = {field: float(cleaned[field]) if cleaned.get(field) else 0 for field in NUMERIC_FIELDS}
        except ValueError:
            errors.append({"row": row_index, "error": "basic_pay, hra, other_allowances, provident_fund, professional_tax and other_deductions must be numbers"})
            continue

        try:
            validated = SalaryStructureUpdate(
                **numeric,
                effective_from=cleaned.get("effective_from"),
            )
        except ValidationError as exc:
            errors.append({"row": row_index, "error": exc.errors()[0]["msg"]})
            continue

        seen.add(employee_no)
        to_upsert.append((teacher_id, validated))

    created_count = 0
    updated_count = 0
    if not dry_run:
        for teacher_id, validated in to_upsert:
            data = validated.model_dump()
            structure = (
                db.query(TeacherSalaryStructure)
                .filter(TeacherSalaryStructure.teacher_id == teacher_id)
                .first()
            )
            if structure:
                for key, value in data.items():
                    setattr(structure, key, value)
                updated_count += 1
            else:
                db.add(TeacherSalaryStructure(teacher_id=teacher_id, **data))
                created_count += 1
        if to_upsert:
            db.commit()
    else:
        for teacher_id, _validated in to_upsert:
            if teacher_id in existing_teacher_ids:
                updated_count += 1
            else:
                created_count += 1

    return {
        "total_rows": rows[-1][0] - 1 if rows else 0,
        "created": (created_count + updated_count) if not dry_run else 0,
        "valid_rows": len(to_upsert),
        "errors": errors,
        "dry_run": dry_run,
        "unknown_columns": unknown_columns,
        "new_teachers": created_count,
        "updated_teachers": updated_count,
    }


@router.get("/salary-structures/{teacher_id}", response_model=SalaryStructureResponse)
def get_salary_structure(
    teacher_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(VIEWERS)),
):
    structure = (
        db.query(TeacherSalaryStructure)
        .filter(TeacherSalaryStructure.teacher_id == teacher_id)
        .first()
    )
    if not structure:
        raise HTTPException(status_code=404, detail="No salary structure set for this teacher")
    return structure


@router.put("/salary-structures/{teacher_id}", response_model=SalaryStructureResponse)
def upsert_salary_structure(
    teacher_id: int,
    payload: SalaryStructureUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    _get_teacher_or_404(db, teacher_id)

    structure = (
        db.query(TeacherSalaryStructure)
        .filter(TeacherSalaryStructure.teacher_id == teacher_id)
        .first()
    )
    data = payload.model_dump()
    if not structure:
        structure = TeacherSalaryStructure(teacher_id=teacher_id, **data)
        db.add(structure)
    else:
        for key, value in data.items():
            setattr(structure, key, value)

    db.commit()
    db.refresh(structure)
    return structure


@router.post("/generate", response_model=list[PayslipResponse])
def generate_payroll(
    payload: GeneratePayrollRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    if not (1 <= payload.month <= 12):
        raise HTTPException(status_code=400, detail="month must be between 1 and 12")

    structures = db.query(TeacherSalaryStructure).all()
    if not structures:
        raise HTTPException(status_code=400, detail="No salary structures configured yet")

    existing_teacher_ids = {
        row.teacher_id
        for row in db.query(Payslip.teacher_id).filter(
            Payslip.month == payload.month, Payslip.year == payload.year
        ).all()
    }

    created = []
    for structure in structures:
        if structure.teacher_id in existing_teacher_ids:
            continue  # already generated for this period — safe to re-run

        teacher = db.query(Teacher).filter(Teacher.id == structure.teacher_id).first()
        if not teacher:
            continue  # salary structure for a since-deleted teacher

        gross_pay = (structure.basic_pay or 0) + (structure.hra or 0) + (structure.other_allowances or 0)
        total_deductions = (
            (structure.provident_fund or 0)
            + (structure.professional_tax or 0)
            + (structure.other_deductions or 0)
        )

        payslip = Payslip(
            teacher_id=teacher.id,
            teacher_name_snapshot=teacher.name,
            month=payload.month,
            year=payload.year,
            basic_pay=structure.basic_pay or 0,
            hra=structure.hra or 0,
            other_allowances=structure.other_allowances or 0,
            gross_pay=gross_pay,
            provident_fund=structure.provident_fund or 0,
            professional_tax=structure.professional_tax or 0,
            other_deductions=structure.other_deductions or 0,
            total_deductions=total_deductions,
            net_pay=gross_pay - total_deductions,
            status="Pending",
        )
        db.add(payslip)
        created.append(payslip)

    db.commit()
    for payslip in created:
        db.refresh(payslip)
    return created


@router.get("/payslips", response_model=list[PayslipResponse])
def list_payslips(
    teacher_id: int | None = None,
    month: int | None = None,
    year: int | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(VIEWERS)),
):
    query = db.query(Payslip)
    if teacher_id:
        query = query.filter(Payslip.teacher_id == teacher_id)
    if month:
        query = query.filter(Payslip.month == month)
    if year:
        query = query.filter(Payslip.year == year)
    if status:
        query = query.filter(Payslip.status == status)
    return query.order_by(Payslip.year.desc(), Payslip.month.desc(), Payslip.id.desc()).all()


def _get_payslip_or_404(db: Session, payslip_id: int) -> Payslip:
    payslip = db.query(Payslip).filter(Payslip.id == payslip_id).first()
    if not payslip:
        raise HTTPException(status_code=404, detail="Payslip not found")
    return payslip


@router.put("/payslips/{payslip_id}/mark-paid", response_model=PayslipResponse)
def mark_payslip_paid(
    payslip_id: int,
    payload: PayslipMarkPaid,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    payslip = _get_payslip_or_404(db, payslip_id)
    payslip.status = "Paid"
    payslip.payment_date = payload.payment_date
    if payload.remarks is not None:
        payslip.remarks = payload.remarks

    db.commit()
    db.refresh(payslip)
    return payslip


@router.delete("/payslips/{payslip_id}")
def delete_payslip(
    payslip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    payslip = _get_payslip_or_404(db, payslip_id)
    db.delete(payslip)
    db.commit()
    return {"message": "Payslip deleted successfully"}


@router.get("/payslips/{payslip_id}/pdf")
def payslip_pdf_download(
    payslip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(VIEWERS)),
):
    payslip = _get_payslip_or_404(db, payslip_id)
    teacher = db.query(Teacher).filter(Teacher.id == payslip.teacher_id).first()
    settings = get_settings(db)

    pdf = payslip_pdf({
        "school_name": settings.school_name,
        "currency": settings.currency,
        "teacher_name": payslip.teacher_name_snapshot or (teacher.name if teacher else "-"),
        "employee_no": teacher.employee_no if teacher else "-",
        "month": payslip.month,
        "year": payslip.year,
        "basic_pay": payslip.basic_pay,
        "hra": payslip.hra,
        "other_allowances": payslip.other_allowances,
        "gross_pay": payslip.gross_pay,
        "provident_fund": payslip.provident_fund,
        "professional_tax": payslip.professional_tax,
        "other_deductions": payslip.other_deductions,
        "total_deductions": payslip.total_deductions,
        "net_pay": payslip.net_pay,
        "status": payslip.status,
        "payment_date": payslip.payment_date.isoformat() if payslip.payment_date else "-",
    })
    filename = f"payslip_{payslip.teacher_id}_{payslip.year}_{payslip.month:02d}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"},
    )
