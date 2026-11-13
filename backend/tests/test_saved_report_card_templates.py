import importlib.util
from pathlib import Path


def test_school_template_save_reopen_edit_and_conflict(client, auth):
    payload = {"name":"Senior school custom report", "configuration": {
        "template":"studio", "title":"Term Achievement Record", "accent_color":"#531978",
        "font_family":"serif", "teacher_label":"Mentor", "principal_label":"Head of School",
        "show_rank":False, "mark_colors":{"top":"#ff7700"},
    }}
    response=client.post("/marks/templates",json=payload,headers=auth)
    assert response.status_code==201, response.text
    saved=response.json()
    assert saved["revision"]==1
    reopened=next(row for row in client.get("/marks/templates",headers=auth).json() if row["id"]==saved["id"])
    assert reopened["configuration"]["title"]=="Term Achievement Record"
    assert reopened["configuration"]["mark_colors"]["top"]=="#ff7700"
    assert reopened["configuration"]["show_rank"] is False
    edited={"name":saved["name"],"configuration":reopened["configuration"],"revision":1}
    edited["configuration"]["title"]="Updated School Report"
    changed=client.put(f"/marks/templates/{saved['id']}",json=edited,headers=auth)
    assert changed.status_code==200, changed.text
    assert changed.json()["revision"]==2
    assert client.put(f"/marks/templates/{saved['id']}",json=edited,headers=auth).status_code==409
    assert client.post("/marks/templates",json=payload,headers=auth).status_code==409
    reopened=next(row for row in client.get("/marks/templates",headers=auth).json() if row["id"]==saved["id"])
    assert reopened["configuration"]["title"]=="Updated School Report"


def test_template_validation_and_auth(client, auth):
    assert client.get("/marks/templates").status_code in (401,403)
    for config in ({"accent_color":"not a colour"}, {"template":"unknown"}, {"total_obtained":100}, {"title":"  "}):
        response=client.post("/marks/templates",json={"name":"Invalid", "configuration":config},headers=auth)
        assert response.status_code==422, response.text
    assert client.post("/marks/templates",json={"name":"  ","configuration":{}},headers=auth).status_code==422
    assert client.put("/marks/templates/999999",json={"name":"Missing","configuration":{},"revision":1},headers=auth).status_code==404


def test_custom_report_download_uses_design_with_real_student_data(client, auth, monkeypatch):
    from app import pdf
    student = client.post("/students/", json={"admission_no":"CUSTOM-REPORT-01", "first_name":"Sample"}, headers=auth)
    assert student.status_code == 200, student.text
    exam = client.post("/exams/", json={"exam_name":"Custom Report Exam", "exam_date":"2026-03-01"}, headers=auth)
    assert exam.status_code == 200, exam.text
    mark = client.post("/marks/", json={"student_id":student.json()["id"], "exam_id":exam.json()["id"], "subject_name":"Mathematics", "marks_obtained":93, "total_marks":100}, headers=auth)
    assert mark.status_code == 200, mark.text
    captured = {}
    original = pdf.report_card_pdf
    def capture(data, template):
        captured.update(data)
        return original(data, template)
    monkeypatch.setattr(pdf, "report_card_pdf", capture)
    response = client.post("/marks/report-card-preview", params={"student_id":student.json()["id"], "exam_id":exam.json()["id"]},
                           json={"template":"scholar", "title":"School Achievement", "show_rank":False, "teacher_label":"Mentor", "mark_colors":{"top":"#ff8800"}}, headers=auth)
    assert response.status_code == 200, response.text
    assert response.content.startswith(b"%PDF")
    assert captured["student_name"].startswith("Sample")
    assert captured["design"]["title"] == "School Achievement"
    assert captured["design"]["show_rank"] is False
    assert captured["mark_colors"]["top"] == "#ff8800"


def test_template_migration_creates_tenant_table_and_is_repeatable(tmp_path):
    from sqlalchemy import create_engine, inspect
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    path=Path(__file__).parents[1]/"alembic/versions/fe3f4a5b6c7d_saved_report_card_templates.py"
    spec=importlib.util.spec_from_file_location("saved_templates_migration",path)
    migration=importlib.util.module_from_spec(spec);spec.loader.exec_module(migration)
    engine=create_engine(f"sqlite:///{tmp_path / 'migration.db'}")
    with engine.begin() as connection:
        migration.op=Operations(MigrationContext.configure(connection))
        migration.upgrade();migration.upgrade()
        assert "report_card_templates" in inspect(connection).get_table_names()
        assert {column["name"] for column in inspect(connection).get_columns("report_card_templates")} == {"id","name","configuration","revision"}
        migration.downgrade()
        assert "report_card_templates" not in inspect(connection).get_table_names()
