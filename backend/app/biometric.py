"""Biometric attendance: punch ingestion and attendance derivation.

Kept separate from the route module so the same logic serves all three ingest
routes -- the HTTP endpoint used by terminals and on-prem agents, and the
scheduled puller in run_biometric_sync.py -- and so the interesting parts stay
testable without an HTTP client or a device.
"""

import hashlib
import json
import secrets
from datetime import datetime

from sqlalchemy.orm import Session

from app import models

# Terminals authenticate with one of these instead of a user session.
TOKEN_BYTES = 32


def generate_device_token() -> tuple[str, str]:
    """Return (plaintext, hash). Only the hash is stored."""
    token = secrets.token_urlsafe(TOKEN_BYTES)
    return token, hash_device_token(token)


def hash_device_token(token: str) -> str:
    """Plain SHA-256, deliberately not a slow KDF.

    These tokens are 256 bits of randomness rather than user-chosen secrets, so
    there is nothing to brute-force, and a terminal may authenticate on every
    batch -- an intentionally slow hash here would just burn CPU per punch.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def verify_device_token(token: str, token_hash: str | None) -> bool:
    if not token or not token_hash:
        return False
    return secrets.compare_digest(hash_device_token(token), token_hash)


def make_dedupe_key(device_id: int, device_user_id: str, punched_at: datetime, direction: str | None) -> str:
    """Stable identity for a punch.

    Devices retry, and a pull window normally overlaps the previous one, so the
    same punch arrives more than once. Two reads of the same person on the same
    device at the same second in the same direction are treated as one event.
    """
    parts = f"{device_id}|{device_user_id}|{punched_at.replace(microsecond=0).isoformat()}|{direction or ''}"
    return hashlib.sha256(parts.encode("utf-8")).hexdigest()


def resolve_enrollment(db: Session, device_id: int, device_user_id: str):
    """Find who a device-side id belongs to.

    A mapping naming this specific device wins over a device-agnostic one, so a
    single terminal that numbers people differently can be corrected without
    disturbing the shared roster.
    """
    device_user_id = str(device_user_id)

    specific = (
        db.query(models.BiometricEnrollment)
        .filter(
            models.BiometricEnrollment.device_id == device_id,
            models.BiometricEnrollment.device_user_id == device_user_id,
            models.BiometricEnrollment.is_active == True,  # noqa: E712
        )
        .first()
    )
    if specific:
        return specific

    return (
        db.query(models.BiometricEnrollment)
        .filter(
            models.BiometricEnrollment.device_id.is_(None),
            models.BiometricEnrollment.device_user_id == device_user_id,
            models.BiometricEnrollment.is_active == True,  # noqa: E712
        )
        .first()
    )


def parse_punch_timestamp(value) -> datetime:
    """Accept the timestamp shapes terminals and vendor APIs actually send."""
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)):
        return datetime.utcfromtimestamp(value)

    text = str(value).strip()
    if text.endswith("Z"):
        text = text[:-1]
    for fmt in (
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%d-%m-%Y %H:%M:%S",
        "%d/%m/%Y %H:%M:%S",
    ):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    # Last resort: fromisoformat handles fractional seconds and offsets.
    parsed = datetime.fromisoformat(text)
    return parsed.replace(tzinfo=None) if parsed.tzinfo else parsed


def normalise_direction(value) -> str | None:
    """Map the many ways devices spell in/out onto 'in', 'out', or unknown."""
    if value is None:
        return None
    text = str(value).strip().lower()
    if text in ("in", "0", "checkin", "check-in", "check_in", "i", "entry"):
        return "in"
    if text in ("out", "1", "checkout", "check-out", "check_out", "o", "exit"):
        return "out"
    return None


def ingest_punches(db: Session, device: models.BiometricDevice, records: list[dict]) -> dict:
    """Store a batch of raw punches, skipping ones already seen.

    Returns counts rather than raising on individual bad records: a single
    malformed row in a batch of hundreds should not cost the whole batch, and
    the device has no way to act on a partial failure anyway.
    """
    ingested = 0
    duplicates = 0
    unmatched = 0
    rejected = []
    # (student_id, date) pairs this batch affected, so derivation can be
    # incremental instead of re-reading the whole day.
    touched: set[tuple[int, object]] = set()

    for index, record in enumerate(records):
        try:
            device_user_id = str(record.get("device_user_id") or record.get("user_id") or "").strip()
            if not device_user_id:
                rejected.append({"index": index, "reason": "missing device_user_id"})
                continue

            raw_time = (
                record.get("timestamp")
                or record.get("punched_at")
                or record.get("time")
            )
            if raw_time is None:
                rejected.append({"index": index, "reason": "missing timestamp"})
                continue
            punched_at = parse_punch_timestamp(raw_time)
        except (ValueError, TypeError) as exc:
            rejected.append({"index": index, "reason": f"unparseable record: {exc}"})
            continue

        direction = normalise_direction(record.get("direction") or record.get("punch_type"))
        dedupe_key = make_dedupe_key(device.id, device_user_id, punched_at, direction)

        already = (
            db.query(models.BiometricPunch)
            .filter(models.BiometricPunch.dedupe_key == dedupe_key)
            .first()
        )
        if already:
            duplicates += 1
            continue

        enrollment = resolve_enrollment(db, device.id, device_user_id)
        if enrollment is None:
            unmatched += 1

        db.add(models.BiometricPunch(
            device_id=device.id,
            device_user_id=device_user_id,
            punched_at=punched_at,
            direction=direction,
            raw_payload=json.dumps(record, default=str),
            dedupe_key=dedupe_key,
            student_id=enrollment.student_id if enrollment else None,
            teacher_id=enrollment.teacher_id if enrollment else None,
        ))
        ingested += 1
        if enrollment and enrollment.student_id:
            touched.add((enrollment.student_id, punched_at.date()))

    device.last_seen_at = datetime.utcnow()
    db.commit()

    # Punches are useless sitting in their own table. Deriving here is what
    # makes a terminal at the gate show up on the attendance register without
    # anyone remembering to press a button.
    derived = derive_for_punches(db, touched)

    return {
        "ingested": ingested,
        "duplicates": duplicates,
        "unmatched": unmatched,
        "rejected": rejected,
        "attendance": derived,
    }


def derive_for_punches(db: Session, touched: set) -> dict:
    """Derive attendance for just the students and dates a batch touched.

    Incremental on purpose. Re-deriving the whole day on every punch would
    rewrite the register hundreds of times a morning, and a school with a
    thousand students would spend the entire first period doing it.

    Note what this deliberately does *not* do: mark anyone Absent. Absence is
    a judgement about a day that has finished -- at 08:05 nobody knows who is
    simply not here yet -- so that stays with the whole-day pass in
    derive_attendance_for_date, run by cron after school.
    """
    config = get_config(db)
    if not config.derive_attendance or not touched:
        return {"created": 0, "updated": 0, "skipped_manual": 0}

    created = updated = skipped_manual = 0

    for student_id, on_date in sorted(touched):
        student = db.query(models.Student).filter(models.Student.id == student_id).first()
        if not student:
            continue

        day_start = datetime.combine(on_date, datetime.min.time())
        day_end = datetime.combine(on_date, datetime.max.time())
        punches = (
            db.query(models.BiometricPunch)
            .filter(
                models.BiometricPunch.student_id == student_id,
                models.BiometricPunch.punched_at >= day_start,
                models.BiometricPunch.punched_at <= day_end,
            )
            .order_by(models.BiometricPunch.punched_at)
            .all()
        )
        if not punches:
            continue

        status = _status_for_punches(punches, config)
        existing = (
            db.query(models.Attendance)
            .filter(
                models.Attendance.student_id == student_id,
                models.Attendance.attendance_date == on_date,
            )
            .first()
        )

        if existing:
            if existing.source != "Biometric" and not config.overwrite_manual:
                skipped_manual += 1
                continue
            if existing.status != status or existing.source != "Biometric":
                existing.status = status
                existing.remarks = _remark_for(punches)
                existing.source = "Biometric"
                updated += 1
            continue

        db.add(models.Attendance(
            student_id=student_id,
            attendance_date=on_date,
            academic_year=None,
            class_id=student.class_id,
            class_name_snapshot=student.class_name,
            section_snapshot=student.section,
            status=status,
            remarks=_remark_for(punches),
            source="Biometric",
        ))
        created += 1

    for punch in db.query(models.BiometricPunch).filter(
        models.BiometricPunch.processed_at.is_(None),
        models.BiometricPunch.student_id.in_([sid for sid, _ in touched]),
    ).all():
        if (punch.student_id, punch.punched_at.date()) in touched:
            punch.processed_at = datetime.utcnow()

    db.commit()
    return {"created": created, "updated": updated, "skipped_manual": skipped_manual}


def get_config(db: Session) -> models.BiometricAttendanceConfig:
    """The school's derivation rules, created with safe defaults on first use."""
    config = db.query(models.BiometricAttendanceConfig).first()
    if not config:
        config = models.BiometricAttendanceConfig()
        db.add(config)
        db.commit()
        db.refresh(config)
    return config


def relink_unmatched_punches(db: Session) -> int:
    """Re-resolve punches that had no enrollment when they arrived.

    Called after enrollments change, so punches recorded before someone was
    mapped still count instead of being lost.
    """
    orphans = (
        db.query(models.BiometricPunch)
        .filter(
            models.BiometricPunch.student_id.is_(None),
            models.BiometricPunch.teacher_id.is_(None),
        )
        .all()
    )
    relinked = 0
    for punch in orphans:
        enrollment = resolve_enrollment(db, punch.device_id, punch.device_user_id)
        if enrollment:
            punch.student_id = enrollment.student_id
            punch.teacher_id = enrollment.teacher_id
            relinked += 1
    if relinked:
        db.commit()
    return relinked


def derive_attendance_for_date(db: Session, target_date, academic_year: str | None = None) -> dict:
    """Turn one day's punches into Attendance rows.

    Deliberately conservative:
      * a teacher's manual mark is left alone unless overwrite_manual is set,
        because a person is a better witness than a turnstile;
      * students with no punch are only marked Absent when absent_if_no_punch
        is on, since a terminal that quietly stopped reporting would otherwise
        mark the whole school absent.
    """
    config = get_config(db)
    if not config.derive_attendance:
        return {"created": 0, "updated": 0, "skipped_manual": 0, "absent_marked": 0, "disabled": True}

    day_start = datetime.combine(target_date, datetime.min.time())
    day_end = datetime.combine(target_date, datetime.max.time())

    punches = (
        db.query(models.BiometricPunch)
        .filter(
            models.BiometricPunch.punched_at >= day_start,
            models.BiometricPunch.punched_at <= day_end,
            models.BiometricPunch.student_id.isnot(None),
        )
        .order_by(models.BiometricPunch.punched_at)
        .all()
    )

    by_student: dict[int, list[models.BiometricPunch]] = {}
    for punch in punches:
        by_student.setdefault(punch.student_id, []).append(punch)

    created = 0
    updated = 0
    skipped_manual = 0

    for student_id, student_punches in by_student.items():
        student = db.query(models.Student).filter(models.Student.id == student_id).first()
        if not student:
            continue

        status = _status_for_punches(student_punches, config)

        existing = (
            db.query(models.Attendance)
            .filter(
                models.Attendance.student_id == student_id,
                models.Attendance.attendance_date == target_date,
            )
            .first()
        )

        if existing:
            # A person is a better witness than a turnstile, so a human's mark
            # stands. Read from the source column rather than sniffing remarks:
            # a teacher writing "Biometric device was down, marked by hand"
            # used to have their own mark classified as machine-written.
            is_ours = existing.source == "Biometric"
            if not is_ours and not config.overwrite_manual:
                skipped_manual += 1
                continue
            if existing.status != status:
                existing.status = status
                existing.remarks = _remark_for(student_punches)
                existing.source = "Biometric"
                updated += 1
            continue

        db.add(models.Attendance(
            student_id=student_id,
            attendance_date=target_date,
            academic_year=academic_year,
            class_id=student.class_id,
            class_name_snapshot=student.class_name,
            section_snapshot=student.section,
            status=status,
            remarks=_remark_for(student_punches),
            source="Biometric",
        ))
        created += 1

    absent_marked = 0
    if config.absent_if_no_punch:
        absent_marked = _mark_absent_without_punches(
            db, target_date, set(by_student.keys()), academic_year, config
        )

    for punch in punches:
        punch.processed_at = datetime.utcnow()

    db.commit()
    return {
        "created": created,
        "updated": updated,
        "skipped_manual": skipped_manual,
        "absent_marked": absent_marked,
        "disabled": False,
    }


def _status_for_punches(punches: list[models.BiometricPunch], config) -> str:
    """First punch decides lateness, last punch decides an early exit."""
    first = punches[0].punched_at.time()
    last = punches[-1].punched_at.time()

    if config.half_day_before and last < config.half_day_before:
        return "Half Day"
    if config.late_after and first > config.late_after:
        return "Late"
    return "Present"


def _remark_for(punches: list[models.BiometricPunch]) -> str:
    """A human-readable summary of the punches behind a derived row.

    Descriptive only. What protects a manual mark is Attendance.source, not
    this text.
    """
    first = punches[0].punched_at.strftime("%H:%M")
    last = punches[-1].punched_at.strftime("%H:%M")
    if first == last:
        return f"Biometric: {first}"
    return f"Biometric: {first}-{last}"


def _mark_absent_without_punches(db: Session, target_date, present_ids: set[int], academic_year, config) -> int:
    """Mark enrolled, active students who never punched as Absent."""
    enrolled_student_ids = {
        row.student_id
        for row in db.query(models.BiometricEnrollment)
        .filter(
            models.BiometricEnrollment.student_id.isnot(None),
            models.BiometricEnrollment.is_active == True,  # noqa: E712
        )
        .all()
    }

    marked = 0
    for student_id in enrolled_student_ids - present_ids:
        student = db.query(models.Student).filter(models.Student.id == student_id).first()
        if not student or student.student_status != "Active":
            continue

        existing = (
            db.query(models.Attendance)
            .filter(
                models.Attendance.student_id == student_id,
                models.Attendance.attendance_date == target_date,
            )
            .first()
        )
        if existing:
            continue

        db.add(models.Attendance(
            student_id=student_id,
            attendance_date=target_date,
            academic_year=academic_year,
            class_id=student.class_id,
            class_name_snapshot=student.class_name,
            section_snapshot=student.section,
            status="Absent",
            remarks="Biometric: no punch recorded",
            source="Biometric",
        ))
        marked += 1

    return marked
