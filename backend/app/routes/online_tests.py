"""Online tests (quizzes): teacher-authored, auto-graded MCQ / True-False
tests taken by students through the parent/student portal.

Only objective question types are supported (mcq_single, true_false) — every
submission is scored immediately, so there is no manual-grading queue or
"pending review" state to build out.
"""

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    OnlineTest,
    OnlineTestAttempt,
    OnlineTestQuestion,
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
)
from app.security import require_roles

router = APIRouter(prefix="/online-tests", tags=["Online Tests"])

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

    results = []
    for attempt in attempts:
        student = students.get(attempt.student_id)
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
        })
    return results
