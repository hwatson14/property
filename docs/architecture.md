# Architecture

## 1. Purpose
This repo implements a private Brisbane property decision cockpit for two users.

The product exists to help the users decide where to buy by:
- collecting candidate property listings
- normalising them into one comparable structure
- filtering and ranking them
- scoring them on:
  - location
  - land-value attractiveness
  - property fit
  - price attractiveness
  - finance
  - cost drag
- supporting shortlist decisions in a single-page workflow with tabs

## 2. Architectural goals
The architecture must optimise for:
1. simplicity
2. trancheability
3. deterministic calculations
4. transparent ranking
5. low repo sprawl
6. clear ownership boundaries
7. honest uncertainty where data is incomplete

## 3. Chosen architecture
Use a **single Streamlit app** in `app.py`.

### Chosen shape
- `app.py` for UI and interaction flow
- `core/scoring.py` for score logic
- `core/finance.py` for finance logic
- `core/services.py` for minimal view-preparation logic
- `storage/db.py` for DB access
- `docs/` for source-of-truth docs
- `skills/` for one reusable Codex workflow

### Explicit non-goals in T1A
Do not introduce:
- multiple app pages
- provider connectors
- auth logic in app code
- background jobs
- duplicated business logic
- speculative abstraction layers

## 4. UI architecture
The product is one page with three tabs.

### Map tab
Default opening surface.
Shows:
- base map
- destination markers
- property markers
- marker styling by review/rankability/shortlist state
- optional score bands for rankable properties
- property selection

No fake commute surface in T1A.

### Compare tab
Shows:
- ranked table
- visible component scores
- total score
- review/rankability state
- completeness
- confidence
- missing inputs

Default view should rank only Rankable and Shortlist items.

### Verification tab
Shows:
- Inbox / Needs review / Rankable / Shortlist / Reject segments
- missing required inputs
- low-confidence land-value entries
- incomplete commute coverage
- price ambiguity issues

## 5. Module boundaries

### `app.py`
Owns:
- layout
- tab rendering
- forms/dialogs
- table rendering
- property selection
- import/export controls

Must not own:
- score formulas
- finance formulas
- DB logic
- provider logic

### `core/scoring.py`
Owns:
- component score calculation
- total score calculation
- rankability and completeness logic
- score presets

### `core/finance.py`
Owns:
- deposit calculations
- fees calculations
- loan amount calculations
- cash buffer calculations
- finance score calculation

### `core/services.py`
Owns only:
- loading listings and settings
- preparing view models
- merging stored inputs with computed outputs
- returning missing-inputs lists and metadata

### `storage/db.py`
Owns:
- DB connection
- schema setup
- CRUD for listings
- CRUD for settings
- CSV import/export helpers

## 6. Persistence model
Persist only:
- `listings`
- `settings`

Do not persist in T1A:
- scorecards
- finance metrics
- route metrics
- land-value metrics
- note history

## 7. Semantic truth model

### Facts
Stable listing facts:
- source
- url
- address
- suburb
- postcode
- lat/lng
- property type
- beds
- baths
- cars
- land size
- internal size
- body corporate
- raw listing price text

### Manual truth inputs
- price comparison value
- assumed purchase price
- structured commute inputs by destination/scenario
- manual land-value estimate
- manual land-value confidence
- manual land-value notes
- optional land-value override score

### Workflow state
- review status
- shortlist status
- notes
- completeness %
- confidence flag
- timestamps

### Derived outputs
Computed live, not persisted:
- location score
- land-value score
- property-fit score
- price score
- finance score
- cost-drag score
- total score
- rankable yes/no
- missing-inputs list

## 8. Review-state model
Use only:
- Inbox
- Needs review
- Rankable
- Shortlist
- Reject

Default ranking view = Rankable + Shortlist.

## 9. Future provider roadmap

### T2
Add:
- Domain ingestion
- routed commute inputs with provenance
- geocode ambiguity handling
- batching and validation
- manual location override retained

### T3
Add:
- land-value provider chain
- REA assisted/manual import helper
- confidence labels
- product hardening

## 10. Delivery principle
The first useful prototype should prioritise:
1. map-first orientation
2. trustworthy rankability gating
3. visible component scores
4. adjustable weights and presets
5. simple finance outputs
6. structured truth inputs for future automation
