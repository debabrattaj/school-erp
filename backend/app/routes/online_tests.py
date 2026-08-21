"""Online tests (quizzes): teacher-authored, auto-graded MCQ / True-False
tests taken by students through the parent/student portal.

Only objective question types are supported (mcq_single, true_false) — every
submission is scored immediately, so there is no manual-grading queue or
"pending review" state to build out.
"""

import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    OnlineTest,
    OnlineTestAttempt,
    OnlineTestQuestion,
    ProctoringAccessLog,
    ProctoringEvent,
    ProctoringPolicy,
    ProctoringSession,
    Student,
    Teacher,
    User,
)
from app.schemas import (
    OnlineTestCreate,
    OnlineTestQuestionCreate,
    OnlineTestQuestionResponse,
    OnlineTestQuestionUpdate,
    OnlineTestResponse,
    OnlineTestUpdate,
    ProctoringEventResponse,
    ProctoringPolicyCreate,
    ProctoringPolicyResponse,
    ProctoringPolicyUpdate,
    ProctoringReviewUpdate,
    ProctoringSessionDetailResponse,
    ProctoringSessionResponse,
)
from app.security import require_roles
from app.tenant import require_feature

# Proctoring is a separate SKU from online_tests -- a school can run online
# tests without ever buying this, so the policy/review routes below carry
# their own entitlement check on top of the router-wide online_tests gate.
PROCTORING_GATE = [Depends(require_feature("online_test_proctoring"))]

# Online Tests is sold separately and ships disabled. The entitlement check
# sits on the router itself so every route below inherits it -- including any
# added later, which is the point of putting it here rather than per-route.
router = APIRouter(
    prefix="/online-tests",
    tags=["Online Tests"],
    dependencies=[Depends(require_feature("online_tests"))],
)

MANAGERS = ["Admin", "Principal", "Teacher"]
VALID_STATUSES = ("Draft", "Published", "Closed")
VALID_QUESTION_TYPES = ("mcq_single", "true_false")


def _question_to_response(question: OnlineTestQuestion) -> OnlineTestQuestionResponse:
    options = json.loads(question.options) if question.options else None
    return OnlineTestQuestionResponse(
        id=question.id,
        question_type=question.question_type,
        question_text=question.question_text,
        options=options,
        correct_option=question.correct_option,
        marks=question.marks,
        sort_order=question.sort_order,
    )


def _test_to_response(db: Session, test: OnlineTest) -> OnlineTestResponse:
    questions = (
        db.query(OnlineTestQuestion).filter(OnlineTestQuestion.test_id == test.id).all()
    )
    return OnlineTestResponse(
        id=test.id,
        academic_year=test.academic_year,
        class_name=test.class_name,
        section=test.section,
        subject=test.subject,
        title=test.title,
        description=test.description,
        duration_minutes=test.duration_minutes,
        starts_at=test.starts_at,
        ends_at=test.ends_at,
        teacher_id=test.teacher_id,
        status=test.status,
        shuffle_questions=bool(test.shuffle_questions),
        shuffle_options=bool(test.shuffle_options),
        proctoring_enabled=bool(test.proctoring_enabled),
        proctoring_policy_id=test.proctoring_policy_id,
        teacher_name_snapshot=test.teacher_name_snapshot,
        total_marks=sum(q.marks or 0 for q in questions),
        question_count=len(questions),
        created_at=test.created_at,
        updated_at=test.updated_at,
    )


def _get_test_or_404(db: Session, test_id: int) -> OnlineTest:
    test = db.query(OnlineTest).filter(OnlineTest.id == test_id).first()
    if not test:
        raise HTTPException(status_code=404, detail="Online test not found")
    return test


def _get_policy_or_404(db: Session, policy_id: int) -> ProctoringPolicy:
    policy = db.query(ProctoringPolicy).filter(ProctoringPolicy.id == policy_id).first()
    if not policy:
        raise HTTPException(status_code=404, detail="Proctoring policy not found")
    return policy


# Registered ahead of GET/PUT/DELETE /{test_id} so "proctoring-policies" is
# never swallowed by the {test_id} path parameter (FastAPI matches routes in
# registration order; a literal segment declared after a same-shape
# parameterized route never gets a chance to match).
@router.get(
    "/proctoring-policies", response_model=list[ProctoringPolicyResponse], dependencies=PROCTORING_GATE
)
def list_proctoring_policies(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    return db.query(ProctoringPolicy).order_by(ProctoringPolicy.name).all()


@router.post(
    "/proctoring-policies", response_model=ProctoringPolicyResponse, dependencies=PROCTORING_GATE
)
def create_proctoring_policy(
    payload: ProctoringPolicyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    if not payload.name.strip():
        raise HTTPException(status_code=400, detail="Name is required")
    policy = ProctoringPolicy(**payload.model_dump())
    db.add(policy)
    db.commit()
    db.refresh(policy)
    return policy


@router.put(
    "/proctoring-policies/{policy_id}", response_model=ProctoringPolicyResponse, dependencies=PROCTORING_GATE
)
def update_proctoring_policy(
    policy_id: int,
    payload: ProctoringPolicyUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    policy = _get_policy_or_404(db, policy_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(policy, key, value)
    db.commit()
    db.refresh(policy)
    return policy


@router.delete("/proctoring-policies/{policy_id}", dependencies=PROCTORING_GATE)
def delete_proctoring_policy(
    policy_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    policy = _get_policy_or_404(db, policy_id)
    db.delete(policy)
    db.commit()
    return {"message": "Proctoring policy deleted successfully"}


@router.get("/", response_model=list[OnlineTestResponse])
def list_online_tests(
    class_name: str | None = None,
    section: str | None = None,
    academic_year: str | None = None,
    status: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    query = db.query(OnlineTest)
    if class_name:
        query = query.filter(OnlineTest.class_name == class_name)
    if section:
        query = query.filter(OnlineTest.section == section)
    if academic_year:
        query = query.filter(OnlineTest.academic_year == academic_year)
    if status:
        query = query.filter(OnlineTest.status == status)

    tests = query.order_by(OnlineTest.id.desc()).all()
    return [_test_to_response(db, test) for test in tests]


@router.post("/", response_model=OnlineTestResponse)
def create_online_test(
    payload: OnlineTestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="Title is required")
    if not payload.class_name.strip():
        raise HTTPException(status_code=400, detail="Class is required")

    data = payload.model_dump()
    test = OnlineTest(**data, status="Draft")
    if test.teacher_id:
        teacher = db.query(Teacher).filter(Teacher.id == test.teacher_id).first()
        test.teacher_name_snapshot = teacher.name if teacher else None

    db.add(test)
    db.commit()
    db.refresh(test)
    return _test_to_response(db, test)


@router.get("/{test_id}", response_model=OnlineTestResponse)
def get_online_test(
    test_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    return _test_to_response(db, _get_test_or_404(db, test_id))


@router.put("/{test_id}", response_model=OnlineTestResponse)
def update_online_test(
    test_id: int,
    payload: OnlineTestUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    test = _get_test_or_404(db, test_id)
    update_data = payload.model_dump(exclude_unset=True)

    if "status" in update_data and update_data["status"] not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"status must be one of {VALID_STATUSES}")

    for key, value in update_data.items():
        setattr(test, key, value)

    if "teacher_id" in update_data:
        teacher = db.query(Teacher).filter(Teacher.id == test.teacher_id).first() if test.teacher_id else None
        test.teacher_name_snapshot = teacher.name if teacher else None

    db.commit()
    db.refresh(test)
    return _test_to_response(db, test)


@router.delete("/{test_id}")
def delete_online_test(
    test_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    test = _get_test_or_404(db, test_id)
    db.delete(test)
    db.commit()
    return {"message": "Online test deleted successfully"}


@router.get("/{test_id}/questions", response_model=list[OnlineTestQuestionResponse])
def list_questions(
    test_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    _get_test_or_404(db, test_id)
    questions = (
        db.query(OnlineTestQuestion)
        .filter(OnlineTestQuestion.test_id == test_id)
        .order_by(OnlineTestQuestion.sort_order, OnlineTestQuestion.id)
        .all()
    )
    return [_question_to_response(q) for q in questions]


@router.post("/{test_id}/questions", response_model=OnlineTestQuestionResponse)
def add_question(
    test_id: int,
    payload: OnlineTestQuestionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    _get_test_or_404(db, test_id)

    if payload.question_type not in VALID_QUESTION_TYPES:
        raise HTTPException(status_code=400, detail=f"question_type must be one of {VALID_QUESTION_TYPES}")
    if not payload.question_text.strip():
        raise HTTPException(status_code=400, detail="Question text is required")

    if payload.question_type == "true_false":
        options = ["True", "False"]
        if payload.correct_option not in options:
            raise HTTPException(status_code=400, detail="correct_option must be 'True' or 'False'")
    else:
        options = [opt.strip() for opt in (payload.options or []) if opt.strip()]
        if len(options) < 2:
            raise HTTPException(status_code=400, detail="mcq_single needs at least 2 options")
        if payload.correct_option not in options:
            raise HTTPException(status_code=400, detail="correct_option must match one of the options")

    question = OnlineTestQuestion(
        test_id=test_id,
        question_type=payload.question_type,
        question_text=payload.question_text.strip(),
        options=json.dumps(options),
        correct_option=payload.correct_option,
        marks=payload.marks,
        sort_order=payload.sort_order,
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    return _question_to_response(question)


def _get_question_or_404(db: Session, test_id: int, question_id: int) -> OnlineTestQuestion:
    question = (
        db.query(OnlineTestQuestion)
        .filter(OnlineTestQuestion.id == question_id, OnlineTestQuestion.test_id == test_id)
        .first()
    )
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    return question


@router.put("/{test_id}/questions/{question_id}", response_model=OnlineTestQuestionResponse)
def update_question(
    test_id: int,
    question_id: int,
    payload: OnlineTestQuestionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    question = _get_question_or_404(db, test_id, question_id)
    update_data = payload.model_dump(exclude_unset=True)

    if "options" in update_data:
        options = [opt.strip() for opt in (update_data.pop("options") or []) if opt.strip()]
        question.options = json.dumps(options)

    for key, value in update_data.items():
        setattr(question, key, value)

    db.commit()
    db.refresh(question)
    return _question_to_response(question)


@router.delete("/{test_id}/questions/{question_id}")
def delete_question(
    test_id: int,
    question_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    question = _get_question_or_404(db, test_id, question_id)
    db.delete(question)
    db.commit()
    return {"message": "Question deleted successfully"}


@router.get("/{test_id}/results")
def get_online_test_results(
    test_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    _get_test_or_404(db, test_id)
    attempts = (
        db.query(OnlineTestAttempt)
        .filter(OnlineTestAttempt.test_id == test_id)
        .order_by(OnlineTestAttempt.id.desc())
        .all()
    )
    students = {
        s.id: s
        for s in db.query(Student).filter(
            Student.id.in_([a.student_id for a in attempts])
        ).all()
    } if attempts else {}

    # Proctoring is optional per test -- most attempts have no session, so
    # these lookups stay empty dicts and every attempt below just gets None.
    sessions_by_attempt = {
        s.attempt_id: s
        for s in db.query(ProctoringSession).filter(
            ProctoringSession.attempt_id.in_([a.id for a in attempts])
        ).all()
    } if attempts else {}
    flag_counts = {}
    if sessions_by_attempt:
        session_ids = [s.id for s in sessions_by_attempt.values()]
        flag_counts = dict(
            db.query(ProctoringEvent.session_id, func.count(ProctoringEvent.id))
            .filter(ProctoringEvent.session_id.in_(session_ids), ProctoringEvent.severity != "info")
            .group_by(ProctoringEvent.session_id)
            .all()
        )

    results = []
    for attempt in attempts:
        student = students.get(attempt.student_id)
        session = sessions_by_attempt.get(attempt.id)
        results.append({
            "id": attempt.id,
            "student_id": attempt.student_id,
            "student_name": (
                " ".join(filter(None, [student.first_name, student.last_name]))
                if student else "-"
            ),
            "admission_no": student.admission_no if student else None,
            "started_at": attempt.started_at,
            "submitted_at": attempt.submitted_at,
            "score": attempt.score,
            "max_score": attempt.max_score,
            "status": attempt.status,
            "proctoring_flag_count": flag_counts.get(session.id, 0) if session else None,
            "proctoring_review_status": session.review_status if session else None,
        })
    return results


@router.get(
    "/{test_id}/results/{attempt_id}/proctoring",
    response_model=ProctoringSessionDetailResponse,
    dependencies=PROCTORING_GATE,
)
def get_proctoring_session_detail(
    test_id: int,
    attempt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    _get_test_or_404(db, test_id)
    attempt = (
        db.query(OnlineTestAttempt)
        .filter(OnlineTestAttempt.id == attempt_id, OnlineTestAttempt.test_id == test_id)
        .first()
    )
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    session = db.query(ProctoringSession).filter(ProctoringSession.attempt_id == attempt_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="This attempt was not proctored")

    events = (
        db.query(ProctoringEvent)
        .filter(ProctoringEvent.session_id == session.id)
        .order_by(ProctoringEvent.occurred_at)
        .all()
    )
    flag_count = sum(1 for e in events if e.severity != "info")

    # Every view of a session's data is logged, so "who watched this
    # student's session" stays answerable.
    db.add(ProctoringAccessLog(session_id=session.id, viewed_by=current_user.email, action="view"))
    db.commit()

    return ProctoringSessionDetailResponse(
        id=session.id,
        attempt_id=session.attempt_id,
        started_at=session.started_at,
        ended_at=session.ended_at,
        review_status=session.review_status,
        reviewed_by=session.reviewed_by,
        reviewed_at=session.reviewed_at,
        reviewer_notes=session.reviewer_notes,
        flag_count=flag_count,
        events=[ProctoringEventResponse.model_validate(e) for e in events],
    )


@router.put(
    "/{test_id}/results/{attempt_id}/proctoring/review",
    response_model=ProctoringSessionResponse,
    dependencies=PROCTORING_GATE,
)
def review_proctoring_session(
    test_id: int,
    attempt_id: int,
    payload: ProctoringReviewUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """Human review verdict on a proctoring session. Never set automatically --
    a high violation count is a prompt to look, not an accusation the system
    makes on its own; only a person can move a session out of Pending."""
    _get_test_or_404(db, test_id)
    attempt = (
        db.query(OnlineTestAttempt)
        .filter(OnlineTestAttempt.id == attempt_id, OnlineTestAttempt.test_id == test_id)
        .first()
    )
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    session = db.query(ProctoringSession).filter(ProctoringSession.attempt_id == attempt_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="This attempt was not proctored")

    valid_statuses = ("Pending", "Cleared", "Flagged")
    if payload.review_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"review_status must be one of {valid_statuses}")

    session.review_status = payload.review_status
    session.reviewer_notes = payload.reviewer_notes
    session.reviewed_by = current_user.email
    session.reviewed_at = datetime.utcnow()
    db.add(ProctoringAccessLog(session_id=session.id, viewed_by=current_user.email, action="review"))
    db.commit()
    db.refresh(session)

    flag_count = (
        db.query(ProctoringEvent)
        .filter(ProctoringEvent.session_id == session.id, ProctoringEvent.severity != "info")
        .count()
    )
    return ProctoringSessionResponse(
        id=session.id,
        attempt_id=session.attempt_id,
        started_at=session.started_at,
        ended_at=session.ended_at,
        review_status=session.review_status,
        reviewed_by=session.reviewed_by,
        reviewed_at=session.reviewed_at,
        reviewer_notes=session.reviewer_notes,
        flag_count=flag_count,
    )
