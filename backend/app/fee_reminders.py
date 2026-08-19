"""Chasing unpaid fees on a schedule.

An escalation ladder: rungs fire at offsets from a fee's due date -- a
courtesy note before, then progressively firmer chases after. Each rung fires
at most once per fee, enforced by a unique constraint rather than by hoping
the cron does not overlap.

Three decisions here are worth knowing about, because getting any of them
wrong is the difference between a collections tool and a complaint:

* **Only the furthest-along rung fires.** Switching this on against a term of
  unpaid fees would otherwise send every parent the +7, +15 and +30 messages
  in the same minute. The rungs that were passed are written down as
  Superseded, so they are accounted for and can never fire later.

* **The figure quoted is what is actually outstanding** -- net of concession
  and of anything already paid. Billing a parent for the full amount after
  they paid half is the fastest way to lose their trust in the whole system.

* **A family with no contact details produces a Skipped row with a reason.**
  A silent absence is indistinguishable from a bug, and "we never got any
  reminder" is exactly the dispute this has to be able to answer.
"""

from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from app import models

REMINDER_STATUSES = ("Sent", "Failed", "Skipped", "Superseded")
CHANNELS = ("Email", "SMS", "WhatsApp", "In App")

# A fee in any of these is settled and must never be chased.
SETTLED_STATUSES = ("Paid", "Cancelled", "Waived")

# Shared hosting kills a long-running cron, and a half-sent batch that cannot
# say how far it got is worse than a small one. The rest goes next run.
DEFAULT_BATCH_LIMIT = 200


class ReminderError(Exception):
    """A reminder problem worth showing a human."""


def _now() -> datetime:
    return datetime.utcnow()


# ---------------------------------------------------------------------------
# What is owed
# ---------------------------------------------------------------------------


def outstanding_for(fee: models.Fee) -> float:
    """What this fee still owes, net of concession and payments.

    Recomputed rather than read from fee.due_amount: that column is maintained
    by the fee routes, and a reminder quoting a stale figure is the one number
    in this system a parent will definitely check.
    """
    payable = (fee.total_amount or 0) - (fee.concession_amount or 0)
    return round(max(payable - (fee.paid_amount or 0), 0), 2)


def is_chaseable(fee: models.Fee) -> tuple[bool, str | None]:
    """Whether this fee should be chased at all, and why not if it should not."""
    if fee.payment_status in SETTLED_STATUSES:
        return False, f"fee is {fee.payment_status}"
    if not fee.due_date:
        # Without a due date there is no ladder to climb.
        return False, "no due date on the fee"
    if outstanding_for(fee) <= 0:
        return False, "nothing outstanding"
    return True, None


# ---------------------------------------------------------------------------
# The ladder
# ---------------------------------------------------------------------------


def active_rules(db: Session) -> list[models.FeeReminderRule]:
    """Rungs in ladder order, earliest offset first."""
    return (
        db.query(models.FeeReminderRule)
        .filter(models.FeeReminderRule.is_active == True)  # noqa: E712
        .order_by(models.FeeReminderRule.offset_days, models.FeeReminderRule.id)
        .all()
    )


def rung_is_due(fee: models.Fee, rule: models.FeeReminderRule, as_of: date) -> bool:
    """Has this rung's date arrived for this fee?"""
    if not fee.due_date:
        return False
    return as_of >= fee.due_date + timedelta(days=rule.offset_days)


def already_handled(db: Session, fee_id: int, rule_ids: list[int]) -> set[int]:
    """Rungs already recorded against this fee, in any status.

    Superseded counts as handled: a rung passed over during catch-up must not
    quietly become due again the next time the cron runs.
    """
    if not rule_ids:
        return set()
    rows = (
        db.query(models.FeeReminderLog.rule_id)
        .filter(
            models.FeeReminderLog.fee_id == fee_id,
            models.FeeReminderLog.rule_id.in_(rule_ids),
        )
        .all()
    )
    return {r[0] for r in rows}


def rungs_for(db: Session, fee: models.Fee, rules: list[models.FeeReminderRule], as_of: date):
    """(rung to fire, rungs it passed over) for one fee.

    Returns (None, []) when nothing is due. The passed-over rungs are returned
    so the caller can record them, which is what stops a term's worth of
    backlog arriving as three simultaneous emails.
    """
    outstanding = outstanding_for(fee)
    handled = already_handled(db, fee.id, [r.id for r in rules])

    due = [
        rule for rule in rules
        if rule.id not in handled
        and rung_is_due(fee, rule, as_of)
        and outstanding >= (rule.min_due_amount or 0)
    ]
    if not due:
        return None, []

    # Furthest along the ladder wins; everything before it is superseded.
    due.sort(key=lambda r: (r.offset_days, r.id))
    return due[-1], due[:-1]


# ---------------------------------------------------------------------------
# Who to tell
# ---------------------------------------------------------------------------


def recipient_for(db: Session, student: models.Student) -> dict:
    """Name, email and phone for whoever should hear about this fee.

    The student's own guardian fields first, then a linked portal parent --
    schools fill in one or the other and rarely both.
    """
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


def can_reach(recipient: dict, channel: str) -> tuple[bool, str | None]:
    """Whether this recipient is reachable on this channel."""
    if channel == "Email":
        return (True, None) if recipient.get("email") else (False, "no email address on file")
    if channel in ("SMS", "WhatsApp"):
        return (True, None) if recipient.get("phone") else (False, "no phone number on file")
    return True, None   # In App needs no contact detail


# ---------------------------------------------------------------------------
# What to say
# ---------------------------------------------------------------------------


DEFAULT_SUBJECT = "Fee reminder: {fee_type} for {student_name}"
DEFAULT_BODY = (
    "Dear {recipient_name},\n\n"
    "This is a reminder that {amount_due} is outstanding for {student_name} "
    "({class_name}) towards {fee_type}.\n"
    "Due date: {due_date}\n\n"
    "If you have already paid, please ignore this message.\n\n"
    "{school_name}"
)


def build_context(db: Session, fee: models.Fee, student: models.Student, recipient: dict) -> dict:
    settings = db.query(models.SchoolSettings).first()
    class_name = " ".join(
        filter(None, [fee.class_name_snapshot or student.class_name, fee.section_snapshot or student.section])
    )
    return {
        "student_name": " ".join(filter(None, [student.first_name, student.last_name])),
        "admission_no": student.admission_no or "",
        "class_name": class_name or "",
        "recipient_name": recipient["name"],
        "fee_type": fee.fee_type or "fees",
        "academic_year": fee.academic_year or "",
        "billing_period": fee.billing_period or "",
        "total_amount": f"{fee.total_amount or 0:,.2f}",
        "concession_amount": f"{fee.concession_amount or 0:,.2f}",
        "paid_amount": f"{fee.paid_amount or 0:,.2f}",
        "amount_due": f"{outstanding_for(fee):,.2f}",
        "due_date": fee.due_date.isoformat() if fee.due_date else "",
        "days_overdue": str((date.today() - fee.due_date).days) if fee.due_date else "",
        "school_name": (settings.school_name if settings else "") or "",
    }


def render(text: str | None, context: dict) -> str:
    """Fill {placeholders} from the context, leaving unknown ones alone.

    A template naming a variable this module does not provide should show up
    in the message as itself rather than raising -- a KeyError here would stop
    the whole run over one school's typo.
    """
    if not text:
        return ""
    out = text
    for key, value in context.items():
        out = out.replace("{" + key + "}", str(value))
    return out


def compose(db: Session, rule: models.FeeReminderRule, context: dict) -> tuple[str, str]:
    """(subject, body) from the rule's template, or the built-in wording."""
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


def _log_reminder(db, fee, rule, student, status, **fields) -> models.FeeReminderLog:
    entry = models.FeeReminderLog(
        fee_id=fee.id, rule_id=rule.id, student_id=student.id if student else None,
        status=status, outstanding_amount=outstanding_for(fee),
        offset_days=rule.offset_days, sent_on=date.today(), sent_at=_now(),
        **fields,
    )
    db.add(entry)
    return entry


def send_one(db: Session, fee: models.Fee, rule: models.FeeReminderRule, student: models.Student) -> dict:
    """Send one reminder, recording the outcome whatever it is."""
    recipient = recipient_for(db, student)
    reachable, reason = can_reach(recipient, rule.channel)
    if not reachable:
        _log_reminder(db, fee, rule, student, "Skipped",
                      skip_reason=reason, recipient=recipient["name"])
        return {"status": "Skipped", "reason": reason}

    context = build_context(db, fee, student, recipient)
    subject, body = compose(db, rule, context)

    # The message goes in communication_logs with every other message the
    # school has sent, rather than into a parallel history nobody thinks to
    # search when a parent asks what they were told.
    message = models.CommunicationLog(
        template_id=rule.template_id, channel=rule.channel, category="Fee Reminder",
        recipient_name=recipient["name"], recipient_email=recipient["email"] or None,
        recipient_phone=recipient["phone"] or None,
        message_body=body, related_module="fees", related_record_id=fee.id,
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
        db, fee, rule, student,
        "Sent" if sent else "Failed",
        communication_log_id=message.id,
        recipient=recipient["email"] or recipient["phone"] or recipient["name"],
        error_message=None if sent else (message.error_message or "delivery failed")[:500],
    )
    return {"status": "Sent" if sent else "Failed", "recipient": recipient["name"]}


def run_reminders(
    db: Session,
    as_of: date | None = None,
    dry_run: bool = False,
    limit: int = DEFAULT_BATCH_LIMIT,
) -> dict:
    """Walk every chaseable fee and fire whichever rung is furthest along."""
    moment = as_of or date.today()
    rules = active_rules(db)
    if not rules:
        return {"as_of": moment, "rules": 0, "considered": 0, "sent": 0,
                "skipped": 0, "failed": 0, "superseded": 0,
                "note": "No active reminder rules — nothing to do."}

    candidates = (
        db.query(models.Fee)
        .filter(models.Fee.payment_status.notin_(SETTLED_STATUSES))
        .filter(models.Fee.due_date.isnot(None))
        .order_by(models.Fee.due_date)
        .all()
    )

    students = {s.id: s for s in db.query(models.Student).all()}
    counts = {"sent": 0, "skipped": 0, "failed": 0, "superseded": 0}
    considered = 0
    detail = []

    for fee in candidates:
        if counts["sent"] + counts["failed"] >= limit:
            break

        chaseable, why_not = is_chaseable(fee)
        if not chaseable:
            continue

        rung, passed = rungs_for(db, fee, rules, moment)
        if not rung:
            continue

        considered += 1
        student = students.get(fee.student_id)
        if not student:
            continue

        if dry_run:
            detail.append({
                "fee_id": fee.id, "student_id": fee.student_id,
                "rule": rung.name, "offset_days": rung.offset_days,
                "channel": rung.channel, "outstanding": outstanding_for(fee),
                "superseded": [r.name for r in passed],
            })
            counts["sent"] += 1
            counts["superseded"] += len(passed)
            continue

        # Record the passed-over rungs first, so a crash midway cannot leave
        # them due to fire on their own later.
        for skipped_rule in passed:
            _log_reminder(db, fee, skipped_rule, student, "Superseded",
                          skip_reason=f"passed over by '{rung.name}'")
            counts["superseded"] += 1

        result = send_one(db, fee, rung, student)
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
