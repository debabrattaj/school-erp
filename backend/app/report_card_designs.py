"""Five paginated, print-ready report card designs using shared academic data."""
import io
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, KeepTogether, Image

DESIGN_THEMES = {
    "heritage": ("#1e3554", "#f6f2e9", "Times-Bold"),
    "scholar": ("#195548", "#edf5f0", "Helvetica-Bold"),
    "horizon": ("#086879", "#eaf6f8", "Helvetica-Bold"),
    "ledger": ("#252525", "#f3f3f3", "Helvetica-Bold"),
    "studio": ("#73415b", "#f7eff4", "Helvetica-Bold"),
}


def designed_report_card(data, template):
    from app.pdf import _resolve_upload_path, _report_card_facts
    from app.report_card_colors import mark_palette, score_band, contrasting_text, table_mark_styles
    palette = mark_palette(data.get("mark_colors"))
    ink_hex, tint_hex, heading_font = DESIGN_THEMES[template]
    ink, tint = colors.HexColor(ink_hex), colors.HexColor(tint_hex)
    muted, rule = colors.HexColor("#526174"), colors.HexColor("#d8dfe7")
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=20*mm, rightMargin=20*mm,
                            topMargin=18*mm, bottomMargin=19*mm,
                            title=f"Report Card - {data.get('student_name') or 'Student'}", author="Schoolment")
    width = A4[0]-40*mm
    base = ParagraphStyle("body", fontName="Helvetica", fontSize=9, leading=13, textColor=colors.HexColor("#263345"), splitLongWords=True)

    def p(text, **kw):
        if "fontSize" in kw and "leading" not in kw: kw["leading"] = kw["fontSize"] * 1.4
        return Paragraph(escape(str(text if text is not None else "-")).replace("\n", "<br/>"), ParagraphStyle("cell", parent=base, **kw))

    def table(rows, widths, background=None, padding=6):
        t = Table(rows, colWidths=widths, hAlign="LEFT")
        commands = [("VALIGN", (0,0),(-1,-1),"TOP"),
                    ("LEFTPADDING",(0,0),(-1,-1),padding),("RIGHTPADDING",(0,0),(-1,-1),padding),
                    ("TOPPADDING",(0,0),(-1,-1),padding),("BOTTOMPADDING",(0,0),(-1,-1),padding)]
        if background: commands.append(("BACKGROUND",(0,0),(-1,-1),background))
        t.setStyle(TableStyle(commands))
        return t

    story=[]
    logo = None
    logo_path = _resolve_upload_path(data.get("logo_url"))
    if logo_path:
        try:
            from reportlab.lib.utils import ImageReader
            iw, ih = ImageReader(logo_path).getSize()
            ratio = min(18*mm/iw,18*mm/ih)
            logo = Image(logo_path,width=iw*ratio,height=ih*ratio)
        except Exception:
            logo = None
    school = data.get("school_name") or "School"
    if template == "heritage":
        if logo: logo.hAlign="CENTER"; story.extend([logo,Spacer(1,3*mm)])
        story.append(p(school,fontName=heading_font,fontSize=22,leading=26,alignment=1,textColor=ink))
        story.append(Spacer(1,3*mm))
    else:
        white = template == "scholar"
        heading = p(school,fontName=heading_font,fontSize=18,leading=22,textColor=colors.white if white else ink)
        cells = [[logo,heading]] if logo else [[heading]]
        story.append(table(cells,[24*mm,width-24*mm] if logo else [width],ink if white else tint,8))
    story.append(Spacer(1,3*mm))
    story.append(p("ACADEMIC REPORT CARD",fontName=heading_font,fontSize=16,leading=21,textColor=ink,
                   alignment=1 if template in ("heritage","studio") else 2 if template=="ledger" else 0))
    story.append(p(f"{data.get('exam_name') or '-'}  |  Academic year {data.get('academic_year') or '-'}",
                   alignment=1 if template in ("heritage","studio") else 0,textColor=muted,fontSize=9))
    story.append(Spacer(1,3*mm))
    details = [("STUDENT NAME",data.get("student_name")),("ADMISSION NUMBER",data.get("admission_no")),
               ("CLASS / SECTION",data.get("class_label")),("ACADEMIC YEAR",data.get("academic_year"))]
    info=[]
    for i in (0,2):
        info.append([[p(k,fontSize=7,textColor=muted),p(v or "-",fontName="Helvetica-Bold",fontSize=10)] for k,v in details[i:i+2]])
    story.append(table(info,[width/2]*2,tint))
    story.append(Spacer(1,3*mm))
    story.append(p("SUBJECT PERFORMANCE",fontName="Helvetica-Bold",fontSize=9,textColor=ink,spaceAfter=6))
    headers=["Subject","Marks","Maximum","Grade","Remarks"]
    rows=[[p(h,fontName="Helvetica-Bold",fontSize=8,textColor=ink if template=="ledger" else colors.white) for h in headers]]
    for row in data.get("rows",[]):
        band = score_band(row, data.get("pass_percentage", 40))
        mark_text = colors.HexColor(contrasting_text(palette[band])) if band else colors.HexColor("#263345")
        status=row.get("assessment_status")
        remarks=row.get("remarks") or "-"
        if status and status not in ("Present","Assessed"):
            remarks=f"{status}. {remarks}" if remarks!="-" else status
        rows.append([p(row.get("subject") or "-"),p(f"{float(row.get('obtained') or 0):g}",alignment=1,textColor=mark_text),
                     p(f"{float(row.get('max') or 0):g}",alignment=1),p(row.get("grade") or "-",alignment=1,fontName="Helvetica-Bold",textColor=mark_text),p(remarks,fontSize=8,leading=11)])
    marks=Table(rows,colWidths=[width*.30,width*.13,width*.13,width*.11,width*.33],repeatRows=1,hAlign="LEFT")
    marks.setStyle(TableStyle([("BACKGROUND",(0,0),(-1,0),tint if template=="ledger" else ink),
        ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white,colors.HexColor("#f8fafc")]),
        ("GRID",(0,0),(-1,-1),.35,rule),("VALIGN",(0,0),(-1,-1),"TOP"),
        ("LEFTPADDING",(0,0),(-1,-1),7),("RIGHTPADDING",(0,0),(-1,-1),7),
        ("TOPPADDING",(0,0),(-1,-1),4 if template=="ledger" else 6),
        ("BOTTOMPADDING",(0,0),(-1,-1),4 if template=="ledger" else 6)]))
    marks.setStyle(TableStyle(table_mark_styles(data)))
    story.extend([marks,Spacer(1,4*mm)])
    labels = {"top":"Top marks", "passed":"Passed", "average":"Average band", "failed":"Failed"}
    # A compact, horizontal key keeps colours interpretable on paper.
    legend = table([[p(label,fontSize=8,alignment=1,textColor=colors.HexColor(contrasting_text(palette[key]))) for key,label in labels.items()]], [width/4]*4,padding=5)
    legend.setStyle(TableStyle([("BACKGROUND",(i,0),(i,0),colors.HexColor(palette[key])) for i,key in enumerate(labels)]))
    story.extend([legend,Spacer(1,2*mm),p(f"Top: 90%+. Passed: 75-89.99%. Average band: passing scores below 75% (not the class average). Failed: below {data.get('pass_percentage',40):g}% or grade F. Failure rules take priority. Absent/exempt subjects are not colour-coded.",fontSize=7,leading=10,textColor=muted),Spacer(1,3*mm)])
    facts=_report_card_facts(data)
    # Missing attendance/rank remains explicitly unknown, never fabricated.
    if not any(k=="Class Rank" for k,v in facts): facts.append(("Class Rank","Not available"))
    if not any(k=="Attendance" for k,v in facts): facts.append(("Attendance","Not recorded"))
    columns=2 if template=="horizon" else 3
    fact_cells=[[p(k.upper(),fontSize=7,textColor=muted),p(v,fontName="Helvetica-Bold",fontSize=13,leading=18,textColor=ink)] for k,v in facts]
    fact_rows=[fact_cells[i:i+columns] for i in range(0,len(fact_cells),columns)]
    for row in fact_rows: row.extend([""]*(columns-len(row)))
    summary=table(fact_rows,[width/columns]*columns,tint)
    story.extend([KeepTogether([p("RESULT SUMMARY",fontName="Helvetica-Bold",fontSize=9,textColor=ink,spaceAfter=6),summary]),Spacer(1,3*mm)])
    feedback=table([[p("TEACHER FEEDBACK & NEXT STEPS",fontName="Helvetica-Bold",fontSize=9,textColor=ink)],
                    [p("Strengths, areas to develop and agreed learning goals",fontSize=8,textColor=muted)],
                    [""],[""]],[width],padding=5)
    feedback.setStyle(TableStyle([("BOX",(0,0),(-1,-1),.5,rule),("LINEBELOW",(0,2),(0,3),.4,rule),
                                  ("TOPPADDING",(0,2),(0,3),8)]))
    signatures=table([[p(label,fontSize=8,alignment=1) for label in ("Class Teacher","Exam Coordinator","Principal")]],[width/3]*3)
    signatures.setStyle(TableStyle([("LINEABOVE",(0,0),(-1,0),.5,muted)]))
    story.append(KeepTogether([feedback,Spacer(1,10*mm),signatures]))

    def decorate(c, document):
        c.saveState()
        if template=="heritage":
            c.setStrokeColor(colors.HexColor("#a48b55")); c.setLineWidth(.7)
            for inset in (10,12): c.rect(inset*mm,inset*mm,A4[0]-2*inset*mm,A4[1]-2*inset*mm)
        elif template=="horizon":
            c.setFillColor(ink);c.rect(10*mm,12*mm,2*mm,A4[1]-24*mm,fill=1,stroke=0)
        else:
            c.setStrokeColor(ink);c.setLineWidth(3 if template!="ledger" else 1);c.line(20*mm,A4[1]-12*mm,A4[0]-20*mm,A4[1]-12*mm)
        c.setFillColor(muted);c.setFont("Helvetica",7)
        c.drawString(20*mm,13*mm,"Academic record | Verify and sign before issue")
        c.drawRightString(A4[0]-20*mm,13*mm,f"Page {document.page}")
        c.restoreState()
    doc.build(story,onFirstPage=decorate,onLaterPages=decorate)
    return buf.getvalue()
