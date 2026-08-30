"""Reports Center backend surfaces added alongside the frontend rework:

- Bulk custom-field-value endpoints (GET /module-custom-fields/{module} and
  GET /students/custom-fields/all) that let the report page fetch every
  record's custom fields in one query instead of one request per record.
- Saved report views (GET/POST/DELETE /report-views), scoped to the
  signed-in user.
"""


def _create_class(client, auth, class_name="Reports Class", section="A"):
    resp = client.post("/classes/", json={
        "class_name": class_name,
        "section": section,
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _create_student(client, auth, class_id, admission_no, first_name):
    resp = client.post("/students/", json={
        "admission_no": admission_no,
        "first_name": first_name,
        "class_id": class_id,
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def test_bulk_module_custom_fields_returns_every_record_in_one_call(client, auth):
    class_id = _create_class(client, auth, "Reports-Bulk-Class")
    student_a = _create_student(client, auth, class_id, "RPT-BULK-A", "Asha")
    student_b = _create_student(client, auth, class_id, "RPT-BULK-B", "Beena")

    for student_id, value in [(student_a, "Vegetarian"), (student_b, "Non-Vegetarian")]:
        resp = client.post(
            f"/module-custom-fields/Students/{student_id}",
            json={"values": [{
                "field_key": "diet",
                "field_label": "Diet",
                "field_type": "text",
                "field_value": value,
            }]},
            headers=auth,
        )
        assert resp.status_code == 200, resp.text

    resp = client.get("/module-custom-fields/Students", headers=auth)
    assert resp.status_code == 200, resp.text
    values = resp.json()

    by_record = {item["record_id"]: item["field_value"] for item in values if item["field_key"] == "diet"}
    assert by_record.get(student_a) == "Vegetarian"
    assert by_record.get(student_b) == "Non-Vegetarian"


def test_bulk_module_custom_fields_rejects_unknown_module(client, auth):
    resp = client.get("/module-custom-fields/NotAModule", headers=auth)
    assert resp.status_code == 400


def test_bulk_legacy_student_custom_fields_returns_every_student(client, auth):
    class_id = _create_class(client, auth, "Reports-Legacy-Class")
    student_id = _create_student(client, auth, class_id, "RPT-LEGACY-A", "Chitra")

    resp = client.post(
        f"/students/{student_id}/custom-fields",
        json={"values": [{
            "field_key": "house",
            "field_label": "House",
            "field_type": "text",
            "field_value": "Red",
        }]},
        headers=auth,
    )
    assert resp.status_code == 200, resp.text

    resp = client.get("/students/custom-fields/all", headers=auth)
    assert resp.status_code == 200, resp.text
    values = resp.json()

    match = [item for item in values if item["student_id"] == student_id and item["field_key"] == "house"]
    assert len(match) == 1
    assert match[0]["field_value"] == "Red"


def test_saved_report_view_create_list_delete(client, auth):
    resp = client.post("/report-views", json={
        "name": "Unpaid Fees This Year",
        "module_name": "Fees",
        "filters": {"statusFilter": "Unpaid", "academicYearFilter": "2026-27"},
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    view = resp.json()
    assert view["name"] == "Unpaid Fees This Year"
    assert view["module_name"] == "Fees"
    assert view["filters"] == {"statusFilter": "Unpaid", "academicYearFilter": "2026-27"}

    resp = client.get("/report-views", params={"module_name": "Fees"}, headers=auth)
    assert resp.status_code == 200, resp.text
    views = resp.json()
    assert any(v["id"] == view["id"] for v in views)

    resp = client.get("/report-views", params={"module_name": "Marks"}, headers=auth)
    assert resp.status_code == 200, resp.text
    assert not any(v["id"] == view["id"] for v in resp.json())

    resp = client.delete(f"/report-views/{view['id']}", headers=auth)
    assert resp.status_code == 200, resp.text

    resp = client.get("/report-views", params={"module_name": "Fees"}, headers=auth)
    assert not any(v["id"] == view["id"] for v in resp.json())


def test_saved_report_view_requires_name(client, auth):
    resp = client.post("/report-views", json={
        "name": "   ",
        "module_name": "Students",
        "filters": {},
    }, headers=auth)
    assert resp.status_code == 400


def test_delete_nonexistent_saved_report_view_404s(client, auth):
    resp = client.delete("/report-views/999999", headers=auth)
    assert resp.status_code == 404
