"""Payroll: per-teacher salary structures and monthly payslip generation."""

import uuid

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


def _make_teacher(db, **overrides):
    from app.models import Teacher
    defaults = dict(
        employee_no=f"PAYROLL-{uuid.uuid4().hex[:8]}",
        name="Test Teacher",
        employment_type="Full Time",
    )
    defaults.update(overrides)
    teacher = Teacher(**defaults)
    db.add(teacher)
    db.commit()
    db.refresh(teacher)
    return teacher


def test_upsert_and_fetch_salary_structure(client, auth, db_session):
    teacher = _make_teacher(db_session)

    resp = client.put(
        f"/payroll/salary-structures/{teacher.id}",
        json={"basic_pay": 30000, "hra": 8000, "other_allowances": 1000,
              "provident_fund": 2000, "professional_tax": 200, "other_deductions": 0},
        headers=auth,
    )
    assert resp.status_code == 200, resp.text

    resp = client.get(f"/payroll/salary-structures/{teacher.id}", headers=auth)
    assert resp.status_code == 200
    assert resp.json()["basic_pay"] == 30000


def test_generate_payroll_is_idempotent(client, auth, db_session):
    teacher = _make_teacher(db_session)
    client.put(
        f"/payroll/salary-structures/{teacher.id}",
        json={"basic_pay": 25000, "hra": 5000, "other_allowances": 0,
              "provident_fund": 1500, "professional_tax": 200, "other_deductions": 0},
        headers=auth,
    )

    resp = client.post("/payroll/generate", json={"month": 4, "year": 2027}, headers=auth)
    assert resp.status_code == 200, resp.text
    created = resp.json()
    assert any(p["teacher_id"] == teacher.id for p in created)

    payslip = next(p for p in created if p["teacher_id"] == teacher.id)
    assert payslip["gross_pay"] == 30000
    assert payslip["total_deductions"] == 1700
    assert payslip["net_pay"] == 28300
    assert payslip["status"] == "Pending"

    # Re-running the same period must not double-bill this teacher.
    resp = client.post("/payroll/generate", json={"month": 4, "year": 2027}, headers=auth)
    assert resp.status_code == 200
    assert not any(p["teacher_id"] == teacher.id for p in resp.json())

    resp = client.get("/payroll/payslips", params={"teacher_id": teacher.id, "month": 4, "year": 2027}, headers=auth)
    assert len(resp.json()) == 1


def test_mark_paid_and_download_pdf(client, auth, db_session):
    teacher = _make_teacher(db_session)
    client.put(
        f"/payroll/salary-structures/{teacher.id}",
        json={"basic_pay": 20000, "hra": 0, "other_allowances": 0,
              "provident_fund": 0, "professional_tax": 0, "other_deductions": 0},
        headers=auth,
    )
    created = client.post("/payroll/generate", json={"month": 5, "year": 2027}, headers=auth).json()
    payslip_id = next(p["id"] for p in created if p["teacher_id"] == teacher.id)

    resp = client.put(
        f"/payroll/payslips/{payslip_id}/mark-paid",
        json={"payment_date": "2027-05-31", "remarks": "Bank transfer"},
        headers=auth,
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "Paid"
    assert resp.json()["payment_date"] == "2027-05-31"

    resp = client.get(f"/payroll/payslips/{payslip_id}/pdf", headers=auth)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content[:4] == b"%PDF"


def test_generate_payroll_requires_manager_role(client, db_session):
    """Teacher role can view but not run payroll — payroll is Admin/Accounts only."""
    from app.models import User
    from app.security import hash_password

    teacher_user = User(
        name="A Teacher", email=f"teacher-{uuid.uuid4().hex[:8]}@example.com",
        password_hash=hash_password("TeacherPass123!"), role="Teacher",
    )
    db_session.add(teacher_user)
    db_session.commit()

    login = client.post("/auth/login", json={
        "account_code": "default", "email": teacher_user.email, "password": "TeacherPass123!",
    })
    assert login.status_code == 200, login.text
    teacher_auth = {"Authorization": f"Bearer {login.json()['access_token']}"}

    resp = client.post("/payroll/generate", json={"month": 6, "year": 2027}, headers=teacher_auth)
    assert resp.status_code == 403

    resp = client.get("/payroll/payslips", headers=teacher_auth)
    assert resp.status_code == 403
