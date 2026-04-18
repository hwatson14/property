import sqlite3
import json

from connectors.domain import (
    brisbane_residential_search_payload,
    domain_listing_to_listing,
    extract_domain_listing_payloads,
    fetch_domain_residential_search,
    import_domain_search,
    normalize_domain_listings,
    retrieve_domain_listings,
)
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


class FakeHttpResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


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


def test_domain_mapping_handles_official_nested_search_listing_shape():
    listing = domain_listing_to_listing(
        {
            "id": 2013958589,
            "priceDetails": {
                "displayPrice": "Contact Agent",
            },
            "propertyDetails": {
                "propertyType": "House",
                "bathrooms": 2,
                "bedrooms": 3,
                "carspaces": 1,
                "suburb": "NEWTOWN",
                "postcode": "2042",
                "displayableAddress": "177 Australia Street, Newtown",
                "latitude": -33.8938522,
                "longitude": 151.176926,
                "landArea": 120,
            },
            "listingSlug": "177-australia-street-newtown-nsw-2042-2013958589",
        }
    )

    assert listing["id"] == "domain:2013958589"
    assert listing["url"] == "https://www.domain.com.au/177-australia-street-newtown-nsw-2042-2013958589"
    assert listing["address"] == "177 Australia Street, Newtown"
    assert listing["suburb"] == "NEWTOWN"
    assert listing["postcode"] == "2042"
    assert listing["lat"] == -33.8938522
    assert listing["lng"] == 151.176926
    assert listing["property_type"] == "house"
    assert listing["beds"] == 3
    assert listing["baths"] == 2
    assert listing["cars"] == 1
    assert listing["land_size_m2"] == 120
    assert listing["price_text_raw"] == "Contact Agent"
    assert listing["price_comparison_value"] is None
    assert listing["assumed_purchase_price"] is None


def test_normalize_domain_listings_maps_multiple_records():
    listings = normalize_domain_listings([sample_domain_listing(), {**sample_domain_listing(), "listingId": "202"}])

    assert [listing["id"] for listing in listings] == ["domain:201", "domain:202"]


def test_brisbane_residential_search_payload_is_sale_only_and_location_based():
    payload = brisbane_residential_search_payload(["Newstead", "Carina"], page_size=25)

    assert payload == {
        "listingType": "Sale",
        "pageSize": 25,
        "locations": [
            {
                "state": "QLD",
                "region": "",
                "area": "",
                "suburb": "Newstead",
                "postCode": "",
                "includeSurroundingSuburbs": False,
            },
            {
                "state": "QLD",
                "region": "",
                "area": "",
                "suburb": "Carina",
                "postCode": "",
                "includeSurroundingSuburbs": False,
            },
        ],
    }


def test_extract_domain_listing_payloads_unwraps_property_listing_results():
    response = [
        {"type": "PropertyListing", "listing": sample_domain_listing()},
        {"type": "Project", "listings": [{"listing": {**sample_domain_listing(), "listingId": "202"}}]},
    ]

    payloads = extract_domain_listing_payloads(response)

    assert [payload["listingId"] for payload in payloads] == ["201", "202"]


def test_fetch_domain_residential_search_posts_json_with_api_key_and_returns_payloads():
    calls = []
    response = [{"type": "PropertyListing", "listing": sample_domain_listing()}]

    def fake_opener(req, timeout):
        calls.append((req, timeout))
        return FakeHttpResponse(response)

    payloads = fetch_domain_residential_search(
        payload={"listingType": "Sale"},
        api_key="key_abc",
        endpoint="https://example.test/search",
        opener=fake_opener,
        timeout=12,
    )

    request, timeout = calls[0]
    assert timeout == 12
    assert request.full_url == "https://example.test/search"
    assert request.get_method() == "POST"
    assert request.headers["Content-type"] == "application/json"
    assert request.headers["X-api-key"] == "key_abc"
    assert json.loads(request.data.decode("utf-8")) == {"listingType": "Sale"}
    assert payloads == [sample_domain_listing()]


def test_retrieve_domain_listings_reuses_normalization_layer():
    def fake_opener(req, timeout):
        return FakeHttpResponse([{"type": "PropertyListing", "listing": sample_domain_listing()}])

    listings = retrieve_domain_listings(
        payload={"listingType": "Sale"},
        api_key="key_abc",
        endpoint="https://example.test/search",
        opener=fake_opener,
    )

    assert listings[0]["id"] == "domain:201"
    assert listings[0]["price_text_raw"] == "Offers over $750k"
    assert listings[0]["price_comparison_value"] is None
    assert listings[0]["assumed_purchase_price"] is None
    assert listings[0]["manual_commute_inputs_json"] is None


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


def test_import_domain_search_retrieves_normalizes_and_uses_existing_dedupe():
    conn = memory_conn()

    def fake_opener(req, timeout):
        return FakeHttpResponse([{"type": "PropertyListing", "listing": sample_domain_listing()}])

    imported = import_domain_search(
        conn,
        payload={"listingType": "Sale"},
        api_key="key_abc",
        endpoint="https://example.test/search",
        opener=fake_opener,
    )
    imported_again = import_domain_search(
        conn,
        payload={"listingType": "Sale"},
        api_key="key_abc",
        endpoint="https://example.test/search",
        opener=fake_opener,
    )

    assert len(imported) == 1
    assert len(imported_again) == 1
    assert len(db.list_listings(conn)) == 1
    assert db.list_listings(conn)[0]["source"] == "domain"


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
