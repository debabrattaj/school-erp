"""Homework/assignments: staff CRUD."""


def test_create_list_update_delete_assignment(client, auth):
    resp = client.post("/homework/", json={
        "class_name": "HW-Test-5", "section": "A", "subject": "Science",
        "title": "Volcano diagram", "description": "Label all parts",
        "due_date": "2027-01-10",
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    assignment = resp.json()
    assert assignment["title"] == "Volcano diagram"

    resp = client.get("/homework/", params={"class_name": "HW-Test-5", "section": "A"}, headers=auth)
    assert resp.status_code == 200
    assert any(a["id"] == assignment["id"] for a in resp.json())

    resp = client.put(f"/homework/{assignment['id']}", json={"title": "Volcano diagram (updated)"}, headers=auth)
    assert resp.status_code == 200
    assert resp.json()["title"] == "Volcano diagram (updated)"

    resp = client.delete(f"/homework/{assignment['id']}", headers=auth)
    assert resp.status_code == 200

    resp = client.get("/homework/", params={"class_name": "HW-Test-5", "section": "A"}, headers=auth)
    assert not any(a["id"] == assignment["id"] for a in resp.json())


def test_create_assignment_requires_title(client, auth):
    resp = client.post("/homework/", json={
        "class_name": "HW-Test-6", "title": "   ",
    }, headers=auth)
    assert resp.status_code == 400
