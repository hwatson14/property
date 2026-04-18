import csv
from pathlib import Path

from core import services
from core.scoring import default_settings


def fixture_rows():
    with Path("tests/fixtures/golden_listings.csv").open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def test_verification_helpers_surface_weak_inputs():
    scored = services.prepare_listings_view(fixture_rows(), default_settings(), "Balanced")

    missing_ids = {row["id"] for row in services.incomplete_commute_coverage(scored)}
    low_confidence_ids = {row["id"] for row in services.low_confidence_land_value(scored)}
    price_ambiguity_ids = {row["id"] for row in services.price_ambiguity_issues(scored)}

    assert "house_morningside_incomplete" in missing_ids
    assert "apt_west_end_high_bodycorp" in low_confidence_ids
    assert "house_morningside_incomplete" in price_ambiguity_ids


def test_ranked_view_defaults_to_rankable_workflow_states():
    scored = services.prepare_ranked_view(fixture_rows(), default_settings(), "Balanced")

    assert {row["review_status"] for row in scored} <= {"Rankable", "Shortlist"}
    assert all(row["is_rankable"] for row in scored)
