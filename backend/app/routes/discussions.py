"""Course discussion forums.

Topics belong to a course, or to a class where a school runs discussion
without a course around it. Staff see and moderate everything; a family sees
the topics attached to their own child's courses and class.

Moderation hides rather than deletes. A teacher taking a post out of view
should not destroy the record of what was said -- that record is exactly
what a safeguarding conversation later needs.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.listing import apply_listing
from app.models import (
    Course,
    CourseLesson,
    DiscussionPost,
    DiscussionTopic,
    LearningResource,
    User,
)
from app import schemas
from app.security import require_roles
from app.tenant import require_feature

router = APIRouter(
    prefix="/discussions",
    tags=["Discussions"],
    dependencies=[Depends(require_feature("discussions"))],
)

MANAGERS = ["Admin", "Principal", "Teacher"]
STAFF_ROLES = ("Admin", "Principal", "Teacher", "Accounts")

MAX_BODY_CHARS = 8000


def is_staff_role(role: str) -> bool:
    return role in STAFF_ROLES


def topic_response(db: Session, topic: DiscussionTopic) -> schemas.DiscussionTopicResponse:
    payload = schemas.DiscussionTopicResponse.model_validate(topic)
    if topic.course_id:
        course = db.query(Course).filter(Course.id == topic.course_id).first()
        payload.course_title = course.title if course else None
    return payload


def visible_posts(db: Session, topic_id: int, include_hidden: bool):
    query = db.query(DiscussionPost).filter(DiscussionPost.topic_id == topic_id)
    if not include_hidden:
        query = query.filter(DiscussionPost.is_hidden.is_(False))
    return query.order_by(DiscussionPost.created_at, DiscussionPost.id).all()


def post_response(post: DiscussionPost, include_hidden_body: bool) -> dict:
    hidden = bool(post.is_hidden)
    return {
        "id": post.id,
        "topic_id": post.topic_id,
        "parent_post_id": post.parent_post_id,
        "author_name": post.author_name,
        "author_role": post.author_role,
        "is_staff": post.is_staff,
        # A hidden post still occupies its place in the thread so replies to
        # it do not become orphans, but its text is only returned to staff.
        "body": post.body if (not hidden or include_hidden_body) else None,
        "is_hidden": hidden,
        "hidden_by": post.hidden_by if include_hidden_body else None,
        "hidden_reason": post.hidden_reason if include_hidden_body else None,
        "created_at": post.created_at,
    }


def refresh_topic_counters(db: Session, topic: DiscussionTopic) -> None:
    posts = (
        db.query(DiscussionPost)
        .filter(
            DiscussionPost.topic_id == topic.id,
            DiscussionPost.is_hidden.is_(False),
        )
        .order_by(DiscussionPost.created_at.desc())
        .all()
    )
    topic.post_count = len(posts)
    topic.last_post_at = posts[0].created_at if posts else None


def create_post(
    db: Session,
    topic: DiscussionTopic,
    body: str,
    user: User,
    parent_post_id: int | None = None,
) -> DiscussionPost:
    """Shared by the staff and portal routes so both sides obey the same
    locking, nesting and length rules."""
    text = (body or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="A post cannot be empty.")
    if len(text) > MAX_BODY_CHARS:
        raise HTTPException(
            status_code=400,
            detail=f"A post cannot be longer than {MAX_BODY_CHARS} characters.",
        )

    parent = None
    if parent_post_id:
        parent = (
            db.query(DiscussionPost)
            .filter(
                DiscussionPost.id == parent_post_id,
                DiscussionPost.topic_id == topic.id,
            )
            .first()
        )
        if not parent:
            raise HTTPException(status_code=404, detail="That post is not in this topic.")
        # One level of nesting: a reply to a reply attaches to the post that
        # started that sub-thread, which keeps rendering flat.
        if parent.parent_post_id:
            parent_post_id = parent.parent_post_id

    post = DiscussionPost(
        topic_id=topic.id,
        parent_post_id=parent_post_id,
        author_user_id=user.id,
        author_name=user.name,
        author_role=user.role,
        is_staff=is_staff_role(user.role),
        body=text,
    )
    db.add(post)
    db.commit()
    db.refresh(post)

    refresh_topic_counters(db, topic)
    db.commit()
    return post


@router.get("/", response_model=list[schemas.DiscussionTopicResponse])
def list_topics(
    course_id: int | None = None,
    class_name: str | None = None,
    section: str | None = None,
    subject: str | None = None,
    search: str | None = None,
    sort: str | None = None,
    order: str = "asc",
    limit: int | None = None,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    query = db.query(DiscussionTopic)
    if course_id:
        query = query.filter(DiscussionTopic.course_id == course_id)
    if class_name:
        query = query.filter(DiscussionTopic.class_name == class_name)
    if section:
        query = query.filter(DiscussionTopic.section == section)
    if subject:
        query = query.filter(DiscussionTopic.subject == subject)

    topics = apply_listing(
        query, DiscussionTopic,
        search=search, search_fields=("title", "class_name", "subject", "created_by_name"),
        sort=sort, order=order, limit=limit, offset=offset,
        # Pinned first, then whatever was talked about most recently -- the
        # order a forum is actually read in.
        default_order=[
            DiscussionTopic.is_pinned.desc(),
            DiscussionTopic.last_post_at.desc().nullslast(),
            DiscussionTopic.id.desc(),
        ],
    ).all()
    return [topic_response(db, topic) for topic in topics]


def _validate_anchors(db: Session, data: dict) -> None:
    if data.get("course_id"):
        if not db.query(Course).filter(Course.id == data["course_id"]).first():
            raise HTTPException(status_code=400, detail="That course does not exist.")
    if data.get("lesson_id"):
        if not db.query(CourseLesson).filter(CourseLesson.id == data["lesson_id"]).first():
            raise HTTPException(status_code=400, detail="That lesson does not exist.")
    if data.get("resource_id"):
        if not db.query(LearningResource).filter(
            LearningResource.id == data["resource_id"]
        ).first():
            raise HTTPException(status_code=400, detail="That resource does not exist.")


@router.post("/", response_model=schemas.DiscussionTopicResponse)
def create_topic(
    payload: schemas.DiscussionTopicCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="Title is required")
    data = payload.model_dump()
    if not data.get("course_id") and not data.get("class_name"):
        raise HTTPException(
            status_code=400,
            detail="A topic needs either a course or a class to belong to.",
        )
    _validate_anchors(db, data)

    body = data.pop("body", None)
    topic = DiscussionTopic(
        **data,
        created_by_user_id=current_user.id,
        created_by_name=current_user.name,
        created_by_role=current_user.role,
        is_staff=is_staff_role(current_user.role),
    )
    db.add(topic)
    db.commit()
    db.refresh(topic)

    # The opening message is an ordinary post, so it can be edited, hidden
    # and replied to like any other.
    if (body or "").strip():
        create_post(db, topic, body, current_user)
        db.refresh(topic)
    return topic_response(db, topic)


def _get_topic_or_404(db: Session, topic_id: int) -> DiscussionTopic:
    topic = db.query(DiscussionTopic).filter(DiscussionTopic.id == topic_id).first()
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    return topic


@router.get("/{topic_id}")
def get_topic(
    topic_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    topic = _get_topic_or_404(db, topic_id)
    posts = visible_posts(db, topic_id, include_hidden=True)
    return {
        "topic": topic_response(db, topic),
        "posts": [post_response(post, include_hidden_body=True) for post in posts],
    }


@router.put("/{topic_id}", response_model=schemas.DiscussionTopicResponse)
def update_topic(
    topic_id: int,
    payload: schemas.DiscussionTopicUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    topic = _get_topic_or_404(db, topic_id)
    data = payload.model_dump(exclude_unset=True)
    _validate_anchors(db, data)
    for key, value in data.items():
        setattr(topic, key, value)
    db.commit()
    db.refresh(topic)
    return topic_response(db, topic)


@router.delete("/{topic_id}")
def delete_topic(
    topic_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    topic = _get_topic_or_404(db, topic_id)
    db.delete(topic)
    db.commit()
    return {"message": "Topic deleted successfully"}


@router.post("/{topic_id}/posts")
def add_post(
    topic_id: int,
    payload: schemas.DiscussionPostCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    topic = _get_topic_or_404(db, topic_id)
    # Staff can always answer, including on a locked topic: locking is aimed
    # at the class, and a teacher's closing word is often why it was locked.
    post = create_post(db, topic, payload.body, current_user, payload.parent_post_id)
    return post_response(post, include_hidden_body=True)


@router.post("/{topic_id}/posts/{post_id}/hide")
def hide_post(
    topic_id: int,
    post_id: int,
    payload: schemas.DiscussionModerationRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    topic = _get_topic_or_404(db, topic_id)
    post = (
        db.query(DiscussionPost)
        .filter(DiscussionPost.id == post_id, DiscussionPost.topic_id == topic_id)
        .first()
    )
    if not post:
        raise HTTPException(status_code=404, detail="Post not found")

    post.is_hidden = payload.hidden
    post.hidden_by = current_user.name if payload.hidden else None
    post.hidden_at = datetime.utcnow() if payload.hidden else None
    post.hidden_reason = payload.reason if payload.hidden else None

    db.commit()
    refresh_topic_counters(db, topic)
    db.commit()
    db.refresh(post)
    return post_response(post, include_hidden_body=True)
