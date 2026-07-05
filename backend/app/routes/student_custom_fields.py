from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app import models, schemas

router = APIRouter(
    prefix="/students",
    tags=["Student Custom Fields"]
)


def get_student_or_404(student_id: int, db: Session):
    student = (
        db.query(models.Student)
        .filter(models.Student.id == student_id)
        .first()
    )

    if not student:
        raise HTTPException(status_code=404, detail="Student not found")

    return student


@router.get(
    "/{student_id}/custom-fields",
    response_model=list[schemas.StudentCustomFieldValueResponse]
)
def get_student_custom_fields(
    student_id: int,
    db: Session = Depends(get_db)
):
    get_student_or_404(student_id, db)

    values = (
        db.query(models.StudentCustomFieldValue)
        .filter(models.StudentCustomFieldValue.student_id == student_id)
        .order_by(models.StudentCustomFieldValue.id.asc())
        .all()
    )

    return values


@router.post(
    "/{student_id}/custom-fields",
    response_model=list[schemas.StudentCustomFieldValueResponse]
)
def save_student_custom_fields(
    student_id: int,
    payload: schemas.StudentCustomFieldBulkSave,
    db: Session = Depends(get_db)
):
    get_student_or_404(student_id, db)

    existing_values = (
        db.query(models.StudentCustomFieldValue)
        .filter(models.StudentCustomFieldValue.student_id == student_id)
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
            custom_value = models.StudentCustomFieldValue(
                student_id=student_id,
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
    "/{student_id}/custom-fields",
    response_model=list[schemas.StudentCustomFieldValueResponse]
)
def update_student_custom_fields(
    student_id: int,
    payload: schemas.StudentCustomFieldBulkSave,
    db: Session = Depends(get_db)
):
    return save_student_custom_fields(student_id, payload, db)


@router.delete("/{student_id}/custom-fields/{field_key}")
def delete_student_custom_field(
    student_id: int,
    field_key: str,
    db: Session = Depends(get_db)
):
    get_student_or_404(student_id, db)

    custom_value = (
        db.query(models.StudentCustomFieldValue)
        .filter(
            models.StudentCustomFieldValue.student_id == student_id,
            models.StudentCustomFieldValue.field_key == field_key
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