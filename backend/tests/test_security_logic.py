"""Unit tests for the security-critical and core logic modules.

These are pure/deterministic and touch no application data. Run with:
    PYTHONPATH=.pylibs python -m pytest tests -q
"""

import os
import time
import sqlite3

import pytest


# --- TOTP (app/totp.py) ---

def test_totp_generate_and_verify():
    from app import totp
    secret = totp.generate_secret()
    assert len(secret) >= 16
    counter = int(time.time() // totp.STEP_SECONDS)
    code = totp._hotp(secret, counter)
    assert totp.verify_totp(secret, code) is True
    assert totp.verify_totp(secret, "000000") is False
    assert totp.verify_totp(secret, "") is False
    assert totp.verify_totp("", code) is False


def test_totp_clock_skew_window():
    from app import totp
    secret = totp.generate_secret()
    counter = int(time.time() // totp.STEP_SECONDS)
    # previous and next step should both verify (window=1)
    assert totp.verify_totp(secret, totp._hotp(secret, counter - 1)) is True
    assert totp.verify_totp(secret, totp._hotp(secret, counter + 1)) is True


def test_totp_provisioning_uri():
    from app import totp
    uri = totp.provisioning_uri("ABCDEF", "user@example.com")
    assert uri.startswith("otpauth://totp/")
    assert "secret=ABCDEF" in uri


# --- Password policy (app/security.py) ---

def test_password_policy(monkeypatch):
    from app import security
    from fastapi import HTTPException
    # below minimum -> raises
    with pytest.raises(HTTPException) as exc:
        security.validate_password("short")
    assert exc.value.status_code == 400
    # at/above minimum -> ok
    security.validate_password("longenough1")


# --- Rate limiter (app/rate_limit.py) ---

def test_rate_limiter_blocks_after_threshold(monkeypatch):
    import importlib
    from app import rate_limit
    monkeypatch.setenv("LOGIN_MAX_ATTEMPTS", "3")
    importlib.reload(rate_limit)
    keys = rate_limit.login_keys("9.9.9.9", "brute@test.com")
    assert rate_limit.check_login_allowed(keys) is None
    for _ in range(3):
        rate_limit.record_login_failure(keys)
    retry = rate_limit.check_login_allowed(keys)
    assert isinstance(retry, int) and retry > 0
    rate_limit.clear_login_failures(keys)
    assert rate_limit.check_login_allowed(keys) is None


# --- WhatsApp number normalization (app/whatsapp.py) ---

def test_whatsapp_number_normalization(monkeypatch):
    monkeypatch.setenv("WHATSAPP_DEFAULT_COUNTRY_CODE", "+91")
    from app import whatsapp
    assert whatsapp.normalize_whatsapp_number("9876543210") == "whatsapp:+919876543210"
    assert whatsapp.normalize_whatsapp_number("+14155550100") == "whatsapp:+14155550100"
    assert whatsapp.normalize_whatsapp_number("098765") == "whatsapp:+9198765"


# --- Mailer log-mode (app/mailer.py) ---

def test_mailer_logmode(monkeypatch):
    monkeypatch.delenv("SMTP_HOST", raising=False)
    from app import mailer
    assert mailer.is_configured() is False
    # log-mode returns True without raising
    assert mailer.send_email("a@b.com", "sub", "body") is True


# --- Audit helpers (app/audit.py) ---

def test_audit_should_audit():
    from app import audit
    assert audit.should_audit("POST", "/fees/") is True
    assert audit.should_audit("GET", "/fees/") is False
    assert audit.should_audit("POST", "/docs") is False


def test_audit_actor_from_token():
    from app import audit
    assert audit.actor_from_token(None) == {"email": None, "role": None, "account_code": None}
    assert audit.actor_from_token("Bearer not.a.jwt")["email"] is None


# --- PDF receipt (app/pdf.py) ---

def test_fee_receipt_pdf_bytes():
    from app import pdf
    data = pdf.fee_receipt_pdf({
        "school_name": "Test School", "currency": "USD", "receipt_no": "R1",
        "student_name": "Jane", "class_label": "5A", "fee_type": "Tuition",
        "academic_year": "2026-27", "total": 100, "paid": 100, "balance": 0,
        "status": "Paid", "payment_date": "2026-07-06",
    })
    assert data[:5] == b"%PDF-"
    assert len(data) > 500


# --- Backup online-copy roundtrip (app/backup.py) ---

def test_sqlite_online_backup_roundtrip(tmp_path):
    from app import backup
    src = tmp_path / "src.db"
    dst = tmp_path / "dst.db"
    conn = sqlite3.connect(src)
    conn.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)")
    conn.execute("INSERT INTO t (v) VALUES ('hello')")
    conn.commit()
    conn.close()

    backup._online_backup(str(src), str(dst))
    out = sqlite3.connect(dst)
    assert out.execute("SELECT v FROM t").fetchone()[0] == "hello"
    assert out.execute("PRAGMA integrity_check").fetchone()[0] == "ok"


def test_backup_sqlite_path_parsing():
    from app import backup
    assert backup._sqlite_path("sqlite:///./x.db") == "./x.db"
    assert backup._sqlite_path("postgresql+psycopg://u@h/db") is None
