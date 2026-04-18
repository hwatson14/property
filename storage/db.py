"""Persistence and CSV helpers for T1A/T1B.

T1B free hosting uses hosted Postgres through PROPERTY_COCKPIT_DATABASE_URL.
SQLite remains only as the local/test fallback so the product can run without a
remote database during development.
"""

from __future__ import annotations

import csv
import json
import os
import sqlite3
import uuid
from datetime import datetime, timezone
from io import StringIO
from pathlib import Path
from typing import Any

from core.scoring import (
    LAND_VALUE_CONFIDENCES,
    PROPERTY_TYPES,
    REVIEW_STATUSES,
    SHORTLIST_STATUSES,
    default_settings,
)


DB_PATH = Path("data/property_cockpit.sqlite3")
DB_PATH_ENV_VAR = "PROPERTY_COCKPIT_DB_PATH"
DB_URL_ENV_VAR = "PROPERTY_COCKPIT_DATABASE_URL"

LISTING_COLUMNS = [
    "id",
    "source",
    "url",
    "address",
    "suburb",
    "postcode",
    "lat",
    "lng",
    "property_type",
    "beds",
    "baths",
    "cars",
    "land_size_m2",
    "internal_size_m2",
    "body_corporate_pa",
    "price_text_raw",
    "price_comparison_value",
    "assumed_purchase_price",
    "manual_commute_inputs_json",
    "manual_land_value_estimate",
    "manual_land_value_confidence",
    "manual_land_value_notes",
    "manual_land_value_override_score",
    "review_status",
    "shortlist_status",
    "notes",
    "created_at",
    "updated_at",
]

CSV_COLUMNS = [column for column in LISTING_COLUMNS if column not in {"created_at", "updated_at"}]

NUMERIC_COLUMNS = {
    "lat",
    "lng",
    "beds",
    "baths",
    "cars",
    "land_size_m2",
    "internal_size_m2",
    "body_corporate_pa",
    "price_comparison_value",
    "assumed_purchase_price",
    "manual_land_value_estimate",
    "manual_land_value_override_score",
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def configured_database_url() -> str | None:
    """Return the hosted Postgres URL used by free hosted deployments."""
    return os.environ.get(DB_URL_ENV_VAR)


def configured_db_path() -> Path:
    """Return the local SQLite DB path used only for local/test fallback."""
    return Path(os.environ.get(DB_PATH_ENV_VAR, DB_PATH))


def connect(db_path: str | Path | None = None):
    database_url = configured_database_url()
    if db_path is None and database_url:
        return connect_postgres(database_url)
    return connect_sqlite(db_path)


def connect_sqlite(db_path: str | Path | None = None) -> sqlite3.Connection:
    path = Path(db_path) if db_path is not None else configured_db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def connect_postgres(database_url: str):
    import psycopg
    from psycopg.rows import dict_row

    return psycopg.connect(database_url, row_factory=dict_row)


def is_postgres(conn) -> bool:
    return conn.__class__.__module__.startswith("psycopg")


def placeholder(conn) -> str:
    return "%s" if is_postgres(conn) else "?"


def row_to_dict(row: Any) -> dict[str, Any]:
    return dict(row)


def init_db(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS listings (
            id TEXT PRIMARY KEY,
            source TEXT NOT NULL,
            url TEXT NULL,
            address TEXT NOT NULL,
            suburb TEXT NOT NULL,
            postcode TEXT NULL,
            lat REAL NULL,
            lng REAL NULL,
            property_type TEXT NOT NULL,
            beds INTEGER NOT NULL,
            baths REAL NOT NULL,
            cars REAL NULL,
            land_size_m2 REAL NULL,
            internal_size_m2 REAL NULL,
            body_corporate_pa REAL NULL,
            price_text_raw TEXT NULL,
            price_comparison_value REAL NULL,
            assumed_purchase_price REAL NULL,
            manual_commute_inputs_json TEXT NULL,
            manual_land_value_estimate REAL NULL,
            manual_land_value_confidence TEXT NULL,
            manual_land_value_notes TEXT NULL,
            manual_land_value_override_score REAL NULL,
            review_status TEXT NOT NULL,
            shortlist_status TEXT NOT NULL,
            notes TEXT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value_json TEXT NOT NULL
        )
        """
    )
    conn.commit()
    ensure_default_settings(conn)


def ensure_default_settings(conn: sqlite3.Connection) -> None:
    existing = {row["key"] for row in conn.execute("SELECT key FROM settings").fetchall()}
    for key, value in default_settings().items():
        if key not in existing:
            conn.execute(
                "INSERT INTO settings (key, value_json) VALUES (?, ?)",
                (key, json.dumps(value, sort_keys=True)),
            )
    conn.commit()


def _blank_to_none(value: Any) -> Any:
    return None if value == "" else value


def _normalise_listing(data: dict[str, Any], for_insert: bool = True) -> dict[str, Any]:
    listing = {column: _blank_to_none(data.get(column)) for column in LISTING_COLUMNS}
    timestamp = now_iso()
    if for_insert and not listing["id"]:
        listing["id"] = str(uuid.uuid4())
    listing["source"] = listing["source"] or "manual"
    listing["review_status"] = listing["review_status"] or "Inbox"
    listing["shortlist_status"] = listing["shortlist_status"] or "candidate"
    listing["created_at"] = listing["created_at"] or timestamp
    listing["updated_at"] = timestamp
    for column in NUMERIC_COLUMNS:
        if listing[column] is not None:
            listing[column] = float(listing[column])
    if listing["beds"] is not None:
        listing["beds"] = int(float(listing["beds"]))
    validate_listing(listing)
    return listing


def validate_listing(listing: dict[str, Any]) -> None:
    required_text = ["id", "source", "address", "suburb", "property_type", "review_status", "shortlist_status"]
    for field in required_text:
        if listing.get(field) in (None, ""):
            raise ValueError(f"{field} is required")
    if listing["property_type"] not in PROPERTY_TYPES:
        raise ValueError(f"Invalid property_type: {listing['property_type']}")
    if listing["review_status"] not in REVIEW_STATUSES:
        raise ValueError(f"Invalid review_status: {listing['review_status']}")
    if listing["shortlist_status"] not in SHORTLIST_STATUSES:
        raise ValueError(f"Invalid shortlist_status: {listing['shortlist_status']}")
    confidence = listing.get("manual_land_value_confidence")
    if confidence not in (None, "") and confidence not in LAND_VALUE_CONFIDENCES:
        raise ValueError(f"Invalid manual_land_value_confidence: {confidence}")
    commute_json = listing.get("manual_commute_inputs_json")
    if commute_json not in (None, ""):
        parsed = json.loads(commute_json)
        if not isinstance(parsed, dict):
            raise ValueError("manual_commute_inputs_json must be a JSON object")


def list_listings(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    rows = conn.execute(f"SELECT {', '.join(LISTING_COLUMNS)} FROM listings ORDER BY created_at, address").fetchall()
    return [row_to_dict(row) for row in rows]


def get_listing(conn: sqlite3.Connection, listing_id: str) -> dict[str, Any] | None:
    mark = placeholder(conn)
    row = conn.execute(
        f"SELECT {', '.join(LISTING_COLUMNS)} FROM listings WHERE id = {mark}",
        (listing_id,),
    ).fetchone()
    return row_to_dict(row) if row else None


def upsert_listing(conn: sqlite3.Connection, data: dict[str, Any]) -> dict[str, Any]:
    existing = get_listing(conn, data["id"]) if data.get("id") else None
    listing = _normalise_listing({**(existing or {}), **data}, for_insert=existing is None)
    placeholders = ", ".join([placeholder(conn)] * len(LISTING_COLUMNS))
    update_clause = ", ".join([f"{column}=excluded.{column}" for column in LISTING_COLUMNS if column != "id"])
    conn.execute(
        f"""
        INSERT INTO listings ({', '.join(LISTING_COLUMNS)})
        VALUES ({placeholders})
        ON CONFLICT(id) DO UPDATE SET {update_clause}
        """,
        [listing[column] for column in LISTING_COLUMNS],
    )
    conn.commit()
    return listing


def delete_listing(conn: sqlite3.Connection, listing_id: str) -> None:
    conn.execute(f"DELETE FROM listings WHERE id = {placeholder(conn)}", (listing_id,))
    conn.commit()


def load_settings(conn: sqlite3.Connection) -> dict[str, Any]:
    ensure_default_settings(conn)
    rows = conn.execute("SELECT key, value_json FROM settings").fetchall()
    return {row_to_dict(row)["key"]: json.loads(row_to_dict(row)["value_json"]) for row in rows}


def save_setting(conn: sqlite3.Connection, key: str, value: Any) -> None:
    mark = placeholder(conn)
    conn.execute(
        f"""
        INSERT INTO settings (key, value_json)
        VALUES ({mark}, {mark})
        ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json
        """,
        (key, json.dumps(value, sort_keys=True)),
    )
    conn.commit()


def export_csv(conn: sqlite3.Connection) -> str:
    output = StringIO()
    writer = csv.DictWriter(output, fieldnames=CSV_COLUMNS, lineterminator="\n")
    writer.writeheader()
    for listing in list_listings(conn):
        row = {column: listing.get(column) for column in CSV_COLUMNS}
        writer.writerow({key: "" if value is None else value for key, value in row.items()})
    return output.getvalue()


def import_csv(conn: sqlite3.Connection, csv_text: str, replace: bool = False) -> list[dict[str, Any]]:
    reader = csv.DictReader(StringIO(csv_text))
    if reader.fieldnames is None:
        raise ValueError("CSV has no header")
    missing = [column for column in CSV_COLUMNS if column not in reader.fieldnames]
    if missing:
        raise ValueError(f"CSV missing required columns: {', '.join(missing)}")

    imported: list[dict[str, Any]] = []
    if replace:
        conn.execute("DELETE FROM listings")
    for raw_row in reader:
        row = {column: raw_row.get(column) for column in CSV_COLUMNS}
        imported.append(upsert_listing(conn, row))
    conn.commit()
    return imported
