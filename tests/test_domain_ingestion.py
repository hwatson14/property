import sqlite3

from connectors.domain import domain_listing_to_listing, normalize_domain_listings
from storage import db


def memory_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    db.init_db(conn)
    return conn


def sample_domain_listing():
    return {
        "listingId": "201",
        "url": "https://www.domain.com.au/201",
        "displayableAddress": "1 Domain St, Newstead QLD 4006",
        "suburb": "Newstead",
        "postcode": "4006",
        "latitude": -27.4508,
        "longitude": 153.0446,
        "propertyType": "Apartment",
        "bedrooms": 2,
        "bathrooms": 2,
        "carspaces": 1,
        "buildingArea": 92,
        "displayPrice": "Offers over $750k",
    }


def test_domain_mapping_preserves_existing_truth_model_without_inference():
    listing = domain_listing_to_listing(sample_domain_listing())

    assert listing["id"] == "domain:201"
    assert listing["source"] == "domain"
    assert listing["url"] == "https://www.domain.com.au/201"
    assert listing["address"] == "1 Domain St, Newstead QLD 4006"
    assert listing["suburb"] == "Newstead"
    assert listing["postcode"] == "4006"
    assert listing["lat"] == -27.4508
    assert listing["lng"] == 153.0446
    assert listing["property_type"] == "apartment"
    assert listing["beds"] == 2
    assert listing["baths"] == 2
    assert listing["cars"] == 1
    assert listing["internal_size_m2"] == 92
    assert listing["price_text_raw"] == "Offers over $750k"
    assert listing["price_comparison_value"] is None
    assert listing["assumed_purchase_price"] is None
    assert listing["manual_commute_inputs_json"] is None
    assert listing["manual_land_value_estimate"] is None
    assert listing["manual_land_value_confidence"] is None
    assert listing["manual_land_value_override_score"] is None
    assert listing["review_status"] == "Inbox"
    assert listing["shortlist_status"] == "candidate"


def test_normalize_domain_listings_maps_multiple_records():
    listings = normalize_domain_listings([sample_domain_listing(), {**sample_domain_listing(), "listingId": "202"}])

    assert [listing["id"] for listing in listings] == ["domain:201", "domain:202"]


def test_domain_ingest_dedupes_by_url_and_preserves_manual_truth_fields():
    conn = memory_conn()
    initial = domain_listing_to_listing(sample_domain_listing())
    created = db.ingest_listing(conn, initial)
    enriched = {
        **created,
        "price_comparison_value": 760000,
        "assumed_purchase_price": 775000,
        "manual_commute_inputs_json": '{"work_a": {"weekday_am_peak": 18}}',
        "manual_land_value_estimate": 320000,
        "manual_land_value_confidence": "medium",
        "manual_land_value_override_score": 5.5,
        "review_status": "Rankable",
        "shortlist_status": "priority_inspect",
        "notes": "Manual review notes",
    }
    db.upsert_listing(conn, enriched)

    updated_payload = domain_listing_to_listing(
        {
            **sample_domain_listing(),
            "listingId": "different-domain-id",
            "displayPrice": "Auction",
            "bedrooms": 3,
        }
    )
    updated = db.ingest_listing(conn, updated_payload)
    rows = db.list_listings(conn)

    assert len(rows) == 1
    assert updated["id"] == created["id"]
    assert updated["price_text_raw"] == "Auction"
    assert updated["beds"] == 3
    assert updated["price_comparison_value"] == 760000
    assert updated["assumed_purchase_price"] == 775000
    assert updated["manual_commute_inputs_json"] == '{"work_a": {"weekday_am_peak": 18}}'
    assert updated["manual_land_value_estimate"] == 320000
    assert updated["manual_land_value_confidence"] == "medium"
    assert updated["manual_land_value_override_score"] == 5.5
    assert updated["review_status"] == "Rankable"
    assert updated["shortlist_status"] == "priority_inspect"
    assert updated["notes"] == "Manual review notes"


def test_domain_ingest_dedupes_by_source_address_suburb_postcode_when_url_missing():
    conn = memory_conn()
    first = domain_listing_to_listing({**sample_domain_listing(), "url": None})
    second = domain_listing_to_listing(
        {
            **sample_domain_listing(),
            "listingId": "202",
            "url": None,
            "displayPrice": "Under offer",
        }
    )

    db.ingest_listing(conn, first)
    db.ingest_listing(conn, second)
    rows = db.list_listings(conn)

    assert len(rows) == 1
    assert rows[0]["price_text_raw"] == "Under offer"
