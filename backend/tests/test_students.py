"""Student bulk CSV import.

Regression coverage for a real production bug: the commit loop passed
Pydantic's full model_dump() (including the request-only `roll_no_mode`
field) straight into the Student(**...) constructor. SQLAlchemy rejects
unknown kwargs, so every real (non-dry-run) import crashed with an
unhandled 500 on the first valid row -- which, since the crash happens
outside FastAPI's own exception handling, comes back with no CORS
headers at all, so the browser reports a misleading "blocked by CORS
policy" error instead of the real cause. Dry runs and files with no
valid rows never hit that code path, which is why the bug went unnoticed:
the endpoint "worked" for template downloads, validation-only runs, and
badly-formed files, and only broke on an actual import of real data.
"""

import io

import pytest


@pytest.fixture()
def db_session(client):
    from app.database import SessionLocal
    session = SessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()


@pytest.fixture()
def a_class(db_session):
    from app.models import SchoolClass
    school_class = SchoolClass(class_name="1", section="A")
    db_session.add(school_class)
    db_session.commit()
    db_session.refresh(school_class)
    return school_class


def _csv_file(rows_csv: str):
    return {"file": ("students.csv", io.BytesIO(rows_csv.encode("utf-8")), "text/csv")}


HEADER = (
    "admission_no,first_name,last_name,gender,dob,class_name,section,roll_no,"
    "admission_date,student_status,father_name,mother_name,guardian_name,"
    "guardian_phone,guardian_email,nationality,blood_group"
)


def test_bulk_import_template_matches_upload_columns(client, auth):
    resp = client.get("/students/bulk-import-template", headers=auth)
    assert resp.status_code == 200
    header_line = resp.text.splitlines()[0]
    assert header_line == HEADER


def test_dry_run_creates_nothing_and_reports_errors(client, auth, a_class):
    body = HEADER + "\n" + ",Jane,Doe,Female,2012-05-14,1,A,1,2026-04-01,Active,,,,,,,\n"
    resp = client.post(
        "/students/bulk-import?dry_run=true", headers=auth, files=_csv_file(body)
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["dry_run"] is True
    assert data["created"] == 0
    assert data["errors"] == [{"row": 2, "error": "admission_no is required"}]

    listed = client.get("/students/", headers=auth).json()
    assert not any(s["first_name"] == "Jane" for s in listed)


def test_real_import_creates_students(client, auth, a_class):
    """The exact scenario that used to crash: a well-formed file, dry_run=false."""
    body = (
        HEADER + "\n"
        + "ADMTEST001,Jane,Doe,Female,2012-05-14,1,A,1,2026-04-01,Active,"
        "John Doe,Mary Doe,John Doe,9876543210,john.doe@example.com,Indian,O+\n"
        + "ADMTEST002,Sam,Roy,Male,2012-06-20,1,A,2,2026-04-01,Active,"
        "Ravi Roy,Sita Roy,Ravi Roy,9876500000,ravi.roy@example.com,Indian,B+\n"
    )
    resp = client.post(
        "/students/bulk-import?dry_run=false", headers=auth, files=_csv_file(body)
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["created"] == 2
    assert data["errors"] == []

    listed = client.get("/students/", headers=auth).json()
    admission_nos = {s["admission_no"] for s in listed}
    assert {"ADMTEST001", "ADMTEST002"}.issubset(admission_nos)
    jane = next(s for s in listed if s["admission_no"] == "ADMTEST001")
    assert jane["class_id"] == a_class.id
    assert jane["roll_no"] == "1"


def test_duplicate_admission_no_in_file_is_rejected(client, auth, a_class):
    body = (
        HEADER + "\n"
        + "ADMDUP001,A,One,Male,2012-01-01,1,A,1,2026-04-01,Active,,,,,,,\n"
        + "ADMDUP001,A,Two,Male,2012-01-01,1,A,2,2026-04-01,Active,,,,,,,\n"
    )
    resp = client.post(
        "/students/bulk-import?dry_run=true", headers=auth, files=_csv_file(body)
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid_rows"] == 1
    assert data["errors"] == [
        {"row": 3, "error": "Duplicate admission_no in file: ADMDUP001"}
    ]


def test_unknown_class_section_is_rejected(client, auth):
    body = (
        HEADER + "\n"
        + "ADMNOCLASS,A,One,Male,2012-01-01,99,Z,1,2026-04-01,Active,,,,,,,\n"
    )
    resp = client.post(
        "/students/bulk-import?dry_run=true", headers=auth, files=_csv_file(body)
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["valid_rows"] == 0
    assert "No matching class found" in data["errors"][0]["error"]
