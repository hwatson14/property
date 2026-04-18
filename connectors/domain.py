"""Domain listing ingestion mapping for T2A.

This module normalizes caller-supplied Domain listing payloads into the
existing canonical listing model. It does not call Domain, geocode addresses,
route commutes, or infer manual truth inputs.
"""

from __future__ import annotations

import json
import os
from urllib import request
from typing import Any


DOMAIN_API_KEY_ENV_VAR = "DOMAIN_API_KEY"
DOMAIN_SEARCH_URL_ENV_VAR = "DOMAIN_RESIDENTIAL_SEARCH_URL"
DEFAULT_DOMAIN_RESIDENTIAL_SEARCH_URL = "https://api.domain.com.au/v1/listings/residential/_search"

PROPERTY_TYPE_MAP = {
    "house": "house",
    "townhouse": "townhouse",
    "apartment": "apartment",
    "unit": "unit",
    "villa": "unit",
}


def first_present(data: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = data.get(key)
        if value not in (None, ""):
            return value
    return None


def as_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    return float(value)


def as_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    return int(float(value))


def normalize_property_type(value: Any) -> str:
    key = str(value or "").strip().lower()
    if key not in PROPERTY_TYPE_MAP:
        return "house"
    return PROPERTY_TYPE_MAP[key]


def full_address(domain_listing: dict[str, Any]) -> str:
    address = first_present(domain_listing, "address", "displayableAddress", "streetAddress")
    if isinstance(address, dict):
        parts = [
            address.get("street"),
            address.get("suburb"),
            address.get("state"),
            address.get("postcode"),
        ]
        return " ".join(str(part) for part in parts if part not in (None, ""))
    return str(address or "").strip()


def property_details(domain_listing: dict[str, Any]) -> dict[str, Any]:
    details = domain_listing.get("propertyDetails")
    return details if isinstance(details, dict) else {}


def price_details(domain_listing: dict[str, Any]) -> dict[str, Any]:
    details = domain_listing.get("priceDetails")
    return details if isinstance(details, dict) else {}


def first_nested_present(domain_listing: dict[str, Any], *keys: str) -> Any:
    details = property_details(domain_listing)
    prices = price_details(domain_listing)
    return first_present(domain_listing, *keys) or first_present(details, *keys) or first_present(prices, *keys)


def domain_listing_url(domain_listing: dict[str, Any]) -> str | None:
    explicit_url = first_present(domain_listing, "url", "listingUrl", "seoUrl")
    if explicit_url:
        return explicit_url
    slug = first_present(domain_listing, "listingSlug")
    if slug:
        return f"https://www.domain.com.au/{slug}"
    listing_id = first_present(domain_listing, "id", "listingId", "domainId")
    if listing_id:
        return f"https://www.domain.com.au/{listing_id}"
    return None


def domain_listing_to_listing(domain_listing: dict[str, Any]) -> dict[str, Any]:
    """Map a Domain listing payload into canonical listing fields."""
    address = full_address(domain_listing)
    details = property_details(domain_listing)
    if not address:
        address = str(first_present(details, "displayableAddress") or "").strip()
    suburb = first_nested_present(domain_listing, "suburb", "suburbName") or ""
    postcode = first_nested_present(domain_listing, "postcode", "postCode")
    price_text_raw = first_nested_present(domain_listing, "price_text_raw", "priceDetails", "displayPrice", "price")
    if isinstance(price_text_raw, dict):
        price_text_raw = first_present(price_text_raw, "displayPrice", "price", "text")

    listing_id = first_present(domain_listing, "id", "listingId", "domainId")
    source_id = f"domain:{listing_id}" if listing_id else None

    return {
        "id": source_id,
        "source": "domain",
        "url": domain_listing_url(domain_listing),
        "address": address,
        "suburb": str(suburb).strip(),
        "postcode": str(postcode).strip() if postcode not in (None, "") else None,
        "lat": as_float(first_nested_present(domain_listing, "lat", "latitude")),
        "lng": as_float(first_nested_present(domain_listing, "lng", "longitude")),
        "property_type": normalize_property_type(first_nested_present(domain_listing, "property_type", "propertyType")),
        "beds": as_int(first_nested_present(domain_listing, "beds", "bedrooms")) or 0,
        "baths": as_float(first_nested_present(domain_listing, "baths", "bathrooms")) or 0,
        "cars": as_float(first_nested_present(domain_listing, "cars", "carspaces", "parking")),
        "land_size_m2": as_float(first_nested_present(domain_listing, "land_size_m2", "landArea", "landSize")),
        "internal_size_m2": as_float(first_nested_present(domain_listing, "internal_size_m2", "buildingArea", "buildingSize")),
        "body_corporate_pa": None,
        "price_text_raw": str(price_text_raw).strip() if price_text_raw not in (None, "") else None,
        "price_comparison_value": as_float(first_present(domain_listing, "price_comparison_value")),
        "assumed_purchase_price": as_float(first_present(domain_listing, "assumed_purchase_price")),
        "manual_commute_inputs_json": None,
        "manual_land_value_estimate": None,
        "manual_land_value_confidence": None,
        "manual_land_value_notes": None,
        "manual_land_value_override_score": None,
        "review_status": "Inbox",
        "shortlist_status": "candidate",
        "notes": None,
    }


def normalize_domain_listings(domain_listings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [domain_listing_to_listing(item) for item in domain_listings]


def domain_api_key_from_env() -> str:
    api_key = os.environ.get(DOMAIN_API_KEY_ENV_VAR)
    if not api_key:
        raise RuntimeError(f"{DOMAIN_API_KEY_ENV_VAR} is required for live Domain retrieval")
    return api_key


def domain_search_url_from_env() -> str:
    return os.environ.get(DOMAIN_SEARCH_URL_ENV_VAR, DEFAULT_DOMAIN_RESIDENTIAL_SEARCH_URL)


def brisbane_residential_search_payload(suburbs: list[str], page_size: int = 50) -> dict[str, Any]:
    return {
        "listingType": "Sale",
        "pageSize": page_size,
        "locations": [
            {
                "state": "QLD",
                "region": "",
                "area": "",
                "suburb": suburb,
                "postCode": "",
                "includeSurroundingSuburbs": False,
            }
            for suburb in suburbs
        ],
    }


def extract_domain_listing_payloads(search_response: Any) -> list[dict[str, Any]]:
    listings: list[dict[str, Any]] = []
    for item in search_response or []:
        if not isinstance(item, dict):
            continue
        item_type = item.get("type")
        if item_type == "PropertyListing" and isinstance(item.get("listing"), dict):
            listings.append(item["listing"])
        elif isinstance(item.get("listing"), dict):
            listings.append(item["listing"])
        elif item_type == "Project":
            for child in item.get("listings", []) or []:
                if isinstance(child, dict):
                    listings.append(child.get("listing", child))
        elif "propertyDetails" in item or "priceDetails" in item:
            listings.append(item)
    return listings


def fetch_domain_residential_search(
    payload: dict[str, Any],
    api_key: str | None = None,
    endpoint: str | None = None,
    opener: Any = None,
    timeout: int = 30,
) -> list[dict[str, Any]]:
    api_key = api_key or domain_api_key_from_env()
    endpoint = endpoint or domain_search_url_from_env()
    body = json.dumps(payload).encode("utf-8")
    req = request.Request(
        endpoint,
        data=body,
        headers={
            "Content-Type": "application/json",
            "X-API-Key": api_key,
        },
        method="POST",
    )
    open_fn = opener or request.urlopen
    with open_fn(req, timeout=timeout) as response:
        response_body = response.read().decode("utf-8")
    return extract_domain_listing_payloads(json.loads(response_body))


def retrieve_domain_listings(
    payload: dict[str, Any],
    api_key: str | None = None,
    endpoint: str | None = None,
    opener: Any = None,
) -> list[dict[str, Any]]:
    return normalize_domain_listings(
        fetch_domain_residential_search(
            payload=payload,
            api_key=api_key,
            endpoint=endpoint,
            opener=opener,
        )
    )


def import_domain_search(conn: Any, payload: dict[str, Any], api_key: str | None = None, endpoint: str | None = None, opener: Any = None) -> list[dict[str, Any]]:
    from storage import db

    listings = retrieve_domain_listings(payload, api_key=api_key, endpoint=endpoint, opener=opener)
    return [db.ingest_listing(conn, listing) for listing in listings]
