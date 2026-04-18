import csv
import json
from pathlib import Path

from core.scoring import default_settings, ranked_listings, score_listing
from storage import db


PRESET_NAMES = {
    "balanced": "Balanced",
    "location_first": "Location-first",
    "value_first": "Value-first",
}

NUMERIC_FIELDS = {
    "price_comparison_value",
    "assumed_purchase_price",
    "manual_land_value_estimate",
    "manual_land_value_override_score",
}


def fixture_rows():
    with Path("tests/fixtures/golden_listings.csv").open(newline="", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def expected_outputs():
    return json.loads(Path("tests/fixtures/expected_outputs.json").read_text(encoding="utf-8"))


def fixture_compatible_starter_settings():
    return default_settings()


def test_golden_fixture_starter_assertions():
    rows = {row["id"]: row for row in fixture_rows()}
    settings = fixture_compatible_starter_settings()

    for assertion in expected_outputs()["starter_assertions"]:
        score = score_listing(rows[assertion["listing_id"]], settings)
        assert score["is_rankable"] is assertion["must_be_rankable"]
        for missing in assertion.get("must_have_missing_inputs", []):
            assert missing in score["missing_inputs_list"]
        if "must_have_confidence" in assertion:
            assert score["input_confidence_flag"] == assertion["must_have_confidence"]


def test_golden_fixture_relative_order_expectations():
    rows = fixture_rows()
    settings = fixture_compatible_starter_settings()

    for preset_key, ordered_pair in expected_outputs()["relative_order_expectations"].items():
        ranked_ids = [row["id"] for row in ranked_listings(rows, settings, PRESET_NAMES[preset_key])]
        first, second = ordered_pair
        assert ranked_ids.index(first) < ranked_ids.index(second)


def test_csv_round_trip_preserves_acceptance_fields():
    import sqlite3

    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    db.init_db(conn)
    db.import_csv(conn, Path("tests/fixtures/golden_listings.csv").read_text(encoding="utf-8"))
    exported = db.export_csv(conn)

    next_conn = sqlite3.connect(":memory:")
    next_conn.row_factory = sqlite3.Row
    db.init_db(next_conn)
    db.import_csv(next_conn, exported)
    original_rows = {row["id"]: row for row in fixture_rows()}
    round_trip_rows = {row["id"]: row for row in db.list_listings(next_conn)}

    for listing_id, original in original_rows.items():
        round_trip = round_trip_rows[listing_id]
        for field in expected_outputs()["csv_round_trip_required_fields"]:
            if field in NUMERIC_FIELDS and original[field] not in (None, ""):
                assert float(round_trip[field]) == float(original[field])
            else:
                assert str(round_trip[field] or "") == str(original[field] or "")


def test_completeness_and_confidence_are_separate_outputs():
    row = next(item for item in fixture_rows() if item["id"] == "apt_newstead_complete")
    score = score_listing(row, fixture_compatible_starter_settings())

    assert "data_completeness_pct" in score
    assert "input_confidence_flag" in score
    assert isinstance(score["data_completeness_pct"], int)
    assert score["input_confidence_flag"] == "Medium"
