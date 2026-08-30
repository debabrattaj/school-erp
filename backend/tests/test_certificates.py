"""Coverage for app/routes/certificates.py. It shares the /students prefix
with routes/students.py, exposing PDF-generating endpoints at
/students/{id}/bonafide, /transfer-certificate, /transcript, /id-card --
which had zero test coverage before this file.
"""

import uuid


def _make_student(client, auth, tag):
    resp = client.post("/students/", json={
        "admission_no": f"CERT-{tag}",
        "first_name": "Certy",
        "last_name": f"Student{tag}",
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def test_bonafide_rejects_unauthenticated(client):
    resp = client.get("/students/1/bonafide")
    assert resp.status_code in (401, 403)


def test_transfer_certificate_rejects_unauthenticated(client):
    resp = client.get("/students/1/transfer-certificate")
    assert resp.status_code in (401, 403)


def test_transcript_rejects_unauthenticated(client):
    resp = client.get("/students/1/transcript")
    assert resp.status_code in (401, 403)


def test_id_card_rejects_unauthenticated(client):
    resp = client.get("/students/1/id-card")
    assert resp.status_code in (401, 403)


def test_certificate_endpoints_full_flow_for_admin(client, auth):
    tag = uuid.uuid4().hex[:8]
    student_id = _make_student(client, auth, tag)

    bonafide_resp = client.get(f"/students/{student_id}/bonafide", headers=auth)
    assert bonafide_resp.status_code == 200, bonafide_resp.text
    assert bonafide_resp.headers["content-type"] == "application/pdf"
    assert bonafide_resp.content[:4] == b"%PDF"

    tc_resp = client.get(
        f"/students/{student_id}/transfer-certificate",
        params={"reason": "Family relocation", "conduct": "Excellent"},
        headers=auth,
    )
    assert tc_resp.status_code == 200, tc_resp.text
    assert tc_resp.headers["content-type"] == "application/pdf"
    assert tc_resp.content[:4] == b"%PDF"

    transcript_resp = client.get(f"/students/{student_id}/transcript", headers=auth)
    assert transcript_resp.status_code == 200, transcript_resp.text
    assert transcript_resp.headers["content-type"] == "application/pdf"
    assert transcript_resp.content[:4] == b"%PDF"

    id_card_resp = client.get(f"/students/{student_id}/id-card", headers=auth)
    assert id_card_resp.status_code == 200, id_card_resp.text
    assert id_card_resp.headers["content-type"] == "application/pdf"
    assert id_card_resp.content[:4] == b"%PDF"


def test_bonafide_404s_for_unknown_student(client, auth):
    resp = client.get("/students/9999999/bonafide", headers=auth)
    assert resp.status_code == 404
