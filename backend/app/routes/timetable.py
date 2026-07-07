import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import TimetableEntry, SchoolClass, Teacher, User, SchoolSettings
from app.schemas import (
    TimetableEntryCreate,
    TimetableEntryUpdate,
    TimetableEntryResponse,
)
from app.security import require_roles
from app.pdf import timetable_pdf

router = APIRouter(prefix="/timetable", tags=["Timetable"])

VALID_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _fill_snapshots(db: Session, entry: TimetableEntry) -> None:
    """Denormalize class/teacher names so the grid renders without extra joins."""
    if entry.class_id:
        cls = db.query(SchoolClass).filter(SchoolClass.id == entry.class_id).first()
        if cls:
            entry.class_name_snapshot = cls.class_name
            entry.section_snapshot = cls.section
    if entry.teacher_id:
        teacher = db.query(Teacher).filter(Teacher.id == entry.teacher_id).first()
        if teacher:
            entry.teacher_name_snapshot = teacher.name
    else:
        entry.teacher_name_snapshot = None


def _check_teacher_clash(db: Session, entry_data: dict, exclude_id: int | None = None) -> None:
    """A teacher cannot be in two places in the same year/day/period."""
    teacher_id = entry_data.get("teacher_id")
    if not teacher_id or entry_data.get("entry_type", "period") != "period":
        return
    query = db.query(TimetableEntry).filter(
        TimetableEntry.teacher_id == teacher_id,
        TimetableEntry.academic_year == entry_data.get("academic_year"),
        TimetableEntry.day_of_week == entry_data.get("day_of_week"),
        TimetableEntry.period_no == entry_data.get("period_no"),
    )
    if exclude_id:
        query = query.filter(TimetableEntry.id != exclude_id)
    clash = query.first()
    if clash:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Teacher is already assigned to "
                f"{clash.class_name_snapshot or 'another class'} "
                f"{clash.section_snapshot or ''} in period {clash.period_no} "
                f"on {clash.day_of_week}."
            ),
        )


@router.get("/", response_model=list[TimetableEntryResponse])
def list_timetable(
    class_id: int | None = None,
    academic_year: str | None = None,
    teacher_id: int | None = None,
    day_of_week: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher"])),
):
    query = db.query(TimetableEntry)
    if class_id:
        query = query.filter(TimetableEntry.class_id == class_id)
    if academic_year:
        query = query.filter(TimetableEntry.academic_year == academic_year)
    if teacher_id:
        query = query.filter(TimetableEntry.teacher_id == teacher_id)
    if day_of_week:
        query = query.filter(TimetableEntry.day_of_week == day_of_week)
    return query.order_by(TimetableEntry.period_no).all()


@router.get("/pdf")
def timetable_pdf_export(
    class_id: int | None = None,
    teacher_id: int | None = None,
    academic_year: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher"])),
):
    if not class_id and not teacher_id:
        raise HTTPException(status_code=400, detail="class_id or teacher_id is required")

    query = db.query(TimetableEntry)
    if class_id:
        query = query.filter(TimetableEntry.class_id == class_id)
    if teacher_id:
        query = query.filter(TimetableEntry.teacher_id == teacher_id)
    if academic_year:
        query = query.filter(TimetableEntry.academic_year == academic_year)
    entries = query.order_by(TimetableEntry.period_no).all()
    if not entries:
        raise HTTPException(status_code=404, detail="No timetable entries found")

    settings = db.query(SchoolSettings).first()
    school_name = settings.school_name if settings else "School"

    period_rows = {}
    for entry in entries:
        period_rows.setdefault(entry.period_no, []).append(entry)

    rows = []
    for period_no in sorted(period_rows.keys()):
        group = period_rows[period_no]
        break_entry = next((e for e in group if e.entry_type != "period"), None)
        if break_entry:
            rows.append({
                "period_no": period_no,
                "is_break": True,
                "break_label": break_entry.label or break_entry.entry_type.title(),
                "start_time": break_entry.start_time,
                "end_time": break_entry.end_time,
            })
            continue

        cells = {}
        sample = group[0]
        for entry in group:
            if class_id:
                line1 = entry.subject or "-"
                line2 = entry.teacher_name_snapshot
            else:
                class_label = entry.class_name_snapshot or ""
                if entry.section_snapshot:
                    class_label = f"{class_label}-{entry.section_snapshot}" if class_label else entry.section_snapshot
                line1 = class_label or "-"
                line2 = entry.subject
            cells[entry.day_of_week] = {"line1": line1, "line2": line2}

        rows.append({
            "period_no": period_no,
            "is_break": False,
            "start_time": sample.start_time,
            "end_time": sample.end_time,
            "cells": cells,
        })

    if class_id:
        cls = db.query(SchoolClass).filter(SchoolClass.id == class_id).first()
        title = f"{cls.class_name} - {cls.section}" if cls else "Class"
        subtitle = "Class Timetable"
        days = VALID_DAYS[:6]
    else:
        teacher = db.query(Teacher).filter(Teacher.id == teacher_id).first()
        title = teacher.name if teacher else "Teacher"
        subtitle = "Teacher Timetable"
        days = sorted({e.day_of_week for e in entries if e.day_of_week != "*"}, key=VALID_DAYS.index)

    pdf_bytes = timetable_pdf({
        "school_name": school_name,
        "subtitle": subtitle,
        "title": title,
        "academic_year": academic_year or (entries[0].academic_year if entries else None),
        "days": days,
        "rows": rows,
    })

    filename = f"timetable_{'class_' + str(class_id) if class_id else 'teacher_' + str(teacher_id)}.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"},
    )


@router.post("/", response_model=TimetableEntryResponse)
def create_timetable_entry(
    payload: TimetableEntryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    is_break = (payload.entry_type or "period") != "period"
    # Break/recess rows span all days (day_of_week "*"); only real periods
    # are tied to a specific weekday.
    if not is_break and payload.day_of_week not in VALID_DAYS:
        raise HTTPException(status_code=400, detail=f"Invalid day. Allowed: {', '.join(VALID_DAYS)}")
    if payload.period_no < 1:
        raise HTTPException(status_code=400, detail="Period number must be 1 or greater.")

    data = payload.model_dump()
    if is_break:
        data["day_of_week"] = "*"
    _check_teacher_clash(db, data)

    entry = TimetableEntry(**data)
    _fill_snapshots(db, entry)
    db.add(entry)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="This class already has a period in that day/slot.",
        )
    db.refresh(entry)
    return entry


@router.put("/{entry_id}", response_model=TimetableEntryResponse)
def update_timetable_entry(
    entry_id: int,
    payload: TimetableEntryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    entry = db.query(TimetableEntry).filter(TimetableEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Timetable entry not found")

    updates = payload.model_dump(exclude_unset=True)
    if (
        "day_of_week" in updates
        and updates["day_of_week"] not in VALID_DAYS
        and updates["day_of_week"] != "*"
    ):
        raise HTTPException(status_code=400, detail=f"Invalid day. Allowed: {', '.join(VALID_DAYS)}")

    for key, value in updates.items():
        setattr(entry, key, value)

    _check_teacher_clash(
        db,
        {
            "teacher_id": entry.teacher_id,
            "academic_year": entry.academic_year,
            "day_of_week": entry.day_of_week,
            "period_no": entry.period_no,
        },
        exclude_id=entry.id,
    )
    _fill_snapshots(db, entry)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="This class already has a period in that day/slot.",
        )
    db.refresh(entry)
    return entry


@router.delete("/{entry_id}")
def delete_timetable_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    entry = db.query(TimetableEntry).filter(TimetableEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Timetable entry not found")
    db.delete(entry)
    db.commit()
    return {"message": "Timetable entry deleted"}
