"""Deterministic T1A scoring, rankability, completeness, and presets."""

from __future__ import annotations

import json
from copy import deepcopy
from typing import Any

from core.finance import calculate_finance, clamp_score


REVIEW_STATUSES = ["Inbox", "Needs review", "Rankable", "Shortlist", "Reject"]
SHORTLIST_STATUSES = ["candidate", "shortlist", "reject", "priority_inspect"]
PROPERTY_TYPES = ["house", "townhouse", "apartment", "unit"]
LAND_VALUE_CONFIDENCES = ["high", "medium", "low"]
SCENARIOS = ["weekday_am_peak", "weekday_pm_peak", "saturday_midday"]

COMPONENTS = [
    "location",
    "land_value",
    "property_fit",
    "price",
    "finance",
    "cost_drag",
]


# T1A starter defaults are fixture-compatible decision settings, not hidden
# constants. They seed the persisted settings table and can be overridden from
# the app/sidebar without changing the formulas or golden fixture data.
DEFAULT_SETTINGS: dict[str, Any] = {
    "score_presets": {
        "Balanced": {
            "location": 0.25,
            "land_value": 0.20,
            "property_fit": 0.20,
            "price": 0.15,
            "finance": 0.10,
            "cost_drag": 0.10,
        },
        "Location-first": {
            "location": 0.35,
            "land_value": 0.15,
            "property_fit": 0.20,
            "price": 0.10,
            "finance": 0.10,
            "cost_drag": 0.10,
        },
        "Value-first": {
            "location": 0.15,
            "land_value": 0.30,
            "property_fit": 0.15,
            "price": 0.20,
            "finance": 0.10,
            "cost_drag": 0.10,
        },
    },
    "last_selected_preset": "Balanced",
    "finance_defaults": {
        "available_cash": 270000,
        "deposit_percent": 0.20,
        "fees_estimate": 28000,
        "desired_buffer": 50000,
        "minimum_buffer": 0,
    },
    "property_fit_targets": {
        "preferred_property_types": ["house", "townhouse"],
        "acceptable_property_types": ["house", "townhouse", "apartment", "unit"],
        "min_beds": 3,
        "min_baths": 2,
        "min_cars": 1,
        "target_land_size_m2": 400,
        "target_internal_size_m2": 140,
        "preferred_body_corp": 3000,
        "hard_max_body_corp": 10000,
    },
    "destination_definitions": {
        "work_a": {
            "label": "Work A",
            "lat": -27.4698,
            "lng": 153.0251,
            "weight": 0.55,
            "target_minutes": 20,
            "max_acceptable_minutes": 45,
        },
        "work_b": {
            "label": "Work B",
            "lat": -27.4766,
            "lng": 153.0166,
            "weight": 0.45,
            "target_minutes": 25,
            "max_acceptable_minutes": 50,
        },
    },
    "scenario_weights": {
        "weekday_am_peak": 0.45,
        "weekday_pm_peak": 0.40,
        "saturday_midday": 0.15,
    },
    "filter_defaults": {
        "budget_cap": 950000,
        "budget_floor": 530000,
        "excellent_land_value_ratio": 0.62,
        "good_land_value_ratio": 0.50,
        "poor_land_value_ratio": 0.35,
    },
}


def default_settings() -> dict[str, Any]:
    return deepcopy(DEFAULT_SETTINGS)


def normalise_settings(settings: dict[str, Any] | None) -> dict[str, Any]:
    merged = default_settings()
    if not settings:
        return merged
    for key, value in settings.items():
        if isinstance(value, dict) and isinstance(merged.get(key), dict):
            merged[key].update(value)
        else:
            merged[key] = value
    return merged


def get_weights(settings: dict[str, Any], preset_name: str | None = None, overrides: dict[str, float] | None = None) -> dict[str, float]:
    settings = normalise_settings(settings)
    preset = preset_name or settings.get("last_selected_preset") or "Balanced"
    weights = dict(settings["score_presets"].get(preset, settings["score_presets"]["Balanced"]))
    if overrides:
        weights.update({k: float(v) for k, v in overrides.items() if k in COMPONENTS})
    total = sum(weights.values())
    if total <= 0:
        raise ValueError("Score weights must sum to a positive value")
    return {key: value / total for key, value in weights.items()}


def parse_commutes(value: Any) -> dict[str, dict[str, float]]:
    if value in (None, ""):
        return {}
    if isinstance(value, dict):
        return value
    parsed = json.loads(value)
    if not isinstance(parsed, dict):
        raise ValueError("manual_commute_inputs_json must be a JSON object")
    return parsed


def _present(value: Any) -> bool:
    return value is not None and value != ""


def _num(value: Any, default: float | None = None) -> float | None:
    if value is None or value == "":
        return default
    return float(value)


def _score_lower_is_better(value: float | None, target: float, maximum: float) -> float:
    if value is None:
        return 0.0
    if value <= target:
        return 10.0
    if value >= maximum:
        return 0.0
    return clamp_score(10.0 * (maximum - value) / (maximum - target))


def _score_higher_is_better(value: float | None, target: float) -> float:
    if value is None:
        return 0.0
    if target <= 0:
        return 10.0
    return clamp_score(10.0 * value / target)


def required_input_keys(listing: dict[str, Any], settings: dict[str, Any]) -> list[str]:
    settings = normalise_settings(settings)
    required = [
        "address",
        "property_type",
        "price_comparison_value",
        "assumed_purchase_price",
        "beds",
        "baths",
        "cars",
        "size_relevant",
        "manual_land_value_estimate_or_override",
    ]
    for dest in settings["destination_definitions"]:
        for scenario in SCENARIOS:
            required.append(f"{dest}.{scenario}")

    property_type = (listing.get("property_type") or "").lower()
    if property_type == "house":
        required.append("land_size_m2")
    elif property_type in {"apartment", "unit"}:
        required.extend(["internal_size_m2", "body_corporate_pa"])
    elif property_type == "townhouse":
        required.extend(["townhouse_size", "body_corporate_pa"])
    return required


def missing_inputs(listing: dict[str, Any], settings: dict[str, Any]) -> list[str]:
    settings = normalise_settings(settings)
    missing: list[str] = []
    for field in ["address", "property_type", "price_comparison_value", "assumed_purchase_price", "beds", "baths"]:
        if not _present(listing.get(field)):
            missing.append(field)
    if "cars" not in listing:
        missing.append("cars")

    land = _num(listing.get("land_size_m2"))
    internal = _num(listing.get("internal_size_m2"))
    body_corp = _num(listing.get("body_corporate_pa"))
    property_type = (listing.get("property_type") or "").lower()
    if property_type == "house" and land is None:
        missing.append("land_size_m2")
    elif property_type in {"apartment", "unit"}:
        if internal is None:
            missing.append("internal_size_m2")
        if body_corp is None:
            missing.append("body_corporate_pa")
    elif property_type == "townhouse":
        if land is None and internal is None:
            missing.append("townhouse_size")
        if body_corp is None:
            missing.append("body_corporate_pa")
    elif property_type not in PROPERTY_TYPES:
        missing.append("valid_property_type")

    if not _present(listing.get("manual_land_value_estimate")) and not _present(listing.get("manual_land_value_override_score")):
        missing.append("manual_land_value_estimate_or_override")

    commutes = parse_commutes(listing.get("manual_commute_inputs_json"))
    for dest in settings["destination_definitions"]:
        for scenario in SCENARIOS:
            if not _present(commutes.get(dest, {}).get(scenario)):
                missing.append(f"{dest}.{scenario}")
    return missing


def completeness_pct(listing: dict[str, Any], settings: dict[str, Any]) -> int:
    required = required_input_keys(listing, settings)
    missing = set(missing_inputs(listing, settings))
    present_count = sum(1 for key in required if key not in missing)
    return round(100 * present_count / len(required)) if required else 100


def confidence_flag(listing: dict[str, Any], settings: dict[str, Any]) -> str:
    missing = missing_inputs(listing, settings)
    confidence = (listing.get("manual_land_value_confidence") or "").lower()
    override_used = _present(listing.get("manual_land_value_override_score"))
    if override_used or confidence == "low" or any("." in item for item in missing):
        return "Low"
    if confidence == "high":
        return "High"
    if confidence == "medium":
        return "Medium"
    return "Low"


def is_rankable(listing: dict[str, Any], settings: dict[str, Any]) -> bool:
    if listing.get("review_status") == "Reject" or listing.get("shortlist_status") == "reject":
        return False
    return not missing_inputs(listing, settings)


def location_score(listing: dict[str, Any], settings: dict[str, Any]) -> float:
    settings = normalise_settings(settings)
    commutes = parse_commutes(listing.get("manual_commute_inputs_json"))
    total = 0.0
    weight_total = 0.0
    for dest, definition in settings["destination_definitions"].items():
        dest_weight = float(definition.get("weight", 1.0))
        target = float(definition.get("target_minutes", 20))
        maximum = float(definition.get("max_acceptable_minutes", 45))
        for scenario, scenario_weight in settings["scenario_weights"].items():
            value = _num(commutes.get(dest, {}).get(scenario))
            subscore = _score_lower_is_better(value, target, maximum)
            weight = dest_weight * float(scenario_weight)
            total += subscore * weight
            weight_total += weight
    return round(total / weight_total, 2) if weight_total else 0.0


def land_value_score(listing: dict[str, Any], settings: dict[str, Any]) -> float:
    settings = normalise_settings(settings)
    override = _num(listing.get("manual_land_value_override_score"))
    if override is not None:
        return round(clamp_score(override), 2)

    estimate = _num(listing.get("manual_land_value_estimate"))
    price = _num(listing.get("assumed_purchase_price"))
    if estimate is None or price in (None, 0):
        return 0.0

    filters = settings["filter_defaults"]
    excellent = float(filters["excellent_land_value_ratio"])
    poor = float(filters["poor_land_value_ratio"])
    ratio = estimate / price
    if ratio >= excellent:
        score = 10.0
    elif ratio <= poor:
        score = 0.0
    else:
        score = 10.0 * (ratio - poor) / (excellent - poor)

    confidence = (listing.get("manual_land_value_confidence") or "").lower()
    if confidence == "medium":
        score -= 0.5
    elif confidence == "low":
        score -= 1.0
    return round(clamp_score(score), 2)


def property_fit_score(listing: dict[str, Any], settings: dict[str, Any]) -> float:
    settings = normalise_settings(settings)
    targets = settings["property_fit_targets"]
    property_type = (listing.get("property_type") or "").lower()
    preferred = set(targets["preferred_property_types"])
    acceptable = set(targets["acceptable_property_types"])
    if property_type in preferred:
        type_score = 10.0
    elif property_type in acceptable:
        type_score = 6.0
    else:
        type_score = 0.0

    beds = _score_higher_is_better(_num(listing.get("beds")), float(targets["min_beds"]))
    baths = _score_higher_is_better(_num(listing.get("baths")), float(targets["min_baths"]))
    cars = _score_higher_is_better(_num(listing.get("cars"), 0.0), float(targets["min_cars"]))

    if property_type == "house":
        size = _score_higher_is_better(_num(listing.get("land_size_m2")), float(targets["target_land_size_m2"]))
    elif property_type in {"apartment", "unit"}:
        size = _score_higher_is_better(_num(listing.get("internal_size_m2")), float(targets["target_internal_size_m2"]))
    else:
        size_basis = _num(listing.get("internal_size_m2")) or _num(listing.get("land_size_m2"))
        target_basis = min(float(targets["target_internal_size_m2"]), float(targets["target_land_size_m2"]))
        size = _score_higher_is_better(size_basis, target_basis)

    body = _num(listing.get("body_corporate_pa"))
    if body is None and property_type == "house":
        body_corp_fit = 10.0
    elif body is None:
        body_corp_fit = 3.0
    else:
        body_corp_fit = _score_lower_is_better(
            body,
            float(targets["preferred_body_corp"]),
            float(targets["hard_max_body_corp"]),
        )

    score = (
        type_score * 0.15
        + beds * 0.20
        + baths * 0.10
        + cars * 0.10
        + size * 0.25
        + body_corp_fit * 0.20
    )
    return round(clamp_score(score), 2)


def price_score(listing: dict[str, Any], settings: dict[str, Any]) -> float:
    settings = normalise_settings(settings)
    price = _num(listing.get("price_comparison_value"))
    if price is None:
        return 0.0
    budget_cap = float(settings["filter_defaults"]["budget_cap"])
    budget_floor = float(settings["filter_defaults"]["budget_floor"])
    if price <= budget_floor:
        return 10.0
    if price >= budget_cap:
        return 0.0
    return round(clamp_score(10.0 * (budget_cap - price) / (budget_cap - budget_floor)), 2)


def cost_drag_score(listing: dict[str, Any], settings: dict[str, Any]) -> float:
    settings = normalise_settings(settings)
    property_type = (listing.get("property_type") or "").lower()
    body = _num(listing.get("body_corporate_pa"))
    targets = settings["property_fit_targets"]
    if body is None and property_type == "house":
        return 10.0
    if body is None:
        return 3.0
    return round(
        _score_lower_is_better(
            body,
            float(targets["preferred_body_corp"]),
            float(targets["hard_max_body_corp"]),
        ),
        2,
    )


def score_listing(
    listing: dict[str, Any],
    settings: dict[str, Any] | None = None,
    preset_name: str | None = None,
    weight_overrides: dict[str, float] | None = None,
) -> dict[str, Any]:
    settings = normalise_settings(settings)
    weights = get_weights(settings, preset_name, weight_overrides)
    finance = calculate_finance(listing.get("assumed_purchase_price"), settings["finance_defaults"])
    components = {
        "location_score": location_score(listing, settings),
        "land_value_score": land_value_score(listing, settings),
        "property_fit_score": property_fit_score(listing, settings),
        "price_score": price_score(listing, settings),
        "finance_score": finance.finance_score,
        "cost_drag_score": cost_drag_score(listing, settings),
    }
    total = (
        components["location_score"] * weights["location"]
        + components["land_value_score"] * weights["land_value"]
        + components["property_fit_score"] * weights["property_fit"]
        + components["price_score"] * weights["price"]
        + components["finance_score"] * weights["finance"]
        + components["cost_drag_score"] * weights["cost_drag"]
    )
    missing = missing_inputs(listing, settings)
    return {
        **components,
        "total_score": round(total, 2),
        "is_rankable": not missing and listing.get("review_status") != "Reject" and listing.get("shortlist_status") != "reject",
        "data_completeness_pct": completeness_pct(listing, settings),
        "input_confidence_flag": confidence_flag(listing, settings),
        "missing_inputs_list": missing,
        "finance_outputs": finance,
    }


def score_listings(
    listings: list[dict[str, Any]],
    settings: dict[str, Any] | None = None,
    preset_name: str | None = None,
    weight_overrides: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    return [
        {**listing, **score_listing(listing, settings, preset_name, weight_overrides)}
        for listing in listings
    ]


def ranked_listings(
    listings: list[dict[str, Any]],
    settings: dict[str, Any] | None = None,
    preset_name: str | None = None,
    weight_overrides: dict[str, float] | None = None,
    include_non_rankable: bool = False,
) -> list[dict[str, Any]]:
    scored = score_listings(listings, settings, preset_name, weight_overrides)
    if not include_non_rankable:
        scored = [
            item
            for item in scored
            if item["is_rankable"] and item.get("review_status") in {"Rankable", "Shortlist"}
        ]
    return sorted(scored, key=lambda item: (item["total_score"], item.get("address", "")), reverse=True)
