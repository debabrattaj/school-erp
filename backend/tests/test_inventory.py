"""Inventory: kits, staff issuance, and the rules that keep them honest.

The engine underneath (stock, Issue/Purchase/Return, per-cycle dedup) had no
tests before this file, so the ad-hoc bulk-issue path is covered here too --
not just the new kit and staff behaviour -- since it is the one live path a
school already depends on and this change touches it directly.

The two rules worth protecting are: a kit built for one audience cannot be
issued to the other, and staff never buy -- a purchase is always a student
replacing something they lost, paid for individually.
"""

import uuid
from datetime import date

import pytest


def _set_inventory_enabled(enabled: bool):
    from app.tenant import CentralSessionLocal, get_account
    from app.tenant_models import SchoolFeature

    account = get_account("default")
    db = CentralSessionLocal()
    try:
        row = (
            db.query(SchoolFeature)
            .filter(
                SchoolFeature.account_id == account["id"],
                SchoolFeature.feature_key == "inventory",
            )
            .first()
        )
        if row:
            row.is_enabled = enabled
        else:
            db.add(SchoolFeature(
                account_id=account["id"], feature_key="inventory", is_enabled=enabled,
            ))
        db.commit()
    finally:
        db.close()


@pytest.fixture(autouse=True)
def inventory_enabled(client):
    """Sold separately, so it ships disabled -- switch it on for these tests."""
    _set_inventory_enabled(True)
    yield
    _set_inventory_enabled(False)


@pytest.fixture()
def db_session(client):
    from app.database import SessionLocal
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


def _item(db, name="Blazer", quantity=100, unit_price=800):
    from app.models import InventoryItem
    item = InventoryItem(
        item_name=name, item_code=f"INV-{uuid.uuid4().hex[:8]}",
        category="Uniform", unit="pcs",
        quantity_available=quantity, reorder_level=5, unit_price=unit_price,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def _student(db, **overrides):
    from app.models import Student
    fields = {"admission_no": f"INV-{uuid.uuid4().hex[:8]}", "first_name": "Kit", "last_name": "Wearer"}
    fields.update(overrides)
    student = Student(**fields)
    db.add(student)
    db.commit()
    db.refresh(student)
    return student


def _teacher(db, name="Kit Wearer Staff"):
    from app.models import Teacher
    teacher = Teacher(employee_no=f"INV-{uuid.uuid4().hex[:8]}", name=name)
    db.add(teacher)
    db.commit()
    db.refresh(teacher)
    return teacher


def _kit(client, auth, applies_to="Student", name=None):
    resp = client.post("/inventory/kits", json={
        "name": name or f"Kit {uuid.uuid4().hex[:6]}", "applies_to": applies_to,
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _add_kit_item(client, auth, kit_id, item_id, quantity=1):
    resp = client.post(f"/inventory/kits/{kit_id}/items",
                       json={"item_id": item_id, "quantity": quantity}, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _bulk_issue(client, auth, **payload):
    body = {
        "transaction_date": date.today().isoformat(),
        "cycle": "Annual", "academic_year": "2026-27",
    }
    body.update(payload)
    return client.post("/inventory/bulk-issue", json=body, headers=auth)


# --------------------------------------------------------------------------
# Kits
# --------------------------------------------------------------------------


def test_a_kit_needs_a_name_and_a_valid_audience(client, auth):
    resp = client.post("/inventory/kits", json={"name": "", "applies_to": "Student"}, headers=auth)
    assert resp.status_code == 400

    resp = client.post("/inventory/kits", json={"name": "X", "applies_to": "Aliens"}, headers=auth)
    assert resp.status_code == 400
    assert "applies_to must be one of" in resp.json()["detail"]


def test_kit_names_are_unique(client, auth):
    _kit(client, auth, name="Junior Uniform Kit")
    dup = client.post("/inventory/kits", json={
        "name": "Junior Uniform Kit", "applies_to": "Staff",
    }, headers=auth)
    assert dup.status_code == 400


def test_adding_the_same_item_twice_is_refused(client, auth, db_session):
    item = _item(db_session)
    kit = _kit(client, auth)
    _add_kit_item(client, auth, kit["id"], item.id)

    dup = client.post(f"/inventory/kits/{kit['id']}/items",
                      json={"item_id": item.id, "quantity": 2}, headers=auth)
    assert dup.status_code == 400
    assert "already in the kit" in dup.json()["detail"]


def test_a_kit_reports_its_items_with_quantities(client, auth, db_session):
    blazer = _item(db_session, "Blazer")
    tie = _item(db_session, "Tie")
    kit = _kit(client, auth)
    _add_kit_item(client, auth, kit["id"], blazer.id, quantity=1)
    body = _add_kit_item(client, auth, kit["id"], tie.id, quantity=2)

    names = {row["item_name"]: row["quantity"] for row in body["items"]}
    assert names == {"Blazer": 1, "Tie": 2}


def test_removing_a_kit_item_leaves_the_rest(client, auth, db_session):
    blazer = _item(db_session, "Blazer")
    tie = _item(db_session, "Tie")
    kit = _kit(client, auth)
    _add_kit_item(client, auth, kit["id"], blazer.id)
    _add_kit_item(client, auth, kit["id"], tie.id)

    resp = client.delete(f"/inventory/kits/{kit['id']}/items/{blazer.id}", headers=auth)
    assert resp.status_code == 200
    assert [row["item_name"] for row in resp.json()["items"]] == ["Tie"]


def test_a_kit_that_has_been_issued_cannot_be_deleted(client, auth, db_session):
    item = _item(db_session)
    student = _student(db_session)
    kit = _kit(client, auth)
    _add_kit_item(client, auth, kit["id"], item.id)
    _bulk_issue(client, auth, kit_id=kit["id"], student_ids=[student.id])

    resp = client.delete(f"/inventory/kits/{kit['id']}", headers=auth)
    assert resp.status_code == 400
    assert "already been issued" in resp.json()["detail"]


def test_an_unused_kit_can_be_deleted(client, auth, db_session):
    kit = _kit(client, auth)
    assert client.delete(f"/inventory/kits/{kit['id']}", headers=auth).status_code == 200


def test_an_item_still_referenced_by_a_kit_cannot_be_deleted(client, auth, db_session):
    """Deleting an item cascaded its whole transaction history away, silently
    -- this is the same protection applied to the kit relationship."""
    item = _item(db_session)
    kit = _kit(client, auth)
    _add_kit_item(client, auth, kit["id"], item.id)

    resp = client.delete(f"/inventory/items/{item.id}", headers=auth)
    assert resp.status_code == 400
    assert "part of a kit" in resp.json()["detail"]


# --------------------------------------------------------------------------
# Kit audience: the wall between student and staff
# --------------------------------------------------------------------------


def test_a_student_kit_cannot_be_issued_to_staff(client, auth, db_session):
    item = _item(db_session)
    teacher = _teacher(db_session)
    kit = _kit(client, auth, applies_to="Student", name="Student Only")
    _add_kit_item(client, auth, kit["id"], item.id)

    resp = _bulk_issue(client, auth, kit_id=kit["id"], teacher_ids=[teacher.id])
    assert resp.status_code == 400
    assert "student kit and cannot be issued to staff" in resp.json()["detail"]


def test_a_staff_kit_cannot_be_issued_to_students(client, auth, db_session):
    item = _item(db_session)
    student = _student(db_session)
    kit = _kit(client, auth, applies_to="Staff", name="Staff Only")
    _add_kit_item(client, auth, kit["id"], item.id)

    resp = _bulk_issue(client, auth, kit_id=kit["id"], student_ids=[student.id])
    assert resp.status_code == 400
    assert "staff kit and cannot be issued to students" in resp.json()["detail"]


def test_an_empty_kit_cannot_be_issued(client, auth, db_session):
    student = _student(db_session)
    kit = _kit(client, auth)
    resp = _bulk_issue(client, auth, kit_id=kit["id"], student_ids=[student.id])
    assert resp.status_code == 400
    assert "no items in it" in resp.json()["detail"]


def test_an_inactive_kit_cannot_be_issued(client, auth, db_session):
    item = _item(db_session)
    student = _student(db_session)
    kit = _kit(client, auth)
    _add_kit_item(client, auth, kit["id"], item.id)
    client.put(f"/inventory/kits/{kit['id']}", json={"is_active": False}, headers=auth)

    resp = _bulk_issue(client, auth, kit_id=kit["id"], student_ids=[student.id])
    assert resp.status_code == 400
    assert "inactive" in resp.json()["detail"]


# --------------------------------------------------------------------------
# Issuing a kit to students
# --------------------------------------------------------------------------


def test_issuing_a_kit_to_students_records_one_transaction_each(client, auth, db_session):
    from app.models import InventoryTransaction

    blazer = _item(db_session, "Blazer", quantity=50)
    tie = _item(db_session, "Tie", quantity=50)
    a, b = _student(db_session), _student(db_session)
    kit = _kit(client, auth)
    _add_kit_item(client, auth, kit["id"], blazer.id, quantity=1)
    _add_kit_item(client, auth, kit["id"], tie.id, quantity=1)

    resp = _bulk_issue(client, auth, kit_id=kit["id"], student_ids=[a.id, b.id])
    assert resp.status_code == 200
    body = resp.json()
    assert body["total_issued"] == 4  # 2 items x 2 students

    rows = db_session.query(InventoryTransaction).filter(
        InventoryTransaction.kit_id == kit["id"]).all()
    assert len(rows) == 4
    assert all(r.transaction_type == "Issue" for r in rows)
    assert all(r.issued_to_student_id in (a.id, b.id) for r in rows)


def test_stock_is_deducted_once_per_recipient_per_item(client, auth, db_session):
    item = _item(db_session, quantity=10)
    a, b = _student(db_session), _student(db_session)
    kit = _kit(client, auth)
    _add_kit_item(client, auth, kit["id"], item.id, quantity=2)

    _bulk_issue(client, auth, kit_id=kit["id"], student_ids=[a.id, b.id])

    db_session.expire_all()
    assert db_session.get(type(item), item.id).quantity_available == 6  # 10 - (2*2)


def test_re_running_the_same_cycle_does_not_double_issue(client, auth, db_session):
    """The whole point of cycle+academic_year: a repeat run skips whoever
    already has it rather than issuing a second blazer."""
    item = _item(db_session, quantity=10)
    student = _student(db_session)
    kit = _kit(client, auth)
    _add_kit_item(client, auth, kit["id"], item.id)

    first = _bulk_issue(client, auth, kit_id=kit["id"], student_ids=[student.id])
    assert first.json()["results"][0]["issued_count"] == 1

    second = _bulk_issue(client, auth, kit_id=kit["id"], student_ids=[student.id])
    row = second.json()["results"][0]
    assert row["issued_count"] == 0
    assert row["skipped_duplicate_count"] == 1

    db_session.expire_all()
    assert db_session.get(type(item), item.id).quantity_available == 9  # only one issue happened


def test_a_new_academic_year_re_entitles_everyone(client, auth, db_session):
    item = _item(db_session, quantity=10)
    student = _student(db_session)
    kit = _kit(client, auth)
    _add_kit_item(client, auth, kit["id"], item.id)

    _bulk_issue(client, auth, kit_id=kit["id"], student_ids=[student.id], academic_year="2026-27")
    again = _bulk_issue(client, auth, kit_id=kit["id"], student_ids=[student.id], academic_year="2027-28")
    assert again.json()["results"][0]["issued_count"] == 1


def test_insufficient_stock_skips_only_that_item(client, auth, db_session):
    plenty = _item(db_session, "Tie", quantity=50)
    scarce = _item(db_session, "Blazer", quantity=1)
    a, b = _student(db_session), _student(db_session)
    kit = _kit(client, auth)
    _add_kit_item(client, auth, kit["id"], plenty.id)
    _add_kit_item(client, auth, kit["id"], scarce.id)

    resp = _bulk_issue(client, auth, kit_id=kit["id"], student_ids=[a.id, b.id])
    results = {r["item_name"]: r for r in resp.json()["results"]}
    assert results["Tie"]["issued_count"] == 2
    assert results["Blazer"]["skipped_insufficient_stock"] is True
    assert results["Blazer"]["issued_count"] == 0


# --------------------------------------------------------------------------
# Issuing a kit to staff
# --------------------------------------------------------------------------


def test_issuing_a_kit_to_staff_uses_the_teacher_column_not_free_text(client, auth, db_session):
    from app.models import InventoryTransaction

    item = _item(db_session, "Lanyard", quantity=10)
    teacher = _teacher(db_session)
    kit = _kit(client, auth, applies_to="Staff", name="Staff ID Kit")
    _add_kit_item(client, auth, kit["id"], item.id)

    resp = _bulk_issue(client, auth, kit_id=kit["id"], teacher_ids=[teacher.id])
    assert resp.status_code == 200
    assert resp.json()["total_issued"] == 1

    row = db_session.query(InventoryTransaction).filter(
        InventoryTransaction.kit_id == kit["id"]).first()
    assert row.issued_to_teacher_id == teacher.id
    assert row.issued_to_student_id is None


def test_staff_dedup_works_the_same_as_student_dedup(client, auth, db_session):
    item = _item(db_session, quantity=10)
    teacher = _teacher(db_session)
    kit = _kit(client, auth, applies_to="Staff")
    _add_kit_item(client, auth, kit["id"], item.id)

    _bulk_issue(client, auth, kit_id=kit["id"], teacher_ids=[teacher.id])
    second = _bulk_issue(client, auth, kit_id=kit["id"], teacher_ids=[teacher.id])
    assert second.json()["results"][0]["skipped_duplicate_count"] == 1


def test_an_unknown_teacher_id_is_rejected(client, auth, db_session):
    item = _item(db_session)
    kit = _kit(client, auth, applies_to="Staff")
    _add_kit_item(client, auth, kit["id"], item.id)

    resp = _bulk_issue(client, auth, kit_id=kit["id"], teacher_ids=[999999])
    assert resp.status_code == 404


# --------------------------------------------------------------------------
# Staff never buy
# --------------------------------------------------------------------------


def test_a_student_can_purchase_a_replacement(client, auth, db_session):
    item = _item(db_session, quantity=10, unit_price=800)
    student = _student(db_session)

    resp = client.post("/inventory/transactions/", json={
        "item_id": item.id, "transaction_date": date.today().isoformat(),
        "transaction_type": "Purchase", "quantity": 1,
        "issued_to_student_id": student.id, "unit_price": 800,
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    assert resp.json()["amount"] == 800


def test_a_purchase_naming_a_teacher_is_refused(client, auth, db_session):
    """Staff never buy -- a purchase is a student replacing a lost item and
    paying for it themselves."""
    item = _item(db_session, quantity=10)
    teacher = _teacher(db_session)

    resp = client.post("/inventory/transactions/", json={
        "item_id": item.id, "transaction_date": date.today().isoformat(),
        "transaction_type": "Purchase", "quantity": 1,
        "issued_to_teacher_id": teacher.id,
    }, headers=auth)
    assert resp.status_code == 400
    assert "staff issuance is never a purchase" in resp.json()["detail"]


def test_a_purchase_naming_free_text_staff_is_also_refused(client, auth, db_session):
    item = _item(db_session, quantity=10)
    resp = client.post("/inventory/transactions/", json={
        "item_id": item.id, "transaction_date": date.today().isoformat(),
        "transaction_type": "Purchase", "quantity": 1,
        "issued_to_staff": "Front Office",
    }, headers=auth)
    assert resp.status_code == 400


def test_a_purchase_with_nobody_named_is_refused(client, auth, db_session):
    item = _item(db_session, quantity=10)
    resp = client.post("/inventory/transactions/", json={
        "item_id": item.id, "transaction_date": date.today().isoformat(),
        "transaction_type": "Purchase", "quantity": 1,
    }, headers=auth)
    assert resp.status_code == 400
    assert "must name the student" in resp.json()["detail"]


def test_ordinary_issue_to_a_teacher_still_works(client, auth, db_session):
    """Only Purchase is restricted -- an ordinary single-transaction Issue to
    a staff member (outside a kit) is unaffected."""
    item = _item(db_session, quantity=10)
    teacher = _teacher(db_session)
    resp = client.post("/inventory/transactions/", json={
        "item_id": item.id, "transaction_date": date.today().isoformat(),
        "transaction_type": "Issue", "quantity": 1,
        "issued_to_teacher_id": teacher.id,
    }, headers=auth)
    assert resp.status_code == 200


# --------------------------------------------------------------------------
# Backward compatibility: the ad-hoc path the live frontend already uses
# --------------------------------------------------------------------------


def test_ad_hoc_bulk_issue_without_a_kit_still_works(client, auth, db_session):
    """The exact shape the frontend has sent since before kits existed:
    items + student_ids, no kit_id."""
    item = _item(db_session, quantity=10)
    student = _student(db_session)

    resp = _bulk_issue(
        client, auth,
        items=[{"item_id": item.id, "quantity_per_student": 1}],
        student_ids=[student.id],
    )
    assert resp.status_code == 200
    assert resp.json()["total_issued"] == 1


def test_bulk_issue_needs_a_kit_or_items(client, auth, db_session):
    student = _student(db_session)
    resp = _bulk_issue(client, auth, student_ids=[student.id])
    assert resp.status_code == 400
    assert "Select a kit or at least one item" in resp.json()["detail"]


def test_bulk_issue_needs_a_recipient(client, auth, db_session):
    item = _item(db_session)
    resp = _bulk_issue(client, auth, items=[{"item_id": item.id, "quantity_per_student": 1}])
    assert resp.status_code == 400
    assert "Select at least one student or staff" in resp.json()["detail"]


def test_an_unknown_student_id_is_rejected(client, auth, db_session):
    item = _item(db_session)
    resp = _bulk_issue(
        client, auth,
        items=[{"item_id": item.id, "quantity_per_student": 1}],
        student_ids=[999999],
    )
    assert resp.status_code == 404


# --------------------------------------------------------------------------
# Barcode
# --------------------------------------------------------------------------


def test_an_item_can_be_created_with_a_barcode_and_looked_up_by_it(client, auth):
    code = f"BC-{uuid.uuid4().hex[:10]}"
    created = client.post("/inventory/items/", json={
        "item_name": "Barcoded Item", "barcode": code, "quantity_available": 5,
    }, headers=auth)
    assert created.status_code == 200, created.text

    found = client.get(f"/inventory/items/by-barcode/{code}", headers=auth)
    assert found.status_code == 200, found.text
    assert found.json()["item_name"] == "Barcoded Item"


def test_an_unknown_barcode_is_a_404(client, auth):
    resp = client.get("/inventory/items/by-barcode/no-such-barcode", headers=auth)
    assert resp.status_code == 404


def test_two_items_cannot_share_a_barcode(client, auth):
    code = f"BC-{uuid.uuid4().hex[:10]}"
    first = client.post("/inventory/items/", json={"item_name": "First", "barcode": code}, headers=auth)
    assert first.status_code == 200, first.text
    second = client.post("/inventory/items/", json={"item_name": "Second", "barcode": code}, headers=auth)
    assert second.status_code == 400


# --------------------------------------------------------------------------
# Purchase price fallback
# --------------------------------------------------------------------------


def test_a_purchase_with_no_unit_price_falls_back_to_the_items_selling_price(client, auth, db_session):
    item = _item(db_session, unit_price=350)
    student = _student(db_session)
    resp = client.post("/inventory/transactions/", json={
        "item_id": item.id, "transaction_date": date.today().isoformat(),
        "transaction_type": "Purchase", "quantity": 2,
        "issued_to_student_id": student.id, "payment_status": "Paid",
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    assert resp.json()["amount"] == 700
    assert resp.json()["unit_price"] == 350


def test_a_purchase_with_an_explicit_price_overrides_the_items_selling_price(client, auth, db_session):
    item = _item(db_session, unit_price=350)
    student = _student(db_session)
    resp = client.post("/inventory/transactions/", json={
        "item_id": item.id, "transaction_date": date.today().isoformat(),
        "transaction_type": "Purchase", "quantity": 2, "unit_price": 500,
        "issued_to_student_id": student.id, "payment_status": "Paid",
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    assert resp.json()["amount"] == 1000


# --------------------------------------------------------------------------
# Reports
# --------------------------------------------------------------------------


def test_low_stock_report_lists_only_items_at_or_below_reorder_level(client, auth, db_session):
    from app.models import InventoryItem

    low = InventoryItem(
        item_name=f"Low Stock {uuid.uuid4().hex[:6]}", quantity_available=2, reorder_level=5, status="Active",
    )
    healthy = InventoryItem(
        item_name=f"Healthy Stock {uuid.uuid4().hex[:6]}", quantity_available=50, reorder_level=5, status="Active",
    )
    db_session.add_all([low, healthy])
    db_session.commit()

    resp = client.get("/inventory/reports/low-stock", headers=auth)
    assert resp.status_code == 200, resp.text
    names = [row["item_name"] for row in resp.json()]
    assert low.item_name in names
    assert healthy.item_name not in names


def test_cost_summary_report_reflects_purchases_and_payment_status(client, auth, db_session):
    item = _item(db_session, unit_price=100)
    student = _student(db_session)
    client.post("/inventory/transactions/", json={
        "item_id": item.id, "transaction_date": date.today().isoformat(),
        "transaction_type": "Purchase", "quantity": 3, "unit_price": 100,
        "issued_to_student_id": student.id, "payment_status": "Unpaid",
    }, headers=auth)

    resp = client.get("/inventory/reports/cost-summary", headers=auth)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["purchase_revenue"] >= 300
    assert body["purchase_unpaid"] >= 300


def test_kit_coverage_report_counts_distinct_recipients_against_the_whole_audience(client, auth, db_session):
    item = _item(db_session, quantity=100)
    kit = _kit(client, auth, applies_to="Student")
    _add_kit_item(client, auth, kit["id"], item.id, quantity=1)
    student = _student(db_session)

    resp = _bulk_issue(client, auth, kit_id=kit["id"], student_ids=[student.id])
    assert resp.status_code == 200, resp.text

    report = client.get("/inventory/reports/kit-coverage", params={
        "cycle": "Annual", "academic_year": "2026-27",
    }, headers=auth)
    assert report.status_code == 200, report.text
    row = next(r for r in report.json() if r["kit_id"] == kit["id"])
    assert row["issued_count"] == 1
    assert row["eligible_count"] >= 1


# --------------------------------------------------------------------------
# CSV export
# --------------------------------------------------------------------------


def test_items_export_is_a_csv_with_the_created_item(client, auth, db_session):
    item = _item(db_session, name=f"Exportable {uuid.uuid4().hex[:6]}")
    resp = client.get("/inventory/items/export", headers=auth)
    assert resp.status_code == 200
    assert item.item_name in resp.text


def test_transactions_export_is_a_csv_with_the_created_transaction(client, auth, db_session):
    item = _item(db_session)
    student = _student(db_session)
    client.post("/inventory/transactions/", json={
        "item_id": item.id, "transaction_date": date.today().isoformat(),
        "transaction_type": "Stock In", "quantity": 5,
    }, headers=auth)
    resp = client.get("/inventory/transactions/export", headers=auth)
    assert resp.status_code == 200
    assert item.item_name in resp.text
