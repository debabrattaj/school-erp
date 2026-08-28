"""Fee concessions and scholarships.

Resolving which discounts apply to a fee, and what they come to. Kept out of
the route module so the arithmetic is testable directly -- this is money being
given away, and the failure mode of a subtle bug here is a school under-billing
every student on a scheme without noticing.

Two rules the rest of the app depends on:

  * Only an Approved grant discounts anything. A request awaiting a decision
    must never quietly reduce a fee.
  * A fee can never go below zero, no matter how many schemes stack on it.
"""

from datetime import date

from sqlalchemy.orm import Session

from app import models

VALID_DISCOUNT_TYPES = ("percent", "fixed")
GRANT_STATUSES = ("Requested", "Approved", "Rejected", "Revoked")


def effective_rate(grant: models.StudentConcession, scheme: models.ConcessionScheme) -> tuple[str, float]:
    """The rate to actually use: the student's override, else the scheme's.

    An override exists so a negotiated amount for one family doesn't require
    inventing a whole scheme for them.
    """
    discount_type = (grant.discount_type or scheme.discount_type or "percent").lower()
    value = grant.discount_value if grant.discount_value is not None else scheme.discount_value
    return discount_type, float(value or 0)


def is_currently_valid(grant: models.StudentConcession, on_date: date | None = None) -> bool:
    """Whether a grant's validity window covers the given date.

    A grant with no window is open-ended. The window is what stops a one-year
    scholarship from silently discounting next year's fees too.
    """
    on_date = on_date or date.today()
    if grant.valid_from and on_date < grant.valid_from:
        return False
    if grant.valid_to and on_date > grant.valid_to:
        return False
    return True


def applicable_grants(
    db: Session,
    student_id: int,
    fee_type: str | None = None,
    academic_year: str | None = None,
    on_date: date | None = None,
) -> list[tuple[models.StudentConcession, models.ConcessionScheme]]:
    """Every approved, in-window grant that covers this fee."""
    grants = (
        db.query(models.StudentConcession)
        .filter(
            models.StudentConcession.student_id == student_id,
            models.StudentConcession.status == "Approved",
        )
        .all()
    )

    matched = []
    for grant in grants:
        if academic_year and grant.academic_year and grant.academic_year != academic_year:
            continue
        if not is_currently_valid(grant, on_date):
            continue

        scheme = (
            db.query(models.ConcessionScheme)
            .filter(models.ConcessionScheme.id == grant.scheme_id)
            .first()
        )
        if not scheme or not scheme.is_active:
            continue
        # A scheme scoped to one fee type must not discount the others.
        if scheme.applies_to_fee_type and fee_type and scheme.applies_to_fee_type != fee_type:
            continue

        matched.append((grant, scheme))

    return matched


def compute_discount(base_amount: float, grants: list[tuple]) -> float:
    """Total discount on base_amount from a set of grants.

    Percentages are all taken against the original amount rather than applied
    one after another. Two 50% schemes therefore come to 100%, not 75% -- which
    is what a school means by "half fee for staff, half for siblings", and it
    also makes the result independent of the order the grants happen to be in.

    The total is capped at the base, so stacked schemes can zero a fee but can
    never turn it into a credit.
    """
    if base_amount <= 0:
        return 0.0

    total = 0.0
    for grant, scheme in grants:
        discount_type, value = effective_rate(grant, scheme)
        if value <= 0:
            continue
        if discount_type == "percent":
            total += base_amount * min(value, 100.0) / 100.0
        else:
            total += value

    return round(min(total, base_amount), 2)


def discount_for_fee(
    db: Session,
    student_id: int,
    base_amount: float,
    fee_type: str | None = None,
    academic_year: str | None = None,
    on_date: date | None = None,
) -> float:
    """Convenience wrapper: resolve grants and total them in one call."""
    grants = applicable_grants(db, student_id, fee_type, academic_year, on_date)
    return compute_discount(base_amount, grants)


def explain_discount(
    db: Session,
    student_id: int,
    base_amount: float,
    fee_type: str | None = None,
    academic_year: str | None = None,
) -> dict:
    """The discount plus a per-scheme breakdown.

    Exists so a fee screen can show a guardian *why* an amount was reduced,
    rather than presenting an unexplained smaller number.
    """
    grants = applicable_grants(db, student_id, fee_type, academic_year)

    lines = []
    for grant, scheme in grants:
        discount_type, value = effective_rate(grant, scheme)
        if discount_type == "percent":
            amount = base_amount * min(value, 100.0) / 100.0
            label = f"{value:g}%"
        else:
            amount = value
            label = f"{value:g}"
        lines.append({
            "grant_id": grant.id,
            "scheme_id": scheme.id,
            "scheme_name": scheme.name,
            "category": scheme.category,
            "discount_type": discount_type,
            "discount_value": value,
            "label": label,
            "amount": round(amount, 2),
        })

    total = compute_discount(base_amount, grants)
    uncapped = round(sum(line["amount"] for line in lines), 2)

    return {
        "base_amount": round(base_amount, 2),
        "concession_amount": total,
        "payable_amount": round(base_amount - total, 2),
        # Surfaced rather than hidden: if schemes stacked past the fee, the
        # school is giving away more than it is charging and should know.
        "capped": uncapped > total,
        "lines": lines,
    }


def recalculate_fee(db: Session, fee: models.Fee) -> dict:
    """Re-apply concessions to one fee and update its balance.

    Only touches fees with nothing paid against them. Re-discounting a fee a
    guardian has already partly paid would leave a credit balance the rest of
    the app has no way to represent, so those are reported and skipped for a
    human to settle.
    """
    from app.routes.fees import calculate_fee_status

    if (fee.paid_amount or 0) > 0:
        return {"fee_id": fee.id, "changed": False, "reason": "already part-paid"}

    discount = discount_for_fee(
        db, fee.student_id, fee.total_amount or 0,
        fee_type=fee.fee_type, academic_year=fee.academic_year,
    )
    if round(fee.concession_amount or 0, 2) == discount:
        return {"fee_id": fee.id, "changed": False, "reason": "unchanged"}

    previous = fee.concession_amount or 0
    fee.concession_amount = discount
    due_amount, payment_status = calculate_fee_status(
        fee.total_amount, fee.paid_amount or 0, discount
    )
    fee.due_amount = due_amount
    fee.payment_status = payment_status

    return {
        "fee_id": fee.id, "changed": True,
        "previous_concession": round(previous, 2),
        "concession_amount": discount,
        "due_amount": due_amount,
    }
