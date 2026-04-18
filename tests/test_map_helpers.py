import csv
from pathlib import Path

from app import map_view_state, valid_lat_lng


def test_valid_lat_lng_accepts_numeric_values_and_rejects_missing_or_invalid_values():
    assert valid_lat_lng({"lat": "-27.47", "lng": "153.03"}) is True
    assert valid_lat_lng({"lat": None, "lng": "153.03"}) is False
    assert valid_lat_lng({"lat": "-100", "lng": "153.03"}) is False
    assert valid_lat_lng({"lat": "-27.47", "lng": "200"}) is False


def test_map_view_state_centres_and_zooms_to_marker_bounds():
    view = map_view_state(
        [
            {"lat": -27.45, "lon": 153.00},
            {"lat": -27.55, "lon": 153.10},
        ]
    )

    assert round(view["latitude"], 2) == -27.50
    assert round(view["longitude"], 2) == 153.05
    assert view["zoom"] == 10


def test_map_view_state_zooms_in_for_single_marker():
    view = map_view_state([{"lat": -27.45, "lon": 153.00}])

    assert view == {"latitude": -27.45, "longitude": 153.00, "zoom": 13}


def test_golden_fixture_listings_have_valid_manual_coordinates():
    with Path("tests/fixtures/golden_listings.csv").open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))

    assert rows
    assert all(valid_lat_lng(row) for row in rows)
