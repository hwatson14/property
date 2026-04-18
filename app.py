"""Single-page Streamlit UI for the T1A property cockpit."""

from __future__ import annotations

import json
from typing import Any

import pandas as pd
import streamlit as st

from core import services
from core.scoring import (
    COMPONENTS,
    LAND_VALUE_CONFIDENCES,
    PROPERTY_TYPES,
    REVIEW_STATUSES,
    SHORTLIST_STATUSES,
    SCENARIOS,
    get_weights,
)
from storage import db


st.set_page_config(page_title="Brisbane Property Decision Cockpit", layout="wide")


def get_conn():
    if "db_conn" in st.session_state:
        return st.session_state["db_conn"]
    conn = db.connect()
    db.init_db(conn)
    st.session_state["db_conn"] = conn
    return conn


@st.cache_data(show_spinner=False, ttl=30)
def cached_load_app_state(_conn, data_version: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    return services.load_app_state(_conn)


@st.cache_data(show_spinner=False)
def cached_prepare_listings_view(
    listings: list[dict[str, Any]],
    settings: dict[str, Any],
    preset_name: str | None,
    weight_overrides: dict[str, float],
) -> list[dict[str, Any]]:
    return services.prepare_listings_view(listings, settings, preset_name, weight_overrides)


@st.cache_data(show_spinner=False)
def cached_prepare_ranked_view(
    listings: list[dict[str, Any]],
    settings: dict[str, Any],
    preset_name: str | None,
    weight_overrides: dict[str, float],
) -> list[dict[str, Any]]:
    return services.prepare_ranked_view(listings, settings, preset_name, weight_overrides)


def clear_view_caches() -> None:
    cached_load_app_state.clear()
    cached_prepare_listings_view.clear()
    cached_prepare_ranked_view.clear()


def persisted_state_changed() -> None:
    st.session_state["data_version"] = st.session_state.get("data_version", 0) + 1
    clear_view_caches()


def optional_float(value: str | float | int | None) -> float | None:
    if value in (None, ""):
        return None
    return float(value)


def money(value: Any) -> str:
    if value in (None, ""):
        return "-"
    return f"${float(value):,.0f}"


def selected_listing(scored: list[dict[str, Any]]) -> dict[str, Any] | None:
    selected_id = st.session_state.get("selected_listing_id")
    return next((listing for listing in scored if listing["id"] == selected_id), scored[0] if scored else None)


def save_listing(conn, data: dict[str, Any]) -> None:
    db.upsert_listing(conn, data)
    st.session_state["selected_listing_id"] = data.get("id") or st.session_state.get("selected_listing_id")
    persisted_state_changed()
    st.rerun()


def render_quick_add(conn) -> None:
    with st.sidebar.expander("Quick Add Property"):
        with st.form("quick_add_property", clear_on_submit=True):
            address = st.text_input("Address")
            suburb = st.text_input("Suburb")
            property_type = st.selectbox("Property type", PROPERTY_TYPES)
            price_text_raw = st.text_input("Raw listing price text")
            price_comparison_value = st.text_input("Comparison price")
            assumed_purchase_price = st.text_input("Assumed purchase price")
            beds = st.number_input("Beds", min_value=0, step=1, value=3)
            baths = st.number_input("Baths", min_value=0.0, step=0.5, value=2.0)
            cars_text = st.text_input("Cars", value="1")
            submitted = st.form_submit_button("Add property")
        if submitted:
            save_listing(
                conn,
                {
                    "source": "manual",
                    "address": address,
                    "suburb": suburb,
                    "property_type": property_type,
                    "price_text_raw": price_text_raw,
                    "price_comparison_value": optional_float(price_comparison_value),
                    "assumed_purchase_price": optional_float(assumed_purchase_price),
                    "beds": beds,
                    "baths": baths,
                    "cars": optional_float(cars_text),
                    "review_status": "Inbox",
                    "shortlist_status": "candidate",
                },
            )


def render_sidebar(conn, settings: dict[str, Any]) -> tuple[str, dict[str, float]]:
    st.sidebar.header("Decision settings")
    presets = list(settings["score_presets"].keys())
    default_preset = settings.get("last_selected_preset", "Balanced")
    preset_name = st.sidebar.selectbox(
        "Preset",
        presets,
        index=presets.index(default_preset) if default_preset in presets else 0,
    )
    if st.sidebar.button("Remember selected preset"):
        db.save_setting(conn, "last_selected_preset", preset_name)
        persisted_state_changed()
        st.rerun()

    base_weights = get_weights(settings, preset_name)
    weight_overrides: dict[str, float] = {}
    with st.sidebar.expander("Temporary score weights", expanded=True):
        for component in COMPONENTS:
            weight_overrides[component] = st.slider(
                component.replace("_", " ").title(),
                min_value=0.0,
                max_value=1.0,
                value=float(base_weights[component]),
                step=0.01,
            )
        st.caption("Temporary changes affect this session only unless you update a shared preset outside T1A.")

    with st.sidebar.expander("Finance defaults"):
        finance_defaults = dict(settings["finance_defaults"])
        with st.form("finance_defaults"):
            finance_defaults["available_cash"] = st.number_input(
                "Available cash", min_value=0, step=5000, value=int(finance_defaults["available_cash"])
            )
            finance_defaults["deposit_percent"] = st.number_input(
                "Deposit percent", min_value=0.0, max_value=1.0, step=0.01, value=float(finance_defaults["deposit_percent"])
            )
            finance_defaults["fees_estimate"] = st.number_input(
                "Fees estimate", min_value=0, step=1000, value=int(finance_defaults["fees_estimate"])
            )
            finance_defaults["desired_buffer"] = st.number_input(
                "Desired buffer", min_value=0, step=1000, value=int(finance_defaults["desired_buffer"])
            )
            finance_defaults["minimum_buffer"] = st.number_input(
                "Minimum buffer", min_value=0, step=1000, value=int(finance_defaults["minimum_buffer"])
            )
            if st.form_submit_button("Save finance defaults"):
                db.save_setting(conn, "finance_defaults", finance_defaults)
                persisted_state_changed()
                st.rerun()

    with st.sidebar.expander("Property-fit targets"):
        targets = dict(settings["property_fit_targets"])
        with st.form("property_fit_targets"):
            targets["preferred_property_types"] = st.multiselect(
                "Preferred property types",
                PROPERTY_TYPES,
                default=targets["preferred_property_types"],
            )
            targets["min_beds"] = st.number_input("Minimum beds", min_value=0, step=1, value=int(targets["min_beds"]))
            targets["min_baths"] = st.number_input("Minimum baths", min_value=0.0, step=0.5, value=float(targets["min_baths"]))
            targets["min_cars"] = st.number_input("Minimum cars", min_value=0, step=1, value=int(targets["min_cars"]))
            targets["target_land_size_m2"] = st.number_input("Target land size", min_value=0, step=10, value=int(targets["target_land_size_m2"]))
            targets["target_internal_size_m2"] = st.number_input("Target internal size", min_value=0, step=10, value=int(targets["target_internal_size_m2"]))
            targets["preferred_body_corp"] = st.number_input("Preferred body corp", min_value=0, step=500, value=int(targets["preferred_body_corp"]))
            targets["hard_max_body_corp"] = st.number_input("Hard max body corp", min_value=0, step=500, value=int(targets["hard_max_body_corp"]))
            if st.form_submit_button("Save property targets"):
                db.save_setting(conn, "property_fit_targets", targets)
                persisted_state_changed()
                st.rerun()

    with st.sidebar.expander("Filter and value defaults"):
        filter_defaults = dict(settings["filter_defaults"])
        with st.form("filter_defaults"):
            filter_defaults["budget_cap"] = st.number_input(
                "Budget cap",
                min_value=0,
                step=10000,
                value=int(filter_defaults["budget_cap"]),
            )
            filter_defaults["budget_floor"] = st.number_input(
                "Budget floor",
                min_value=0,
                step=10000,
                value=int(filter_defaults["budget_floor"]),
            )
            filter_defaults["excellent_land_value_ratio"] = st.number_input(
                "Excellent land-value ratio",
                min_value=0.0,
                max_value=1.0,
                step=0.01,
                value=float(filter_defaults["excellent_land_value_ratio"]),
            )
            filter_defaults["good_land_value_ratio"] = st.number_input(
                "Good land-value ratio",
                min_value=0.0,
                max_value=1.0,
                step=0.01,
                value=float(filter_defaults["good_land_value_ratio"]),
            )
            filter_defaults["poor_land_value_ratio"] = st.number_input(
                "Poor land-value ratio",
                min_value=0.0,
                max_value=1.0,
                step=0.01,
                value=float(filter_defaults["poor_land_value_ratio"]),
            )
            if st.form_submit_button("Save filter defaults"):
                db.save_setting(conn, "filter_defaults", filter_defaults)
                persisted_state_changed()
                st.rerun()

    with st.sidebar.expander("Destination definitions"):
        st.json(settings["destination_definitions"])
        st.caption("T1A stores manual commute inputs against these destinations and scenarios.")

    uploaded = st.sidebar.file_uploader("CSV import", type=["csv"])
    if uploaded and st.sidebar.button("Import CSV"):
        db.import_csv(conn, uploaded.getvalue().decode("utf-8-sig"))
        persisted_state_changed()
        st.rerun()
    st.sidebar.download_button(
        "Export CSV",
        data=db.export_csv(conn),
        file_name="property_listings.csv",
        mime="text/csv",
    )
    render_quick_add(conn)
    return preset_name, weight_overrides


def marker_color(listing: dict[str, Any]) -> list[int]:
    if listing.get("review_status") == "Reject" or listing.get("shortlist_status") == "reject":
        return [120, 120, 120]
    if listing.get("review_status") == "Shortlist" or listing.get("shortlist_status") in {"shortlist", "priority_inspect"}:
        return [18, 120, 75]
    if listing.get("is_rankable"):
        return [39, 102, 192]
    return [218, 124, 48]


def valid_lat_lng(item: dict[str, Any]) -> bool:
    try:
        lat = float(item.get("lat"))
        lng = float(item.get("lng"))
    except (TypeError, ValueError):
        return False
    return -90 <= lat <= 90 and -180 <= lng <= 180


def map_view_state(rows: list[dict[str, Any]]) -> dict[str, float]:
    lats = [float(row["lat"]) for row in rows]
    lngs = [float(row["lon"]) for row in rows]
    lat_span = max(lats) - min(lats) if len(lats) > 1 else 0
    lng_span = max(lngs) - min(lngs) if len(lngs) > 1 else 0
    span = max(lat_span, lng_span)
    if span <= 0.01:
        zoom = 13
    elif span <= 0.03:
        zoom = 12
    elif span <= 0.08:
        zoom = 11
    elif span <= 0.18:
        zoom = 10
    elif span <= 0.40:
        zoom = 9
    else:
        zoom = 8
    return {
        "latitude": sum(lats) / len(lats),
        "longitude": sum(lngs) / len(lngs),
        "zoom": zoom,
    }


def selection_value(container: Any, key: str, default: Any = None) -> Any:
    if container is None:
        return default
    if hasattr(container, "get"):
        return container.get(key, default)
    return getattr(container, key, default)


def selected_listing_id_from_map_event(event: Any, property_rows: list[dict[str, Any]] | None = None) -> str | None:
    if not event:
        return None
    selection = selection_value(event, "selection", {})
    objects = selection_value(selection, "objects", {})
    selected_properties = selection_value(objects, "property-markers", [])
    if not selected_properties:
        indices = selection_value(selection_value(selection, "indices", {}), "property-markers", [])
        if property_rows and indices:
            index = indices[0]
            if 0 <= index < len(property_rows):
                return property_rows[index].get("id")
        return None
    return selection_value(selected_properties[0], "id")


def pending_map_selected_listing_id(event: Any, property_rows: list[dict[str, Any]], last_applied_id: str | None) -> str | None:
    clicked_listing_id = selected_listing_id_from_map_event(event, property_rows)
    if clicked_listing_id and clicked_listing_id != last_applied_id:
        return clicked_listing_id
    return None


def render_map_tab(scored: list[dict[str, Any]], settings: dict[str, Any], conn=None) -> None:
    st.subheader("Map")
    map_selection_rows = [{"id": listing["id"]} for listing in scored if valid_lat_lng(listing)]
    pending_selected_id = pending_map_selected_listing_id(
        st.session_state.get("property_map"),
        map_selection_rows,
        st.session_state.get("last_applied_map_selection_id"),
    )
    if pending_selected_id:
        st.session_state["selected_listing_id"] = pending_selected_id
        st.session_state["last_applied_map_selection_id"] = pending_selected_id

    choices = {f"{item['address']} ({item['review_status']})": item["id"] for item in scored}
    if choices:
        selected_id = st.session_state.get("selected_listing_id")
        choice_labels = list(choices.keys())
        selected_index = 0
        if selected_id in choices.values():
            selected_index = list(choices.values()).index(selected_id)
        selected = st.selectbox("Select property from map", choice_labels, index=selected_index)
        st.session_state["selected_listing_id"] = choices[selected]

    selected_listing_id = st.session_state.get("selected_listing_id")
    property_rows = []
    missing_coordinate_rows = []
    for listing in scored:
        if valid_lat_lng(listing):
            is_selected = listing["id"] == selected_listing_id
            property_rows.append(
                {
                    "lat": float(listing["lat"]),
                    "lon": float(listing["lng"]),
                    "id": listing["id"],
                    "address": listing["address"],
                    "state": "selected property" if is_selected else listing["review_status"],
                    "color": [255, 214, 74] if is_selected else marker_color(listing),
                    "line_color": [20, 20, 20] if is_selected else [255, 255, 255],
                    "radius": 260 if is_selected else 190,
                }
            )
        else:
            missing_coordinate_rows.append(listing)

    destination_rows = []
    for key, destination in settings["destination_definitions"].items():
        if valid_lat_lng(destination):
            destination_rows.append(
                {
                    "lat": float(destination["lat"]),
                    "lon": float(destination["lng"]),
                    "address": destination.get("label", key),
                    "state": "destination",
                    "color": [140, 52, 160],
                    "line_color": [255, 255, 255],
                    "radius": 120,
                }
            )

    if missing_coordinate_rows:
        with st.expander(f"{len(missing_coordinate_rows)} listing(s) missing map coordinates"):
            st.write([listing["address"] for listing in missing_coordinate_rows])
            selected_missing = next(
                (listing for listing in missing_coordinate_rows if listing["id"] == selected_listing_id),
                None,
            )
            if selected_missing and conn is not None:
                with st.form("map_coordinate_entry"):
                    st.caption(f"Add manual coordinates for {selected_missing['address']}")
                    lat_text = st.text_input("Latitude")
                    lng_text = st.text_input("Longitude")
                    if st.form_submit_button("Save coordinates"):
                        save_listing(
                            conn,
                            {
                                **selected_missing,
                                "lat": optional_float(lat_text),
                                "lng": optional_float(lng_text),
                            },
                        )
            elif conn is not None:
                st.caption("Select one of these listings above to add manual coordinates here.")

    map_rows = property_rows + destination_rows
    if map_rows:
        try:
            import pydeck as pdk

            view = map_view_state(property_rows or map_rows)
            layers = [
                pdk.Layer(
                    "ScatterplotLayer",
                    id="destination-markers",
                    data=destination_rows,
                    get_position="[lon, lat]",
                    get_fill_color="color",
                    get_line_color="line_color",
                    get_radius="radius",
                    radius_min_pixels=8,
                    radius_max_pixels=18,
                    stroked=True,
                    line_width_min_pixels=2,
                    pickable=False,
                ),
                pdk.Layer(
                    "ScatterplotLayer",
                    id="property-markers",
                    data=property_rows,
                    get_position="[lon, lat]",
                    get_fill_color="color",
                    get_line_color="line_color",
                    get_radius="radius",
                    radius_min_pixels=12,
                    radius_max_pixels=30,
                    stroked=True,
                    line_width_min_pixels=2,
                    pickable=True,
                ),
            ]
            event = st.pydeck_chart(
                pdk.Deck(
                    map_style=None,
                    initial_view_state=pdk.ViewState(**view),
                    layers=layers,
                    tooltip={"text": "{address}\n{state}"},
                ),
                key="property_map",
                on_select="rerun",
                selection_mode="single-object",
            )
            clicked_listing_id = selected_listing_id_from_map_event(event, property_rows)
            if clicked_listing_id and clicked_listing_id != st.session_state.get("selected_listing_id"):
                st.session_state["selected_listing_id"] = clicked_listing_id
                st.session_state["last_applied_map_selection_id"] = clicked_listing_id
        except ImportError:
            st.map(pd.DataFrame(map_rows), latitude="lat", longitude="lon")
        st.caption("Property markers are larger circles; destination markers are smaller purple circles; the selected property is yellow.")
    else:
        st.info("No property or destination coordinates are available for the map.")


def table_rows(scored: list[dict[str, Any]]) -> pd.DataFrame:
    columns = [
        "address",
        "suburb",
        "price_comparison_value",
        "assumed_purchase_price",
        "property_type",
        "beds",
        "baths",
        "cars",
        "land_size_m2",
        "internal_size_m2",
        "body_corporate_pa",
        "location_score",
        "land_value_score",
        "property_fit_score",
        "price_score",
        "finance_score",
        "cost_drag_score",
        "total_score",
        "data_completeness_pct",
        "input_confidence_flag",
        "review_status",
        "shortlist_status",
        "missing_inputs_list",
    ]
    return pd.DataFrame([{column: item.get(column) for column in columns} | {"id": item["id"]} for item in scored])


def render_compare_tab(scored_ranked: list[dict[str, Any]], scored_all: list[dict[str, Any]], listings: list[dict[str, Any]], settings: dict[str, Any], preset_name: str, weight_overrides: dict[str, float]) -> None:
    st.subheader("Compare")
    include_non_rankable = st.toggle("Include non-rankable properties", value=False)
    rows = services.prepare_ranked_view(listings, settings, preset_name, weight_overrides, include_non_rankable)
    st.dataframe(table_rows(rows), hide_index=True, use_container_width=True)

    choices = {f"{item['address']} - {item['total_score']}": item["id"] for item in rows or scored_all}
    if choices:
        selected = st.selectbox("Select property row", list(choices.keys()), key="compare_select")
        st.session_state["selected_listing_id"] = choices[selected]
    if not scored_ranked:
        st.info("No rankable Rankable/Shortlist properties yet. Use Verification to see missing inputs.")


def edit_selected_property(conn, listing: dict[str, Any]) -> None:
    with st.expander("Edit Selected Property"):
        with st.form("edit_selected_property"):
            review_status = st.selectbox("Review status", REVIEW_STATUSES, index=REVIEW_STATUSES.index(listing["review_status"]))
            shortlist_status = st.selectbox("Shortlist status", SHORTLIST_STATUSES, index=SHORTLIST_STATUSES.index(listing["shortlist_status"]))
            address = st.text_input("Address", value=listing.get("address") or "")
            suburb = st.text_input("Suburb", value=listing.get("suburb") or "")
            postcode = st.text_input("Postcode", value=listing.get("postcode") or "")
            url = st.text_input("URL", value=listing.get("url") or "")
            property_type = st.selectbox("Property type", PROPERTY_TYPES, index=PROPERTY_TYPES.index(listing["property_type"]))
            beds = st.number_input("Beds", min_value=0, step=1, value=int(listing.get("beds") or 0))
            baths = st.number_input("Baths", min_value=0.0, step=0.5, value=float(listing.get("baths") or 0))
            cars = st.text_input("Cars", value="" if listing.get("cars") is None else str(listing.get("cars")))
            lat = st.text_input("Latitude", value="" if listing.get("lat") is None else str(listing.get("lat")))
            lng = st.text_input("Longitude", value="" if listing.get("lng") is None else str(listing.get("lng")))
            land_size_m2 = st.text_input("Land size m2", value="" if listing.get("land_size_m2") is None else str(listing.get("land_size_m2")))
            internal_size_m2 = st.text_input("Internal size m2", value="" if listing.get("internal_size_m2") is None else str(listing.get("internal_size_m2")))
            body_corporate_pa = st.text_input("Body corporate pa", value="" if listing.get("body_corporate_pa") is None else str(listing.get("body_corporate_pa")))
            price_text_raw = st.text_input("Raw listing price text", value=listing.get("price_text_raw") or "")
            price_comparison_value = st.text_input("Comparison price", value="" if listing.get("price_comparison_value") is None else str(listing.get("price_comparison_value")))
            assumed_purchase_price = st.text_input("Assumed purchase price", value="" if listing.get("assumed_purchase_price") is None else str(listing.get("assumed_purchase_price")))
            notes = st.text_area("Notes", value=listing.get("notes") or "")
            if st.form_submit_button("Save property"):
                save_listing(
                    conn,
                    {
                        **listing,
                        "review_status": review_status,
                        "shortlist_status": shortlist_status,
                        "address": address,
                        "suburb": suburb,
                        "postcode": postcode,
                        "url": url,
                        "property_type": property_type,
                        "beds": beds,
                        "baths": baths,
                        "cars": optional_float(cars),
                        "lat": optional_float(lat),
                        "lng": optional_float(lng),
                        "land_size_m2": optional_float(land_size_m2),
                        "internal_size_m2": optional_float(internal_size_m2),
                        "body_corporate_pa": optional_float(body_corporate_pa),
                        "price_text_raw": price_text_raw,
                        "price_comparison_value": optional_float(price_comparison_value),
                        "assumed_purchase_price": optional_float(assumed_purchase_price),
                        "notes": notes,
                    },
                )


def edit_commute_inputs(conn, listing: dict[str, Any], settings: dict[str, Any]) -> None:
    with st.expander("Edit Commute Inputs"):
        current = json.loads(listing.get("manual_commute_inputs_json") or "{}")
        with st.form("edit_commute_inputs"):
            next_values: dict[str, dict[str, float | None]] = {}
            for destination, definition in settings["destination_definitions"].items():
                st.markdown(f"**{definition.get('label', destination)}**")
                next_values[destination] = {}
                cols = st.columns(len(SCENARIOS))
                for index, scenario in enumerate(SCENARIOS):
                    existing = current.get(destination, {}).get(scenario)
                    value = cols[index].text_input(
                        scenario,
                        value="" if existing is None else str(existing),
                        key=f"{listing['id']}_{destination}_{scenario}",
                    )
                    next_values[destination][scenario] = optional_float(value)
            if st.form_submit_button("Save commutes"):
                compact = {
                    destination: {scenario: minutes for scenario, minutes in values.items() if minutes is not None}
                    for destination, values in next_values.items()
                }
                save_listing(conn, {**listing, "manual_commute_inputs_json": json.dumps(compact, sort_keys=True)})


def edit_land_value(conn, listing: dict[str, Any]) -> None:
    with st.expander("Edit Land Value Inputs"):
        with st.form("edit_land_value"):
            estimate = st.text_input("Manual land-value estimate", value="" if listing.get("manual_land_value_estimate") is None else str(listing.get("manual_land_value_estimate")))
            confidence_value = listing.get("manual_land_value_confidence") or "medium"
            confidence = st.selectbox(
                "Manual land-value confidence",
                LAND_VALUE_CONFIDENCES,
                index=LAND_VALUE_CONFIDENCES.index(confidence_value) if confidence_value in LAND_VALUE_CONFIDENCES else 1,
            )
            notes = st.text_area("Manual land-value notes", value=listing.get("manual_land_value_notes") or "")
            override = st.text_input("Manual land-value override score", value="" if listing.get("manual_land_value_override_score") is None else str(listing.get("manual_land_value_override_score")))
            if st.form_submit_button("Save land value"):
                save_listing(
                    conn,
                    {
                        **listing,
                        "manual_land_value_estimate": optional_float(estimate),
                        "manual_land_value_confidence": confidence,
                        "manual_land_value_notes": notes,
                        "manual_land_value_override_score": optional_float(override),
                    },
                )


def render_detail_panel(conn, listing: dict[str, Any] | None, settings: dict[str, Any]) -> None:
    st.divider()
    st.subheader("Selected Property Detail")
    if not listing:
        st.info("Select or add a property to see details.")
        return

    edit_selected_property(conn, listing)
    edit_commute_inputs(conn, listing, settings)
    edit_land_value(conn, listing)

    facts, prices, commutes, land, finance, notes, scores, missing = st.tabs(
        ["Facts", "Price inputs", "Commute inputs", "Land value", "Finance", "Notes", "Score breakdown", "Missing inputs"]
    )
    with facts:
        st.write(
            {
                "address": listing.get("address"),
                "suburb": listing.get("suburb"),
                "property_type": listing.get("property_type"),
                "beds": listing.get("beds"),
                "baths": listing.get("baths"),
                "cars": listing.get("cars"),
                "land_size_m2": listing.get("land_size_m2"),
                "internal_size_m2": listing.get("internal_size_m2"),
                "body_corporate_pa": listing.get("body_corporate_pa"),
            }
        )
    with prices:
        st.write(
            {
                "price_text_raw": listing.get("price_text_raw"),
                "price_comparison_value": money(listing.get("price_comparison_value")),
                "assumed_purchase_price": money(listing.get("assumed_purchase_price")),
            }
        )
    with commutes:
        st.json(json.loads(listing.get("manual_commute_inputs_json") or "{}"))
    with land:
        st.write(
            {
                "manual_land_value_estimate": money(listing.get("manual_land_value_estimate")),
                "manual_land_value_confidence": listing.get("manual_land_value_confidence"),
                "manual_land_value_notes": listing.get("manual_land_value_notes"),
                "manual_land_value_override_score": listing.get("manual_land_value_override_score"),
            }
        )
    with finance:
        outputs = listing["finance_outputs"]
        st.metric("Deposit", money(outputs.deposit_dollars))
        st.metric("Total upfront cash", money(outputs.total_upfront_cash))
        st.metric("Loan amount", money(outputs.loan_amount))
        st.metric("Cash buffer", money(outputs.cash_buffer))
    with notes:
        st.write(listing.get("notes") or "-")
    with scores:
        st.write(
            {
                "location_score": listing["location_score"],
                "land_value_score": listing["land_value_score"],
                "property_fit_score": listing["property_fit_score"],
                "price_score": listing["price_score"],
                "finance_score": listing["finance_score"],
                "cost_drag_score": listing["cost_drag_score"],
                "total_score": listing["total_score"],
                "is_rankable": listing["is_rankable"],
                "data_completeness_pct": listing["data_completeness_pct"],
                "input_confidence_flag": listing["input_confidence_flag"],
            }
        )
    with missing:
        if listing["missing_inputs_list"]:
            st.write(listing["missing_inputs_list"])
        else:
            st.success("No required inputs missing.")


def render_verification_tab(scored: list[dict[str, Any]]) -> None:
    st.subheader("Verification")
    buckets = services.verification_buckets(scored)
    selected_status = st.segmented_control("Review state", list(buckets.keys()), default="Needs review")
    st.dataframe(table_rows(buckets[selected_status]), hide_index=True, use_container_width=True)

    left, middle, right = st.columns(3)
    with left:
        st.markdown("**Missing required inputs**")
        missing_rows = [item for item in scored if item.get("missing_inputs_list")]
        st.dataframe(table_rows(missing_rows), hide_index=True, use_container_width=True)
    with middle:
        st.markdown("**Low-confidence land value**")
        st.dataframe(table_rows(services.low_confidence_land_value(scored)), hide_index=True, use_container_width=True)
    with right:
        st.markdown("**Price ambiguity**")
        st.dataframe(table_rows(services.price_ambiguity_issues(scored)), hide_index=True, use_container_width=True)

    st.markdown("**Incomplete commute coverage**")
    st.dataframe(table_rows(services.incomplete_commute_coverage(scored)), hide_index=True, use_container_width=True)


def main() -> None:
    conn = get_conn()
    data_version = st.session_state.setdefault("data_version", 0)
    listings, settings = cached_load_app_state(conn, data_version)
    preset_name, weight_overrides = render_sidebar(conn, settings)
    scored = cached_prepare_listings_view(listings, settings, preset_name, weight_overrides)
    scored_ranked = cached_prepare_ranked_view(listings, settings, preset_name, weight_overrides)

    st.title("Brisbane Property Decision Cockpit")
    map_tab, compare_tab, verification_tab = st.tabs(["Map", "Compare", "Verification"])
    with map_tab:
        render_map_tab(scored, settings, conn)
    with compare_tab:
        render_compare_tab(scored_ranked, scored, listings, settings, preset_name, weight_overrides)
    with verification_tab:
        render_verification_tab(scored)

    render_detail_panel(conn, selected_listing(scored), settings)


if __name__ == "__main__":
    main()
