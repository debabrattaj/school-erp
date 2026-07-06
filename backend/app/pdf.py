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

from reportlab.lib.pagesizes import A4  # noqa: E402
from reportlab.lib.units import mm  # noqa: E402
from reportlab.lib import colors  # noqa: E402
from reportlab.pdfgen import canvas  # noqa: E402
from reportlab.platypus import Table, TableStyle  # noqa: E402

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
