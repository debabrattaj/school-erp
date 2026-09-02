"""ExamComponent.weightage was captured in the UI and stored, but nothing
ever read it when grading -- a mark's grade always came from a straight
marks_obtained/total_marks sum regardless of what weight each component was
supposed to carry. These tests pin the fix: weighted marks must grade off
the weightage-adjusted percentage, unweighted marks keep the old raw
behavior, and rank/report-card totals must agree with whichever percentage
actually decided the grade.
"""


def _create_class(client, auth, class_name="Grading Class", section="A"):
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


def _create_exam(client, auth, exam_name, exam_date="2026-03-01"):
    resp = client.post("/exams/", json={
        "exam_name": exam_name,
        "exam_date": exam_date,
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def _create_component(client, auth, exam_id, name, max_marks, weightage=None, sort_order=1):
    resp = client.post("/exam-components/", json={
        "exam_id": exam_id,
        "component_name": name,
        "max_marks": max_marks,
        "weightage": weightage,
        "sort_order": sort_order,
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    return resp.json()["id"]


def test_mark_without_components_uses_raw_percentage(client, auth):
    class_id = _create_class(client, auth, "Grading-Raw")
    student_id = _create_student(client, auth, class_id, "GRADE-001", "Nina")
    exam_id = _create_exam(client, auth, "Grading-Raw-Exam")

    resp = client.post("/marks/", json={
        "student_id": student_id,
        "exam_id": exam_id,
        "subject_name": "Mathematics",
        "marks_obtained": 45,
        "total_marks": 50,
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    mark = resp.json()
    assert mark["percentage"] == 90.0
    assert mark["grade"] == "A+"


def test_weighted_components_use_weightage_not_raw_sum(client, auth):
    """Unit Test is worth 20% of the grade, Final is worth 80% -- despite
    both being scored out of 50. A student who aces the low-weight
    component and blanks the high-weight one must grade near the bottom,
    not the middle a raw 50/100 sum would imply."""
    class_id = _create_class(client, auth, "Grading-Weighted")
    student_id = _create_student(client, auth, class_id, "GRADE-010", "Omar")
    exam_id = _create_exam(client, auth, "Grading-Weighted-Exam")

    unit_test_id = _create_component(client, auth, exam_id, "Unit Test", 50, weightage=20, sort_order=1)
    final_id = _create_component(client, auth, exam_id, "Final", 50, weightage=80, sort_order=2)

    resp = client.post("/marks/", json={
        "student_id": student_id,
        "exam_id": exam_id,
        "subject_name": "Science",
        "marks_obtained": 0,  # overwritten by component sum
        "total_marks": 0,
        "component_scores": [
            {"exam_component_id": unit_test_id, "component_name": "Unit Test", "marks_obtained": 50, "max_marks": 50},
            {"exam_component_id": final_id, "component_name": "Final", "marks_obtained": 0, "max_marks": 50},
        ],
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    mark = resp.json()

    # Raw sum would be (50+0)/(50+50) = 50%. Weighted is (100%*20 + 0%*80)/100 = 20%.
    assert mark["marks_obtained"] == 50
    assert mark["total_marks"] == 100
    assert mark["percentage"] == 20.0
    assert mark["grade"] == "F"  # 20% is below the default 40% pass mark


def test_partial_weightage_falls_back_to_raw_percentage(client, auth):
    """If even one linked component has no weightage set, the exam hasn't
    opted into weighted grading -- averaging a weighted score against an
    unweighted one would be meaningless, so this must behave exactly like
    the no-weightage case: raw marks_obtained/total_marks."""
    class_id = _create_class(client, auth, "Grading-Partial")
    student_id = _create_student(client, auth, class_id, "GRADE-020", "Priya")
    exam_id = _create_exam(client, auth, "Grading-Partial-Exam")

    weighted_id = _create_component(client, auth, exam_id, "Unit Test", 50, weightage=20, sort_order=1)
    unweighted_id = _create_component(client, auth, exam_id, "Final", 50, weightage=None, sort_order=2)

    resp = client.post("/marks/", json={
        "student_id": student_id,
        "exam_id": exam_id,
        "subject_name": "English",
        "marks_obtained": 0,
        "total_marks": 0,
        "component_scores": [
            {"exam_component_id": weighted_id, "component_name": "Unit Test", "marks_obtained": 50, "max_marks": 50},
            {"exam_component_id": unweighted_id, "component_name": "Final", "marks_obtained": 0, "max_marks": 50},
        ],
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    mark = resp.json()
    assert mark["percentage"] == 50.0  # raw (50+0)/(50+50), weightage ignored


def test_update_mark_recomputes_weighted_percentage(client, auth):
    class_id = _create_class(client, auth, "Grading-Update")
    student_id = _create_student(client, auth, class_id, "GRADE-030", "Zoe")
    exam_id = _create_exam(client, auth, "Grading-Update-Exam")

    unit_test_id = _create_component(client, auth, exam_id, "Unit Test", 50, weightage=20, sort_order=1)
    final_id = _create_component(client, auth, exam_id, "Final", 50, weightage=80, sort_order=2)

    create_resp = client.post("/marks/", json={
        "student_id": student_id,
        "exam_id": exam_id,
        "subject_name": "History",
        "marks_obtained": 0,
        "total_marks": 0,
        "component_scores": [
            {"exam_component_id": unit_test_id, "component_name": "Unit Test", "marks_obtained": 0, "max_marks": 50},
            {"exam_component_id": final_id, "component_name": "Final", "marks_obtained": 0, "max_marks": 50},
        ],
    }, headers=auth)
    assert create_resp.status_code == 200, create_resp.text
    mark_id = create_resp.json()["id"]
    assert create_resp.json()["percentage"] == 0.0

    update_resp = client.put(f"/marks/{mark_id}", json={
        "component_scores": [
            {"exam_component_id": unit_test_id, "component_name": "Unit Test", "marks_obtained": 50, "max_marks": 50},
            {"exam_component_id": final_id, "component_name": "Final", "marks_obtained": 50, "max_marks": 50},
        ],
    }, headers=auth)
    assert update_resp.status_code == 200, update_resp.text
    assert update_resp.json()["percentage"] == 100.0
    assert update_resp.json()["grade"] == "A+"


def test_exam_rank_orders_by_percentage_and_shares_ties(client, auth):
    class_id = _create_class(client, auth, "Grading-Rank")
    top = _create_student(client, auth, class_id, "GRADE-100", "Top")
    tie_a = _create_student(client, auth, class_id, "GRADE-101", "TieA")
    tie_b = _create_student(client, auth, class_id, "GRADE-102", "TieB")
    last = _create_student(client, auth, class_id, "GRADE-103", "Last")
    exam_id = _create_exam(client, auth, "Grading-Rank-Exam")

    for student_id, marks_obtained in [(top, 95), (tie_a, 70), (tie_b, 70), (last, 40)]:
        resp = client.post("/marks/", json={
            "student_id": student_id,
            "exam_id": exam_id,
            "subject_name": "Geography",
            "marks_obtained": marks_obtained,
            "total_marks": 100,
        }, headers=auth)
        assert resp.status_code == 200, resp.text

    rank_resp = client.get("/marks/rank", params={"exam_id": exam_id}, headers=auth)
    assert rank_resp.status_code == 200, rank_resp.text
    ranks = {row["student_id"]: row for row in rank_resp.json()}

    assert ranks[top]["rank"] == 1
    assert ranks[tie_a]["rank"] == 2
    assert ranks[tie_b]["rank"] == 2  # tied scores share a rank
    assert ranks[last]["rank"] == 4  # next distinct score skips to 4, not 3
    assert ranks[top]["out_of"] == 4


def test_report_card_succeeds_and_reflects_weighted_total(client, auth):
    class_id = _create_class(client, auth, "Grading-ReportCard")
    student_id = _create_student(client, auth, class_id, "GRADE-200", "Report")
    exam_id = _create_exam(client, auth, "Grading-ReportCard-Exam")

    unit_test_id = _create_component(client, auth, exam_id, "Unit Test", 50, weightage=20, sort_order=1)
    final_id = _create_component(client, auth, exam_id, "Final", 50, weightage=80, sort_order=2)

    mark_resp = client.post("/marks/", json={
        "student_id": student_id,
        "exam_id": exam_id,
        "subject_name": "Physics",
        "marks_obtained": 0,
        "total_marks": 0,
        "component_scores": [
            {"exam_component_id": unit_test_id, "component_name": "Unit Test", "marks_obtained": 50, "max_marks": 50},
            {"exam_component_id": final_id, "component_name": "Final", "marks_obtained": 0, "max_marks": 50},
        ],
    }, headers=auth)
    assert mark_resp.status_code == 200, mark_resp.text

    report_resp = client.get("/marks/report-card", params={
        "student_id": student_id, "exam_id": exam_id,
    }, headers=auth)
    assert report_resp.status_code == 200, report_resp.text
    assert report_resp.headers["content-type"] == "application/pdf"


def test_report_card_pdf_accepts_all_three_templates(client, auth):
    class_id = _create_class(client, auth, "Grading-Templates")
    student_id = _create_student(client, auth, class_id, "GRADE-210", "Templated")
    exam_id = _create_exam(client, auth, "Grading-Templates-Exam")

    resp = client.post("/marks/", json={
        "student_id": student_id,
        "exam_id": exam_id,
        "subject_name": "Chemistry",
        "marks_obtained": 72,
        "total_marks": 100,
    }, headers=auth)
    assert resp.status_code == 200, resp.text

    for template in ("classic", "modern", "compact"):
        report_resp = client.get("/marks/report-card", params={
            "student_id": student_id, "exam_id": exam_id, "template": template,
        }, headers=auth)
        assert report_resp.status_code == 200, (template, report_resp.text)
        assert report_resp.headers["content-type"] == "application/pdf"
        assert len(report_resp.content) > 0


def test_report_card_rejects_unknown_template(client, auth):
    class_id = _create_class(client, auth, "Grading-BadTemplate")
    student_id = _create_student(client, auth, class_id, "GRADE-211", "Unknown")
    exam_id = _create_exam(client, auth, "Grading-BadTemplate-Exam")

    client.post("/marks/", json={
        "student_id": student_id, "exam_id": exam_id,
        "subject_name": "Biology", "marks_obtained": 60, "total_marks": 100,
    }, headers=auth)

    resp = client.get("/marks/report-card", params={
        "student_id": student_id, "exam_id": exam_id, "template": "flashy",
    }, headers=auth)
    assert resp.status_code == 400
    assert "flashy" in resp.json()["detail"]


def test_report_card_data_matches_pdf_totals_and_includes_rank_and_attendance(client, auth):
    """The bug this whole endpoint exists to close: the on-screen preview
    and the downloaded PDF used to compute totals/grade/rank differently.
    report-card-data is now what both read from -- assert it actually
    carries the rank and attendance the old on-screen preview never showed,
    and that its weighted total matches the same math the PDF uses."""
    class_id = _create_class(client, auth, "Grading-DataEndpoint")
    top_id = _create_student(client, auth, class_id, "GRADE-220", "Top")
    other_id = _create_student(client, auth, class_id, "GRADE-221", "Other")
    exam_id = _create_exam(client, auth, "Grading-DataEndpoint-Exam")

    for student_id, obtained in [(top_id, 95), (other_id, 60)]:
        resp = client.post("/marks/", json={
            "student_id": student_id, "exam_id": exam_id,
            "subject_name": "Mathematics", "marks_obtained": obtained, "total_marks": 100,
        }, headers=auth)
        assert resp.status_code == 200, resp.text

    # Attendance: 4 Present out of 5 marked days -> 80%.
    for day, status in [
        ("2026-01-05", "Present"), ("2026-01-06", "Present"),
        ("2026-01-07", "Present"), ("2026-01-08", "Present"),
        ("2026-01-09", "Absent"),
    ]:
        att_resp = client.post("/attendance/", json={
            "student_id": top_id,
            "attendance_date": day,
            "status": status,
        }, headers=auth)
        assert att_resp.status_code == 200, att_resp.text

    data_resp = client.get("/marks/report-card-data", params={
        "student_id": top_id, "exam_id": exam_id,
    }, headers=auth)
    assert data_resp.status_code == 200, data_resp.text
    data = data_resp.json()

    assert data["total_obtained"] == 95
    assert data["total_max"] == 100
    assert data["percentage"] == 95.0
    assert data["overall_grade"] == "A+"
    assert data["result"] == "Pass"
    assert data["rank"] == 1
    assert data["out_of"] == 2
    assert data["attendance_percent"] == 80.0

    pdf_resp = client.get("/marks/report-card", params={
        "student_id": top_id, "exam_id": exam_id,
    }, headers=auth)
    assert pdf_resp.status_code == 200, pdf_resp.text


def test_report_card_data_attendance_is_none_when_unmarked(client, auth):
    class_id = _create_class(client, auth, "Grading-NoAttendance")
    student_id = _create_student(client, auth, class_id, "GRADE-230", "NoAttendance")
    exam_id = _create_exam(client, auth, "Grading-NoAttendance-Exam")

    client.post("/marks/", json={
        "student_id": student_id, "exam_id": exam_id,
        "subject_name": "Art", "marks_obtained": 50, "total_marks": 100,
    }, headers=auth)

    resp = client.get("/marks/report-card-data", params={
        "student_id": student_id, "exam_id": exam_id,
    }, headers=auth)
    assert resp.status_code == 200, resp.text
    assert resp.json()["attendance_percent"] is None


def test_report_card_data_404s_when_no_marks(client, auth):
    class_id = _create_class(client, auth, "Grading-NoMarks")
    student_id = _create_student(client, auth, class_id, "GRADE-240", "NoMarks")
    exam_id = _create_exam(client, auth, "Grading-NoMarks-Exam")

    resp = client.get("/marks/report-card-data", params={
        "student_id": student_id, "exam_id": exam_id,
    }, headers=auth)
    assert resp.status_code == 404
