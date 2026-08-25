"""Chasing overdue library books on a schedule.

Mirrors app.fee_reminders closely -- an escalation ladder of rungs, each an
offset in days from the thing's due date, each firing at most once, with only
the furthest-along rung firing so switching the feature on against an
existing backlog of overdue books does not flood every parent with three
messages in the same minute. The differences from fee reminders:

* A library rung only ever fires **after** the due date -- there is nothing
  to "remind" about a book that is not yet late, unlike a courtesy note
  before a fee falls due. offset_days is meant to stay >= 1.

* The borrower can be a student (chased through the guardian, same as fees)
  or a staff member (chased directly, through their own email/phone).

* The fine quoted is recomputed from LibrarySettings at send time, the same
  reasoning as fee reminders' outstanding_for(): the number a parent can
  check against the librarian's desk must never be a stale stored figure.
"""

from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app import models
from app.fee_reminders import can_reach, render  # generic enough to reuse as-is

REMINDER_STATUSES = ("Sent", "Failed", "Skipped", "Superseded")
CHANNELS = ("Email", "SMS", "WhatsApp", "In App")

# An issue in any of these has nothing left to chase.
SETTLED_STATUSES = ("Returned", "Lost", "Damaged")

DEFAULT_BATCH_LIMIT = 200


def _now() -> datetime:
    return datetime.utcnow()


# ---------------------------------------------------------------------------
# Settings and the fine
# ---------------------------------------------------------------------------


def get_settings(db: Session) -> models.LibrarySettings:
    settings = db.query(models.LibrarySettings).first()
    if not settings:
        settings = models.LibrarySettings()
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def days_overdue(issue: models.LibraryIssue, as_of: date) -> int:
    if not issue.due_date:
        return 0
    return max((as_of - issue.due_date).days, 0)


def current_fine(issue: models.LibraryIssue, settings: models.LibrarySettings, as_of: date) -> float:
    overdue = days_overdue(issue, as_of)
    chargeable = max(overdue - (settings.fine_grace_days or 0), 0)
    return round(chargeable * (settings.fine_per_day or 0), 2)


# ---------------------------------------------------------------------------
# The ladder
# ---------------------------------------------------------------------------


def is_chaseable(issue: models.LibraryIssue) -> tuple[bool, str | None]:
    if issue.status in SETTLED_STATUSES:
        return False, f"issue is {issue.status}"
    if issue.status != "Issued":
        return False, f"issue is {issue.status}"
    if not issue.due_date:
        return False, "no due date on the issue"
    return True, None


def active_rules(db: Session) -> list[models.LibraryReminderRule]:
    return (
        db.query(models.LibraryReminderRule)
        .filter(models.LibraryReminderRule.is_active == True)  # noqa: E712
        .order_by(models.LibraryReminderRule.offset_days, models.LibraryReminderRule.id)
        .all()
    )


def rung_is_due(issue: models.LibraryIssue, rule: models.LibraryReminderRule, as_of: date) -> bool:
    if not issue.due_date:
        return False
    return as_of >= issue.due_date + timedelta(days=rule.offset_days)


def already_handled(db: Session, issue_id: int, rule_ids: list[int]) -> set[int]:
    if not rule_ids:
        return set()
    rows = (
        db.query(models.LibraryReminderLog.rule_id)
        .filter(
            models.LibraryReminderLog.issue_id == issue_id,
            models.LibraryReminderLog.rule_id.in_(rule_ids),
        )
        .all()
    )
    return {r[0] for r in rows}


def rungs_for(db: Session, issue: models.LibraryIssue, rules: list[models.LibraryReminderRule], as_of: date):
    """(rung to fire, rungs it passed over) for one issue -- (None, []) when
    nothing is due yet."""
    handled = already_handled(db, issue.id, [r.id for r in rules])
    due = [
        rule for rule in rules
        if rule.id not in handled and rung_is_due(issue, rule, as_of)
    ]
    if not due:
        return None, []
    due.sort(key=lambda r: (r.offset_days, r.id))
    return due[-1], due[:-1]


# ---------------------------------------------------------------------------
# Who to tell
# ---------------------------------------------------------------------------


def recipient_for(db: Session, issue: models.LibraryIssue) -> dict:
    """Name, email and phone for whoever should hear about this overdue book."""
    if issue.borrower_type == "Staff":
        teacher = db.query(models.Teacher).filter(models.Teacher.id == issue.staff_id).first()
        if not teacher:
            return {"name": "Staff member", "email": "", "phone": ""}
        return {
            "name": teacher.name or "Staff member",
            "email": (teacher.email or "").strip(),
            "phone": (teacher.phone or "").strip(),
        }

    student = db.query(models.Student).filter(models.Student.id == issue.student_id).first()
    if not student:
        return {"name": "Parent/Guardian", "email": "", "phone": ""}

    # Same lookup fee reminders uses: the student's own guardian fields
    # first, then a linked portal parent.
    name = (student.guardian_name or student.father_name or student.mother_name or "").strip()
    email = (student.guardian_email or "").strip()
    phone = (student.guardian_phone or "").strip()
    if not email or not name:
        link = (
            db.query(models.ParentStudentLink, models.User)
            .join(models.User, models.User.id == models.ParentStudentLink.user_id)
            .filter(models.ParentStudentLink.student_id == student.id)
            .first()
        )
        if link:
            _, user = link
            name = name or (user.name or "").strip()
            email = email or (user.email or "").strip()
    return {"name": name or "Parent/Guardian", "email": email, "phone": phone}


# ---------------------------------------------------------------------------
# What to say
# ---------------------------------------------------------------------------


DEFAULT_SUBJECT = "Overdue library book: {book_title}"
DEFAULT_BODY = (
    "Dear {recipient_name},\n\n"
    "{book_title} (accession {accession_no}), borrowed by {borrower_name}, is now "
    "{days_overdue} day(s) overdue.\n"
    "Due date: {due_date}\n"
    "Estimated fine so far: {fine_amount}\n\n"
    "Please return the book at the earliest. If it has already been returned, "
    "please ignore this message.\n\n"
    "{school_name}"
)


def build_context(db: Session, issue: models.LibraryIssue, recipient: dict,
                   settings: models.LibrarySettings, as_of: date) -> dict:
    book = db.query(models.LibraryBook).filter(models.LibraryBook.id == issue.book_id).first()
    school = db.query(models.SchoolSettings).first()

    if issue.borrower_type == "Staff":
        teacher = db.query(models.Teacher).filter(models.Teacher.id == issue.staff_id).first()
        borrower_name = teacher.name if teacher else ""
        borrower_group = teacher.department if teacher else ""
    else:
        student = db.query(models.Student).filter(models.Student.id == issue.student_id).first()
        borrower_name = " ".join(filter(None, [student.first_name, student.last_name])) if student else ""
        borrower_group = " ".join(filter(None, [student.class_name, student.section])) if student else ""

    return {
        "book_title": book.title if book else "",
        "accession_no": book.accession_no if book else "",
        "borrower_name": borrower_name or "",
        "borrower_group": borrower_group or "",
        "recipient_name": recipient["name"],
        "due_date": issue.due_date.isoformat() if issue.due_date else "",
        "days_overdue": str(days_overdue(issue, as_of)),
        "fine_amount": f"{current_fine(issue, settings, as_of):,.2f}",
        "school_name": (school.school_name if school else "") or "",
    }


def compose(db: Session, rule: models.LibraryReminderRule, context: dict) -> tuple[str, str]:
    template = None
    if rule.template_id:
        template = (
            db.query(models.CommunicationTemplate)
            .filter(models.CommunicationTemplate.id == rule.template_id)
            .first()
        )
    if template:
        return render(template.subject, context), render(template.body, context)
    return render(DEFAULT_SUBJECT, context), render(DEFAULT_BODY, context)


# ---------------------------------------------------------------------------
# Sending
# ---------------------------------------------------------------------------


def _log_reminder(db, issue, rule, status, **fields) -> models.LibraryReminderLog:
    entry = models.LibraryReminderLog(
        issue_id=issue.id, rule_id=rule.id,
        student_id=issue.student_id, staff_id=issue.staff_id,
        status=status, offset_days=rule.offset_days,
        sent_on=date.today(), sent_at=_now(),
        **fields,
    )
    db.add(entry)
    return entry


def send_one(db: Session, issue: models.LibraryIssue, rule: models.LibraryReminderRule,
             settings: models.LibrarySettings, as_of: date) -> dict:
    recipient = recipient_for(db, issue)
    reachable, reason = can_reach(recipient, rule.channel)
    fine = current_fine(issue, settings, as_of)
    if not reachable:
        _log_reminder(db, issue, rule, "Skipped", skip_reason=reason,
                      recipient=recipient["name"], fine_amount=fine)
        return {"status": "Skipped", "reason": reason}

    context = build_context(db, issue, recipient, settings, as_of)
    subject, body = compose(db, rule, context)

    message = models.CommunicationLog(
        template_id=rule.template_id, channel=rule.channel, category="Library Overdue",
        recipient_name=recipient["name"], recipient_email=recipient["email"] or None,
        recipient_phone=recipient["phone"] or None,
        message_body=body, related_module="library", related_record_id=issue.id,
        status="Pending",
    )
    if rule.channel == "Email":
        message.message_body = f"{subject}\n\n{body}"
    db.add(message)
    db.flush()

    from app.routes.communications import deliver_message

    try:
        deliver_message(message, db)
    except Exception as exc:   # a transport failure must not abort the batch
        message.status = "Failed"
        message.error_message = str(exc)[:500]

    sent = message.status not in ("Failed", "Pending")
    _log_reminder(
        db, issue, rule,
        "Sent" if sent else "Failed",
        communication_log_id=message.id,
        recipient=recipient["email"] or recipient["phone"] or recipient["name"],
        fine_amount=fine,
        error_message=None if sent else (message.error_message or "delivery failed")[:500],
    )
    return {"status": "Sent" if sent else "Failed", "recipient": recipient["name"]}


def run_reminders(
    db: Session,
    as_of: date | None = None,
    dry_run: bool = False,
    limit: int = DEFAULT_BATCH_LIMIT,
) -> dict:
    """Walk every chaseable overdue issue and fire whichever rung is furthest
    along."""
    moment = as_of or date.today()
    rules = active_rules(db)
    if not rules:
        return {"as_of": moment, "rules": 0, "considered": 0, "sent": 0,
                "skipped": 0, "failed": 0, "superseded": 0,
                "note": "No active reminder rules — nothing to do."}

    settings = get_settings(db)
    candidates = (
        db.query(models.LibraryIssue)
        .filter(models.LibraryIssue.status == "Issued")
        .filter(models.LibraryIssue.due_date.isnot(None))
        .order_by(models.LibraryIssue.due_date)
        .all()
    )

    counts = {"sent": 0, "skipped": 0, "failed": 0, "superseded": 0}
    considered = 0
    detail = []

    for issue in candidates:
        if counts["sent"] + counts["failed"] >= limit:
            break

        chaseable, why_not = is_chaseable(issue)
        if not chaseable:
            continue

        rung, passed = rungs_for(db, issue, rules, moment)
        if not rung:
            continue

        considered += 1

        if dry_run:
            detail.append({
                "issue_id": issue.id, "book_id": issue.book_id,
                "borrower_type": issue.borrower_type,
                "student_id": issue.student_id, "staff_id": issue.staff_id,
                "rule": rung.name, "offset_days": rung.offset_days,
                "channel": rung.channel, "fine_amount": current_fine(issue, settings, moment),
                "superseded": [r.name for r in passed],
            })
            counts["sent"] += 1
            counts["superseded"] += len(passed)
            continue

        for skipped_rule in passed:
            _log_reminder(db, issue, skipped_rule, "Superseded",
                          skip_reason=f"passed over by '{rung.name}'")
            counts["superseded"] += 1

        result = send_one(db, issue, rung, settings, moment)
        if result["status"] == "Sent":
            counts["sent"] += 1
        elif result["status"] == "Failed":
            counts["failed"] += 1
        else:
            counts["skipped"] += 1

        db.commit()

    if dry_run:
        db.rollback()

    return {
        "as_of": moment, "rules": len(rules), "considered": considered,
        **counts, "dry_run": dry_run,
        **({"detail": detail} if dry_run else {}),
    }
