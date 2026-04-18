# Schema and UI Contract

## Purpose
This document removes implementation ambiguity for T1A.
It defines the starter persistence schema, CSV contract, and exact single-page UI structure.
If this document conflicts with informal interpretation, this document wins for T1A.

## 1. Persistence schema

T1A persists exactly two logical tables:
- listings
- settings

### 1.1 listings
Minimum columns:
- id TEXT PRIMARY KEY
- source TEXT NOT NULL
- url TEXT NULL
- address TEXT NOT NULL
- suburb TEXT NOT NULL
- postcode TEXT NULL
- lat REAL NULL
- lng REAL NULL
- property_type TEXT NOT NULL
- beds INTEGER NOT NULL
- baths REAL NOT NULL
- cars REAL NULL
- land_size_m2 REAL NULL
- internal_size_m2 REAL NULL
- body_corporate_pa REAL NULL
- price_text_raw TEXT NULL
- price_comparison_value REAL NULL
- assumed_purchase_price REAL NULL
- manual_commute_inputs_json TEXT NULL
- manual_land_value_estimate REAL NULL
- manual_land_value_confidence TEXT NULL
- manual_land_value_notes TEXT NULL
- manual_land_value_override_score REAL NULL
- review_status TEXT NOT NULL
- shortlist_status TEXT NOT NULL
- notes TEXT NULL
- created_at TEXT NOT NULL
- updated_at TEXT NOT NULL

### 1.2 settings
Minimum columns:
- key TEXT PRIMARY KEY
- value_json TEXT NOT NULL

Recommended stored keys:
- score_presets
- last_selected_preset
- finance_defaults
- property_fit_targets
- destination_definitions
- filter_defaults

## 2. Enumerations

### 2.1 review_status
Allowed values:
- Inbox
- Needs review
- Rankable
- Shortlist
- Reject

### 2.2 shortlist_status
Allowed values:
- candidate
- shortlist
- reject
- priority_inspect

### 2.3 manual_land_value_confidence
Allowed values:
- high
- medium
- low

### 2.4 property_type
Allowed values for T1A:
- house
- townhouse
- apartment
- unit

## 3. CSV contract

CSV import/export must round-trip without silent field loss.

Required columns:
- id
- source
- url
- address
- suburb
- postcode
- lat
- lng
- property_type
- beds
- baths
- cars
- land_size_m2
- internal_size_m2
- body_corporate_pa
- price_text_raw
- price_comparison_value
- assumed_purchase_price
- manual_commute_inputs_json
- manual_land_value_estimate
- manual_land_value_confidence
- manual_land_value_notes
- manual_land_value_override_score
- review_status
- shortlist_status
- notes

Rules:
- export must preserve current values exactly
- import must validate required enumerations
- import must fail loudly on malformed JSON in `manual_commute_inputs_json`
- blank numeric values may be imported as null
- raw price text must remain text and never be coerced into comparison or assumed purchase price automatically

## 4. Single-page UI contract

T1A must be a single Streamlit page in `app.py` with tabs.

### 4.1 Tabs
Required tabs in this order:
1. Map
2. Compare
3. Verification

### 4.2 Map tab
Must show:
- map with property markers
- destination markers
- marker styling by review/rankable/shortlist state
- ability to select a property from the map
- no fake commute overlays in T1A

### 4.3 Compare tab
Must show:
- ranked table of rankable properties by default
- optional toggle to include non-rankable properties
- visible component score columns
- total score
- completeness
- confidence
- missing-input summary
- ability to select a property row

### 4.4 Verification tab
Must show segmented views or equivalent filters for:
- Inbox
- Needs review
- Rankable
- Shortlist
- Reject

Must also surface:
- missing required inputs
- low-confidence land-value inputs
- price ambiguity issues
- incomplete commute coverage

## 5. Sidebar contract

Sidebar must contain:
- preset selector
- temporary score weight controls
- finance defaults
- property-fit targets
- destination definitions
- CSV import
- CSV export trigger
- quick-add property action

Rule:
Temporary weight changes must not overwrite shared presets automatically.

## 6. Edit flow contract

Editing must use dialogs, forms, or expanders.
Do not create a permanent always-open form wall.

Required flows:
- Quick Add Property
- Edit Selected Property
- Edit Commute Inputs
- Edit Land Value Inputs

### 6.1 Quick Add Property minimum fields
- address
- suburb
- property_type
- price_text_raw
- price_comparison_value
- assumed_purchase_price
- beds
- baths
- cars

After quick add, listing defaults to:
- review_status = Inbox
- shortlist_status = candidate

### 6.2 Review enrichment fields
- land_size_m2 / internal_size_m2
- body_corporate_pa
- manual_commute_inputs_json
- manual_land_value_estimate
- manual_land_value_confidence
- manual_land_value_notes
- manual_land_value_override_score
- notes

## 7. Selection and detail panel contract

Selecting a property from Map or Compare must populate a shared detail panel or detail section.

The detail section must contain sub-sections for:
- Facts
- Price inputs
- Commute inputs
- Land value
- Finance
- Notes
- Score breakdown
- Missing inputs

## 8. Derived-output contract

Derived outputs are computed live and not persisted in T1A.

Required derived outputs:
- location_score
- land_value_score
- property_fit_score
- price_score
- finance_score
- cost_drag_score
- total_score
- is_rankable
- data_completeness_pct
- input_confidence_flag
- missing_inputs_list

## 9. Default behaviour contract

- Default opening tab: Map
- Default Compare view: rankable + shortlist only
- Non-rankable properties must not pollute default ranking
- Raw price text must never be used directly in formulas
- Missing-input list must be visible somewhere in the app for the selected property

## 10. T1A implementation stop rule

If implementing any UI behaviour would require inventing new product rules not written in:
- AGENTS.md
- formulas_and_rules.md
- tranche_1.md
- this schema_and_ui_contract.md

stop and report the gap instead of guessing.
