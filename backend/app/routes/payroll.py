"""Staff payroll: per-teacher salary structures and monthly payslip runs.

Generating payroll for a month snapshots each teacher's current salary
structure into a Payslip row — so editing a structure later never rewrites
history, same principle as Fee auto-generation snapshotting billing_period.
"""

import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

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
