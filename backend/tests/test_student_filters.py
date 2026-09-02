"""Optional filters on GET /students/, and Principal access to attendance.

Both exist because a client had no way to ask for less than the whole student
table: the mobile app's attendance, marks and class screens each downloaded
every student in the school on every open and narrowed the list in JavaScript.
The filters are additive -- a caller that passes nothing must still get exactly
what it got before, which the first test here pins down.
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


@pytest.fixture()
def principal_auth(client):
    resp = client.post("/auth/login", json={
        "account_code": "default",
        "email": "principal@school.com",
        "password": "principal123",
    })
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}


@pytest.fixture(scope="module")
def cohort(client, module_auth):
    """Two classes with a few students each, plus one withdrawn student.

    Module-scoped: the test database lives for the whole session, so building
    this per test would collide on admission numbers.
    """
    auth = module_auth
    made = []
    for class_name, section, names, status in [
        ("FLT11", "A", ["Ashaf Rao", "Vikramf Nair"], "Active"),
        ("FLT11", "B", ["Priyaf Menon"], "Active"),
        ("FLT12", "A", ["Rahulf Das"], "Active"),
        ("FLT12", "A", ["Oldf Student"], "Transferred"),
    ]:
        cls = client.post("/classes/", json={"class_name": class_name, "section": section}, headers=auth)
        class_id = cls.json()["id"] if cls.status_code == 200 else None
        for full in names:
            first, last = full.split(" ", 1)
            resp = client.post("/students/", json={
                "admission_no": f"FILT-{first}-{class_name}{section}",
                "first_name": first,
                "last_name": last,
                "class_id": class_id,
                "class_name": class_name,
                "section": section,
                "student_status": status,
            }, headers=auth)
            assert resp.status_code == 200, resp.text
            made.append(resp.json())
    return made


def test_no_filters_returns_every_student(client, auth, cohort):
    """The pre-existing contract: no parameters means the whole list."""
    resp = client.get("/students/", headers=auth)
    assert resp.status_code == 200
    ids = {s["id"] for s in resp.json()}
    assert {s["id"] for s in cohort} <= ids


def test_filters_by_class_and_section(client, auth, cohort):
    resp = client.get("/students/", params={"class_name": "FLT11", "section": "A"}, headers=auth)
    assert resp.status_code == 200
    rows = resp.json()
    assert {r["first_name"] for r in rows} == {"Ashaf", "Vikramf"}


def test_filters_by_class_id(client, auth, cohort):
    class_id = cohort[0]["class_id"]
    resp = client.get("/students/", params={"class_id": class_id}, headers=auth)
    assert resp.status_code == 200
    assert all(r["class_id"] == class_id for r in resp.json())


def test_filters_by_status(client, auth, cohort):
    resp = client.get("/students/", params={"class_name": "FLT12", "student_status": "Transferred"}, headers=auth)
    assert resp.status_code == 200
    assert all(r["student_status"] == "Transferred" for r in resp.json())
    assert {r["first_name"] for r in resp.json()} == {"Oldf"}


def test_search_matches_name_and_admission_no(client, auth, cohort):
    by_name = client.get("/students/", params={"search": "Priyaf"}, headers=auth)
    assert [r["first_name"] for r in by_name.json()] == ["Priyaf"]

    by_admission = client.get("/students/", params={"search": "FILT-Rahulf"}, headers=auth)
    assert [r["first_name"] for r in by_admission.json()] == ["Rahulf"]


def test_search_is_case_insensitive(client, auth, cohort):
    resp = client.get("/students/", params={"search": "ashaf"}, headers=auth)
    assert [r["first_name"] for r in resp.json()] == ["Ashaf"]


def test_limit_and_offset_page_through_the_list(client, auth, cohort):
    everything = client.get("/students/", headers=auth).json()
    first = client.get("/students/", params={"limit": 2}, headers=auth).json()
    second = client.get("/students/", params={"limit": 2, "offset": 2}, headers=auth).json()

    assert len(first) == 2
    assert [s["id"] for s in first] == [s["id"] for s in everything[:2]]
    assert [s["id"] for s in second] == [s["id"] for s in everything[2:4]]


def test_filters_combine(client, auth, cohort):
    resp = client.get(
        "/students/",
        params={"class_name": "FLT12", "section": "A", "student_status": "Active"},
        headers=auth,
    )
    assert [r["first_name"] for r in resp.json()] == ["Rahulf"]


class TestPrincipalAttendance:
    """A Principal reviews attendance; Admin and Teacher write it.

    Their permission map says attendance:view, and these pin the boundary so
    the write routes are not widened again by someone reading the map and
    assuming the routes were the mistake.
    """

    def test_principal_can_read_the_register(self, client, principal_auth, cohort):
        assert client.get("/attendance/", headers=principal_auth).status_code == 200

    def test_principal_can_read_the_class_roster(self, client, principal_auth, cohort):
        """Reviewing the day's marks is reading, and stays allowed."""
        class_id = cohort[0]["class_id"]
        resp = client.get(
            "/attendance/roster",
            params={"class_id": class_id, "attendance_date": "2026-09-01"},
            headers=principal_auth,
        )
        assert resp.status_code == 200, resp.text

    def test_principal_cannot_mark_one_student(self, client, principal_auth, cohort):
        resp = client.post("/attendance/", json={
            "student_id": cohort[0]["id"],
            "attendance_date": "2026-09-05",
            "status": "Present",
        }, headers=principal_auth)
        assert resp.status_code == 403

    def test_principal_cannot_mark_a_whole_class(self, client, principal_auth, cohort):
        resp = client.post("/attendance/bulk", json={
            "attendance_date": "2026-09-06",
            "class_id": cohort[0]["class_id"],
            "entries": [{"student_id": cohort[0]["id"], "status": "Present"}],
        }, headers=principal_auth)
        assert resp.status_code == 403

    def test_principal_cannot_correct_an_existing_mark(self, client, principal_auth, auth, cohort):
        created = client.post("/attendance/", json={
            "student_id": cohort[1]["id"],
            "attendance_date": "2026-09-07",
            "status": "Absent",
        }, headers=auth)
        assert created.status_code == 200, created.text

        refused = client.put(
            f"/attendance/{created.json()['id']}",
            json={"status": "Excused"},
            headers=principal_auth,
        )
        assert refused.status_code == 403

    def test_deleting_attendance_stays_admin_only(self, client, principal_auth, auth, cohort):
        created = client.post("/attendance/", json={
            "student_id": cohort[2]["id"],
            "attendance_date": "2026-09-08",
            "status": "Present",
        }, headers=auth)
        assert created.status_code == 200, created.text

        refused = client.delete(f"/attendance/{created.json()['id']}", headers=principal_auth)
        assert refused.status_code == 403

    def test_the_permission_map_matches_what_the_routes_allow(self, client):
        """Both clients build their navigation from the map the login returns,
        so it claiming `manage` while the routes refuse it is what sent
        Principals to a page that could not save."""
        resp = client.post("/auth/login", json={
            "account_code": "default",
            "email": "principal@school.com",
            "password": "principal123",
        })
        assert resp.status_code == 200, resp.text
        perms = resp.json()["user"]["permissions"]
        assert perms["attendance"] == "view", "the map must not promise writes the routes refuse"
