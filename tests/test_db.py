import sqlite3
from pathlib import Path

import pytest

from storage import db


def memory_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    db.init_db(conn)
    return conn


def test_configured_db_path_uses_deployment_environment_variable(monkeypatch, tmp_path):
    configured_path = tmp_path / "shared" / "property.sqlite3"
    monkeypatch.setenv(db.DB_PATH_ENV_VAR, str(configured_path))

    assert db.configured_db_path() == configured_path

    conn = db.connect()
    db.init_db(conn)
    db.upsert_listing(
        conn,
        {
            "source": "manual",
            "address": "1 Shared Path St",
            "suburb": "Brisbane",
            "property_type": "house",
            "beds": 3,
            "baths": 2,
            "cars": 1,
            "review_status": "Inbox",
            "shortlist_status": "candidate",
        },
    )
    conn.close()

    next_conn = db.connect()
    db.init_db(next_conn)
    assert [row["address"] for row in db.list_listings(next_conn)] == ["1 Shared Path St"]


def test_import_export_round_trip_preserves_critical_fields():
    conn = memory_conn()
    csv_text = Path("tests/fixtures/golden_listings.csv").read_text(encoding="utf-8")
    db.import_csv(conn, csv_text)
    exported = db.export_csv(conn)

    next_conn = memory_conn()
    db.import_csv(next_conn, exported)
    row = db.get_listing(next_conn, "apt_west_end_high_bodycorp")

    assert row["price_text_raw"] == "Mid $700s"
    assert row["price_comparison_value"] == 745000
    assert row["assumed_purchase_price"] == 760000
    assert "weekday_am_peak" in row["manual_commute_inputs_json"]
    assert row["manual_land_value_confidence"] == "low"
    assert row["manual_land_value_override_score"] == 5.5
    assert row["review_status"] == "Rankable"
    assert row["shortlist_status"] == "candidate"
    assert row["notes"] == "Great location but heavy body corp"


def test_import_rejects_invalid_enumeration():
    conn = memory_conn()
    csv_text = Path("tests/fixtures/golden_listings.csv").read_text(encoding="utf-8")
    bad = csv_text.replace(",apartment,2,2,1,", ",castle,2,2,1,", 1)

    with pytest.raises(ValueError, match="Invalid property_type"):
        db.import_csv(conn, bad)


def test_import_rejects_malformed_commute_json():
    conn = memory_conn()
    csv_text = Path("tests/fixtures/golden_listings.csv").read_text(encoding="utf-8")
    bad = csv_text.replace(
        "\"{\"\"work_a\"\": {\"\"weekday_am_peak\"\": 18, \"\"weekday_pm_peak\"\": 24, \"\"saturday_midday\"\": 15}, \"\"work_b\"\": {\"\"weekday_am_peak\"\": 28, \"\"weekday_pm_peak\"\": 34, \"\"saturday_midday\"\": 24}}\"",
        "{not-json}",
        1,
    )

    with pytest.raises(ValueError):
        db.import_csv(conn, bad)
