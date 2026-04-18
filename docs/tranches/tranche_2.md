# Tranche 2

## 1. Goal
Replace manual commute truth inputs with routed commute inputs and add automated Domain ingestion, while preserving the same scoring semantics and verification discipline established in T1A.

T2 is the commute-intelligence tranche.
It exists to make location scoring real.
It does **not** exist to redesign the app into a generic map product.

## 2. Prerequisites
T1A must be accepted.
T1B is strongly preferred if the app is already intended for shared use.

Do not begin T2 if:
- T1A acceptance harness is not passing
- review/rankability workflow is still unstable
- price separation rules are not already enforced
- the app still relies on arbitrary manual final scores for location

## 3. In scope

### Provider adapter layer
Create `connectors/` and add:
- Domain listing ingestion adapter
- routed commute adapter

The routed commute adapter must support:
- destination/scenario-based commute generation
- provenance metadata
- geocode ambiguity visibility
- manual override retention
- batched request execution where appropriate
- fail-closed behaviour for blank/bad origins

### Domain ingestion
Add automated Domain ingestion for Brisbane listings, while preserving canonical listing semantics.

Required behaviour:
- import listings into canonical property facts
- preserve `price_text_raw`
- populate or update `price_comparison_value` and `assumed_purchase_price` only through explicit logic or review flow
- dedupe safely
- do not silently overwrite manual truth inputs without explicit rules

### Routed commute inputs
Replace manual commute entry as the default path for location inputs.
Retain manual override capability.

Required routed scenarios:
- weekday_am_peak
- weekday_pm_peak
- saturday_midday

### Verification hardening
Add visibility for:
- geocode ambiguity
- no-route conditions
- stale routed inputs
- provenance/source metadata
- manual override vs provider-generated values

### Live validation gate
Before T2 is accepted, run a small live validation sample and verify:
- anchors are correct
- plausible AM/PM differences exist
- route outputs are believable for Brisbane geography
- no-route and ambiguity cases remain visible

## 4. Out of scope
Do not implement in T2:
- land-value providers
- REA assisted import
- product-wide UI redesign
- page splitting unless absolutely necessary
- fake commute heatmaps not backed by validated routed data
- full market completeness work

## 5. Required user-visible behaviour
At the end of T2, the users must be able to:
1. ingest Domain listings into the cockpit
2. see routed commute inputs populate location scoring
3. retain manual override where required
4. see provenance / ambiguity / no-route states in Verification
5. continue using Map / Compare / Verification without workflow regression

## 6. Acceptance criteria

### Product acceptance
- Domain ingestion works for Brisbane search flows
- routed commute inputs are used by default for location scoring
- manual overrides still work
- no-route and ambiguity cases are visible
- Compare ranking uses routed location data where available

### Architecture acceptance
- provider logic remains in `connectors/`
- scoring semantics remain in `core/scoring.py`
- T1A workflow is preserved
- map remains useful but does not become a fake commute surface

### Quality acceptance
- connector smoke tests exist
- routing/provenance/geocode tests exist
- a live validation checklist has been completed
- no silent regressions to T1A acceptance behaviour

## 7. Definition of done
T2 is done when location scoring is provider-backed, validated, provenance-aware, and integrated without compromising T1A trust rules.
