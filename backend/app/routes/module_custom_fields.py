from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas

router = APIRouter(
    prefix="/module-custom-fields",
    tags=["Module Custom Fields"]
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


def check_record_exists(module_name: str, record_id: int, db: Session):
    """
    Checks whether the record exists in its own module table.
    This protects us from saving custom fields for fake records.
    """

    if module_name == "Students":
        record = (
            db.query(models.Student)
            .filter(models.Student.id == record_id)
            .first()
        )

    elif module_name == "Teachers":
        record = (
            db.query(models.Teacher)
            .filter(models.Teacher.id == record_id)
            .first()
        )

    elif module_name == "Classes":
        record = (
            db.query(models.SchoolClass)
            .filter(models.SchoolClass.id == record_id)
            .first()
        )

    elif module_name == "Fees":
        record = (
            db.query(models.Fee)
            .filter(models.Fee.id == record_id)
            .first()
        )

    elif module_name == "Attendance":
        record = (
            db.query(models.Attendance)
            .filter(models.Attendance.id == record_id)
            .first()
        )

    elif module_name == "Exams":
        record = (
            db.query(models.Exam)
            .filter(models.Exam.id == record_id)
            .first()
        )

    elif module_name == "Marks":
        record = (
            db.query(models.Mark)
            .filter(models.Mark.id == record_id)
            .first()
        )

    else:
        record = None

    if not record:
        raise HTTPException(
            status_code=404,
            detail=f"{module_name} record not found"
        )

    return record


@router.get(
    "/{module_name}/{record_id}",
    response_model=list[schemas.ModuleCustomFieldValueResponse]
)
def get_module_custom_fields(
    module_name: str,
    record_id: int,
    db: Session = Depends(get_db)
):
    normalized_module = normalize_module_name(module_name)
    check_record_exists(normalized_module, record_id, db)

    values = (
        db.query(models.ModuleCustomFieldValue)
        .filter(
            models.ModuleCustomFieldValue.module_name == normalized_module,
            models.ModuleCustomFieldValue.record_id == record_id
        )
        .order_by(models.ModuleCustomFieldValue.id.asc())
        .all()
    )

    return values


@router.post(
    "/{module_name}/{record_id}",
    response_model=list[schemas.ModuleCustomFieldValueResponse]
)
def save_module_custom_fields(
    module_name: str,
    record_id: int,
    payload: schemas.ModuleCustomFieldBulkSave,
    db: Session = Depends(get_db)
):
    normalized_module = normalize_module_name(module_name)
    check_record_exists(normalized_module, record_id, db)

    existing_values = (
        db.query(models.ModuleCustomFieldValue)
        .filter(
            models.ModuleCustomFieldValue.module_name == normalized_module,
            models.ModuleCustomFieldValue.record_id == record_id
        )
        .all()
    )

    existing_map = {
        item.field_key: item
        for item in existing_values
    }

    saved_items = []

    for item in payload.values:
        field_key = item.field_key.strip()

        if not field_key:
            continue

        if field_key in existing_map:
            custom_value = existing_map[field_key]
            custom_value.field_label = item.field_label
            custom_value.field_type = item.field_type
            custom_value.field_value = item.field_value
        else:
            custom_value = models.ModuleCustomFieldValue(
                module_name=normalized_module,
                record_id=record_id,
                field_key=field_key,
                field_label=item.field_label,
                field_type=item.field_type,
                field_value=item.field_value
            )

            db.add(custom_value)

        saved_items.append(custom_value)

    db.commit()

    for item in saved_items:
        db.refresh(item)

    return saved_items


@router.put(
    "/{module_name}/{record_id}",
    response_model=list[schemas.ModuleCustomFieldValueResponse]
)
def update_module_custom_fields(
    module_name: str,
    record_id: int,
    payload: schemas.ModuleCustomFieldBulkSave,
    db: Session = Depends(get_db)
):
    return save_module_custom_fields(
        module_name=module_name,
        record_id=record_id,
        payload=payload,
        db=db
    )


@router.delete("/{module_name}/{record_id}/{field_key}")
def delete_module_custom_field(
    module_name: str,
    record_id: int,
    field_key: str,
    db: Session = Depends(get_db)
):
    normalized_module = normalize_module_name(module_name)
    check_record_exists(normalized_module, record_id, db)

    custom_value = (
        db.query(models.ModuleCustomFieldValue)
        .filter(
            models.ModuleCustomFieldValue.module_name == normalized_module,
            models.ModuleCustomFieldValue.record_id == record_id,
            models.ModuleCustomFieldValue.field_key == field_key
        )
        .first()
    )

    if not custom_value:
        raise HTTPException(
            status_code=404,
            detail="Custom field value not found"
        )

    db.delete(custom_value)
    db.commit()

    return {
        "message": "Custom field value deleted successfully"
    }


@router.delete("/{module_name}/{record_id}")
def delete_all_module_custom_fields(
    module_name: str,
    record_id: int,
    db: Session = Depends(get_db)
):
    normalized_module = normalize_module_name(module_name)
    check_record_exists(normalized_module, record_id, db)

    values = (
        db.query(models.ModuleCustomFieldValue)
        .filter(
            models.ModuleCustomFieldValue.module_name == normalized_module,
            models.ModuleCustomFieldValue.record_id == record_id
        )
        .all()
    )

    for item in values:
        db.delete(item)

    db.commit()

    return {
        "message": f"All custom field values deleted for {normalized_module} record {record_id}"
    }