"""PDF generation (fee receipts).

Uses reportlab. In dev it's installed under .pylibs (the venv site-packages is
read-only here); in production it's a normal dependency.
"""

import io
import os
import sys

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_PYLIBS = os.path.join(_BACKEND_DIR, ".pylibs")
if os.path.isdir(_PYLIBS) and _PYLIBS not in sys.path:
    sys.path.insert(0, _PYLIBS)

from reportlab.lib.pagesizes import A4, landscape  # noqa: E402
from reportlab.lib.units import mm  # noqa: E402
from reportlab.lib import colors  # noqa: E402
from reportlab.lib.utils import ImageReader  # noqa: E402
from reportlab.pdfgen import canvas  # noqa: E402
from reportlab.platypus import Table, TableStyle  # noqa: E402

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "./uploads")


def _resolve_upload_path(url):
    """Map a stored '/uploads/...' URL to its on-disk path (or None)."""
    if not url or not isinstance(url, str):
        return None
    if url.startswith("/uploads/"):
        rel = url[len("/uploads/"):]
        path = os.path.join(UPLOAD_DIR, rel)
        return path if os.path.exists(path) else None
    return None


def _draw_image_safe(c, url, x, y, w, h):
    """Draw an image from an uploaded URL; ignore if missing/unreadable."""
    path = _resolve_upload_path(url)
    if not path:
        return False
    try:
        c.drawImage(ImageReader(path), x, y, width=w, height=h,
                    preserveAspectRatio=True, mask="auto")
        return True
    except Exception:
        return False

CURRENCY_SYMBOLS = {
    "INR": "Rs ", "USD": "$", "EUR": "EUR ", "GBP": "GBP ",
    "AED": "AED ", "SGD": "S$", "AUD": "A$", "CAD": "C$", "JPY": "JPY ",
}


def _money(amount, currency):
    symbol = CURRENCY_SYMBOLS.get((currency or "INR").upper(), (currency or "") + " ")
    return f"{symbol}{float(amount or 0):,.2f}"


def fee_receipt_pdf(data: dict) -> bytes:
    """Render a fee receipt to PDF bytes.

    Expected keys: school_name, currency, receipt_no, student_name, class_label,
    fee_type, academic_year, total, paid, balance, status, payment_date.
    """
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    left = 25 * mm
    right = width - 25 * mm
    y = height - 30 * mm

    # Header
    c.setFont("Helvetica-Bold", 18)
    c.drawString(left, y, data.get("school_name") or "School")
    c.setFont("Helvetica", 11)
    y -= 8 * mm
    c.drawString(left, y, "Fee Receipt")
    c.setFont("Helvetica", 10)
    c.drawRightString(right, y, f"Receipt No: {data.get('receipt_no') or '-'}")
    y -= 4 * mm
    c.line(left, y, right, y)
    y -= 10 * mm

    def row(label, value):
        nonlocal y
        c.setFont("Helvetica-Bold", 10)
        c.drawString(left, y, label)
        c.setFont("Helvetica", 10)
        c.drawString(left + 45 * mm, y, str(value))
        y -= 7 * mm

    currency = data.get("currency")
    row("Student", data.get("student_name") or "-")
    row("Class", data.get("class_label") or "-")
    row("Academic Year", data.get("academic_year") or "-")
    row("Fee Type", data.get("fee_type") or "-")
    row("Payment Date", data.get("payment_date") or "-")
    y -= 3 * mm
    c.line(left, y, right, y)
    y -= 10 * mm

    row("Total Amount", _money(data.get("total"), currency))
    row("Paid Amount", _money(data.get("paid"), currency))
    row("Balance", _money(data.get("balance"), currency))
    row("Status", data.get("status") or "-")

    # Footer
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(left, 20 * mm, "This is a computer-generated receipt.")

    c.showPage()
    c.save()
    return buf.getvalue()


def report_card_pdf(data: dict) -> bytes:
    """Render an academic report card to PDF bytes.

    Expected keys: school_name, student_name, admission_no, class_label,
    exam_name, academic_year, rows (list of {subject, obtained, max, grade}),
    total_obtained, total_max, percentage, overall_grade.
    """
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    left = 20 * mm
    right = width - 20 * mm
    y = height - 25 * mm

    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(width / 2, y, data.get("school_name") or "School")
    y -= 8 * mm
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(width / 2, y, "Report Card")
    y -= 4 * mm
    c.line(left, y, right, y)
    y -= 9 * mm

    c.setFont("Helvetica", 10)
    c.drawString(left, y, f"Student: {data.get('student_name') or '-'}")
    c.drawRightString(right, y, f"Admission No: {data.get('admission_no') or '-'}")
    y -= 6 * mm
    c.drawString(left, y, f"Class: {data.get('class_label') or '-'}")
    c.drawRightString(right, y, f"Academic Year: {data.get('academic_year') or '-'}")
    y -= 6 * mm
    c.drawString(left, y, f"Exam: {data.get('exam_name') or '-'}")
    y -= 8 * mm

    # Subjects table
    table_data = [["Subject", "Marks", "Max", "Grade"]]
    for row in data.get("rows", []):
        table_data.append([
            str(row.get("subject") or "-"),
            f"{float(row.get('obtained') or 0):g}",
            f"{float(row.get('max') or 0):g}",
            str(row.get("grade") or "-"),
        ])

    col_widths = [right - left - 3 * 30 * mm, 30 * mm, 30 * mm, 30 * mm]
    table = Table(table_data, colWidths=col_widths)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#25324b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    tw, th = table.wrap(right - left, y)
    table.drawOn(c, left, y - th)
    y = y - th - 10 * mm

    # Totals
    c.setFont("Helvetica-Bold", 11)
    c.drawString(left, y, f"Total: {data.get('total_obtained', 0):g} / {data.get('total_max', 0):g}")
    c.drawRightString(right, y, f"Percentage: {data.get('percentage', 0):.2f}%")
    y -= 7 * mm
    c.drawString(left, y, f"Overall Grade: {data.get('overall_grade') or '-'}")

    c.setFont("Helvetica-Oblique", 8)
    c.drawString(left, 20 * mm, "This is a computer-generated report card.")

    c.showPage()
    c.save()
    return buf.getvalue()


def transcript_pdf(data: dict) -> bytes:
    """Render a multi-year academic transcript.

    Expected keys: school_name, student_name, admission_no, dob, issue_date,
    years (list of {academic_year, class_label, exams: [{exam_name, rows,
    total_obtained, total_max, percentage, overall_grade}]}).
    """
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    left = 20 * mm
    right = width - 20 * mm
    y = height - 25 * mm

    def footer():
        c.setFont("Helvetica-Oblique", 8)
        c.drawString(left, 15 * mm, "This is a computer-generated transcript.")

    def new_page():
        nonlocal y
        footer()
        c.showPage()
        y = height - 20 * mm
        c.setFont("Helvetica", 10)

    c.setFont("Helvetica-Bold", 18)
    c.drawCentredString(width / 2, y, data.get("school_name") or "School")
    y -= 8 * mm
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(width / 2, y, "Academic Transcript")
    y -= 4 * mm
    c.line(left, y, right, y)
    y -= 9 * mm

    c.setFont("Helvetica", 10)
    c.drawString(left, y, f"Student: {data.get('student_name') or '-'}")
    c.drawRightString(right, y, f"Admission No: {data.get('admission_no') or '-'}")
    y -= 6 * mm
    if data.get("dob"):
        c.drawString(left, y, f"Date of Birth: {data.get('dob')}")
        y -= 6 * mm
    y -= 4 * mm

    years = data.get("years", [])
    if not years:
        c.setFont("Helvetica-Oblique", 10)
        c.drawString(left, y, "No academic records found.")
        y -= 8 * mm

    for year_block in years:
        if y < 60 * mm:
            new_page()

        c.setFont("Helvetica-Bold", 12)
        c.drawString(left, y, f"Academic Year: {year_block.get('academic_year') or '-'}")
        c.drawRightString(right, y, f"Class: {year_block.get('class_label') or '-'}")
        y -= 6 * mm
        c.line(left, y, right, y)
        y -= 8 * mm

        exams = year_block.get("exams", [])
        if not exams:
            c.setFont("Helvetica-Oblique", 9.5)
            c.drawString(left, y, "No exam records for this academic year.")
            y -= 10 * mm

        for exam in exams:
            if y < 55 * mm:
                new_page()

            c.setFont("Helvetica-Bold", 10.5)
            c.drawString(left, y, exam.get("exam_name") or "-")
            y -= 6 * mm

            table_data = [["Subject", "Marks", "Max", "Grade"]]
            for row in exam.get("rows", []):
                table_data.append([
                    str(row.get("subject") or "-"),
                    f"{float(row.get('obtained') or 0):g}",
                    f"{float(row.get('max') or 0):g}",
                    str(row.get("grade") or "-"),
                ])
            col_widths = [right - left - 3 * 28 * mm, 28 * mm, 28 * mm, 28 * mm]
            table = Table(table_data, colWidths=col_widths)
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#25324b")),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("ALIGN", (1, 0), (-1, -1), "CENTER"),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]))
            _, th = table.wrap(right - left, y)
            table.drawOn(c, left, y - th)
            y = y - th - 5 * mm

            c.setFont("Helvetica-Bold", 9.5)
            c.drawString(left, y, f"Total: {exam.get('total_obtained', 0):g} / {exam.get('total_max', 0):g}")
            c.drawRightString(
                right, y,
                f"Percentage: {exam.get('percentage', 0):.2f}%  |  Grade: {exam.get('overall_grade') or '-'}",
            )
            y -= 10 * mm

        y -= 4 * mm

    c.setFont("Helvetica-Bold", 11)
    c.drawRightString(right, max(y, 35 * mm), "Principal / Authorised Signatory")
    footer()

    c.showPage()
    c.save()
    return buf.getvalue()


def timetable_pdf(data: dict) -> bytes:
    """Render a timetable grid (by class or by teacher) to PDF bytes, landscape.

    Expected keys: school_name, subtitle, title, academic_year, days (list of
    day names), rows (list of {period_no, is_break, break_label, start_time,
    end_time, cells: {day: {"line1": subject, "line2": detail}}}).
    """
    buf = io.BytesIO()
    pagesize = landscape(A4)
    c = canvas.Canvas(buf, pagesize=pagesize)
    width, height = pagesize
    left = 15 * mm
    right = width - 15 * mm
    y = height - 15 * mm

    c.setFont("Helvetica-Bold", 16)
    c.drawCentredString(width / 2, y, data.get("school_name") or "School")
    y -= 7 * mm
    c.setFont("Helvetica-Bold", 12)
    c.drawCentredString(width / 2, y, data.get("subtitle") or "Timetable")
    y -= 6 * mm
    c.setFont("Helvetica", 10)
    c.drawCentredString(
        width / 2, y,
        f"{data.get('title') or '-'}    |    Academic Year: {data.get('academic_year') or '-'}",
    )
    y -= 9 * mm

    days = data.get("days", [])
    rows = data.get("rows", [])

    table_data = [["Period / Time"] + days]
    for row in rows:
        time_label = f"P{row.get('period_no')}"
        if row.get("start_time") and row.get("end_time"):
            time_label += f" ({row['start_time']}-{row['end_time']})"

        if row.get("is_break"):
            table_data.append([row.get("break_label") or "Break"] + [""] * len(days))
            continue

        cells = row.get("cells", {})
        row_cells = []
        for day in days:
            cell = cells.get(day)
            if cell:
                line1 = cell.get("line1") or ""
                line2 = cell.get("line2") or ""
                row_cells.append(" - ".join([part for part in [line1, line2] if part]) or "-")
            else:
                row_cells.append("-")
        table_data.append([time_label] + row_cells)

    col_widths = [32 * mm] + [(right - left - 32 * mm) / max(len(days), 1)] * len(days)
    table = Table(table_data, colWidths=col_widths)

    style_cmds = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#25324b")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    for idx, row in enumerate(rows, start=1):
        if row.get("is_break"):
            style_cmds.append(("SPAN", (1, idx), (len(days), idx)))
            style_cmds.append(("BACKGROUND", (0, idx), (-1, idx), colors.HexColor("#fef3c7")))
    table.setStyle(TableStyle(style_cmds))

    _, th = table.wrap(right - left, y)
    table.drawOn(c, left, y - th)

    c.setFont("Helvetica-Oblique", 8)
    c.drawString(left, 10 * mm, "This is a computer-generated timetable.")

    c.showPage()
    c.save()
    return buf.getvalue()


def _cert_header(c, width, y, data):
    """Common certificate header: optional logo + school name + issue line."""
    left = 25 * mm
    logo = data.get("logo_url")
    if _draw_image_safe(c, logo, left, y - 4 * mm, 20 * mm, 20 * mm):
        text_x = left + 24 * mm
    else:
        text_x = left
    c.setFont("Helvetica-Bold", 18)
    c.drawString(text_x, y + 8 * mm, data.get("school_name") or "School")
    c.setFont("Helvetica", 9)
    if data.get("school_address"):
        c.drawString(text_x, y + 2 * mm, str(data["school_address"]))
    return y - 14 * mm


def bonafide_certificate_pdf(data: dict) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    left = 25 * mm
    right = width - 25 * mm
    y = height - 30 * mm

    y = _cert_header(c, width, y, data)
    c.line(left, y, right, y)
    y -= 14 * mm

    c.setFont("Helvetica-Bold", 15)
    c.drawCentredString(width / 2, y, "BONAFIDE CERTIFICATE")
    y -= 16 * mm

    name = data.get("student_name") or "-"
    father = data.get("father_name") or data.get("guardian_name") or "-"
    klass = data.get("class_label") or "-"
    year = data.get("academic_year") or "-"
    adm = data.get("admission_no") or "-"
    dob = data.get("dob") or "-"

    body = (
        f"This is to certify that {name}, {('son/daughter of ' + father) if father != '-' else ''} "
        f"bearing Admission No. {adm}, is a bonafide student of this institution. "
        f"He/She is currently studying in Class {klass} during the academic year {year}. "
        f"His/Her date of birth as per our records is {dob}."
    )

    c.setFont("Helvetica", 11)
    # simple word-wrap
    words = body.split()
    line = ""
    text_y = y
    for w in words:
        trial = (line + " " + w).strip()
        if c.stringWidth(trial, "Helvetica", 11) > (right - left):
            c.drawString(left, text_y, line)
            text_y -= 8 * mm
            line = w
        else:
            line = trial
    if line:
        c.drawString(left, text_y, line)
    text_y -= 16 * mm

    c.drawString(left, text_y, f"Date of Issue: {data.get('issue_date') or '-'}")
    c.setFont("Helvetica-Bold", 11)
    c.drawRightString(right, 40 * mm, "Principal / Authorised Signatory")
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(left, 22 * mm, "This is a computer-generated certificate.")

    c.showPage()
    c.save()
    return buf.getvalue()


def transfer_certificate_pdf(data: dict) -> bytes:
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    left = 25 * mm
    right = width - 25 * mm
    y = height - 30 * mm

    y = _cert_header(c, width, y, data)
    c.line(left, y, right, y)
    y -= 12 * mm
    c.setFont("Helvetica-Bold", 15)
    c.drawCentredString(width / 2, y, "TRANSFER CERTIFICATE")
    y -= 6 * mm
    c.setFont("Helvetica", 9)
    c.drawRightString(right, y, f"TC No: {data.get('tc_no') or '-'}")
    y -= 12 * mm

    rows = [
        ("Student Name", data.get("student_name") or "-"),
        ("Admission No", data.get("admission_no") or "-"),
        ("Father's Name", data.get("father_name") or "-"),
        ("Mother's Name", data.get("mother_name") or "-"),
        ("Date of Birth", data.get("dob") or "-"),
        ("Nationality", data.get("nationality") or "-"),
        ("Class", data.get("class_label") or "-"),
        ("Academic Year", data.get("academic_year") or "-"),
        ("Date of Admission", data.get("admission_date") or "-"),
        ("Date of Leaving", data.get("leaving_date") or "-"),
        ("Reason for Leaving", data.get("reason") or "-"),
        ("Conduct", data.get("conduct") or "Good"),
    ]
    for label, value in rows:
        c.setFont("Helvetica-Bold", 10)
        c.drawString(left, y, f"{label}:")
        c.setFont("Helvetica", 10)
        c.drawString(left + 50 * mm, y, str(value))
        y -= 8.5 * mm

    c.setFont("Helvetica", 10)
    c.drawString(left, 40 * mm, f"Date of Issue: {data.get('issue_date') or '-'}")
    c.setFont("Helvetica-Bold", 11)
    c.drawRightString(right, 40 * mm, "Principal / Authorised Signatory")
    c.setFont("Helvetica-Oblique", 8)
    c.drawString(left, 22 * mm, "This is a computer-generated certificate.")

    c.showPage()
    c.save()
    return buf.getvalue()


def student_id_card_pdf(data: dict) -> bytes:
    """A portrait CR80-ish ID card (single card-sized page)."""
    card_w, card_h = 54 * mm, 86 * mm
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(card_w, card_h))

    # Header band
    c.setFillColor(colors.HexColor("#25324b"))
    c.rect(0, card_h - 16 * mm, card_w, 16 * mm, fill=1, stroke=0)
    logo_drawn = _draw_image_safe(c, data.get("logo_url"), 2 * mm, card_h - 14 * mm, 12 * mm, 12 * mm)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 7.5)
    school = (data.get("school_name") or "School")[:26]
    c.drawString((15 * mm) if logo_drawn else (3 * mm), card_h - 9 * mm, school)
    c.setFont("Helvetica", 5.5)
    c.drawString((15 * mm) if logo_drawn else (3 * mm), card_h - 12.5 * mm, "STUDENT IDENTITY CARD")

    # Photo
    photo_w, photo_h = 24 * mm, 28 * mm
    px = (card_w - photo_w) / 2
    py = card_h - 16 * mm - photo_h - 3 * mm
    c.setFillColor(colors.HexColor("#e2e8f0"))
    c.rect(px, py, photo_w, photo_h, fill=1, stroke=0)
    if not _draw_image_safe(c, data.get("photo_url"), px, py, photo_w, photo_h):
        c.setFillColor(colors.HexColor("#94a3b8"))
        c.setFont("Helvetica", 6)
        c.drawCentredString(card_w / 2, py + photo_h / 2, "No Photo")

    # Name
    c.setFillColor(colors.HexColor("#0f172a"))
    c.setFont("Helvetica-Bold", 9)
    c.drawCentredString(card_w / 2, py - 5 * mm, (data.get("student_name") or "-")[:28])

    # Details
    details = [
        ("Adm No", data.get("admission_no") or "-"),
        ("Class", data.get("class_label") or "-"),
        ("DOB", data.get("dob") or "-"),
        ("Blood", data.get("blood_group") or "-"),
        ("Guardian", data.get("guardian_name") or "-"),
        ("Phone", data.get("guardian_phone") or "-"),
    ]
    dy = py - 10 * mm
    for label, value in details:
        c.setFont("Helvetica-Bold", 6)
        c.setFillColor(colors.HexColor("#475569"))
        c.drawString(4 * mm, dy, f"{label}:")
        c.setFont("Helvetica", 6)
        c.setFillColor(colors.HexColor("#0f172a"))
        c.drawString(18 * mm, dy, str(value)[:22])
        dy -= 5 * mm

    c.showPage()
    c.save()
    return buf.getvalue()
