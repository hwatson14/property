"""Minimal view-preparation services for T1A."""

from __future__ import annotations

from typing import Any

from core.scoring import ranked_listings, score_listings
from storage import db


def load_app_state(conn) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    return db.list_listings(conn), db.load_settings(conn)


def prepare_listings_view(
    listings: list[dict[str, Any]],
    settings: dict[str, Any],
    preset_name: str | None = None,
    weight_overrides: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    return score_listings(listings, settings, preset_name, weight_overrides)


def prepare_ranked_view(
    listings: list[dict[str, Any]],
    settings: dict[str, Any],
    preset_name: str | None = None,
    weight_overrides: dict[str, float] | None = None,
    include_non_rankable: bool = False,
) -> list[dict[str, Any]]:
    return ranked_listings(listings, settings, preset_name, weight_overrides, include_non_rankable)


def verification_buckets(scored_listings: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    buckets = {status: [] for status in ["Inbox", "Needs review", "Rankable", "Shortlist", "Reject"]}
    for listing in scored_listings:
        status = listing.get("review_status", "Inbox")
        buckets.setdefault(status, []).append(listing)
    return buckets


def low_confidence_land_value(scored_listings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        listing
        for listing in scored_listings
        if listing.get("manual_land_value_confidence") == "low"
        or listing.get("manual_land_value_override_score") not in (None, "")
    ]


def price_ambiguity_issues(scored_listings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        listing
        for listing in scored_listings
        if listing.get("price_text_raw")
        and (listing.get("price_comparison_value") in (None, "") or listing.get("assumed_purchase_price") in (None, ""))
    ]


def incomplete_commute_coverage(scored_listings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        listing
        for listing in scored_listings
        if any("." in missing for missing in listing.get("missing_inputs_list", []))
    ]
