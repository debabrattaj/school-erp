"""Validated rich document templates. Never render arbitrary HTML or fetch image URLs."""
import base64
import io
import json
import re
from xml.sax.saxutils import escape
from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer, PageBreak, Image, HRFlowable

FIELDS = {"school_name", "student_name", "admission_no", "class_label", "exam_name", "academic_year", "total_obtained", "total_max", "percentage", "overall_grade", "result", "rank", "attendance_percent"}
NODES = {"doc", "paragraph", "heading", "text", "hardBreak", "horizontalRule", "bulletList", "orderedList", "listItem", "blockquote", "table", "tableRow", "tableCell", "tableHeader", "image", "reportField", "reportMarks", "pageBreak"}
FONTS = {"Arial":"Helvetica", "Times New Roman":"Times-Roman", "Courier New":"Courier"}

def colour(value):
    if re.fullmatch(r"#[0-9a-fA-F]{6}", str(value)): return value
    match = re.fullmatch(r"rgb\(\s*(\d{1,3}),\s*(\d{1,3}),\s*(\d{1,3})\s*\)", str(value))
    if match and all(int(n) <= 255 for n in match.groups()): return "#" + "".join(f"{int(n):02x}" for n in match.groups())
    raise ValueError("Use a valid document colour")

def image_bytes(src):
    if not isinstance(src, str) or not re.match(r"^data:image/(png|jpeg);base64,", src): raise ValueError("Images must be uploaded PNG or JPEG files")
    try:
        raw = base64.b64decode(src.split(",", 1)[1], validate=True)
        if len(raw) > 1024*1024: raise ValueError("Image exceeds 1 MB")
        with PILImage.open(io.BytesIO(raw)) as image:
            if image.format not in ("PNG", "JPEG") or image.width*image.height > 16000000: raise ValueError("Image is too large or unsupported")
            image.verify()
        return raw
    except Exception as error:
        raise ValueError("Invalid image; use PNG or JPEG up to 1 MB and 16 megapixels") from error

def validate_document(document):
    if document is None: return None
    if len(json.dumps(document)) > 4_500_000: raise ValueError("Document exceeds 4.5 MB")
    if not isinstance(document, dict) or document.get("type") != "doc": raise ValueError("Invalid document")
    count = 0
    def walk(node, depth=0, parent=None):
        nonlocal count
        count += 1
        if count > 6000 or depth > 16: raise ValueError("Document is too complex")
        if not isinstance(node, dict) or node.get("type") not in NODES: raise ValueError("Unsupported document element")
        kind = node["type"]
        if kind == "doc" and parent is not None: raise ValueError("Nested document")
        if kind in ("pageBreak", "reportMarks") and parent != "doc": raise ValueError("Place page breaks and automatic marks outside tables and lists")
        attrs = node.get("attrs") or {}
        if not isinstance(attrs, dict): raise ValueError("Invalid document attributes")
        if attrs.get("textAlign") not in (None,"left","center","right","justify"): raise ValueError("Invalid alignment")
        if kind == "heading" and attrs.get("level", 1) not in (1,2,3): raise ValueError("Invalid heading level")
        if kind == "reportField" and attrs.get("field") not in FIELDS: raise ValueError("Unknown automatic field")
        if kind == "image":
            image_bytes(attrs.get("src"))
            if not isinstance(attrs.get("width", 180), (int,float)) or not 40 <= attrs.get("width",180) <= 480: raise ValueError("Invalid image width")
        if kind in ("tableCell", "tableHeader"):
            for key in ("colspan", "rowspan"):
                if not isinstance(attrs.get(key,1), int) or not 1 <= attrs.get(key,1) <= 20: raise ValueError("Invalid cell span")
            if attrs.get("backgroundColor"): colour(attrs["backgroundColor"])
            if attrs.get("colwidth") is not None:
                if not isinstance(attrs["colwidth"],list) or len(attrs["colwidth"])>20 or any(not isinstance(n,int) or not 1<=n<=2000 for n in attrs["colwidth"]): raise ValueError("Invalid column widths")
        if kind == "text" and (not isinstance(node.get("text"), str) or len(node["text"]) > 30000): raise ValueError("Invalid text")
        marks=node.get("marks", [])
        if not isinstance(marks,list): raise ValueError("Invalid text formatting")
        for mark in marks:
            if not isinstance(mark,dict) or mark.get("type") not in ("bold","italic","underline","strike","textStyle"): raise ValueError("Unsupported text formatting")
            a=mark.get("attrs") or {}
            if not isinstance(a,dict): raise ValueError("Invalid text style")
            if mark["type"]=="textStyle":
                if set(a)-{"color","backgroundColor","fontFamily","fontSize","lineHeight"}: raise ValueError("Unsupported text style")
                for k in ("color","backgroundColor"):
                    if a.get(k): colour(a[k])
                if a.get("fontFamily") and a["fontFamily"] not in FONTS: raise ValueError("Unsupported font")
                if a.get("fontSize") and not re.fullmatch(r"(?:[8-9]|[1-3][0-9]|4[0-8])(?:pt|px)", str(a["fontSize"])): raise ValueError("Font size must be 8–48 pt/px")
                if a.get("lineHeight") and str(a["lineHeight"]) not in ("1","1.15","1.4","1.5","2"): raise ValueError("Invalid line spacing")
        children=node.get("content",[])
        if not isinstance(children,list): raise ValueError("Invalid document children")
        if any(not isinstance(child,dict) for child in children): raise ValueError("Invalid document element")
        allowed_children={
            "doc":NODES-{"doc","text","hardBreak","reportField","tableRow","tableCell","tableHeader","listItem"},
            "paragraph":{"text","hardBreak","reportField"}, "heading":{"text","hardBreak","reportField"},
            "table":{"tableRow"}, "tableRow":{"tableCell","tableHeader"},
            "bulletList":{"listItem"}, "orderedList":{"listItem"},
            "tableCell":{"paragraph","heading","bulletList","orderedList","blockquote","image","table"},
            "tableHeader":{"paragraph","heading","bulletList","orderedList","blockquote","image","table"},
            "listItem":{"paragraph","heading","bulletList","orderedList","blockquote"},
        }
        if kind in allowed_children and any(child.get("type") not in allowed_children[kind] for child in children): raise ValueError("Unsupported document structure")
        if kind=="table":
            if not children or len(children)>100 or any(r.get("type")!="tableRow" for r in children): raise ValueError("Invalid table rows")
            if any(not isinstance(r.get("content"),list) or not r["content"] or len(r["content"])>20 or any(not isinstance(c,dict) or c.get("type") not in ("tableCell","tableHeader") for c in r["content"]) for r in children): raise ValueError("Invalid table cells")
        for child in children: walk(child,depth+1,kind)
    walk(document)
    return document

def document_pdf(data, document):
    validate_document(document)
    from app.report_card_colors import table_mark_styles, score_band, mark_palette, contrasting_text
    stream=io.BytesIO()
    width=A4[0]-88
    base=ParagraphStyle("document",fontName="Helvetica",fontSize=11,leading=15.4,spaceAfter=8,textColor=colors.HexColor("#263345"))
    def inline(node):
        kind=node["type"]
        if kind=="hardBreak": return "<br/>"
        if kind=="reportField":
            value=data.get(node.get("attrs",{}).get("field"))
            if isinstance(value,float): value=f"{value:.2f}".rstrip("0").rstrip(".")
            result=escape(str(value if value is not None else "—"))
        elif kind=="text": result=escape(node.get("text", "")).replace("\n","<br/>")
        else: result="".join(inline(c) for c in node.get("content",[]))
        for mark in node.get("marks",[]):
            tag={"bold":"b","italic":"i","underline":"u","strike":"strike"}.get(mark["type"])
            if tag: result=f"<{tag}>{result}</{tag}>"
            if mark["type"]=="textStyle":
                a=mark.get("attrs") or {};params=[]
                if a.get("fontFamily"): params.append(f'face="{FONTS[a["fontFamily"]]}"')
                if a.get("fontSize"):
                    size=float(a["fontSize"][:-2])*(.75 if a["fontSize"].endswith("px") else 1)
                    params.append(f'size="{size}"')
                if a.get("color"): params.append(f'color="{colour(a["color"])}"')
                if a.get("backgroundColor"): params.append(f'backColor="{colour(a["backgroundColor"])}"')
                result=f'<font {" ".join(params)}>{result}</font>'
        return result
    def para(node,prefix=""):
        attrs=node.get("attrs") or {};size={1:24,2:18,3:14}.get(attrs.get("level"),11) if node["type"]=="heading" else 11
        sizes=[size];spacing=[]
        def scan(n):
            for m in n.get("marks",[]):
                a=m.get("attrs") or {};v=a.get("fontSize")
                if v: sizes.append(float(v[:-2])*(.75 if v.endswith("px") else 1))
                if a.get("lineHeight"): spacing.append(float(a["lineHeight"]))
            for c in n.get("content",[]): scan(c)
        scan(node)
        style=ParagraphStyle("block",parent=base,fontSize=size,fontName="Helvetica-Bold" if node["type"]=="heading" else "Helvetica",leading=max(sizes)*max(spacing or [1.4]),alignment={"left":0,"center":1,"right":2,"justify":4}.get(attrs.get("textAlign"),0))
        return Paragraph(prefix+inline(node) or "<br/>",style)
    def blocks(nodes,available=width):
        output=[]
        for node in nodes:
            kind=node["type"];attrs=node.get("attrs") or {};children=node.get("content",[])
            if kind in ("paragraph","heading"): output.append(para(node))
            elif kind=="horizontalRule": output.extend([HRFlowable(width="100%",thickness=.6,color=colors.HexColor("#94a3b8")),Spacer(1,8)])
            elif kind=="pageBreak": output.append(PageBreak())
            elif kind=="image":
                raw=image_bytes(attrs["src"])
                with PILImage.open(io.BytesIO(raw)) as im: iw,ih=im.size
                w=min(attrs.get("width",180)*.75,available);h=w*ih/iw
                if h>600: w*=600/h;h=600
                image=Image(io.BytesIO(raw),width=w,height=h);image.hAlign="LEFT";output.extend([image,Spacer(1,8)])
            elif kind in ("bulletList","orderedList"):
                for index,item in enumerate(children):
                    parts=item.get("content",[])
                    if parts and parts[0]["type"]=="paragraph": output.append(para(parts[0],"• " if kind=="bulletList" else f"{index+1}. "));parts=parts[1:]
                    output.extend(blocks(parts,available))
            elif kind in ("listItem","blockquote"): output.extend(blocks(children,available))
            elif kind=="table":
                occupied={};origins=[];ncols=0
                for r,row in enumerate(children):
                    col=0
                    for cell in row["content"]:
                        while (r,col) in occupied: col+=1
                        a=cell.get("attrs") or {};cs=a.get("colspan",1);rs=a.get("rowspan",1)
                        if col+cs>20 or r+rs>len(children): raise ValueError("Table cell span exceeds table bounds")
                        for y in range(r,r+rs):
                            for x in range(col,col+cs):
                                if (y,x) in occupied: raise ValueError("Overlapping table cells")
                                occupied[y,x]=True
                        origins.append((r,col,cs,rs,cell));col+=cs;ncols=max(ncols,col)
                grid=[[""]*ncols for _ in children];commands=[("GRID",(0,0),(-1,-1),.5,colors.HexColor("#cbd5e1")),("VALIGN",(0,0),(-1,-1),"TOP"),("LEFTPADDING",(0,0),(-1,-1),7),("RIGHTPADDING",(0,0),(-1,-1),7),("TOPPADDING",(0,0),(-1,-1),7),("BOTTOMPADDING",(0,0),(-1,-1),7)]
                weights=[0]*ncols
                for r,c,cs,rs,cell in origins:
                    for i,value in enumerate((cell.get("attrs") or {}).get("colwidth") or []):
                        if i<cs: weights[c+i]=max(weights[c+i],value)
                weights=[w or 120 for w in weights];widths=[available*w/sum(weights) for w in weights]
                for r,c,cs,rs,cell in origins:
                    grid[r][c]=blocks(cell.get("content",[]),sum(widths[c:c+cs])-14) or ""
                    if cs>1 or rs>1: commands.append(("SPAN",(c,r),(c+cs-1,r+rs-1)))
                    bg=(cell.get("attrs") or {}).get("backgroundColor") or ("#eef2f7" if cell["type"]=="tableHeader" else None)
                    if bg: commands.append(("BACKGROUND",(c,r),(c+cs-1,r+rs-1),colors.HexColor(colour(bg))))
                table=Table(grid,colWidths=widths,hAlign="LEFT",splitInRow=1)
                table.setStyle(TableStyle(commands));output.extend([table,Spacer(1,10)])
            elif kind=="reportMarks":
                rows=[[Paragraph(x,base) for x in ("Subject","Marks","Maximum","Grade","Remarks")]]
                palette=mark_palette(data.get("mark_colors"))
                for row in data.get("rows",[]):
                    band=score_band(row,data.get("pass_percentage",40))
                    highlighted=ParagraphStyle("highlighted",parent=base,textColor=colors.HexColor(contrasting_text(palette[band]))) if band else base
                    rows.append([Paragraph(escape(str(row.get(k) if row.get(k) is not None else "—")),highlighted if k in ("obtained","grade") else base) for k in ("subject","obtained","max","grade","remarks")])
                if len(rows)==1: rows.append([Paragraph("No marks recorded",base),"","","",""])
                table=Table(rows,colWidths=[available*n for n in (.30,.13,.13,.11,.33)],repeatRows=1,splitInRow=1)
                table.setStyle(TableStyle([("GRID",(0,0),(-1,-1),.5,colors.HexColor("#cbd5e1")),("BACKGROUND",(0,0),(-1,0),colors.HexColor("#eef2f7")),("VALIGN",(0,0),(-1,-1),"TOP"),("TOPPADDING",(0,0),(-1,-1),6),("BOTTOMPADDING",(0,0),(-1,-1),6)]+table_mark_styles(data)))
                output.extend([table,Spacer(1,10)])
        return output
    def footer(canvas,doc):
        canvas.saveState();canvas.setFont("Helvetica",8);canvas.setFillColor(colors.HexColor("#64748b"));canvas.drawRightString(A4[0]-44,24,f"Page {doc.page}");canvas.restoreState()
    doc=SimpleDocTemplate(stream,pagesize=A4,leftMargin=44,rightMargin=44,topMargin=40,bottomMargin=40,title="School report card")
    doc.build(blocks(document.get("content",[])) or [Spacer(1,1)],onFirstPage=footer,onLaterPages=footer)
    return stream.getvalue()
