"""Learning resources: the study material half of the LMS.

Teachers publish documents, videos, links and written notes to a class (and
optionally one section), and the portal shows a family everything published
for their child. A resource is scoped by class/section/subject strings rather
than by class_subject_id like the syllabus module, because material is
routinely shared with every section of a grade, and with classes whose
subject mappings have not been set up.

The other half of the LMS -- handing work in and grading it -- lives with the
assignments it belongs to, in routes/homework.py.
"""

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.listing import apply_listing
from app.models import (
    LearningResource,
    LearningResourceView,
    Student,
    Teacher,
    User,
)
from app.schemas import (
    LearningResourceCreate,
    LearningResourceEngagement,
    LearningResourceResponse,
    LearningResourceUpdate,
)
from app.security import require_roles
from app.tenant import require_feature

router = APIRouter(
    prefix="/lms",
    tags=["Learning Resources"],
    dependencies=[Depends(require_feature("lms"))],
)

MANAGERS = ["Admin", "Principal", "Teacher"]
VALID_TYPES = ("Document", "Video", "Link", "Note")
VALID_STATUSES = ("Draft", "Published", "Archived")


def _apply_teacher_snapshot(db: Session, resource: LearningResource) -> None:
    if resource.teacher_id:
        teacher = db.query(Teacher).filter(Teacher.id == resource.teacher_id).first()
        resource.teacher_name_snapshot = teacher.name if teacher else None
    else:
        resource.teacher_name_snapshot = None


def _validate(resource_type: str, status: str, url, content) -> None:
    if resource_type not in VALID_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Type must be one of: {', '.join(VALID_TYPES)}",
        )
    if status not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Status must be one of: {', '.join(VALID_STATUSES)}",
        )
    # A resource with neither a link nor a body is an empty shelf slot: it
    # reads as material in the portal and opens to nothing.
    if resource_type == "Note":
        if not (content or "").strip():
            raise HTTPException(status_code=400, detail="A note needs some content.")
    elif not (url or "").strip():
        raise HTTPException(
            status_code=400,
            detail=f"A {resource_type.lower()} needs a file or link URL.",
        )


def _viewer_counts(db: Session, resource_ids: list[int]) -> dict[int, int]:
    if not resource_ids:
        return {}
    rows = (
        db.query(LearningResourceView.resource_id, func.count(LearningResourceView.id))
        .filter(LearningResourceView.resource_id.in_(resource_ids))
        .group_by(LearningResourceView.resource_id)
        .all()
    )
    return {resource_id: count for resource_id, count in rows}


def _to_response(resource: LearningResource, viewer_count: int | None = None):
    payload = LearningResourceResponse.model_validate(resource)
    payload.viewer_count = viewer_count or 0
    return payload


def _class_students(db: Session, class_name: str, section: str | None):
    """Everyone a resource or assignment is addressed to. A blank section on
    the resource means the whole class, so it is not a filter then."""
    query = db.query(Student).filter(
        Student.class_name == class_name,
        (Student.student_status == "Active") | (Student.student_status.is_(None)),
    )
    if section:
        query = query.filter(Student.section == section)
    return query.order_by(Student.roll_no, Student.id).all()


def student_name(student: Student) -> str:
    return f"{student.first_name} {student.last_name or ''}".strip()


@router.get("/resources", response_model=list[LearningResourceResponse])
def list_resources(
    class_name: str | None = None,
    section: str | None = None,
    subject: str | None = None,
    academic_year: str | None = None,
    resource_type: str | None = None,
    status: str | None = None,
    syllabus_unit_id: int | None = None,
    search: str | None = None,
    sort: str | None = None,
    order: str = "asc",
    limit: int | None = None,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    query = db.query(LearningResource)
    if class_name:
        query = query.filter(LearningResource.class_name == class_name)
    if section:
        query = query.filter(LearningResource.section == section)
    if subject:
        query = query.filter(LearningResource.subject == subject)
    if academic_year:
        query = query.filter(LearningResource.academic_year == academic_year)
    if resource_type:
        query = query.filter(LearningResource.resource_type == resource_type)
    if status:
        query = query.filter(LearningResource.status == status)
    if syllabus_unit_id:
        query = query.filter(LearningResource.syllabus_unit_id == syllabus_unit_id)

    resources = apply_listing(
        query, LearningResource,
        search=search,
        search_fields=("title", "description", "subject", "class_name", "section"),
        sort=sort, order=order, limit=limit, offset=offset,
        default_order=[LearningResource.created_at.desc(), LearningResource.id.desc()],
    ).all()

    counts = _viewer_counts(db, [r.id for r in resources])
    return [_to_response(r, counts.get(r.id, 0)) for r in resources]


@router.post("/resources", response_model=LearningResourceResponse)
def create_resource(
    payload: LearningResourceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="Title is required")
    if not payload.class_name.strip():
        raise HTTPException(status_code=400, detail="Class is required")
    _validate(payload.resource_type, payload.status, payload.url, payload.content)

    resource = LearningResource(**payload.model_dump())
    resource.created_by = current_user.name
    if resource.status == "Published":
        resource.published_at = datetime.utcnow()
    _apply_teacher_snapshot(db, resource)

    db.add(resource)
    db.commit()
    db.refresh(resource)
    return _to_response(resource, 0)


def _get_resource_or_404(db: Session, resource_id: int) -> LearningResource:
    resource = db.query(LearningResource).filter(LearningResource.id == resource_id).first()
    if not resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    return resource


@router.get("/resources/{resource_id}", response_model=LearningResourceResponse)
def get_resource(
    resource_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    resource = _get_resource_or_404(db, resource_id)
    return _to_response(resource, _viewer_counts(db, [resource.id]).get(resource.id, 0))


@router.put("/resources/{resource_id}", response_model=LearningResourceResponse)
def update_resource(
    resource_id: int,
    payload: LearningResourceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    resource = _get_resource_or_404(db, resource_id)
    update_data = payload.model_dump(exclude_unset=True)

    merged = {
        "resource_type": update_data.get("resource_type", resource.resource_type),
        "status": update_data.get("status", resource.status),
        "url": update_data.get("url", resource.url),
        "content": update_data.get("content", resource.content),
    }
    _validate(merged["resource_type"], merged["status"], merged["url"], merged["content"])

    was_published = resource.status == "Published"
    for key, value in update_data.items():
        setattr(resource, key, value)
    if "teacher_id" in update_data:
        _apply_teacher_snapshot(db, resource)
    # Stamped the first time it goes live and then left alone -- this is when
    # the class got the material, not when the teacher last fixed a typo.
    if resource.status == "Published" and not was_published and not resource.published_at:
        resource.published_at = datetime.utcnow()

    db.commit()
    db.refresh(resource)
    return _to_response(resource, _viewer_counts(db, [resource.id]).get(resource.id, 0))


@router.delete("/resources/{resource_id}")
def delete_resource(
    resource_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    resource = _get_resource_or_404(db, resource_id)
    db.delete(resource)
    db.commit()
    return {"message": "Resource deleted successfully"}


@router.get("/resources/{resource_id}/engagement", response_model=LearningResourceEngagement)
def resource_engagement(
    resource_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """Who has opened this, and who has not -- the question a teacher asks
    the day before the lesson that assumes everyone read it."""
    resource = _get_resource_or_404(db, resource_id)

    students = _class_students(db, resource.class_name, resource.section)
    views = {
        view.student_id: view
        for view in db.query(LearningResourceView)
        .filter(LearningResourceView.resource_id == resource_id)
        .all()
    }

    viewers = []
    not_viewed = []
    for student in students:
        view = views.get(student.id)
        entry = {
            "student_id": student.id,
            "student_name": student_name(student),
            "admission_no": student.admission_no,
            "roll_no": student.roll_no,
            "section": student.section,
        }
        if view:
            entry["view_count"] = view.view_count
            entry["first_viewed_at"] = view.first_viewed_at
            entry["last_viewed_at"] = view.last_viewed_at
            viewers.append(entry)
        else:
            not_viewed.append(entry)

    return LearningResourceEngagement(
        resource_id=resource.id,
        total_students=len(students),
        viewed_count=len(viewers),
        viewers=viewers,
        not_viewed=not_viewed,
    )


def visible_resources_query(db: Session, class_name: str, section: str | None, on_day: date):
    """The published, released material a given class can see today.

    Shared with the portal so staff and family views can never drift: a
    resource still in Draft, archived, or scheduled for a later date is not
    material the class has been given yet.
    """
    query = db.query(LearningResource).filter(
        LearningResource.class_name == class_name,
        LearningResource.status == "Published",
        (LearningResource.available_from.is_(None))
        | (LearningResource.available_from <= on_day),
    )
    if section:
        query = query.filter(
            (LearningResource.section == section) | (LearningResource.section.is_(None))
        )
    else:
        query = query.filter(LearningResource.section.is_(None))
    return query
