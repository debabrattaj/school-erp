import pytest
from app.pdf import report_card_pdf
from app.report_card_colors import score_band, mark_palette, contrasting_text
from app.report_card_designs import DESIGN_THEMES


@pytest.mark.parametrize("score,band", [(95,"top"),(90,"top"),(89.99,"passed"),(75,"passed"),(74.99,"average"),(40,"average"),(39.99,"failed")])
def test_score_band_boundaries(score, band):
    assert score_band({"obtained":score,"max":100}) == band


def test_rules_use_weighted_scores_and_respect_exemptions_and_pass_threshold():
    assert score_band({"obtained":95,"max":100,"percentage":35}) == "failed"
    assert score_band({"obtained":95,"max":100,"grade":"F"}) == "failed"
    assert score_band({"obtained":95,"max":100},96) == "failed"
    for status in ("Absent","Exempt","Not assessed"):
        assert score_band({"obtained":0,"max":100,"assessment_status":status}) is None
    assert score_band({"obtained":0,"max":0}) is None


def test_custom_colours_are_validated_and_contrast_is_accessible():
    assert mark_palette({"top":"#112233","failed":"not-a-colour"})["top"] == "#112233"
    assert mark_palette({"failed":"not-a-colour"})["failed"] == "#dc2626"
    assert contrasting_text("#ffffff") == "#000000"
    assert contrasting_text("#000000") == "#ffffff"


@pytest.mark.parametrize("template", list(DESIGN_THEMES))
def test_new_designs_support_long_paginated_reports(template):
    rows=[{"subject":f"Subject {i} - Environmental Science and Sustainable Development", "obtained":80,"max":100,"grade":"A","remarks":"Progressing steadily. "*5} for i in range(45)]
    pdf=report_card_pdf({"school_name":"A long institution name with Science & Arts <Campus>","student_name":"Sample Student", "rows":rows,
                         "total_obtained":3600,"total_max":4500,"percentage":80,"mark_colors":{"passed":"#ffff00"}},template)
    assert pdf.startswith(b"%PDF")
    assert len(pdf)>5000
