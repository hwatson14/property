import csv
from pathlib import Path

from app import map_view_state, selected_listing_id_from_map_event, valid_lat_lng


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


def test_selected_listing_id_from_map_event_reads_property_marker_selection():
    event = {
        "selection": {
            "objects": {
                "property-markers": [
                    {
                        "id": "house_camp_hill_value",
                        "address": "5 Ridge St, Camp Hill QLD 4152",
                    }
                ]
            }
        }
    }

    assert selected_listing_id_from_map_event(event) == "house_camp_hill_value"


def test_selected_listing_id_from_map_event_ignores_empty_or_destination_selection():
    assert selected_listing_id_from_map_event(None) is None
    assert selected_listing_id_from_map_event({"selection": {"objects": {}}}) is None
    assert (
        selected_listing_id_from_map_event(
            {
                "selection": {
                    "objects": {
                        "destination-markers": [
                            {
                                "address": "Work A",
                            }
                        ]
                    }
                }
            }
        )
        is None
    )


class AttributeState:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)


def test_selected_listing_id_from_map_event_reads_attribute_style_streamlit_state():
    event = AttributeState(
        selection=AttributeState(
            objects=AttributeState(
                **{
                    "property-markers": [
                        AttributeState(id="apt_newstead_complete"),
                    ]
                }
            )
        )
    )

    assert selected_listing_id_from_map_event(event) == "apt_newstead_complete"


def test_selected_listing_id_from_map_event_falls_back_to_selected_index():
    event = {
        "selection": {
            "objects": {},
            "indices": {
                "property-markers": [1],
            },
        }
    }
    property_rows = [
        {"id": "first"},
        {"id": "second"},
    ]

    assert selected_listing_id_from_map_event(event, property_rows) == "second"
