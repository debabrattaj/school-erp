import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas

router = APIRouter(
    prefix="/module-layouts",
    tags=["Module Layouts"]
)


ALLOWED_MODULES = {
    "students": "Students",
    "teachers": "Teachers",
    "classes": "Classes",
    "fees": "Fees",
    "attendance": "Attendance",
    "exams": "Exams",
    "marks": "Marks",
}


def normalize_module_name(module_name: str) -> str:
    key = module_name.strip().lower()

    if key not in ALLOWED_MODULES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid module name. Allowed modules: {', '.join(ALLOWED_MODULES.values())}"
        )

    return ALLOWED_MODULES[key]


def build_layout_response(layout: models.ModuleLayout):
    try:
        parsed_layout = json.loads(layout.layout_json)
    except Exception:
        parsed_layout = []

    return {
        "id": layout.id,
        "module_name": layout.module_name,
        "layout_json": parsed_layout,
        "is_active": layout.is_active,
    }


@router.get("/{module_name}", response_model=schemas.ModuleLayoutResponse)
def get_module_layout(
    module_name: str,
    db: Session = Depends(get_db)
):
    normalized_module = normalize_module_name(module_name)

    layout = (
        db.query(models.ModuleLayout)
        .filter(
            models.ModuleLayout.module_name == normalized_module,
            models.ModuleLayout.is_active == True
        )
        .first()
    )

    if not layout:
        raise HTTPException(
            status_code=404,
            detail="Module layout not found"
        )

    return build_layout_response(layout)


@router.post("/{module_name}", response_model=schemas.ModuleLayoutResponse)
def create_module_layout(
    module_name: str,
    payload: schemas.ModuleLayoutSave,
    db: Session = Depends(get_db)
):
    normalized_module = normalize_module_name(module_name)

    existing_layout = (
        db.query(models.ModuleLayout)
        .filter(models.ModuleLayout.module_name == normalized_module)
        .first()
    )

    if existing_layout:
        raise HTTPException(
            status_code=400,
            detail="Layout already exists. Use PUT to update it."
        )

    layout = models.ModuleLayout(
        module_name=normalized_module,
        layout_json=json.dumps(payload.layout_json),
        is_active=True
    )

    db.add(layout)
    db.commit()
    db.refresh(layout)

    return build_layout_response(layout)


@router.put("/{module_name}", response_model=schemas.ModuleLayoutResponse)
def update_module_layout(
    module_name: str,
    payload: schemas.ModuleLayoutSave,
    db: Session = Depends(get_db)
):
    normalized_module = normalize_module_name(module_name)

    layout = (
        db.query(models.ModuleLayout)
        .filter(models.ModuleLayout.module_name == normalized_module)
        .first()
    )

    if layout:
        layout.layout_json = json.dumps(payload.layout_json)
        layout.is_active = True
    else:
        layout = models.ModuleLayout(
            module_name=normalized_module,
            layout_json=json.dumps(payload.layout_json),
            is_active=True
        )

        db.add(layout)

    db.commit()
    db.refresh(layout)

    return build_layout_response(layout)


@router.delete("/{module_name}")
def delete_module_layout(
    module_name: str,
    db: Session = Depends(get_db)
):
    normalized_module = normalize_module_name(module_name)

    layout = (
        db.query(models.ModuleLayout)
        .filter(models.ModuleLayout.module_name == normalized_module)
        .first()
    )

    if not layout:
        raise HTTPException(
            status_code=404,
            detail="Module layout not found"
        )

    layout.is_active = False
    db.commit()

    return {
        "message": f"{normalized_module} layout disabled successfully"
    }