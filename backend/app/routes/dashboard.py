import json
from datetime import date, timedelta
from typing import Any, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import (
    Student,
    Teacher,
    SchoolClass,
    Fee,
    Attendance,
    Exam,
    Mark,
    User,
    HostelAllocation,
    TransportVehicle,
    LibraryBook,
)
from app.dashboard_models import DashboardLayout
from app.security import require_roles, get_current_user

router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"]
)


@router.get("/summary")
def dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Accounts", "Teacher"])
    )
):
    today = date.today()
    next_30_days = today + timedelta(days=30)

    total_students = db.query(Student).count()

    active_students = db.query(Student).filter(
        Student.student_status == "Active"
    ).count()

    international_students = db.query(Student).filter(
        Student.nationality.isnot(None),
        Student.nationality != "",
        func.lower(Student.nationality) != "indian",
        func.lower(Student.nationality) != "india"
    ).count()

    transport_users = db.query(Student).filter(
        Student.transport_route.isnot(None),
        Student.transport_route != ""
    ).count()

    total_teachers = db.query(Teacher).count()
    total_classes = db.query(SchoolClass).count()

    total_collection = db.query(func.sum(Fee.paid_amount)).scalar() or 0
    total_due = db.query(func.sum(Fee.due_amount)).scalar() or 0

    total_fee_amount = db.query(func.sum(Fee.total_amount)).scalar() or 0
    collection_percentage = 0

    if total_fee_amount:
        collection_percentage = round(
            (total_collection / total_fee_amount) * 100,
            2
        )

    today_attendance_total = db.query(Attendance).filter(
        Attendance.attendance_date == today
    ).count()

    today_present = db.query(Attendance).filter(
        Attendance.attendance_date == today,
        Attendance.status == "Present"
    ).count()

    today_absent = db.query(Attendance).filter(
        Attendance.attendance_date == today,
        Attendance.status == "Absent"
    ).count()

    today_late = db.query(Attendance).filter(
        Attendance.attendance_date == today,
        Attendance.status == "Late"
    ).count()

    today_excused = db.query(Attendance).filter(
        Attendance.attendance_date == today,
        Attendance.status == "Excused"
    ).count()

    attendance_percentage = 0

    if today_attendance_total:
        attendance_percentage = round(
            (today_present / today_attendance_total) * 100,
            2
        )

    upcoming_exams = db.query(Exam).filter(
        Exam.exam_date >= today,
        Exam.exam_date <= next_30_days
    ).order_by(Exam.exam_date.asc()).limit(10).all()

    recent_admissions = db.query(Student).order_by(
        Student.id.desc()
    ).limit(10).all()

    fee_defaulters = db.query(Fee).filter(
        Fee.due_amount > 0
    ).order_by(Fee.due_amount.desc()).limit(10).all()

    top_marks = db.query(Mark).order_by(
        Mark.marks_obtained.desc()
    ).limit(10).all()

    return {
        "total_students": total_students,
        "active_students": active_students,
        "international_students": international_students,
        "transport_users": transport_users,

        "total_teachers": total_teachers,
        "total_classes": total_classes,

        "total_collection": total_collection,
        "total_due": total_due,
        "collection_percentage": collection_percentage,

        "attendance_percentage": attendance_percentage,
        "today_present": today_present,
        "today_absent": today_absent,
        "today_late": today_late,
        "today_excused": today_excused,

        "upcoming_exams": [
            {
                "id": exam.id,
                "exam_name": exam.exam_name,
                "class_name": exam.class_name,
                "section": exam.section,
                "exam_date": exam.exam_date,
                "academic_year": exam.academic_year
            }
            for exam in upcoming_exams
        ],

        "recent_admissions": [
            {
                "id": student.id,
                "admission_no": student.admission_no,
                "student_name": f"{student.first_name} {student.last_name or ''}".strip(),
                "class_name": student.class_name,
                "section": student.section,
                "house": student.house,
                "admission_date": student.admission_date
            }
            for student in recent_admissions
        ],

        "fee_defaulters": [
            {
                "id": fee.id,
                "student_id": fee.student_id,
                "fee_type": fee.fee_type,
                "due_amount": fee.due_amount,
                "payment_status": fee.payment_status
            }
            for fee in fee_defaulters
        ],

        "top_performers": [
            {
                "id": mark.id,
                "student_id": mark.student_id,
                "exam_id": mark.exam_id,
                "subject": mark.subject,
                "marks_obtained": mark.marks_obtained,
                "total_marks": mark.total_marks,
                "grade": mark.grade
            }
            for mark in top_marks
        ]
    }


@router.get("/trends")
def dashboard_trends(
    days: int = 14,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Accounts", "Teacher"])
    ),
):
    """Time-series for the dashboard: daily attendance % over the last `days`
    days, and new admissions per month over the last 6 months."""
    days = max(7, min(days, 60))
    today = date.today()

    # ---- Daily attendance % ----
    # Anchor the window to the most recent day that actually has attendance, so
    # the trend always shows real data (in normal use that latest day is today).
    latest = db.query(func.max(Attendance.attendance_date)).scalar()
    anchor = latest if (latest and latest < today) else today
    start = anchor - timedelta(days=days - 1)
    records = (
        db.query(Attendance.attendance_date, Attendance.status)
        .filter(
            Attendance.attendance_date >= start,
            Attendance.attendance_date <= anchor,
        )
        .all()
    )
    per_day: dict = {}
    for att_date, status in records:
        if att_date is None:
            continue
        bucket = per_day.setdefault(att_date, {"present": 0.0, "total": 0})
        bucket["total"] += 1
        if status in ("Present", "Late"):
            bucket["present"] += 1
        elif status == "Half Day":
            bucket["present"] += 0.5

    attendance_trend = []
    for i in range(days):
        day = start + timedelta(days=i)
        bucket = per_day.get(day)
        pct = (
            round((bucket["present"] / bucket["total"]) * 100, 1)
            if bucket and bucket["total"]
            else None
        )
        attendance_trend.append(
            {"date": day.isoformat(), "percentage": pct, "total": bucket["total"] if bucket else 0}
        )

    # ---- New admissions per month (last 6 months) ----
    def month_key(d: date) -> str:
        return f"{d.year}-{d.month:02d}"

    months = []
    cursor = date(today.year, today.month, 1)
    for _ in range(6):
        months.append(cursor)
        # step back one month
        if cursor.month == 1:
            cursor = date(cursor.year - 1, 12, 1)
        else:
            cursor = date(cursor.year, cursor.month - 1, 1)
    months.reverse()
    month_labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    admission_dates = (
        db.query(Student.admission_date)
        .filter(Student.admission_date.isnot(None), Student.admission_date >= months[0])
        .all()
    )
    counts: dict = {}
    for (adm,) in admission_dates:
        if adm:
            counts[month_key(adm)] = counts.get(month_key(adm), 0) + 1

    admissions_trend = [
        {"month": f"{month_labels[m.month - 1]}", "label": f"{month_labels[m.month - 1]} {m.year}", "count": counts.get(month_key(m), 0)}
        for m in months
    ]

    return {"attendance_trend": attendance_trend, "admissions_trend": admissions_trend}


# ---------------- Custom dashboard: report engine ----------------
# A small, whitelisted aggregation engine that powers user-built widgets.
# Each report = a source (table) + a dimension (group-by) + a measure (agg).

# Measures whose values are money (drives currency formatting on the client).
CURRENCY_MEASURES = {"total_amount", "paid_amount", "due_amount", "fine_amount"}

REPORTS = {
    "students": {
        "label": "Students",
        "model": Student,
        "date_col": "admission_date",
        "dimensions": {
            "class_name": "Class",
            "section": "Section",
            "gender": "Gender",
            "house": "House",
            "nationality": "Nationality",
            "student_status": "Status",
            "residential_type": "Residential Type",
            "blood_group": "Blood Group",
        },
        # measure -> (label, column-or-None-for-count)
        "measures": {"count": ("Students", None)},
    },
    "fees": {
        "label": "Fees",
        "model": Fee,
        "date_col": "payment_date",
        "dimensions": {
            "fee_type": "Fee Type",
            "payment_status": "Payment Status",
            "academic_year": "Academic Year",
            "class_name_snapshot": "Class",
        },
        "measures": {
            "count": ("Fee Records", None),
            "total_amount": ("Billed", "total_amount"),
            "paid_amount": ("Collected", "paid_amount"),
            "due_amount": ("Outstanding", "due_amount"),
        },
    },
    "attendance": {
        "label": "Attendance",
        "model": Attendance,
        "date_col": "attendance_date",
        "dimensions": {
            "status": "Status",
            "class_name_snapshot": "Class",
            "academic_year": "Academic Year",
        },
        "measures": {"count": ("Records", None)},
    },
    "marks": {
        "label": "Marks",
        "model": Mark,
        "date_col": None,
        "dimensions": {
            "grade": "Grade",
            "subject": "Subject",
            "academic_year": "Academic Year",
            "exam_name_snapshot": "Exam",
        },
        "measures": {
            "count": ("Mark Entries", None),
            "marks_obtained": ("Total Marks", "marks_obtained"),
        },
    },
    "teachers": {
        "label": "Teachers",
        "model": Teacher,
        "date_col": "joining_date",
        "dimensions": {
            "department": "Department",
            "subject": "Subject",
            "gender": "Gender",
            "employment_type": "Employment Type",
            "salary_grade": "Salary Grade",
            "assigned_class": "Assigned Class",
        },
        "measures": {"count": ("Teachers", None)},
    },
    "hostel": {
        "label": "Hostel Allocations",
        "model": HostelAllocation,
        "date_col": "start_date",
        "dimensions": {"status": "Status"},
        "measures": {"count": ("Allocations", None)},
    },
    "transport": {
        "label": "Transport Vehicles",
        "model": TransportVehicle,
        "date_col": None,
        "dimensions": {"vehicle_type": "Vehicle Type"},
        "measures": {
            "count": ("Vehicles", None),
            "capacity": ("Total Capacity", "capacity"),
        },
    },
    "library": {
        "label": "Library Books",
        "model": LibraryBook,
        "date_col": None,
        "dimensions": {
            "category": "Category",
            "status": "Status",
            "author": "Author",
        },
        "measures": {
            "count": ("Titles", None),
            "total_copies": ("Total Copies", "total_copies"),
            "available_copies": ("Available Copies", "available_copies"),
        },
    },
}


@router.get("/report/catalog")
def report_catalog(
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Accounts", "Teacher"])
    ),
):
    """The set of sources/dimensions/measures the widget builder can offer."""
    return {
        source: {
            "label": cfg["label"],
            "dimensions": cfg["dimensions"],
            "measures": {k: v[0] for k, v in cfg["measures"].items()},
            "has_date": bool(cfg.get("date_col")),
        }
        for source, cfg in REPORTS.items()
    }


@router.get("/report")
def dashboard_report(
    source: str,
    group_by: str,
    measure: str = "count",
    academic_year: str | None = None,
    status: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin", "Principal", "Accounts", "Teacher"])
    ),
):
    """Aggregate one whitelisted source by a dimension and measure, with optional
    academic-year, status and date-range filters. Returns labels + values."""
    from fastapi import HTTPException

    cfg = REPORTS.get(source)
    if not cfg:
        raise HTTPException(status_code=400, detail="Unknown report source")
    if group_by not in cfg["dimensions"]:
        raise HTTPException(status_code=400, detail="Unknown dimension for this source")
    if measure not in cfg["measures"]:
        raise HTTPException(status_code=400, detail="Unknown measure for this source")

    model = cfg["model"]
    dim_col = getattr(model, group_by)
    measure_label, measure_field = cfg["measures"][measure]

    if measure_field is None:
        agg = func.count(model.id)
    else:
        agg = func.coalesce(func.sum(getattr(model, measure_field)), 0)

    query = db.query(dim_col, agg).group_by(dim_col)

    if academic_year and hasattr(model, "academic_year"):
        query = query.filter(model.academic_year == academic_year)

    if status:
        if source == "students":
            query = query.filter(model.student_status == status)
        elif source == "fees":
            query = query.filter(model.payment_status == status)
        elif hasattr(model, "status"):
            query = query.filter(model.status == status)

    date_col_name = cfg.get("date_col")
    if date_col_name and (date_from or date_to):
        date_col = getattr(model, date_col_name)
        if date_from:
            query = query.filter(date_col >= date_from)
        if date_to:
            query = query.filter(date_col <= date_to)

    rows = query.all()
    data = [
        {
            "label": str(label) if label not in (None, "") else "Unspecified",
            "value": round(float(value or 0), 2),
        }
        for label, value in rows
    ]
    data.sort(key=lambda d: -d["value"])
    data = data[: max(1, min(limit, 50))]

    return {
        "labels": [d["label"] for d in data],
        "values": [d["value"] for d in data],
        "measure_label": measure_label,
        "dimension_label": cfg["dimensions"][group_by],
        "source_label": cfg["label"],
        "is_currency": measure in CURRENCY_MEASURES,
    }


# ---------------- Custom dashboard: saved layout (per user) ----------------


class LayoutPayload(BaseModel):
    widgets: List[Any]


@router.get("/layout")
def get_dashboard_layout(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The signed-in user's saved widget layout (null if none saved yet)."""
    row = (
        db.query(DashboardLayout)
        .filter(DashboardLayout.user_id == current_user.id)
        .first()
    )
    if not row or not row.widgets:
        return {"widgets": None}
    try:
        return {"widgets": json.loads(row.widgets)}
    except (ValueError, TypeError):
        return {"widgets": None}


@router.put("/layout")
def save_dashboard_layout(
    payload: LayoutPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Persist the signed-in user's widget layout so it follows them anywhere."""
    text = json.dumps(payload.widgets)
    row = (
        db.query(DashboardLayout)
        .filter(DashboardLayout.user_id == current_user.id)
        .first()
    )
    if row:
        row.widgets = text
    else:
        row = DashboardLayout(user_id=current_user.id, widgets=text)
        db.add(row)
    db.commit()
    return {"ok": True}