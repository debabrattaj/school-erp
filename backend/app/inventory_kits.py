"""Issuing kits of items to students and staff.

A kit is a named, reusable set of items -- an admin defines "Junior Uniform
Kit" once and issues it every cycle, rather than re-picking the same items
from a list each time. Two rules carry the weight of this module:

* **A kit is scoped to one audience.** A kit built for staff cannot be
  bulk-issued to students and vice versa -- enforced here, not left to an
  admin noticing the mistake after the fact.
* **Staff never buy.** Students can purchase a replacement for a lost item
  outside their free entitlement; staff cannot. A "Purchase" transaction
  naming a staff member is refused before it reaches the database.

Kept out of the route module so the dedup and rollback rules -- the parts
worth getting right -- can be tested without HTTP.
"""

from datetime import date

from sqlalchemy.orm import Session

from app import models

APPLIES_TO = ("Student", "Staff")

# Transaction types that reduce stock. A bulk kit issue always uses "Issue";
# purchases are recorded individually through the ordinary transaction
# endpoint, never through a bulk run.
OUT_TYPES = {"Stock Out", "Issue", "Purchase"}
IN_TYPES = {"Stock In", "Return"}


class InventoryError(Exception):
    """An inventory problem worth showing a human."""


def apply_stock(item: models.InventoryItem, transaction_type: str, quantity: float, direction: int = 1) -> None:
    if quantity <= 0:
        raise InventoryError("Quantity must be greater than zero.")

    if transaction_type in IN_TYPES:
        item.quantity_available += quantity * direction
    elif transaction_type in OUT_TYPES:
        next_quantity = item.quantity_available - (quantity * direction)
        if next_quantity < 0:
            raise InventoryError(f"Not enough stock of {item.item_name} available.")
        item.quantity_available = next_quantity
    elif transaction_type == "Adjustment":
        item.quantity_available += quantity * direction


def kit_items(db: Session, kit_id: int) -> list[tuple[models.InventoryItem, float]]:
    """(item, quantity) pairs for a kit, in a stable order."""
    rows = (
        db.query(models.InventoryKitItem, models.InventoryItem)
        .join(models.InventoryItem, models.InventoryItem.id == models.InventoryKitItem.item_id)
        .filter(models.InventoryKitItem.kit_id == kit_id)
        .order_by(models.InventoryKitItem.id)
        .all()
    )
    return [(item, kit_item.quantity) for kit_item, item in rows]


def already_issued(
    db: Session,
    item_id: int,
    cycle: str,
    academic_year: str,
    recipient_ids: list[int],
    recipient_column,
) -> set[int]:
    """Which recipients already received this item in this cycle and year.

    Generalised over the recipient column so the same check protects
    students and staff alike -- a repeat run for the same academic year
    skips whoever already has it rather than double-issuing.
    """
    if not recipient_ids:
        return set()
    rows = (
        db.query(recipient_column)
        .filter(
            models.InventoryTransaction.item_id == item_id,
            models.InventoryTransaction.transaction_type == "Issue",
            models.InventoryTransaction.cycle == cycle,
            models.InventoryTransaction.academic_year == academic_year,
            recipient_column.in_(recipient_ids),
        )
        .all()
    )
    return {r[0] for r in rows}


def validate_purchase_is_student_only(
    transaction_type: str,
    issued_to_student_id: int | None,
    issued_to_teacher_id: int | None,
    issued_to_staff: str | None,
) -> None:
    """Staff never buy. A lost item is replaced only for a student who pays
    for it; a school does not sell replacement stock to its own staff."""
    if transaction_type != "Purchase":
        return
    if issued_to_teacher_id or issued_to_staff:
        raise InventoryError("Purchases are recorded for students only; staff issuance is never a purchase.")
    if not issued_to_student_id:
        raise InventoryError("A purchase must name the student who is buying the replacement.")


def bulk_issue_kit(
    db: Session,
    *,
    kit: models.InventoryKit | None,
    ad_hoc_items: list[tuple[int, float]],
    student_ids: list[int],
    teacher_ids: list[int],
    transaction_date: date,
    cycle: str,
    academic_year: str,
    reference_no: str | None,
    remarks: str | None,
) -> list[dict]:
    """Issue a kit's items (or an ad-hoc list) to a set of students and/or
    staff, skipping anyone already issued this item in this cycle and year.

    Returns one result row per (item, recipient type) combination issued,
    mirroring the shape the bulk-issue endpoint has always returned so an
    ad-hoc call (no kit) behaves exactly as before.
    """
    if kit and kit.applies_to == "Student" and teacher_ids:
        raise InventoryError(f"'{kit.name}' is a student kit and cannot be issued to staff.")
    if kit and kit.applies_to == "Staff" and student_ids:
        raise InventoryError(f"'{kit.name}' is a staff kit and cannot be issued to students.")

    if kit:
        items = kit_items(db, kit.id)
        if not items:
            raise InventoryError(f"'{kit.name}' has no items in it yet.")
    else:
        items = []
        for item_id, quantity in ad_hoc_items:
            item = db.query(models.InventoryItem).filter(models.InventoryItem.id == item_id).first()
            if not item:
                raise InventoryError(f"Inventory item {item_id} not found.")
            items.append((item, quantity))

    results = []

    for item, quantity_per_recipient in items:
        for recipient_ids, column, field in (
            (student_ids, models.InventoryTransaction.issued_to_student_id, "issued_to_student_id"),
            (teacher_ids, models.InventoryTransaction.issued_to_teacher_id, "issued_to_teacher_id"),
        ):
            if not recipient_ids:
                continue

            already = already_issued(db, item.id, cycle, academic_year, recipient_ids, column)
            pending = [r for r in recipient_ids if r not in already]
            skipped_duplicate = len(recipient_ids) - len(pending)

            required = quantity_per_recipient * len(pending)
            if pending and item.quantity_available < required:
                results.append({
                    "item_id": item.id, "item_name": item.item_name,
                    "issued_count": 0, "skipped_duplicate_count": skipped_duplicate,
                    "skipped_insufficient_stock": True,
                })
                continue

            for recipient_id in pending:
                apply_stock(item, "Issue", quantity_per_recipient)
                db.add(models.InventoryTransaction(
                    item_id=item.id, transaction_date=transaction_date,
                    transaction_type="Issue", quantity=quantity_per_recipient,
                    reference_no=reference_no, remarks=remarks,
                    cycle=cycle, academic_year=academic_year,
                    kit_id=kit.id if kit else None,
                    **{field: recipient_id},
                ))

            results.append({
                "item_id": item.id, "item_name": item.item_name,
                "issued_count": len(pending), "skipped_duplicate_count": skipped_duplicate,
                "skipped_insufficient_stock": False,
            })

    return results
