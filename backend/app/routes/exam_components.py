from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Exam, ExamComponent, User
from app.schemas import ExamComponentCreate, ExamComponentResponse, ExamComponentUpdate
from app.security import require_roles

router = APIRouter(
    prefix="/exam-components",
    tags=["Exam Components"],
)


def get_exam_or_404(db: Session, exam_id: int):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")
    return exam


@router.get("/", response_model=list[ExamComponentResponse])
def get_exam_components(
    exam_id: int | None = None,
    active_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal", "Teacher"])),
):
    query = db.query(ExamComponent)

    if exam_id:
        query = query.filter(ExamComponent.exam_id == exam_id)

    if active_only:
        query = query.filter(ExamComponent.is_active == True)

    return query.order_by(
        ExamComponent.exam_id.asc(),
        ExamComponent.sort_order.asc(),
        ExamComponent.id.asc(),
    ).all()


@router.post("/", response_model=ExamComponentResponse)
def create_exam_component(
    payload: ExamComponentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    get_exam_or_404(db, payload.exam_id)

    component = ExamComponent(**payload.model_dump())
    db.add(component)
    db.commit()
    db.refresh(component)
    return component


@router.put("/{component_id}", response_model=ExamComponentResponse)
def update_exam_component(
    component_id: int,
    payload: ExamComponentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    component = db.query(ExamComponent).filter(ExamComponent.id == component_id).first()

    if not component:
        raise HTTPException(status_code=404, detail="Exam component not found")

    update_data = payload.model_dump(exclude_unset=True)

    if "exam_id" in update_data and update_data["exam_id"]:
        get_exam_or_404(db, update_data["exam_id"])

    for key, value in update_data.items():
        setattr(component, key, value)

    db.commit()
    db.refresh(component)
    return component


@router.delete("/{component_id}")
def delete_exam_component(
    component_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["Admin", "Principal"])),
):
    component = db.query(ExamComponent).filter(ExamComponent.id == component_id).first()

    if not component:
        raise HTTPException(status_code=404, detail="Exam component not found")

    db.delete(component)
    db.commit()
    return {"message": "Exam component deleted successfully"}
