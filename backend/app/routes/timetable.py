import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import timetable_generator
from app.database import get_db
from app.models import TimetableEntry, SchoolClass, Teacher, User, SchoolSettings
from app.schemas import (
    TimetableEntryCreate,
    TimetableEntryUpdate,
    TimetableEntryResponse,
)
from app.security import require_roles
from app.tenant import require_feature
from app.pdf import timetable_pdf

router = APIRouter(prefix="/timetable", tags=["Timetable"])

VALID_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
SCHEDULERS = ["Admin", "Principal"]
# Bulk-writes the whole school's grid in one action, so it stays opt-in
# behind the platform owner's switch like the other *_auto_generation
# automations, even though nothing here runs unattended on a schedule.
AUTO_GATE = [Depends(require_feature("timetable_auto_generation"))]


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


# ---------------- Automatic generation ----------------


class AutoGenerateRequest(BaseModel):
    academic_year: str
    class_ids: list[int] | None = None  # empty/omitted = every class
    working_days: list[str] | None = None  # defaults to the school's settings
    periods_per_day: int = timetable_generator.DEFAULT_PERIODS_PER_DAY
    day_start_time: str = timetable_generator.DEFAULT_DAY_START
    period_duration_min: int = timetable_generator.DEFAULT_PERIOD_DURATION_MIN


def _generation_scope(db: Session, payload: AutoGenerateRequest) -> tuple[list[int], list[str]]:
    if payload.class_ids:
        class_ids = [
            c.id for c in db.query(SchoolClass).filter(SchoolClass.id.in_(payload.class_ids)).all()
        ]
    else:
        class_ids = [c.id for c in db.query(SchoolClass).all()]
    if not class_ids:
        raise HTTPException(status_code=400, detail="No classes found to generate a timetable for.")

    if payload.working_days:
        invalid = [d for d in payload.working_days if d not in VALID_DAYS]
        if invalid:
            raise HTTPException(status_code=400, detail=f"Invalid working day(s): {', '.join(invalid)}")
    working_days = timetable_generator.resolve_working_days(db, payload.working_days)
    if not working_days:
        raise HTTPException(status_code=400, detail="No working days configured for this school.")

    return class_ids, working_days


def _run_generation(
    db: Session, payload: AutoGenerateRequest, class_ids: list[int], working_days: list[str]
) -> timetable_generator.GenerationResult:
    if payload.periods_per_day < 1:
        raise HTTPException(status_code=400, detail="Periods per day must be at least 1.")
    return timetable_generator.generate(
        db,
        academic_year=payload.academic_year,
        class_ids=class_ids,
        working_days=working_days,
        periods_per_day=payload.periods_per_day,
        day_start_time=payload.day_start_time,
        period_duration_min=payload.period_duration_min,
    )


def _generation_response(result: timetable_generator.GenerationResult, applied: bool, created: int = 0) -> dict:
    return {
        "applied": applied,
        "created": created,
        "academic_year": result.academic_year,
        "working_days": result.working_days,
        "periods_per_day": result.periods_per_day,
        "classes_processed": result.classes_processed,
        "placed_count": len(result.entries),
        "entries": [e.__dict__ for e in result.entries],
        "unplaced": [u.__dict__ for u in result.unplaced],
        "warnings": result.warnings,
    }


@router.post("/auto-generate/preview", dependencies=AUTO_GATE)
def auto_generate_preview(
    payload: AutoGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(SCHEDULERS)),
):
    """Compute a proposed timetable without writing anything.

    Runs the exact same placement apply() will, against the exact same
    database state, so what an Admin approves here is what they get -- the
    only thing apply() does differently is delete the classes' existing
    periods first and save the result.
    """
    class_ids, working_days = _generation_scope(db, payload)
    result = _run_generation(db, payload, class_ids, working_days)
    return _generation_response(result, applied=False)


@router.post("/auto-generate/apply", dependencies=AUTO_GATE)
def auto_generate_apply(
    payload: AutoGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(SCHEDULERS)),
):
    """Generate and save. Replaces every existing period row (not
    recess/break rows) for the selected classes and academic year --
    intended to be called after a preview has been reviewed."""
    class_ids, working_days = _generation_scope(db, payload)
    result = _run_generation(db, payload, class_ids, working_days)

    db.query(TimetableEntry).filter(
        TimetableEntry.academic_year == payload.academic_year,
        TimetableEntry.class_id.in_(class_ids),
        TimetableEntry.entry_type == "period",
    ).delete(synchronize_session=False)

    created = 0
    for placed in result.entries:
        db.add(
            TimetableEntry(
                academic_year=payload.academic_year,
                class_id=placed.class_id,
                class_name_snapshot=placed.class_name,
                section_snapshot=placed.section,
                day_of_week=placed.day_of_week,
                period_no=placed.period_no,
                entry_type="period",
                subject=placed.subject,
                teacher_id=placed.teacher_id,
                teacher_name_snapshot=placed.teacher_name,
                room=placed.room,
                start_time=placed.start_time,
                end_time=placed.end_time,
            )
        )
        created += 1

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="The timetable changed while generating. Please preview and try again.",
        )

    return _generation_response(result, applied=True, created=created)
