"""Chasing overdue admissions follow-up on a schedule.

One email per staff member per run, listing every task and every inquiry
follow-up assigned to them that is due or overdue -- not one message per
item, which would turn a slow week of pipeline into a flood of mail.

Only items with a linked assigned_to_user_id are reminded about: the
free-text `assigned_to` name on an inquiry has no address to send to, and
this fails closed rather than guessing at one from the name.

Kept out of the route module so the "who's due what" logic can be tested
without HTTP, matching fee_reminders.py / leave.py / syllabus.py.
"""

from datetime import date

from sqlalchemy.orm import Session

from app import models

DEFAULT_BATCH_LIMIT = 200

# An inquiry that has left the pipeline has no more follow-ups to chase.
CLOSED_STAGES = ("Enrolled", "Lost")


def due_tasks(db: Session, as_of: date) -> list[models.AdmissionTask]:
    return (
        db.query(models.AdmissionTask)
        .filter(
            models.AdmissionTask.status == "Pending",
            models.AdmissionTask.due_date.isnot(None),
            models.AdmissionTask.due_date <= as_of,
            models.AdmissionTask.assigned_to_user_id.isnot(None),
        )
        .order_by(models.AdmissionTask.due_date)
        .all()
    )


def due_follow_ups(db: Session, as_of: date) -> list[models.AdmissionInquiry]:
    return (
        db.query(models.AdmissionInquiry)
        .filter(
            models.AdmissionInquiry.follow_up_date.isnot(None),
            models.AdmissionInquiry.follow_up_date <= as_of,
            models.AdmissionInquiry.assigned_to_user_id.isnot(None),
            models.AdmissionInquiry.converted_student_id.is_(None),
            models.AdmissionInquiry.stage.notin_(CLOSED_STAGES),
        )
        .order_by(models.AdmissionInquiry.follow_up_date)
        .all()
    )


def unreachable_tasks(db: Session, as_of: date) -> list[models.AdmissionTask]:
    """Due/overdue tasks nobody will be emailed about -- no linked user at
    all, so there is no address to fail closed *to*. Reported separately
    rather than silently dropped, so an admin can see the gap and link an
    owner rather than assume the reminder ran and covered everything."""
    return (
        db.query(models.AdmissionTask)
        .filter(
            models.AdmissionTask.status == "Pending",
            models.AdmissionTask.due_date.isnot(None),
            models.AdmissionTask.due_date <= as_of,
            models.AdmissionTask.assigned_to_user_id.is_(None),
        )
        .order_by(models.AdmissionTask.due_date)
        .all()
    )


def unreachable_follow_ups(db: Session, as_of: date) -> list[models.AdmissionInquiry]:
    return (
        db.query(models.AdmissionInquiry)
        .filter(
            models.AdmissionInquiry.follow_up_date.isnot(None),
            models.AdmissionInquiry.follow_up_date <= as_of,
            models.AdmissionInquiry.assigned_to_user_id.is_(None),
            models.AdmissionInquiry.converted_student_id.is_(None),
            models.AdmissionInquiry.stage.notin_(CLOSED_STAGES),
        )
        .order_by(models.AdmissionInquiry.follow_up_date)
        .all()
    )


def group_by_assignee(
    tasks: list[models.AdmissionTask], follow_ups: list[models.AdmissionInquiry]
) -> dict[int, dict]:
    by_user: dict[int, dict] = {}
    for task in tasks:
        by_user.setdefault(task.assigned_to_user_id, {"tasks": [], "follow_ups": []})["tasks"].append(task)
    for inquiry in follow_ups:
        by_user.setdefault(inquiry.assigned_to_user_id, {"tasks": [], "follow_ups": []})["follow_ups"].append(inquiry)
    return by_user


def compose(user_name: str, items: dict, as_of: date, school_name: str) -> tuple[str, str]:
    tasks, follow_ups = items["tasks"], items["follow_ups"]
    total = len(tasks) + len(follow_ups)
    subject = f"{total} admissions item(s) due — {school_name}"

    lines = [f"Dear {user_name},", "", "Your admissions follow-ups due:"]
    if follow_ups:
        lines += ["", "Inquiries to follow up:"]
        for inquiry in follow_ups:
            flag = " (overdue)" if inquiry.follow_up_date < as_of else ""
            lines.append(
                f"  - {inquiry.student_name} ({inquiry.inquiry_no}), stage: {inquiry.stage} "
                f"— due {inquiry.follow_up_date}{flag}"
            )
    if tasks:
        lines += ["", "Tasks:"]
        for task in tasks:
            flag = " (overdue)" if task.due_date < as_of else ""
            lines.append(f"  - {task.title} — due {task.due_date}{flag}")
    lines += ["", school_name]
    return subject, "\n".join(lines)


def run_reminders(
    db: Session,
    as_of: date | None = None,
    dry_run: bool = False,
    limit: int = DEFAULT_BATCH_LIMIT,
) -> dict:
    """Email every staff member with an overdue or due-today task or
    follow-up, one summary message each."""
    moment = as_of or date.today()

    tasks = due_tasks(db, moment)
    follow_ups = due_follow_ups(db, moment)
    unreachable_count = len(unreachable_tasks(db, moment)) + len(unreachable_follow_ups(db, moment))
    if not tasks and not follow_ups:
        return {
            "as_of": moment, "considered": 0, "sent": 0, "failed": 0, "skipped": 0,
            "unreachable_count": unreachable_count,
        }

    by_user = group_by_assignee(tasks, follow_ups)
    user_ids = list(by_user.keys())[:limit]
    users = {u.id: u for u in db.query(models.User).filter(models.User.id.in_(user_ids)).all()}
    settings = db.query(models.SchoolSettings).first()
    school_name = (settings.school_name if settings else None) or "School"

    counts = {"sent": 0, "failed": 0, "skipped": 0}
    detail = []

    for user_id in user_ids:
        user = users.get(user_id)
        if not user or not user.email:
            # The user was deleted after being assigned (ondelete=SET NULL
            # would have cleared assigned_to_user_id already, so this is
            # belt-and-braces) -- nowhere to send this one, recorded rather
            # than silently dropped.
            counts["skipped"] += 1
            continue

        items = by_user[user_id]
        subject, body = compose(user.name, items, moment, school_name)

        if dry_run:
            detail.append({
                "user_id": user_id, "email": user.email,
                "tasks": len(items["tasks"]), "follow_ups": len(items["follow_ups"]),
            })
            counts["sent"] += 1
            continue

        message = models.CommunicationLog(
            channel="Email", category="Admission Reminder",
            recipient_name=user.name, recipient_email=user.email,
            message_body=f"{subject}\n\n{body}",
            related_module="admissions", status="Pending",
        )
        db.add(message)
        db.flush()

        from app.routes.communications import deliver_message

        try:
            deliver_message(message, db)
        except Exception as exc:  # a transport failure must not abort the batch
            message.status = "Failed"
            message.error_message = str(exc)[:500]

        if message.status not in ("Failed", "Pending"):
            counts["sent"] += 1
        else:
            counts["failed"] += 1

        db.commit()

    if dry_run:
        db.rollback()

    return {
        "as_of": moment, "considered": len(user_ids),
        **counts, "dry_run": dry_run, "unreachable_count": unreachable_count,
        **({"detail": detail} if dry_run else {}),
    }
