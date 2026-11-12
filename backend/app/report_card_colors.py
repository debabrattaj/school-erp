"""Shared score-band and accessible colour rules for report cards."""
import re

DEFAULT_MARK_COLORS = {"top": "#2563eb", "passed": "#15803d", "average": "#fbbf24", "failed": "#dc2626"}


def mark_palette(custom=None):
    custom = custom or {}
    return {key: value if isinstance(value := custom.get(key), str) and re.fullmatch(r"#[0-9a-fA-F]{6}", value) else default
            for key, default in DEFAULT_MARK_COLORS.items()}


def score_band(row, pass_percentage=40):
    if row.get("assessment_status") in ("Exempt", "Absent", "Not assessed") or not float(row.get("max") or 0):
        return None
    percent = row.get("percentage")
    if percent is None:
        percent = float(row.get("obtained") or 0) / float(row["max"]) * 100
    if str(row.get("grade") or "").strip().upper() == "F" or percent < pass_percentage:
        return "failed"
    if percent >= 90:
        return "top"
    if percent >= 75:
        return "passed"
    return "average"


def contrasting_text(hex_color):
    channels = [int(hex_color[i:i+2], 16)/255 for i in (1,3,5)]
    linear = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in channels]
    luminance = sum(v*w for v,w in zip(linear, (.2126,.7152,.0722)))
    return "#000000" if luminance > .179 else "#ffffff"


def table_mark_styles(data):
    from reportlab.lib import colors
    palette = mark_palette(data.get("mark_colors"))
    styles=[]
    for i,row in enumerate(data.get("rows", []), 1):
        band=score_band(row, data.get("pass_percentage", 40))
        if band:
            for column in (1,3):
                styles.extend([("BACKGROUND",(column,i),(column,i),colors.HexColor(palette[band])),
                               ("TEXTCOLOR",(column,i),(column,i),colors.HexColor(contrasting_text(palette[band])))])
    return styles
