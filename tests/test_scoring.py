import csv
from pathlib import Path

from core.scoring import default_settings, ranked_listings, score_listing


def fixture_rows():
    with Path("tests/fixtures/golden_listings.csv").open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def test_incomplete_listing_is_not_rankable_and_reports_missing_inputs():
    listing = next(row for row in fixture_rows() if row["id"] == "house_morningside_incomplete")
    score = score_listing(listing, default_settings())

    assert score["is_rankable"] is False
    assert "price_comparison_value" in score["missing_inputs_list"]
    assert "assumed_purchase_price" in score["missing_inputs_list"]
    assert "manual_land_value_estimate_or_override" in score["missing_inputs_list"]
    assert "work_a.weekday_pm_peak" in score["missing_inputs_list"]
    assert "work_a.saturday_midday" in score["missing_inputs_list"]


def test_raw_price_text_is_not_used_for_price_or_finance_scores():
    base = next(row for row in fixture_rows() if row["id"] == "apt_newstead_complete")
    changed = {**base, "price_text_raw": "Auction with no guide"}

    base_score = score_listing(base, default_settings())
    changed_score = score_listing(changed, default_settings())

    assert changed_score["price_score"] == base_score["price_score"]
    assert changed_score["finance_score"] == base_score["finance_score"]


def test_default_compare_ranking_excludes_non_rankable_properties():
    ranked = ranked_listings(fixture_rows(), default_settings(), "Balanced")
    ranked_ids = [row["id"] for row in ranked]

    assert "house_morningside_incomplete" not in ranked_ids
    assert all(row["is_rankable"] for row in ranked)


def test_presets_change_ranking_order():
    rows = fixture_rows()
    balanced = [row["id"] for row in ranked_listings(rows, default_settings(), "Balanced")]
    value_first = [row["id"] for row in ranked_listings(rows, default_settings(), "Value-first")]

    assert balanced.index("townhouse_carina_complete") < balanced.index("house_camp_hill_value")
    assert value_first.index("house_camp_hill_value") < value_first.index("townhouse_carina_complete")


def test_starter_defaults_can_be_overridden_without_changing_formula():
    listing = next(row for row in fixture_rows() if row["id"] == "house_camp_hill_value")
    settings = default_settings()
    starter_score = score_listing(listing, settings)["total_score"]

    settings["finance_defaults"]["available_cash"] = 210000
    settings["filter_defaults"]["budget_floor"] = 700000
    overridden_score = score_listing(listing, settings)["total_score"]

    assert overridden_score != starter_score
