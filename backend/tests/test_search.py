"""Coverage for backend/app/routes/search.py (prefix /search) -- global
search across students/teachers/classes/exams. Uses the normal tenant
`auth` fixture (not platform auth). No tests existed for this module
before this file (site-wide zero-coverage audit).
"""

import uuid


def test_search_rejects_unauthenticated(client):
    resp = client.get("/search", params={"q": "anything"})
    assert resp.status_code in (401, 403)


def test_search_short_query_returns_empty_results(client, auth):
    resp = client.get("/search", params={"q": "a"}, headers=auth)
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"results": []}


def test_search_no_query_returns_empty_results(client, auth):
    resp = client.get("/search", headers=auth)
    assert resp.status_code == 200, resp.text
    assert resp.json() == {"results": []}


def test_search_finds_created_student(client, auth):
    unique = uuid.uuid4().hex[:10]
    first_name = f"Zzsearch{unique}"

    class_resp = client.post(
        "/classes/",
        json={"class_name": f"SearchClass-{unique}", "section": "A"},
        headers=auth,
    )
    assert class_resp.status_code == 200, class_resp.text
    class_id = class_resp.json()["id"]

    student_resp = client.post(
        "/students/",
        json={
            "admission_no": f"SRCH-{unique}",
            "first_name": first_name,
            "last_name": "Findme",
            "class_id": class_id,
        },
        headers=auth,
    )
    assert student_resp.status_code == 200, student_resp.text
    student_id = student_resp.json()["id"]

    search_resp = client.get("/search", params={"q": first_name}, headers=auth)
    assert search_resp.status_code == 200, search_resp.text
    results = search_resp.json()["results"]
    assert len(results) >= 1
    match = next(r for r in results if r["id"] == student_id and r["group"] == "Students")
    assert first_name in match["label"]
    assert match["path"] == f"/students/{student_id}"

    # Search by admission_no should also find it.
    by_admission = client.get(
        "/search", params={"q": f"SRCH-{unique}"}, headers=auth
    )
    assert by_admission.status_code == 200, by_admission.text
    admission_results = by_admission.json()["results"]
    assert any(r["id"] == student_id for r in admission_results)


def test_search_finds_created_class(client, auth):
    unique = uuid.uuid4().hex[:10]
    class_name = f"Zzclasssearch{unique}"

    class_resp = client.post(
        "/classes/", json={"class_name": class_name, "section": "B"}, headers=auth
    )
    assert class_resp.status_code == 200, class_resp.text
    class_id = class_resp.json()["id"]

    search_resp = client.get("/search", params={"q": class_name}, headers=auth)
    assert search_resp.status_code == 200, search_resp.text
    results = search_resp.json()["results"]
    match = next(r for r in results if r["id"] == class_id and r["group"] == "Classes")
    assert class_name in match["label"]
