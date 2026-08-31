"""Biometric attendance routes.

Two audiences with different authentication:

  * Staff (Admin/Principal) manage devices, enrollments and rules with a normal
    user session.
  * Terminals and on-prem agents POST punches to /biometric/ingest. A device
    cannot hold a login, so it authenticates with a per-device bearer token and
    identifies its tenant with the X-School-Code header.
"""

import json
from datetime import date, datetime

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app import biometric, models, schemas
from app.database import get_db
from app.models import User
from app.security import require_roles
from app.tenant import require_feature

# Biometric attendance is an optional, separately-sold module. Every route
# below is gated -- including the device ingest endpoint, so a school whose
# subscription lapses stops accepting punches rather than silently collecting
# data it is no longer entitled to store.
router = APIRouter(
    prefix="/biometric",
    tags=["Biometric Attendance"],
    dependencies=[Depends(require_feature("biometric_attendance"))],
)

MANAGERS = ["Admin", "Principal"]
VALID_MODES = ("push", "pull")


def _device_to_response(device: models.BiometricDevice, token: str | None = None) -> dict:
    return {
        "id": device.id,
        "name": device.name,
        "serial_number": device.serial_number,
        "location": device.location,
        "vendor": device.vendor,
        "mode": device.mode,
        "is_active": bool(device.is_active),
        "pull_endpoint": device.pull_endpoint,
        "has_token": bool(device.auth_token_hash),
        "last_seen_at": device.last_seen_at,
        "last_sync_at": device.last_sync_at,
        "created_at": device.created_at,
        # Present exactly once, on registration or rotation. It is not stored
        # in plaintext and cannot be shown again.
        "auth_token": token,
    }


# ---------------- Device registry (staff) ----------------


@router.get("/devices")
def list_devices(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    devices = db.query(models.BiometricDevice).order_by(models.BiometricDevice.id).all()
    return [_device_to_response(d) for d in devices]


@router.post("/devices")
def create_device(
    payload: schemas.BiometricDeviceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    if payload.mode not in VALID_MODES:
        raise HTTPException(status_code=400, detail=f"mode must be one of {VALID_MODES}")
    if not payload.serial_number.strip():
        raise HTTPException(status_code=400, detail="Serial number is required")

    clash = (
        db.query(models.BiometricDevice)
        .filter(models.BiometricDevice.serial_number == payload.serial_number.strip())
        .first()
    )
    if clash:
        raise HTTPException(status_code=400, detail="A device with this serial number already exists")

    token, token_hash = biometric.generate_device_token()
    device = models.BiometricDevice(
        name=payload.name.strip(),
        serial_number=payload.serial_number.strip(),
        location=payload.location,
        vendor=payload.vendor,
        mode=payload.mode,
        pull_endpoint=payload.pull_endpoint,
        pull_config=json.dumps(payload.pull_config) if payload.pull_config else None,
        auth_token_hash=token_hash,
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return _device_to_response(device, token=token)


@router.put("/devices/{device_id}")
def update_device(
    device_id: int,
    payload: schemas.BiometricDeviceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    device = db.query(models.BiometricDevice).filter(models.BiometricDevice.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    data = payload.model_dump(exclude_unset=True)
    if "mode" in data and data["mode"] not in VALID_MODES:
        raise HTTPException(status_code=400, detail=f"mode must be one of {VALID_MODES}")
    if "pull_config" in data:
        data["pull_config"] = json.dumps(data["pull_config"]) if data["pull_config"] else None

    for key, value in data.items():
        setattr(device, key, value)

    db.commit()
    db.refresh(device)
    return _device_to_response(device)


@router.post("/devices/{device_id}/rotate-token")
def rotate_device_token(
    device_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """Issue a new token, invalidating the old one immediately."""
    device = db.query(models.BiometricDevice).filter(models.BiometricDevice.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    token, token_hash = biometric.generate_device_token()
    device.auth_token_hash = token_hash
    db.commit()
    db.refresh(device)
    return _device_to_response(device, token=token)


@router.delete("/devices/{device_id}")
def delete_device(
    device_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    device = db.query(models.BiometricDevice).filter(models.BiometricDevice.id == device_id).first()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    db.delete(device)
    db.commit()
    return {"deleted": True}


# ---------------- Enrollments (staff) ----------------


@router.get("/enrollments")
def list_enrollments(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    rows = db.query(models.BiometricEnrollment).order_by(models.BiometricEnrollment.id).all()

    # Names resolved here, in two batched lookups, rather than leaving every
    # client to download the whole student and teacher tables to label a row.
    student_ids = {r.student_id for r in rows if r.student_id}
    teacher_ids = {r.teacher_id for r in rows if r.teacher_id}

    students = {}
    if student_ids:
        for s in db.query(models.Student).filter(models.Student.id.in_(student_ids)).all():
            students[s.id] = f"{s.first_name or ''} {s.last_name or ''}".strip() or s.admission_no

    teachers = {}
    if teacher_ids:
        for t in db.query(models.Teacher).filter(models.Teacher.id.in_(teacher_ids)).all():
            teachers[t.id] = t.name

    return [
        {
            "id": r.id,
            "device_id": r.device_id,
            "device_user_id": r.device_user_id,
            "student_id": r.student_id,
            "teacher_id": r.teacher_id,
            "person_name": (
                students.get(r.student_id) if r.student_id else teachers.get(r.teacher_id)
            ),
            "is_active": bool(r.is_active),
        }
        for r in rows
    ]


@router.post("/enrollments")
def create_enrollment(
    payload: schemas.BiometricEnrollmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    if bool(payload.student_id) == bool(payload.teacher_id):
        raise HTTPException(
            status_code=400,
            detail="Provide exactly one of student_id or teacher_id",
        )

    device_user_id = str(payload.device_user_id).strip()
    if not device_user_id:
        raise HTTPException(status_code=400, detail="device_user_id is required")

    # Two mappings with the same scope would make resolution ambiguous, so the
    # uniqueness is enforced here (a DB constraint would not catch it, since
    # NULL device_id rows compare as distinct).
    clash = (
        db.query(models.BiometricEnrollment)
        .filter(
            models.BiometricEnrollment.device_id == payload.device_id,
            models.BiometricEnrollment.device_user_id == device_user_id,
        )
        .first()
    )
    if clash:
        raise HTTPException(
            status_code=400,
            detail="That device user id is already mapped for this scope",
        )

    enrollment = models.BiometricEnrollment(
        device_id=payload.device_id,
        device_user_id=device_user_id,
        student_id=payload.student_id,
        teacher_id=payload.teacher_id,
    )
    db.add(enrollment)
    db.commit()
    db.refresh(enrollment)

    # Punches that arrived before this mapping existed are now attributable.
    relinked = biometric.relink_unmatched_punches(db)

    return {"id": enrollment.id, "relinked_punches": relinked}


@router.delete("/enrollments/{enrollment_id}")
def delete_enrollment(
    enrollment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    row = db.query(models.BiometricEnrollment).filter(models.BiometricEnrollment.id == enrollment_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Enrollment not found")
    db.delete(row)
    db.commit()
    return {"deleted": True}


# ---------------- Ingest (devices and on-prem agents) ----------------


@router.post("/ingest")
def ingest(
    payload: schemas.BiometricIngestRequest,
    request: Request,
    db: Session = Depends(get_db),
    x_device_serial: str | None = Header(default=None),
    x_device_token: str | None = Header(default=None),
):
    """Accept a batch of punches from a terminal or an on-prem agent.

    Authenticated by device serial + token, NOT by a user session: this is
    called by hardware. The tenant comes from the X-School-Code header, which
    the shared tenant resolver already honours for requests without a JWT.

    Idempotent -- re-POSTing a batch counts the repeats as duplicates rather
    than double-recording them, so a device that retries after a timeout, or a
    pull window that overlaps the previous one, is harmless.
    """
    if not x_device_serial or not x_device_token:
        raise HTTPException(status_code=401, detail="Device credentials required")

    device = (
        db.query(models.BiometricDevice)
        .filter(models.BiometricDevice.serial_number == x_device_serial.strip())
        .first()
    )
    # Same error either way, so a caller can't probe which serials are real.
    if not device or not biometric.verify_device_token(x_device_token, device.auth_token_hash):
        raise HTTPException(status_code=401, detail="Invalid device credentials")
    if not device.is_active:
        raise HTTPException(status_code=403, detail="This device is disabled")

    result = biometric.ingest_punches(db, device, [p.model_dump() for p in payload.punches])
    return {"device": device.serial_number, **result}


# ---------------- Punch log + derivation (staff) ----------------


@router.get("/punches")
def list_punches(
    on_date: date | None = None,
    device_id: int | None = None,
    unmatched_only: bool = False,
    limit: int = 200,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    query = db.query(models.BiometricPunch)
    if on_date:
        query = query.filter(
            models.BiometricPunch.punched_at >= datetime.combine(on_date, datetime.min.time()),
            models.BiometricPunch.punched_at <= datetime.combine(on_date, datetime.max.time()),
        )
    if device_id:
        query = query.filter(models.BiometricPunch.device_id == device_id)
    if unmatched_only:
        query = query.filter(
            models.BiometricPunch.student_id.is_(None),
            models.BiometricPunch.teacher_id.is_(None),
        )

    rows = query.order_by(models.BiometricPunch.punched_at.desc()).limit(min(limit, 1000)).all()
    return [
        {
            "id": r.id,
            "device_id": r.device_id,
            "device_user_id": r.device_user_id,
            "punched_at": r.punched_at,
            "direction": r.direction,
            "student_id": r.student_id,
            "teacher_id": r.teacher_id,
            "processed_at": r.processed_at,
        }
        for r in rows
    ]


@router.get("/config")
def get_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    config = biometric.get_config(db)
    return {
        "derive_attendance": bool(config.derive_attendance),
        "late_after": config.late_after,
        "half_day_before": config.half_day_before,
        "absent_if_no_punch": bool(config.absent_if_no_punch),
        "overwrite_manual": bool(config.overwrite_manual),
    }


@router.put("/config")
def update_config(
    payload: schemas.BiometricConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    config = biometric.get_config(db)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(config, key, value)
    db.commit()
    db.refresh(config)
    return {
        "derive_attendance": bool(config.derive_attendance),
        "late_after": config.late_after,
        "half_day_before": config.half_day_before,
        "absent_if_no_punch": bool(config.absent_if_no_punch),
        "overwrite_manual": bool(config.overwrite_manual),
    }


@router.post("/derive")
def derive(
    payload: schemas.BiometricDeriveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """Turn a day's punches into attendance rows.

    Safe to re-run: it will not duplicate rows, and it leaves manually-marked
    attendance alone unless the school has opted into overwriting.
    """
    target = payload.target_date or date.today()
    return biometric.derive_attendance_for_date(db, target, academic_year=payload.academic_year)
