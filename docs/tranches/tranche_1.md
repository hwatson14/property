# Tranche 1

## 1. Goal
Deliver the first **usable single-page decision cockpit** for the Brisbane property app.

At the end of T1A, the users must be able to:
- manually add and edit listings
- import and export listings via CSV
- persist listings and settings
- compare listings in a ranked table
- filter listings
- adjust score weights and presets
- enter structured commute inputs
- enter manual land-value estimate/confidence/notes
- view computed component scores
- see simple deposit-related finance outputs
- store review state, shortlist state, and notes
- use a Verification tab to see what is missing or weak

T1A is **manual-first**, **single-page**, **map-first**, and **decision-shell-first**.

## 2. Why T1A exists
T1A exists to prove the actual product:
- map-first orientation
- trustworthy compare view
- deterministic scoring
- rankability gating
- simple finance support
- low-complexity repo structure
- executable acceptance harness

It does **not** exist to prove provider completeness.

## 3. In scope

### Repo scaffold
Create:
- `AGENTS.md`
- `README.md`
- `START_HERE.md`
- `app.py`
- `core/`
- `storage/`
- `docs/`
- `skills/`
- `tests/`

### Docs
Create:
- `docs/product_spec.md`
- `docs/architecture.md`
- `docs/handoff.md`
- `docs/formulas_and_rules.md`
- `docs/tranches/tranche_1.md`
- `docs/reviews/adversarial_review.md`
- `docs/reviews/cold_review.md`

### Skill
Create:
- `skills/tranche-builder/SKILL.md`

### Storage
Implement persistence for:
- listings
- settings

### App
Implement one page only in `app.py` with tabs:
- Map
- Compare
- Verification

### Core logic
Implement:
- scoring logic
- finance logic
- minimal service/view-preparation logic

### Acceptance harness
Implement:
- golden fixture dataset
- expected outputs / invariants
- tranche-1 acceptance tests

## 4. Out of scope
Do not implement in T1A:
- Domain automated ingestion
- REA automated scraping/integration
- routed provider integration
- land-value provider integration
- multiple app pages
- map-derived fake commute overlays
- full mortgage modelling
- auth logic in app code
- visual polish beyond usability

## 5. Required user-visible behaviour
At the end of T1A, the users must be able to:
1. open the app
2. create a property manually
3. edit a property manually
4. import properties via CSV
5. export properties via CSV
6. see properties appear on the map
7. see rankable properties appear in the compare ranking
8. change score weights or presets
9. see rankings update deterministically
10. filter the visible set
11. select a property and view its details
12. enter commute inputs and land-value inputs
13. see finance outputs for that property
14. save review status, shortlist state, and notes
15. see why a property is not rankable

## 6. Required tabs

### Map
Must show:
- base map
- destination markers
- property markers
- property state styling
- property selection

### Compare
Must show:
- ranked table
- visible component scores
- total score
- completeness
- confidence
- missing inputs
- shortlist status

### Verification
Must show:
- properties by review state
- missing required inputs
- low-confidence inputs
- pricing ambiguity / unresolved input issues

## 7. Required ranked-table columns
- address
- suburb
- price_comparison_value
- assumed_purchase_price
- property type
- beds
- baths
- cars
- land size
- internal size
- body corporate
- location score
- land-value score
- property-fit score
- price score
- finance score
- cost-drag score
- total score
- completeness %
- confidence flag
- review status
- shortlist status

## 8. Acceptance criteria

### Product acceptance
- manual property add/edit works
- schema and UI behaviour follow `docs/schema_and_ui_contract.md`
- CSV import/export works
- listings and settings persist
- Map tab works as opening surface
- Compare tab excludes non-rankable items by default
- Verification tab exposes missing/weak inputs
- visible component scores exist
- weights and presets can be changed
- finance outputs are visible and deterministic

### Architecture acceptance
- `app.py` is UI-only
- scoring lives in `core/scoring.py`
- finance lives in `core/finance.py`
- DB logic lives in `storage/db.py`
- repo remains small and understandable

### Quality acceptance
- golden acceptance tests exist
- scoring tests exist
- finance tests exist
- DB tests exist
- docs reflect actual T1A behaviour

## 9. Definition of done
T1A is done when:
- the app runs as a single-page tabbed cockpit
- the map is useful for spatial orientation
- the compare ranking is trustworthy
- incomplete properties are clearly separated
- structured manual commute and land-value inputs are captured
- price model split is respected
- weights/presets persist
- acceptance harness passes
- no major cleanup is needed before T1B or T2
