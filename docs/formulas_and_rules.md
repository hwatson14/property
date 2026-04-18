# Formulas and Rules

## 1. Review-status semantics

### Allowed values
- Inbox
- Needs review
- Rankable
- Shortlist
- Reject

### Meaning
- Inbox: captured but minimally reviewed
- Needs review: partially enriched but not comparable
- Rankable: minimum evidence exists to compare
- Shortlist: deliberately promoted for consideration
- Reject: deliberately excluded

`Shortlist` and `Reject` are decision states. `Inbox`, `Needs review`, and `Rankable` are workflow states.

## 2. Rankability rules

A listing is rankable only if:

### Common required fields
- address
- property_type
- price_comparison_value
- assumed_purchase_price
- beds
- baths
- cars is present or explicitly null
- at least one size field is present where relevant
- required commute inputs exist for all required destinations/scenarios
- manual land-value estimate exists, or manual land-value override score exists

### Type-aware additions
#### House
- land_size_m2 present or explicitly unknown with note
#### Apartment / Unit
- internal_size_m2 present or explicitly unknown with note
- body_corporate_pa present or explicitly unknown with note
#### Townhouse
- internal_size_m2 or land_size_m2 present
- body_corporate_pa present or explicitly unknown with note

### Default view rule
Only Rankable and Shortlist items appear in the default Compare ranking view.

## 3. Completeness and confidence

### Completeness
Completeness measures whether required fields are present.

Recommended formula:
- numerator = count of required fields present for that property type
- denominator = count of required fields for that property type
- `data_completeness_pct = round(100 * numerator / denominator)`

### Confidence
Confidence reflects trust in manual inputs.

Use:
- High
- Medium
- Low

Recommended default:
- High if commute inputs complete and land-value confidence is High
- Medium if commute inputs complete and land-value confidence is Medium
- Low if any required manual truth input is low-confidence or override-driven

## 4. Price model

Keep these separate:

### `price_text_raw`
Original listing text. Never use directly for scoring or finance.

### `price_comparison_value`
Numeric value used for comparison and price scoring.

### `assumed_purchase_price`
Numeric value used for finance and land-value ratio logic.

## 5. Destination/scenario model

Tranche 1 manual commute inputs must be stored by:
- destination
- scenario

Required default scenarios:
- weekday_am_peak
- weekday_pm_peak
- saturday_midday

`manual_commute_inputs_json` shape example:
{
  "work_a": {"weekday_am_peak": 32, "weekday_pm_peak": 39, "saturday_midday": 24},
  "work_b": {"weekday_am_peak": 18, "weekday_pm_peak": 22, "saturday_midday": 16}
}

## 6. Settings model

Persist shared presets:
- Balanced
- Location-first
- Value-first

Allow temporary in-session slider changes without overwriting shared presets by default.

## 7. Component score formulas

All component scores are clamped to [0, 10].

### 7.1 Location score
Use settings:
- destination weights
- scenario weights
- target commute minutes
- max acceptable commute minutes

For each destination/scenario:
- if missing => listing not rankable
- if value <= target => subscore = 10
- if value >= max_acceptable => subscore = 0
- else subscore = 10 * (max_acceptable - value) / (max_acceptable - target)

Then:
- weighted average across scenarios and destinations
- round to 2 decimals

### 7.2 Land-value score
Inputs:
- assumed_purchase_price
- manual_land_value_estimate
- manual_land_value_confidence
- optional manual_land_value_override_score

Rule:
- if override score exists, use it directly
- else compute ratio = manual_land_value_estimate / assumed_purchase_price
- settings define:
  - excellent_ratio
  - good_ratio
  - poor_ratio

Suggested mapping:
- ratio >= excellent_ratio => 10
- ratio <= poor_ratio => 0
- linear interpolation between thresholds

Confidence adjustment:
- High => no penalty
- Medium => subtract 0.5
- Low => subtract 1.0
- clamp after adjustment

### 7.3 Property-fit score
Use settings targets:
- preferred property types
- min beds
- min baths
- min cars
- target land size
- target internal size
- preferred max body corp

Suggested sub-scores:
- type_match: 10 if preferred, 6 if acceptable, 0 if filtered out
- beds: 10 if >= target, else proportionate
- baths: 10 if >= target, else proportionate
- cars: 10 if >= target, else proportionate
- size: 10 if meets target, else proportionate using whichever size field is relevant
- body_corp_fit: 10 if <= preferred max, then linearly decline to 0 at hard max

Recommended weighted mix:
- type 0.15
- beds 0.20
- baths 0.10
- cars 0.10
- size 0.25
- body corp 0.20

### 7.4 Price score
Use:
- budget_cap
- price_comparison_value

Rule:
- if price_comparison_value > budget_cap => filter out by default
- else score = 10 * (budget_cap - price_comparison_value) / budget_cap_floor_range

Implementation recommendation:
- define `budget_floor` in settings, default = 70% of budget_cap
- if price <= budget_floor => 10
- if price >= budget_cap => 0
- else linear interpolation

### 7.5 Finance score
Use:
- assumed_purchase_price
- available_cash
- deposit_percent
- fees_estimate

Compute:
- deposit_dollars = assumed_purchase_price * deposit_percent
- total_upfront_cash = deposit_dollars + fees_estimate
- loan_amount = assumed_purchase_price - deposit_dollars
- cash_buffer = available_cash - total_upfront_cash

Finance score:
- if cash_buffer >= desired_buffer => 10
- if cash_buffer <= minimum_buffer => 0
- else linear interpolation

Recommended settings:
- desired_buffer
- minimum_buffer

### 7.6 Cost-drag score
Use:
- body_corporate_pa
- preferred_body_corp
- hard_max_body_corp

Rule:
- if null and property type requires it => low subscore, not auto-zero unless filtered
- if <= preferred => 10
- if >= hard max => 0
- else linear interpolation

## 8. Total score
`total_score = weighted_sum(component_scores)`

Default shared presets:

### Balanced
- location 0.25
- land_value 0.20
- property_fit 0.20
- price 0.15
- finance 0.10
- cost_drag 0.10

### Location-first
- location 0.35
- land_value 0.15
- property_fit 0.20
- price 0.10
- finance 0.10
- cost_drag 0.10

### Value-first
- location 0.15
- land_value 0.30
- property_fit 0.15
- price 0.20
- finance 0.10
- cost_drag 0.10

Weights must sum to 1.0.

## 9. Missing-inputs list
The score engine must return a list of missing required inputs for each listing.

Examples:
- missing weekday_am_peak for work_a
- missing assumed_purchase_price
- missing body_corporate_pa for apartment
- missing manual_land_value_estimate or override

## 10. CSV contract
CSV import/export must include:
- all fact fields
- price_text_raw
- price_comparison_value
- assumed_purchase_price
- manual commute input columns per destination/scenario
- manual land-value fields
- review_status
- shortlist_status
- notes

Round-trip must not silently drop fields.

## 11. Acceptance harness expectations
Golden acceptance tests must verify:
- non-rankable properties excluded from default ranking
- raw price text not used directly
- preset changes change ranking order
- CSV round-trip preserves critical fields
- missing-input list is returned
- completeness and confidence are shown separately
