"""Courses: sections, lessons, enrollment, progress and instructor-led sessions.

The course is the unit of learning. A course holds ordered sections, each
holding ordered lessons; a lesson either carries its own text/link/video or
points at something that already exists elsewhere in the ERP (a learning
resource, a SCORM package, an online test, an assignment, a session).

Progress is *derived*, not reported. A lesson pointing at an assignment is
complete because a submission exists, not because anything told this module
so -- which means a student who hands work in through the Homework tab sees
their course move on without doing anything twice. CourseLessonProgress rows
are a cache of that judgement, refreshed whenever it is recomputed, so
listing a class's progress stays one query per course rather than one per
learner per lesson.
"""

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.listing import apply_listing
from app.models import (
    Assignment,
    AssignmentSubmission,
    Course,
    CourseEnrollment,
    CourseFeedback,
    CourseLesson,
    CourseLessonProgress,
    CourseSection,
    CourseSession,
    CourseSessionAttendance,
    LearningResource,
    LearningResourceView,
    OnlineTest,
    OnlineTestAttempt,
    ScormAttempt,
    ScormPackage,
    Student,
    Teacher,
    User,
)
from app import schemas
from app.security import require_roles
from app.tenant import require_feature

router = APIRouter(
    prefix="/courses",
    tags=["Courses"],
    dependencies=[Depends(require_feature("courses"))],
)

MANAGERS = ["Admin", "Principal", "Teacher"]

COURSE_TYPES = ("self_paced", "blended", "e_material")
STATUSES = ("Draft", "Published", "Archived")
CONTENT_TYPES = (
    "text", "link", "video", "document",
    "resource", "scorm", "online_test", "assignment", "session",
)
COMPLETION_RULES = ("view", "submit", "score", "manual")
POINTER_COLUMN = {
    "resource": "resource_id",
    "scorm": "scorm_package_id",
    "online_test": "online_test_id",
    "assignment": "assignment_id",
    "session": "session_id",
}


def student_name(student: Student) -> str:
    return f"{student.first_name} {student.last_name or ''}".strip()


# ---------------------------------------------------------------------------
# Progress engine
# ---------------------------------------------------------------------------


def _scored_completion(score, min_score, attempted: bool) -> bool:
    if min_score is None:
        return attempted
    return score is not None and score >= min_score


def evaluate_lesson(db: Session, lesson: CourseLesson, student_id: int, cached: CourseLessonProgress | None):
    """Is this lesson finished for this learner, and at what score?

    Pointer lessons are judged from the thing they point at, so the answer
    cannot drift from the module that owns it. Self-contained lessons have no
    external evidence, so their cached row is the record.
    """
    rule = lesson.completion_rule or "view"

    if lesson.content_type == "assignment" and lesson.assignment_id:
        submission = (
            db.query(AssignmentSubmission)
            .filter(
                AssignmentSubmission.assignment_id == lesson.assignment_id,
                AssignmentSubmission.student_id == student_id,
            )
            .first()
        )
        if not submission:
            return False, None
        score = submission.marks_awarded
        if rule == "score":
            return _scored_completion(score, lesson.min_score, False), score
        return True, score

    if lesson.content_type == "online_test" and lesson.online_test_id:
        attempt = (
            db.query(OnlineTestAttempt)
            .filter(
                OnlineTestAttempt.test_id == lesson.online_test_id,
                OnlineTestAttempt.student_id == student_id,
                OnlineTestAttempt.status == "Submitted",
            )
            .order_by(OnlineTestAttempt.score.desc().nullslast())
            .first()
        )
        if not attempt:
            return False, None
        if rule == "score":
            return _scored_completion(attempt.score, lesson.min_score, False), attempt.score
        return True, attempt.score

    if lesson.content_type == "scorm" and lesson.scorm_package_id:
        attempt = (
            db.query(ScormAttempt)
            .filter(
                ScormAttempt.package_id == lesson.scorm_package_id,
                ScormAttempt.student_id == student_id,
            )
            .first()
        )
        if not attempt:
            return False, None
        finished = attempt.lesson_status in ("completed", "passed")
        if rule == "score":
            return _scored_completion(attempt.score_raw, lesson.min_score, finished), attempt.score_raw
        return finished, attempt.score_raw

    if lesson.content_type == "resource" and lesson.resource_id and rule == "view":
        seen = (
            db.query(LearningResourceView)
            .filter(
                LearningResourceView.resource_id == lesson.resource_id,
                LearningResourceView.student_id == student_id,
            )
            .first()
        )
        if seen:
            return True, None
        # Fall through: a resource can still be ticked off by hand.

    if lesson.content_type == "session" and lesson.session_id:
        attendance = (
            db.query(CourseSessionAttendance)
            .join(CourseEnrollment, CourseSessionAttendance.enrollment_id == CourseEnrollment.id)
            .filter(
                CourseSessionAttendance.session_id == lesson.session_id,
                CourseEnrollment.student_id == student_id,
            )
            .first()
        )
        return bool(attendance and attendance.attended), None

    if cached:
        return cached.status == "Completed", cached.score
    return False, None


def _ordered_lessons(db: Session, course_id: int) -> list[CourseLesson]:
    """Course order: section sequence first, then lesson sequence within it."""
    return (
        db.query(CourseLesson)
        .join(CourseSection, CourseLesson.section_id == CourseSection.id)
        .filter(CourseLesson.course_id == course_id)
        .order_by(
            CourseSection.sequence_no, CourseSection.id,
            CourseLesson.sequence_no, CourseLesson.id,
        )
        .all()
    )


def recompute_enrollment(db: Session, enrollment: CourseEnrollment, commit: bool = True) -> dict:
    """Refresh every lesson's cached state and the enrollment's headline
    figures. Returns {lesson_id: {completed, score, locked}}."""
    course = db.query(Course).filter(Course.id == enrollment.course_id).first()
    lessons = _ordered_lessons(db, enrollment.course_id)
    cached_rows = {
        row.lesson_id: row
        for row in db.query(CourseLessonProgress)
        .filter(CourseLessonProgress.enrollment_id == enrollment.id)
        .all()
    }

    now = datetime.utcnow()
    state: dict[int, dict] = {}
    completed_required = 0
    total_required = 0
    scores: list[float] = []

    for lesson in lessons:
        cached = cached_rows.get(lesson.id)
        completed, score = evaluate_lesson(db, lesson, enrollment.student_id, cached)

        if cached is None:
            cached = CourseLessonProgress(
                enrollment_id=enrollment.id,
                lesson_id=lesson.id,
                status="Completed" if completed else "Not Started",
                score=score,
                completed_at=now if completed else None,
            )
            db.add(cached)
            cached_rows[lesson.id] = cached
        else:
            if completed and cached.status != "Completed":
                cached.status = "Completed"
                cached.completed_at = cached.completed_at or now
            elif not completed and cached.status == "Completed":
                # The evidence went away (a submission deleted, a test reset).
                # Reporting a completion that no longer has anything behind it
                # is worse than moving the learner back a step.
                cached.status = "In Progress" if cached.first_viewed_at else "Not Started"
                cached.completed_at = None
            if score is not None:
                cached.score = score

        if lesson.is_required:
            total_required += 1
            if completed:
                completed_required += 1
        if score is not None:
            scores.append(score)

        state[lesson.id] = {"completed": completed, "score": score, "locked": False}

    # Locking is a second pass: it reads the completion of earlier lessons,
    # which is only fully known once every lesson has been evaluated.
    seen_incomplete_required = False
    for lesson in lessons:
        locked = False
        if lesson.prerequisite_lesson_id:
            gate = state.get(lesson.prerequisite_lesson_id)
            if gate and not gate["completed"]:
                locked = True
        if course and course.enforce_lesson_order and seen_incomplete_required:
            locked = True
        state[lesson.id]["locked"] = locked
        if lesson.is_required and not state[lesson.id]["completed"]:
            seen_incomplete_required = True

    enrollment.progress_percent = (
        round(completed_required * 100.0 / total_required, 1) if total_required else 0.0
    )
    enrollment.final_score = round(sum(scores) / len(scores), 2) if scores else None

    if total_required and completed_required >= total_required:
        if enrollment.status != "Completed":
            enrollment.status = "Completed"
            enrollment.completed_at = enrollment.completed_at or now
    elif enrollment.status != "Dropped":
        # Not finished, so a Completed status must not be left standing
        # behind a percentage that says otherwise -- which is what happens
        # when a grade is corrected downward past the bar it had cleared.
        enrollment.status = (
            "In Progress" if (completed_required or enrollment.started_at) else "Enrolled"
        )
        enrollment.completed_at = None
    if commit:
        db.commit()
    return state


def sync_scorm_lesson_progress(db: Session, package_id: int, student_id: int) -> None:
    """Called by the SCORM runtime after a commit: move on every course whose
    lesson points at this package."""
    lessons = (
        db.query(CourseLesson)
        .filter(
            CourseLesson.content_type == "scorm",
            CourseLesson.scorm_package_id == package_id,
        )
        .all()
    )
    for lesson in lessons:
        enrollment = (
            db.query(CourseEnrollment)
            .filter(
                CourseEnrollment.course_id == lesson.course_id,
                CourseEnrollment.student_id == student_id,
            )
            .first()
        )
        if enrollment:
            recompute_enrollment(db, enrollment)


def course_prerequisite_met(db: Session, course: Course, student_id: int) -> bool:
    if not course.prerequisite_course_id:
        return True
    prior = (
        db.query(CourseEnrollment)
        .filter(
            CourseEnrollment.course_id == course.prerequisite_course_id,
            CourseEnrollment.student_id == student_id,
        )
        .first()
    )
    return bool(prior and prior.status == "Completed")


def visible_courses_query(db: Session, student: Student, on_day: date):
    """Published, released courses a student may see: their class's, plus any
    course not tied to a class at all."""
    return db.query(Course).filter(
        Course.status == "Published",
        (Course.available_from.is_(None)) | (Course.available_from <= on_day),
        (Course.class_name.is_(None)) | (Course.class_name == student.class_name),
        (Course.section.is_(None)) | (Course.section == student.section),
    )


def get_or_create_enrollment(
    db: Session, course: Course, student: Student, via: str, by: str | None = None
) -> CourseEnrollment:
    enrollment = (
        db.query(CourseEnrollment)
        .filter(
            CourseEnrollment.course_id == course.id,
            CourseEnrollment.student_id == student.id,
        )
        .first()
    )
    if enrollment:
        return enrollment

    enrollment = CourseEnrollment(
        course_id=course.id,
        student_id=student.id,
        student_name_snapshot=student_name(student),
        enrolled_via=via,
        enrolled_by=by,
        enrolled_at=datetime.utcnow(),
        status="Enrolled",
    )
    db.add(enrollment)
    db.commit()
    db.refresh(enrollment)
    return enrollment


# ---------------------------------------------------------------------------
# Courses
# ---------------------------------------------------------------------------


def _apply_trainer_snapshot(db: Session, course: Course) -> None:
    if course.trainer_teacher_id:
        teacher = db.query(Teacher).filter(Teacher.id == course.trainer_teacher_id).first()
        course.trainer_name_snapshot = teacher.name if teacher else None
    else:
        course.trainer_name_snapshot = None


def _validate_course(payload: dict, course_id: int | None = None) -> None:
    course_type = payload.get("course_type")
    if course_type is not None and course_type not in COURSE_TYPES:
        raise HTTPException(
            status_code=400, detail=f"Type must be one of: {', '.join(COURSE_TYPES)}"
        )
    status = payload.get("status")
    if status is not None and status not in STATUSES:
        raise HTTPException(
            status_code=400, detail=f"Status must be one of: {', '.join(STATUSES)}"
        )
    prerequisite = payload.get("prerequisite_course_id")
    if prerequisite and course_id and prerequisite == course_id:
        raise HTTPException(
            status_code=400, detail="A course cannot be its own prerequisite."
        )


def _get_course_or_404(db: Session, course_id: int) -> Course:
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


def _course_response(db: Session, course: Course) -> schemas.CourseResponse:
    payload = schemas.CourseResponse.model_validate(course)
    payload.section_count = (
        db.query(CourseSection).filter(CourseSection.course_id == course.id).count()
    )
    payload.lesson_count = (
        db.query(CourseLesson).filter(CourseLesson.course_id == course.id).count()
    )
    payload.enrolled_count = (
        db.query(CourseEnrollment).filter(CourseEnrollment.course_id == course.id).count()
    )
    payload.completed_count = (
        db.query(CourseEnrollment)
        .filter(
            CourseEnrollment.course_id == course.id,
            CourseEnrollment.status == "Completed",
        )
        .count()
    )
    ratings = [
        row.rating
        for row in db.query(CourseFeedback).filter(CourseFeedback.course_id == course.id).all()
    ]
    payload.average_rating = round(sum(ratings) / len(ratings), 2) if ratings else None
    payload.rating_count = len(ratings)
    return payload


@router.get("/", response_model=list[schemas.CourseResponse])
def list_courses(
    class_name: str | None = None,
    section: str | None = None,
    subject: str | None = None,
    academic_year: str | None = None,
    course_type: str | None = None,
    status: str | None = None,
    search: str | None = None,
    sort: str | None = None,
    order: str = "asc",
    limit: int | None = None,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    query = db.query(Course)
    if class_name:
        query = query.filter(Course.class_name == class_name)
    if section:
        query = query.filter(Course.section == section)
    if subject:
        query = query.filter(Course.subject == subject)
    if academic_year:
        query = query.filter(Course.academic_year == academic_year)
    if course_type:
        query = query.filter(Course.course_type == course_type)
    if status:
        query = query.filter(Course.status == status)

    courses = apply_listing(
        query, Course,
        search=search, search_fields=("title", "code", "description", "subject", "class_name"),
        sort=sort, order=order, limit=limit, offset=offset,
        default_order=[Course.created_at.desc(), Course.id.desc()],
    ).all()
    return [_course_response(db, course) for course in courses]


@router.post("/", response_model=schemas.CourseResponse)
def create_course(
    payload: schemas.CourseCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="Title is required")
    data = payload.model_dump()
    _validate_course(data)

    if data.get("code"):
        clash = db.query(Course).filter(Course.code == data["code"]).first()
        if clash:
            raise HTTPException(
                status_code=400, detail=f"Course code '{data['code']}' is already in use."
            )

    course = Course(**data)
    course.created_by = current_user.name
    if course.status == "Published":
        course.published_at = datetime.utcnow()
    _apply_trainer_snapshot(db, course)

    db.add(course)
    db.commit()
    db.refresh(course)

    if course.status == "Published" and course.auto_enroll_class:
        enroll_class_students(db, course, current_user.name)
    return _course_response(db, course)


@router.get("/{course_id}", response_model=schemas.CourseDetailResponse)
def get_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """The whole outline in one call: a course editor needs every section and
    lesson at once, and fetching them separately is a request per section."""
    course = _get_course_or_404(db, course_id)
    sections = (
        db.query(CourseSection)
        .filter(CourseSection.course_id == course_id)
        .order_by(CourseSection.sequence_no, CourseSection.id)
        .all()
    )
    lessons_by_section: dict[int, list] = {}
    for lesson in _ordered_lessons(db, course_id):
        lessons_by_section.setdefault(lesson.section_id, []).append(
            schemas.CourseLessonResponse.model_validate(lesson)
        )

    detail = schemas.CourseDetailResponse.model_validate(_course_response(db, course))
    detail.sections = [
        schemas.CourseSectionResponse(
            id=s.id,
            course_id=s.course_id,
            sequence_no=s.sequence_no,
            title=s.title,
            description=s.description,
            lessons=lessons_by_section.get(s.id, []),
        )
        for s in sections
    ]
    return detail


@router.put("/{course_id}", response_model=schemas.CourseResponse)
def update_course(
    course_id: int,
    payload: schemas.CourseUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    course = _get_course_or_404(db, course_id)
    update_data = payload.model_dump(exclude_unset=True)
    _validate_course(update_data, course_id=course_id)

    if update_data.get("code") and update_data["code"] != course.code:
        clash = db.query(Course).filter(Course.code == update_data["code"]).first()
        if clash:
            raise HTTPException(
                status_code=400, detail=f"Course code '{update_data['code']}' is already in use."
            )

    was_published = course.status == "Published"
    for key, value in update_data.items():
        setattr(course, key, value)
    if "trainer_teacher_id" in update_data:
        _apply_trainer_snapshot(db, course)
    if course.status == "Published" and not was_published and not course.published_at:
        course.published_at = datetime.utcnow()

    db.commit()
    db.refresh(course)

    if course.status == "Published" and course.auto_enroll_class:
        enroll_class_students(db, course, current_user.name)
    return _course_response(db, course)


@router.delete("/{course_id}")
def delete_course(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    course = _get_course_or_404(db, course_id)
    db.delete(course)
    db.commit()
    return {"message": "Course deleted successfully"}


# ---------------------------------------------------------------------------
# Sections and lessons
# ---------------------------------------------------------------------------


def _next_sequence(db: Session, model, **filters) -> int:
    rows = db.query(model).filter_by(**filters).all()
    return max((row.sequence_no or 0) for row in rows) + 1 if rows else 1


@router.post("/{course_id}/sections", response_model=schemas.CourseSectionResponse)
def create_section(
    course_id: int,
    payload: schemas.CourseSectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    _get_course_or_404(db, course_id)
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="Title is required")

    section = CourseSection(
        course_id=course_id,
        title=payload.title,
        description=payload.description,
        sequence_no=payload.sequence_no
        or _next_sequence(db, CourseSection, course_id=course_id),
    )
    db.add(section)
    db.commit()
    db.refresh(section)
    return schemas.CourseSectionResponse.model_validate(section)


@router.put("/{course_id}/sections/{section_id}", response_model=schemas.CourseSectionResponse)
def update_section(
    course_id: int,
    section_id: int,
    payload: schemas.CourseSectionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    section = (
        db.query(CourseSection)
        .filter(CourseSection.id == section_id, CourseSection.course_id == course_id)
        .first()
    )
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(section, key, value)
    db.commit()
    db.refresh(section)
    return schemas.CourseSectionResponse.model_validate(section)


@router.delete("/{course_id}/sections/{section_id}")
def delete_section(
    course_id: int,
    section_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    section = (
        db.query(CourseSection)
        .filter(CourseSection.id == section_id, CourseSection.course_id == course_id)
        .first()
    )
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    db.delete(section)
    db.commit()
    return {"message": "Section deleted successfully"}


def _validate_lesson(db: Session, course_id: int, data: dict, lesson: CourseLesson | None = None) -> None:
    content_type = data.get("content_type", lesson.content_type if lesson else "text")
    if content_type not in CONTENT_TYPES:
        raise HTTPException(
            status_code=400, detail=f"Content type must be one of: {', '.join(CONTENT_TYPES)}"
        )
    rule = data.get("completion_rule", lesson.completion_rule if lesson else "view")
    if rule not in COMPLETION_RULES:
        raise HTTPException(
            status_code=400, detail=f"Completion rule must be one of: {', '.join(COMPLETION_RULES)}"
        )

    # A pointer lesson with nothing to point at renders as an empty slot the
    # learner cannot complete, so it is refused at the door.
    pointer = POINTER_COLUMN.get(content_type)
    if pointer:
        value = data.get(pointer, getattr(lesson, pointer) if lesson else None)
        if not value:
            raise HTTPException(
                status_code=400,
                detail=f"A {content_type.replace('_', ' ')} lesson must name the item it opens.",
            )
        exists = {
            "resource_id": lambda v: db.query(LearningResource).filter(LearningResource.id == v).first(),
            "scorm_package_id": lambda v: db.query(ScormPackage).filter(ScormPackage.id == v).first(),
            "online_test_id": lambda v: db.query(OnlineTest).filter(OnlineTest.id == v).first(),
            "assignment_id": lambda v: db.query(Assignment).filter(Assignment.id == v).first(),
            "session_id": lambda v: db.query(CourseSession).filter(CourseSession.id == v).first(),
        }[pointer](value)
        if not exists:
            raise HTTPException(status_code=400, detail="That item no longer exists.")
    elif content_type == "text":
        content = data.get("content", lesson.content if lesson else None)
        if not (content or "").strip():
            raise HTTPException(status_code=400, detail="A text lesson needs some content.")
    else:
        url = data.get("url", lesson.url if lesson else None)
        if not (url or "").strip():
            raise HTTPException(
                status_code=400, detail=f"A {content_type} lesson needs a URL."
            )

    if rule == "score" and data.get("min_score", lesson.min_score if lesson else None) is None:
        raise HTTPException(
            status_code=400,
            detail="A lesson completed by score needs a minimum score.",
        )

    prerequisite_id = data.get("prerequisite_lesson_id")
    if prerequisite_id:
        if lesson and prerequisite_id == lesson.id:
            raise HTTPException(
                status_code=400, detail="A lesson cannot be its own prerequisite."
            )
        gate = (
            db.query(CourseLesson)
            .filter(CourseLesson.id == prerequisite_id, CourseLesson.course_id == course_id)
            .first()
        )
        if not gate:
            raise HTTPException(
                status_code=400,
                detail="A prerequisite must be another lesson on the same course.",
            )


@router.post("/{course_id}/sections/{section_id}/lessons", response_model=schemas.CourseLessonResponse)
def create_lesson(
    course_id: int,
    section_id: int,
    payload: schemas.CourseLessonCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    _get_course_or_404(db, course_id)
    section = (
        db.query(CourseSection)
        .filter(CourseSection.id == section_id, CourseSection.course_id == course_id)
        .first()
    )
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="Title is required")

    data = payload.model_dump()
    _validate_lesson(db, course_id, data)

    lesson = CourseLesson(**data)
    lesson.course_id = course_id
    lesson.section_id = section_id
    lesson.sequence_no = payload.sequence_no or _next_sequence(
        db, CourseLesson, section_id=section_id
    )

    db.add(lesson)
    db.commit()
    db.refresh(lesson)
    _recompute_course_enrollments(db, course_id)
    return schemas.CourseLessonResponse.model_validate(lesson)


@router.put("/{course_id}/lessons/{lesson_id}", response_model=schemas.CourseLessonResponse)
def update_lesson(
    course_id: int,
    lesson_id: int,
    payload: schemas.CourseLessonUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    lesson = (
        db.query(CourseLesson)
        .filter(CourseLesson.id == lesson_id, CourseLesson.course_id == course_id)
        .first()
    )
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")

    update_data = payload.model_dump(exclude_unset=True)
    _validate_lesson(db, course_id, update_data, lesson=lesson)
    for key, value in update_data.items():
        setattr(lesson, key, value)

    db.commit()
    db.refresh(lesson)
    _recompute_course_enrollments(db, course_id)
    return schemas.CourseLessonResponse.model_validate(lesson)


@router.delete("/{course_id}/lessons/{lesson_id}")
def delete_lesson(
    course_id: int,
    lesson_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    lesson = (
        db.query(CourseLesson)
        .filter(CourseLesson.id == lesson_id, CourseLesson.course_id == course_id)
        .first()
    )
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    db.delete(lesson)
    db.commit()
    _recompute_course_enrollments(db, course_id)
    return {"message": "Lesson deleted successfully"}


def _recompute_course_enrollments(db: Session, course_id: int) -> None:
    """Editing the outline changes what "finished" means, so every learner's
    percentage is restated rather than left describing the old shape."""
    for enrollment in (
        db.query(CourseEnrollment).filter(CourseEnrollment.course_id == course_id).all()
    ):
        recompute_enrollment(db, enrollment, commit=False)
    db.commit()


# ---------------------------------------------------------------------------
# Enrollment
# ---------------------------------------------------------------------------


def class_roster(db: Session, course: Course) -> list[Student]:
    """Everyone a class-scoped course covers. A course with no class named is
    school-wide and has no roster to auto-enroll -- staff nominate instead."""
    if not course.class_name:
        return []
    query = db.query(Student).filter(
        Student.class_name == course.class_name,
        (Student.student_status == "Active") | (Student.student_status.is_(None)),
    )
    if course.section:
        query = query.filter(Student.section == course.section)
    return query.order_by(Student.roll_no, Student.id).all()


def enroll_class_students(db: Session, course: Course, by: str | None) -> int:
    """Put the whole class on the course. Idempotent: re-publishing does not
    disturb learners who are already on it, or resurrect anyone dropped."""
    added = 0
    existing = {
        row.student_id
        for row in db.query(CourseEnrollment)
        .filter(CourseEnrollment.course_id == course.id)
        .all()
    }
    for student in class_roster(db, course):
        if student.id in existing:
            continue
        db.add(
            CourseEnrollment(
                course_id=course.id,
                student_id=student.id,
                student_name_snapshot=student_name(student),
                enrolled_via="class_auto",
                enrolled_by=by,
                enrolled_at=datetime.utcnow(),
                status="Enrolled",
            )
        )
        added += 1
    if added:
        db.commit()
    return added


class EnrollRequest(BaseModel):
    student_ids: list[int] = []
    # Ignore the list and take everyone in the course's class instead.
    whole_class: bool = False


@router.get("/{course_id}/enrollments", response_model=schemas.CourseProgressBoard)
def list_enrollments(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """Who is on the course and how far through -- the register and the
    progress report are the same screen for a teacher."""
    course = _get_course_or_404(db, course_id)
    enrollments = (
        db.query(CourseEnrollment)
        .filter(CourseEnrollment.course_id == course_id)
        .order_by(CourseEnrollment.student_name_snapshot, CourseEnrollment.id)
        .all()
    )
    for enrollment in enrollments:
        recompute_enrollment(db, enrollment, commit=False)
    db.commit()

    enrolled_ids = {e.student_id for e in enrollments}
    not_enrolled = [
        {
            "student_id": student.id,
            "student_name": student_name(student),
            "admission_no": student.admission_no,
            "roll_no": student.roll_no,
            "section": student.section,
        }
        for student in class_roster(db, course)
        if student.id not in enrolled_ids
    ]

    completed = [e for e in enrollments if e.status == "Completed"]
    return schemas.CourseProgressBoard(
        course=_course_response(db, course),
        enrollments=[schemas.CourseEnrollmentResponse.model_validate(e) for e in enrollments],
        not_enrolled=not_enrolled,
        enrolled_count=len(enrollments),
        completed_count=len(completed),
        average_progress=(
            round(sum(e.progress_percent or 0 for e in enrollments) / len(enrollments), 1)
            if enrollments else 0.0
        ),
    )


@router.post("/{course_id}/enrollments")
def enroll_students(
    course_id: int,
    payload: EnrollRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    course = _get_course_or_404(db, course_id)

    if payload.whole_class:
        added = enroll_class_students(db, course, current_user.name)
        return {"enrolled": added}

    if not payload.student_ids:
        raise HTTPException(status_code=400, detail="Name at least one student to enroll.")

    added = 0
    skipped_prerequisite = []
    for student_id in payload.student_ids:
        student = db.query(Student).filter(Student.id == student_id).first()
        if not student:
            continue
        # The prerequisite is a rule about the learner, so it is checked here
        # too -- nominating someone must not be a way around it.
        if not course_prerequisite_met(db, course, student.id):
            skipped_prerequisite.append(student_name(student))
            continue
        before = (
            db.query(CourseEnrollment)
            .filter(
                CourseEnrollment.course_id == course.id,
                CourseEnrollment.student_id == student.id,
            )
            .first()
        )
        get_or_create_enrollment(db, course, student, "nominated", current_user.name)
        if not before:
            added += 1

    return {
        "enrolled": added,
        "skipped_prerequisite": skipped_prerequisite,
    }


@router.delete("/{course_id}/enrollments/{enrollment_id}")
def remove_enrollment(
    course_id: int,
    enrollment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    enrollment = (
        db.query(CourseEnrollment)
        .filter(
            CourseEnrollment.id == enrollment_id,
            CourseEnrollment.course_id == course_id,
        )
        .first()
    )
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    db.delete(enrollment)
    db.commit()
    return {"message": "Enrollment removed"}


@router.get("/{course_id}/enrollments/{enrollment_id}/lessons")
def enrollment_lesson_detail(
    course_id: int,
    enrollment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """One learner's lesson-by-lesson state, for the teacher chasing a
    stalled course."""
    enrollment = (
        db.query(CourseEnrollment)
        .filter(
            CourseEnrollment.id == enrollment_id,
            CourseEnrollment.course_id == course_id,
        )
        .first()
    )
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment not found")

    state = recompute_enrollment(db, enrollment)
    lessons = _ordered_lessons(db, course_id)
    return {
        "enrollment": schemas.CourseEnrollmentResponse.model_validate(enrollment),
        "lessons": [
            {
                "lesson_id": lesson.id,
                "title": lesson.title,
                "content_type": lesson.content_type,
                "is_required": lesson.is_required,
                "completed": state.get(lesson.id, {}).get("completed", False),
                "score": state.get(lesson.id, {}).get("score"),
                "locked": state.get(lesson.id, {}).get("locked", False),
            }
            for lesson in lessons
        ],
    }


# ---------------------------------------------------------------------------
# Instructor-led sessions (blended courses)
# ---------------------------------------------------------------------------


@router.get("/{course_id}/sessions", response_model=list[schemas.CourseSessionResponse])
def list_sessions(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    _get_course_or_404(db, course_id)
    sessions = (
        db.query(CourseSession)
        .filter(CourseSession.course_id == course_id)
        .order_by(CourseSession.starts_at.asc().nullslast(), CourseSession.id)
        .all()
    )
    return [schemas.CourseSessionResponse.model_validate(s) for s in sessions]


@router.post("/{course_id}/sessions", response_model=schemas.CourseSessionResponse)
def create_session(
    course_id: int,
    payload: schemas.CourseSessionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    _get_course_or_404(db, course_id)
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="Title is required")
    if payload.mode not in ("classroom", "online"):
        raise HTTPException(status_code=400, detail="Mode must be classroom or online.")
    if payload.starts_at and payload.ends_at and payload.ends_at < payload.starts_at:
        raise HTTPException(status_code=400, detail="A session cannot end before it starts.")

    session = CourseSession(course_id=course_id, **payload.model_dump())
    if session.trainer_teacher_id:
        teacher = db.query(Teacher).filter(Teacher.id == session.trainer_teacher_id).first()
        session.trainer_name_snapshot = teacher.name if teacher else None

    db.add(session)
    db.commit()
    db.refresh(session)
    return schemas.CourseSessionResponse.model_validate(session)


@router.put("/{course_id}/sessions/{session_id}", response_model=schemas.CourseSessionResponse)
def update_session(
    course_id: int,
    session_id: int,
    payload: schemas.CourseSessionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    session = (
        db.query(CourseSession)
        .filter(CourseSession.id == session_id, CourseSession.course_id == course_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    update_data = payload.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(session, key, value)
    if "trainer_teacher_id" in update_data:
        teacher = (
            db.query(Teacher).filter(Teacher.id == session.trainer_teacher_id).first()
            if session.trainer_teacher_id else None
        )
        session.trainer_name_snapshot = teacher.name if teacher else None
    db.commit()
    db.refresh(session)
    return schemas.CourseSessionResponse.model_validate(session)


@router.delete("/{course_id}/sessions/{session_id}")
def delete_session(
    course_id: int,
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    session = (
        db.query(CourseSession)
        .filter(CourseSession.id == session_id, CourseSession.course_id == course_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()
    return {"message": "Session deleted successfully"}


class AttendanceMark(BaseModel):
    enrollment_id: int
    attended: bool
    remarks: str | None = None


class AttendanceRequest(BaseModel):
    marks: list[AttendanceMark]


@router.get("/{course_id}/sessions/{session_id}/attendance")
def session_attendance(
    course_id: int,
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    session = (
        db.query(CourseSession)
        .filter(CourseSession.id == session_id, CourseSession.course_id == course_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    enrollments = (
        db.query(CourseEnrollment)
        .filter(CourseEnrollment.course_id == course_id)
        .order_by(CourseEnrollment.student_name_snapshot, CourseEnrollment.id)
        .all()
    )
    marked = {
        row.enrollment_id: row
        for row in db.query(CourseSessionAttendance)
        .filter(CourseSessionAttendance.session_id == session_id)
        .all()
    }
    return {
        "session": schemas.CourseSessionResponse.model_validate(session),
        "rows": [
            {
                "enrollment_id": e.id,
                "student_id": e.student_id,
                "student_name": e.student_name_snapshot,
                "attended": bool(marked[e.id].attended) if e.id in marked else None,
                "remarks": marked[e.id].remarks if e.id in marked else None,
            }
            for e in enrollments
        ],
    }


@router.post("/{course_id}/sessions/{session_id}/attendance")
def mark_session_attendance(
    course_id: int,
    session_id: int,
    payload: AttendanceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    session = (
        db.query(CourseSession)
        .filter(CourseSession.id == session_id, CourseSession.course_id == course_id)
        .first()
    )
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    valid_enrollments = {
        e.id: e
        for e in db.query(CourseEnrollment)
        .filter(CourseEnrollment.course_id == course_id)
        .all()
    }
    now = datetime.utcnow()
    touched = []
    for mark in payload.marks:
        enrollment = valid_enrollments.get(mark.enrollment_id)
        if not enrollment:
            continue
        row = (
            db.query(CourseSessionAttendance)
            .filter(
                CourseSessionAttendance.session_id == session_id,
                CourseSessionAttendance.enrollment_id == mark.enrollment_id,
            )
            .first()
        )
        if not row:
            row = CourseSessionAttendance(
                session_id=session_id, enrollment_id=mark.enrollment_id
            )
            db.add(row)
        row.attended = mark.attended
        row.remarks = mark.remarks
        row.marked_by = current_user.name
        row.marked_at = now
        touched.append(enrollment)

    db.commit()
    # A session lesson is completed by attending, so marking the register
    # moves those learners on.
    for enrollment in touched:
        recompute_enrollment(db, enrollment, commit=False)
    db.commit()
    return {"marked": len(touched)}


@router.get("/{course_id}/feedback")
def course_feedback(
    course_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    _get_course_or_404(db, course_id)
    rows = (
        db.query(CourseFeedback)
        .filter(CourseFeedback.course_id == course_id)
        .order_by(CourseFeedback.created_at.desc())
        .all()
    )
    ratings = [row.rating for row in rows]
    return {
        "average_rating": round(sum(ratings) / len(ratings), 2) if ratings else None,
        "rating_count": len(ratings),
        "feedback": [
            {
                "id": row.id,
                "student_name": row.student_name_snapshot,
                "rating": row.rating,
                "comment": row.comment,
                "created_at": row.created_at,
            }
            for row in rows
        ],
    }
