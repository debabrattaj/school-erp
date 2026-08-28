"""Admissions follow-up reminders: preview and on-demand run.

Unlike fee/library reminders this isn't an escalation ladder -- one daily
digest per staff member, not a configurable set of rungs -- so there is no
rule CRUD here, just a way to see who would be emailed before the cron runs,
and a way to trigger it on demand.
"""

from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import admission_reminders as reminder_logic
from app.database import get_db
from app.models import User
from app.security import require_roles
from app.tenant import require_feature

router = APIRouter(prefix="/admission-reminders", tags=["Admission Reminders"])

MANAGERS = ["Admin", "Principal"]

# Off unless the platform owner turns it on, matching fee_reminders /
# library_reminders. A module that messages staff unattended must not
# switch itself on.
REMINDER_GATE = [Depends(require_feature("admission_reminders"))]


@router.get("/preview", dependencies=REMINDER_GATE)
def preview(
    as_of: date | None = None,
    limit: int = reminder_logic.DEFAULT_BATCH_LIMIT,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """Exactly who would be emailed, and how many due items have no linked
    staff account to reach, without sending anything."""
    return reminder_logic.run_reminders(db, as_of=as_of, dry_run=True, limit=limit)


@router.post("/run", dependencies=REMINDER_GATE)
def run_now(
    as_of: date | None = None,
    limit: int = reminder_logic.DEFAULT_BATCH_LIMIT,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(MANAGERS)),
):
    """Send the reminder digest right now, rather than waiting for cron."""
    return reminder_logic.run_reminders(db, as_of=as_of, dry_run=False, limit=limit)
