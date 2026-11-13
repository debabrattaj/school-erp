import json
import io
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, ConfigDict, field_validator
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.database import get_db
from app.models import ReportCardTemplate, User
from app.security import require_roles

router = APIRouter()
staff = require_roles(["Admin", "Principal", "Teacher"])


class MarkColours(BaseModel):
    model_config = ConfigDict(extra="forbid")
    top: str = Field("#2563eb", pattern=r"^#[0-9a-fA-F]{6}$")
    passed: str = Field("#15803d", pattern=r"^#[0-9a-fA-F]{6}$")
    average: str = Field("#fbbf24", pattern=r"^#[0-9a-fA-F]{6}$")
    failed: str = Field("#dc2626", pattern=r"^#[0-9a-fA-F]{6}$")


class TextFormat(BaseModel):
    model_config = ConfigDict(extra="forbid")
    font: Literal["sans", "serif", "mono"] = "sans"
    size: int = Field(12, ge=8, le=32)
    bold: bool = False
    italic: bool = False
    underline: bool = False
    color: str = Field("#263345", pattern=r"^#[0-9a-fA-F]{6}$")
    align: Literal["left", "center", "right", "justify"] = "left"
    line_height: float = Field(1.4, ge=1, le=2)


class ReportDesign(BaseModel):
    model_config = ConfigDict(extra="forbid")
    document_json: dict | None = None
    template: Literal["heritage", "scholar", "horizon", "ledger", "studio"] = "heritage"
    text_styles: dict[Literal["title", "feedback_title", "feedback_prompt", "teacher_label", "coordinator_label", "principal_label"], TextFormat] = Field(default_factory=dict)
    title: str = Field("Report Card", min_length=1, max_length=80)
    accent_color: str | None = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")
    font_family: Literal["default", "sans", "serif"] = "default"
    feedback_title: str = Field("Teacher feedback & next steps", max_length=100)
    feedback_prompt: str = Field("Strengths, areas to develop and agreed learning goals", max_length=250)
    teacher_label: str = Field("Class Teacher", max_length=60)
    coordinator_label: str = Field("Exam Coordinator", max_length=60)
    principal_label: str = Field("Principal", max_length=60)
    show_rank: bool = True
    show_attendance: bool = True
    show_feedback: bool = True
    mark_colors: MarkColours = Field(default_factory=MarkColours)

    @field_validator("document_json")
    @classmethod
    def validate_rich_document(cls, value):
        from app.report_document import validate_document
        return validate_document(value)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value):
        if not value.strip(): raise ValueError("Enter a report title")
        return value.strip()


class SavedDesignInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: str = Field(min_length=1, max_length=100)
    configuration: ReportDesign
    revision: int | None = Field(None, ge=1)

    @field_validator("name")
    @classmethod
    def trim_name(cls, value):
        if not value.strip(): raise ValueError("Enter a template name")
        return value.strip()


def serialize(row):
    return {"id": row.id, "name": row.name, "revision": row.revision,
            "configuration": json.loads(row.configuration)}


@router.get("/templates")
def list_templates(db: Session = Depends(get_db), user: User = Depends(staff)):
    # get_db is already tenant-scoped; no cross-school IDs are accepted.
    return [serialize(row) for row in db.query(ReportCardTemplate).order_by(ReportCardTemplate.name).all()]


@router.post("/templates", status_code=201)
def create_template(payload: SavedDesignInput, db: Session = Depends(get_db), user: User = Depends(staff)):
    row = ReportCardTemplate(name=payload.name, configuration=payload.configuration.model_dump_json(), revision=1)
    db.add(row)
    try: db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A template with this name already exists. Use a different name or open it to edit.")
    db.refresh(row)
    return serialize(row)


@router.put("/templates/{template_id}")
def update_template(template_id: int, payload: SavedDesignInput, db: Session = Depends(get_db), user: User = Depends(staff)):
    row = db.query(ReportCardTemplate).filter_by(id=template_id).first()
    if not row: raise HTTPException(404, "Saved template not found")
    if payload.revision is None: raise HTTPException(409, "Reopen the template before saving changes.")
    try:
        changed = db.query(ReportCardTemplate).filter_by(id=template_id, revision=payload.revision).update(
            {"name": payload.name, "configuration": payload.configuration.model_dump_json(), "revision": payload.revision+1}, synchronize_session=False)
        if not changed:
            db.rollback()
            raise HTTPException(409, "Someone else updated this template. Reopen it or save your edits as a new template.")
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A template with this name already exists.")
    db.refresh(row)
    return serialize(row)


@router.post("/report-card-preview")
def download_custom_report(design: ReportDesign, student_id: int, exam_id: int,
                           db: Session = Depends(get_db), user: User = Depends(staff)):
    from app.routes.marks import build_report_card_data
    from app.pdf import report_card_pdf
    data = build_report_card_data(db, student_id, exam_id)
    data["design"] = design.model_dump()
    data["mark_colors"] = design.mark_colors.model_dump()
    try:
        result = report_card_pdf(data, design.template)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    return StreamingResponse(io.BytesIO(result), media_type="application/pdf",
                             headers={"Content-Disposition": 'attachment; filename="report-card.pdf"'})
