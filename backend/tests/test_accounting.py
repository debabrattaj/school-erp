"""Coverage for app/routes/accounting.py (prefix /accounting), which had no
tests at all before this file. Covers the manual ledger-entry CRUD plus the
read-only summary/ledger/export endpoints, and confirms unauthenticated
callers are rejected.
"""

import uuid


def _tag():
    return uuid.uuid4().hex[:8]


def test_entries_list_rejects_unauthenticated(client):
    resp = client.get("/accounting/entries/")
    assert resp.status_code in (401, 403)


def test_summary_rejects_unauthenticated(client):
    resp = client.get("/accounting/summary")
    assert resp.status_code in (401, 403)


def test_create_entry_rejects_unauthenticated(client):
    resp = client.post("/accounting/entries/", json={
        "entry_date": "2026-01-01", "entry_type": "Income",
        "category": "Donation", "amount": 100,
    })
    assert resp.status_code in (401, 403)


def test_create_entry_rejects_bad_entry_type(client, auth):
    resp = client.post("/accounting/entries/", json={
        "entry_date": "2026-01-05", "entry_type": "Nonsense",
        "category": "Misc", "amount": 10,
    }, headers=auth)
    assert resp.status_code == 400


def test_ledger_entry_full_flow(client, auth):
    tag = _tag()
    category = f"AuditCat-{tag}"

    create_resp = client.post("/accounting/entries/", json={
        "entry_date": "2026-02-10",
        "entry_type": "Income",
        "category": category,
        "amount": 2500.5,
        "payment_mode": "Cash",
        "reference_no": f"REF-{tag}",
        "description": "Test income entry",
    }, headers=auth)
    assert create_resp.status_code == 200, create_resp.text
    entry = create_resp.json()
    assert entry["category"] == category
    assert entry["entry_type"] == "Income"
    assert entry["amount"] == 2500.5
    entry_id = entry["id"]

    list_resp = client.get("/accounting/entries/", headers=auth)
    assert list_resp.status_code == 200
    assert any(e["id"] == entry_id for e in list_resp.json())

    ledger_resp = client.get("/accounting/ledger", headers=auth, params={
        "start_date": "2026-02-01", "end_date": "2026-02-28",
    })
    assert ledger_resp.status_code == 200
    ledger = ledger_resp.json()
    assert any(
        e["category"] == category and e["source"] == "manual" for e in ledger
    )

    summary_resp = client.get("/accounting/summary", headers=auth, params={
        "start_date": "2026-02-01", "end_date": "2026-02-28",
    })
    assert summary_resp.status_code == 200
    summary = summary_resp.json()
    assert summary["other_income"] >= 2500.5
    assert any(m["month"] == "2026-02" for m in summary["monthly"])

    export_resp = client.get("/accounting/export/tally", headers=auth, params={
        "start_date": "2026-02-01", "end_date": "2026-02-28",
    })
    assert export_resp.status_code == 200
    assert category in export_resp.text
    assert export_resp.headers["content-type"].startswith("application/xml")

    update_resp = client.put(f"/accounting/entries/{entry_id}", json={
        "amount": 3000,
        "description": "Updated description",
    }, headers=auth)
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["amount"] == 3000
    assert update_resp.json()["category"] == category

    delete_resp = client.delete(f"/accounting/entries/{entry_id}", headers=auth)
    assert delete_resp.status_code == 200

    list_after = client.get("/accounting/entries/", headers=auth)
    assert not any(e["id"] == entry_id for e in list_after.json())


def test_update_entry_not_found(client, auth):
    resp = client.put("/accounting/entries/99999999", json={"amount": 1}, headers=auth)
    assert resp.status_code == 404


def test_delete_entry_not_found(client, auth):
    resp = client.delete("/accounting/entries/99999999", headers=auth)
    assert resp.status_code == 404
