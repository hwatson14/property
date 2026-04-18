"""Domain listing ingestion mapping for T2A.

This module normalizes caller-supplied Domain listing payloads into the
existing canonical listing model. It does not call Domain, geocode addresses,
route commutes, or infer manual truth inputs.
"""

from __future__ import annotations

from typing import Any


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


def domain_listing_to_listing(domain_listing: dict[str, Any]) -> dict[str, Any]:
    """Map a Domain listing payload into canonical listing fields."""
    address = full_address(domain_listing)
    suburb = first_present(domain_listing, "suburb", "suburbName") or ""
    postcode = first_present(domain_listing, "postcode", "postCode")
    price_text_raw = first_present(domain_listing, "price_text_raw", "priceDetails", "displayPrice", "price")
    if isinstance(price_text_raw, dict):
        price_text_raw = first_present(price_text_raw, "displayPrice", "price", "text")

    listing_id = first_present(domain_listing, "id", "listingId", "domainId")
    source_id = f"domain:{listing_id}" if listing_id else None

    return {
        "id": source_id,
        "source": "domain",
        "url": first_present(domain_listing, "url", "listingUrl", "seoUrl"),
        "address": address,
        "suburb": str(suburb).strip(),
        "postcode": str(postcode).strip() if postcode not in (None, "") else None,
        "lat": as_float(first_present(domain_listing, "lat", "latitude")),
        "lng": as_float(first_present(domain_listing, "lng", "longitude")),
        "property_type": normalize_property_type(first_present(domain_listing, "property_type", "propertyType")),
        "beds": as_int(first_present(domain_listing, "beds", "bedrooms")) or 0,
        "baths": as_float(first_present(domain_listing, "baths", "bathrooms")) or 0,
        "cars": as_float(first_present(domain_listing, "cars", "carspaces", "parking")),
        "land_size_m2": as_float(first_present(domain_listing, "land_size_m2", "landArea", "landSize")),
        "internal_size_m2": as_float(first_present(domain_listing, "internal_size_m2", "buildingArea", "buildingSize")),
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
