import sqlite3
from pathlib import Path

import pytest

from storage import db


class FakePostgresConnection:
    __module__ = "psycopg.connection"

    def __init__(self):
        self.statements = []
        self.params = []
        self.settings_rows = []
        self.listing_rows = {}
        self.commits = 0

    def execute(self, sql, params=None):
        self.statements.append(sql)
        self.params.append(params)
        normalised = " ".join(sql.split())
        if normalised.startswith("SELECT key FROM settings"):
            return FakeCursor(self.settings_rows)
        if normalised.startswith("SELECT id, source"):
            if "WHERE id =" in normalised:
                row = self.listing_rows.get(params[0]) if params else None
                return FakeCursor([row] if row else [])
            return FakeCursor(list(self.listing_rows.values()))
        if normalised.startswith("INSERT INTO settings"):
            self.settings_rows.append({"key": params[0], "value_json": params[1]})
        if normalised.startswith("INSERT INTO listings"):
            self.listing_rows[params[0]] = dict(zip(db.LISTING_COLUMNS, params))
        if normalised.startswith("DELETE FROM listings WHERE id ="):
            self.listing_rows.pop(params[0], None)
        if normalised.startswith("DELETE FROM listings") and "WHERE" not in normalised:
            self.listing_rows = {}
        return FakeCursor([])

    def commit(self):
        self.commits += 1


class FakeCursor:
    def __init__(self, rows):
        self.rows = rows

    def fetchall(self):
        return self.rows

    def fetchone(self):
        return self.rows[0] if self.rows else None


def memory_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    db.init_db(conn)
    return conn


def test_configured_db_path_uses_local_fallback_environment_variable(monkeypatch, tmp_path):
    monkeypatch.delenv(db.DB_URL_ENV_VAR, raising=False)
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


def test_connect_uses_hosted_database_url_when_configured(monkeypatch):
    calls = []

    def fake_connect_postgres(database_url):
        calls.append(database_url)
        return "postgres-connection"

    monkeypatch.setenv(db.DB_URL_ENV_VAR, "postgresql://example")
    monkeypatch.setattr(db, "connect_postgres", fake_connect_postgres)

    assert db.connect() == "postgres-connection"
    assert calls == ["postgresql://example"]


def test_postgres_path_uses_psycopg_placeholders_for_settings_and_listings():
    conn = FakePostgresConnection()

    db.init_db(conn)
    db.save_setting(conn, "last_selected_preset", "Balanced")
    db.upsert_listing(
        conn,
        {
            "id": "fake-postgres-listing",
            "source": "manual",
            "address": "1 Placeholder St",
            "suburb": "Brisbane",
            "property_type": "house",
            "beds": 3,
            "baths": 2,
            "cars": 1,
            "review_status": "Inbox",
            "shortlist_status": "candidate",
        },
    )
    db.get_listing(conn, "fake-postgres-listing")
    db.delete_listing(conn, "fake-postgres-listing")

    parameterised_statements = [
        statement
        for statement, params in zip(conn.statements, conn.params)
        if params is not None
    ]

    assert parameterised_statements
    assert all("?" not in statement for statement in parameterised_statements)
    assert any("VALUES (%s, %s)" in statement for statement in parameterised_statements)
    assert any("WHERE id = %s" in statement for statement in parameterised_statements)
    assert any("ON CONFLICT(id)" in statement for statement in parameterised_statements)


def test_import_export_round_trip_preserves_critical_fields():
    conn = memory_conn()
    csv_text = Path("tests/fixtures/golden_listings.csv").read_text(encoding="utf-8")
    db.import_csv(conn, csv_text)
    exported = db.export_csv(conn)

    next_conn = memory_conn()
    db.import_csv(next_conn, exported)
    row = db.get_listing(next_conn, "apt_west_end_high_bodycorp")

    assert row["price_text_raw"] == "Mid $700s"
    assert row["lat"] == -27.4790
    assert row["lng"] == 153.0097
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
