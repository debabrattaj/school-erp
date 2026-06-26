from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import SchoolClass, SchoolSettings, User
from app.schemas import (
    SchoolClassCreate,
    SchoolClassUpdate,
    SchoolClassResponse
)
from app.security import require_roles
from app import models, schemas
router = APIRouter(
    prefix="/classes",
    tags=["Academic Structure"]
)

def get_class_teacher_label(teacher):
    name = teacher.name or "Unknown Teacher"
    department = teacher.department or "No Department"
    return f"{name} : {department}"

def get_allowed_sections(db: Session):
    settings = db.query(SchoolSettings).first()

    if not settings:
        return ["A", "B", "C"]

    if not settings.default_sections:
        return ["A", "B", "C"]

    return [
        x.strip()
        for x in settings.default_sections.split(",")
    ]


@router.post("/classes/", response_model=schemas.ClassResponse)
def create_class(payload: schemas.ClassCreate, db: Session = Depends(get_db)):
    existing_class = (
        db.query(models.SchoolClass)
        .filter(
            models.SchoolClass.class_name == payload.class_name,
            models.SchoolClass.section == payload.section
        )
        .first()
    )
    if existing_class:
        raise HTTPException(status_code=400, detail="Class with this section already exists")

    db_class = models.SchoolClass(
        class_name=payload.class_name,
        section=payload.section,
        room_no=payload.room_no,
        class_teacher_id=None,
        class_teacher=None,
    )

    db.add(db_class)
    db.flush()

    if payload.class_teacher_id:
        teacher = (
            db.query(models.Teacher)
            .filter(
                models.Teacher.id == payload.class_teacher_id,
                models.Teacher.is_class_teacher == True
            )
            .first()
        )

        if not teacher:
            raise HTTPException(
                status_code=400,
                detail="Selected teacher is not marked as Class Teacher"
            )

        # remove this teacher from any old class
        old_classes = (
            db.query(models.SchoolClass)
            .filter(models.SchoolClass.class_teacher_id == teacher.id)
            .all()
        )
        for old_class in old_classes:
            if old_class.id != db_class.id:
                old_class.class_teacher_id = None
                old_class.class_teacher = None

        db_class.class_teacher_id = teacher.id
        db_class.class_teacher = get_class_teacher_label(teacher)

        teacher.is_class_teacher = True
        teacher.class_id = db_class.id

    db.commit()
    db.refresh(db_class)
    return db_class

@router.get("/", response_model=list[SchoolClassResponse])
def get_classes(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            ["Admin", "Principal", "Teacher"]
        )
    )
):
    return db.query(SchoolClass).order_by(
        SchoolClass.class_name,
        SchoolClass.section
    ).all()


@router.get("/{class_id}", response_model=SchoolClassResponse)
def get_class(
    class_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            ["Admin", "Principal", "Teacher"]
        )
    )
):
    school_class = db.query(SchoolClass).filter(
        SchoolClass.id == class_id
    ).first()

    if not school_class:
        raise HTTPException(
            status_code=404,
            detail="Class not found"
        )

    return school_class


@router.put("/classes/{class_id}", response_model=schemas.ClassResponse)
def update_class(class_id: int, payload: schemas.ClassCreate, db: Session = Depends(get_db)):
    db_class = (
        db.query(models.SchoolClass)
        .filter(models.SchoolClass.id == class_id)
        .first()
    )

    if not db_class:
        raise HTTPException(status_code=404, detail="Class not found")

    duplicate_class = (
        db.query(models.SchoolClass)
        .filter(
            models.SchoolClass.class_name == payload.class_name,
            models.SchoolClass.section == payload.section,
            models.SchoolClass.id != class_id
        )
        .first()
    )
    if duplicate_class:
        raise HTTPException(status_code=400, detail="Class with this section already exists")

    old_teacher_id = db_class.class_teacher_id

    db_class.class_name = payload.class_name
    db_class.section = payload.section
    db_class.room_no = payload.room_no

    # remove old teacher assignment if changed/removed
    if old_teacher_id and old_teacher_id != payload.class_teacher_id:
        old_teacher = (
            db.query(models.Teacher)
            .filter(models.Teacher.id == old_teacher_id)
            .first()
        )
        if old_teacher:
            old_teacher.class_id = None

    if payload.class_teacher_id:
        teacher = (
            db.query(models.Teacher)
            .filter(
                models.Teacher.id == payload.class_teacher_id,
                models.Teacher.is_class_teacher == True
            )
            .first()
        )

        if not teacher:
            raise HTTPException(
                status_code=400,
                detail="Selected teacher is not marked as Class Teacher"
            )

        # remove teacher from any other class first
        old_classes = (
            db.query(models.SchoolClass)
            .filter(
                models.SchoolClass.class_teacher_id == teacher.id,
                models.SchoolClass.id != db_class.id
            )
            .all()
        )
        for old_class in old_classes:
            old_class.class_teacher_id = None
            old_class.class_teacher = None

        db_class.class_teacher_id = teacher.id
        db_class.class_teacher = get_class_teacher_label(teacher)

        teacher.is_class_teacher = True
        teacher.class_id = db_class.id

    else:
        db_class.class_teacher_id = None
        db_class.class_teacher = None

    db.commit()
    db.refresh(db_class)
    return db_class

@router.delete("/{class_id}")
def delete_class(
    class_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(["Admin"])
    )
):
    school_class = db.query(SchoolClass).filter(
        SchoolClass.id == class_id
    ).first()

    if not school_class:
        raise HTTPException(
            status_code=404,
            detail="Class not found"
        )

    db.delete(school_class)
    db.commit()

    return {
        "message": "Class deleted successfully"
    }


@router.get("/metadata/sections")
def get_sections(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(
            ["Admin", "Principal", "Teacher"]
        )
    )
):
    return {
        "sections": get_allowed_sections(db)
    }


def get_teacher_display_name(teacher):
    name = f"{teacher.first_name or ''} {teacher.last_name or ''}".strip()

    if teacher.teacher_code:
        return f"{teacher.teacher_code} - {name}"

    return name or f"Teacher ID: {teacher.id}"


def sync_class_teacher_from_teacher(db, teacher):
    # remove this teacher from old classes
    old_classes = (
        db.query(models.SchoolClass)
        .filter(models.SchoolClass.class_teacher_id == teacher.id)
        .all()
    )

    for old_class in old_classes:
        if old_class.id != teacher.class_id:
            old_class.class_teacher_id = None
            old_class.class_teacher = None

    if teacher.is_class_teacher and teacher.class_id:
        school_class = (
            db.query(models.SchoolClass)
            .filter(models.SchoolClass.id == teacher.class_id)
            .first()
        )

        if school_class:
            # clear previous teacher assignment for this class
            if (
                school_class.class_teacher_id
                and school_class.class_teacher_id != teacher.id
            ):
                old_teacher = (
                    db.query(models.Teacher)
                    .filter(models.Teacher.id == school_class.class_teacher_id)
                    .first()
                )

                if old_teacher:
                    old_teacher.class_id = None

            school_class.class_teacher_id = teacher.id
            school_class.class_teacher = get_teacher_display_name(teacher)
    else:
        teacher.class_id = None

def apply_class_teacher_lookup(db, school_class, class_teacher_id):
    if not class_teacher_id:
        school_class.class_teacher_id = None
        school_class.class_teacher = None
        return

    teacher = (
        db.query(models.Teacher)
        .filter(models.Teacher.id == class_teacher_id)
        .first()
    )

    if not teacher:
        raise HTTPException(status_code=404, detail="Class teacher not found")

    school_class.class_teacher_id = teacher.id
    school_class.class_teacher = get_teacher_display_name(teacher)

    teacher.is_class_teacher = True
    teacher.class_id = school_class.id