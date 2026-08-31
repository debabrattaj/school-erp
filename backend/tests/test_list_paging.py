"""Search, sort and paging on the list endpoints that grow with use.

These are additive: a caller passing none of the new parameters must still get
the whole list in the order it always got, which the first test in each group
pins down. Paging and search were added together deliberately -- paging a list
whose client still searched its own loaded rows would silently search only the
page it happened to hold.
"""

import pytest


@pytest.fixture(scope="module")
def module_auth(client):
    resp = client.post("/auth/login", json={
        "account_code": "default",
        "email": "admin@school.com",
        "password": "admin123",
    })
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture(scope="module", autouse=True)
def enable_gated_modules(client):
    """Mess, Infirmary and Library are sold separately and default to off.

    Switched on directly in the central store rather than through
    /accounts/{code}/features, which is platform-owner-only.
    """
    from app.tenant import CentralSessionLocal
    from app.tenant_models import SchoolAccount, SchoolFeature

    db = CentralSessionLocal()
    try:
        account = db.query(SchoolAccount).filter(SchoolAccount.account_code == "default").first()
        assert account is not None
        for key in ("mess_management", "health_infirmary", "library"):
            row = (
                db.query(SchoolFeature)
                .filter(SchoolFeature.account_id == account.id, SchoolFeature.feature_key == key)
                .first()
            )
            if row:
                row.is_enabled = True
            else:
                db.add(SchoolFeature(account_id=account.id, feature_key=key, is_enabled=True))
        db.commit()
    finally:
        db.close()


@pytest.fixture(scope="module")
def homework_rows(client, module_auth):
    made = []
    for i, (title, section) in enumerate(
        [("PAGE Algebra drills", "A"), ("PAGE Poetry reading", "B"), ("PAGE Lab safety", "A")]
    ):
        resp = client.post("/homework/", json={
            "class_name": "PG9",
            "section": section,
            "subject": "Mathematics",
            "title": title,
            "due_date": f"2026-10-0{i + 1}",
        }, headers=module_auth)
        assert resp.status_code == 200, resp.text
        made.append(resp.json())
    return made


class TestHomeworkListing:
    def test_no_parameters_returns_the_whole_list(self, client, module_auth, homework_rows):
        resp = client.get("/homework/", headers=module_auth)
        assert resp.status_code == 200
        ids = {r["id"] for r in resp.json()}
        assert {r["id"] for r in homework_rows} <= ids

    def test_search_narrows_by_title(self, client, module_auth, homework_rows):
        resp = client.get("/homework/", params={"search": "Poetry"}, headers=module_auth)
        assert [r["title"] for r in resp.json()] == ["PAGE Poetry reading"]

    def test_search_is_case_insensitive(self, client, module_auth, homework_rows):
        resp = client.get("/homework/", params={"search": "algebra"}, headers=module_auth)
        assert [r["title"] for r in resp.json()] == ["PAGE Algebra drills"]

    def test_search_combines_with_the_existing_filters(self, client, module_auth, homework_rows):
        resp = client.get(
            "/homework/", params={"search": "PAGE", "section": "A"}, headers=module_auth
        )
        assert {r["title"] for r in resp.json()} == {"PAGE Algebra drills", "PAGE Lab safety"}

    def test_limit_and_offset_walk_the_list_without_repeating(self, client, module_auth, homework_rows):
        everything = client.get("/homework/", params={"search": "PAGE"}, headers=module_auth).json()
        assert len(everything) == 3

        first = client.get("/homework/", params={"search": "PAGE", "limit": 2}, headers=module_auth).json()
        second = client.get(
            "/homework/", params={"search": "PAGE", "limit": 2, "offset": 2}, headers=module_auth
        ).json()

        assert [r["id"] for r in first] == [r["id"] for r in everything[:2]]
        assert [r["id"] for r in second] == [r["id"] for r in everything[2:]]
        # No row appears on two pages, which is what makes appending them safe.
        assert not ({r["id"] for r in first} & {r["id"] for r in second})

    def test_a_short_page_is_how_the_client_knows_it_is_done(self, client, module_auth, homework_rows):
        page = client.get("/homework/", params={"search": "PAGE", "limit": 50}, headers=module_auth).json()
        assert len(page) < 50

    def test_sort_ascending_and_descending(self, client, module_auth, homework_rows):
        asc = client.get(
            "/homework/", params={"search": "PAGE", "sort": "title", "order": "asc"}, headers=module_auth
        ).json()
        desc = client.get(
            "/homework/", params={"search": "PAGE", "sort": "title", "order": "desc"}, headers=module_auth
        ).json()
        titles = [r["title"] for r in asc]
        assert titles == sorted(titles)
        assert [r["title"] for r in desc] == list(reversed(titles))

    def test_an_unknown_sort_column_is_ignored_rather_than_erroring(self, client, module_auth, homework_rows):
        resp = client.get(
            "/homework/", params={"search": "PAGE", "sort": "definitely_not_a_column"}, headers=module_auth
        )
        assert resp.status_code == 200
        assert len(resp.json()) == 3


class TestOtherPagedEndpoints:
    """The same helper backs each of these, so one call apiece is enough."""

    @pytest.mark.parametrize("path", [
        "/fees/",
        "/library/books/",
        "/library/issues/",
        "/accounting/entries/",
        "/mess/attendance/",
        "/health-infirmary/visits/",
        "/student-enrollments/",
        "/students/",
        "/teachers/",
    ])
    def test_accepts_the_listing_parameters(self, client, module_auth, path):
        resp = client.get(
            path,
            params={"search": "zzz-no-match-expected", "sort": "id", "order": "desc", "limit": 5, "offset": 0},
            headers=module_auth,
        )
        assert resp.status_code == 200, f"{path}: {resp.text}"
        assert isinstance(resp.json(), list)

    @pytest.mark.parametrize("path", [
        "/fees/", "/library/books/", "/accounting/entries/", "/students/", "/teachers/",
    ])
    def test_limit_is_respected(self, client, module_auth, path):
        resp = client.get(path, params={"limit": 1}, headers=module_auth)
        assert resp.status_code == 200
        assert len(resp.json()) <= 1
