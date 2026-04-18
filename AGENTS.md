# AGENTS.md

## Purpose

This repo is a private Brisbane property decision cockpit for two users.

Its job is to help the users decide where to buy by:
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
- supporting shortlist decisions through a single-page, tabbed workflow

This repo is **not**:
- a public property portal
- a generic browsing app
- a full mortgage-broker system
- a map-first truth engine without verification
- a microservices project

The main product is a trusted property decision cockpit.

## Architecture

Keep the architecture simple.

Chosen shape:
- single Streamlit app in `app.py`
- business logic in `core/`
- DB access in `storage/db.py`
- docs in `docs/`
- one reusable workflow skill in `skills/`

Do not introduce in tranche 1:
- multiple app pages
- provider connectors
- auth logic in app code
- background workers
- speculative abstraction layers

## Repo rules

1. Prefer editing existing files over creating new ones.
2. Keep the repo small and understandable.
3. Do not put scoring logic in `app.py`.
4. Do not put finance logic in `app.py`.
5. Do not put DB logic in `app.py`.
6. Keep scoring in `core/scoring.py`.
7. Keep finance in `core/finance.py`.
8. Keep DB access in `storage/db.py`.
9. Honest uncertainty is better than fake precision.
10. Do not pull later-tranche complexity into tranche 1.

## Read first

Before making meaningful changes, read:

- `START_HERE.md`
- `docs/product_spec.md`
- `docs/architecture.md`
- `docs/handoff.md`
- `docs/formulas_and_rules.md`
- `docs/schema_and_ui_contract.md`
- `docs/tranches/tranche_1.md`
- `docs/tranches/tranche_1b.md`
- `docs/tranches/tranche_2.md`
- `docs/tranches/tranche_3.md`
- `docs/reviews/adversarial_review.md`
- `docs/reviews/cold_review.md`

If code and docs conflict, do not guess. Surface the conflict and resolve it.

## Current build strategy

### T1A
Build a one-screen manual-first decision cockpit with:
- single-page tabs: Map / Compare / Verification
- manual property add/edit
- CSV import/export
- persisted listings and settings
- ranked comparison table
- visible component scores
- adjustable score weights and presets
- computed property-fit / price / finance / cost-drag scores
- structured manual commute inputs
- structured manual land-value inputs
- review/rankability workflow
- golden fixtures and acceptance tests

### T1B
Deploy the already-correct shell for shared use.

### T2
Add real location intelligence and automated listing ingestion:
- Domain ingestion
- routed commute inputs with provenance
- manual override retained

### T3
Add land-value intelligence and product hardening:
- land-value provider chain
- REA assisted/manual import helper
- confidence labels
- private-access hardening

Do not build T2 or T3 features in T1A.

## Product rules

1. Hard eliminators belong in filters.
2. Soft preferences belong in scores.
3. Every visible score must be explainable.
4. Total score must come from visible component scores and weights.
5. T1A must store structured manual inputs where automation is not yet honest.
6. Do not store fake final scores where raw inputs can be stored instead.
7. Do not imply provider-backed truth before providers exist.
8. Incomplete properties must not pollute default ranking.
9. Raw listing price text, comparison price, and assumed purchase price are separate concepts.

## Stop rules

Stop and report instead of guessing when:
- a finance rule is required but not defined
- a provider contract is unclear
- land-value logic would require invented certainty
- docs conflict materially
- a requested change would break the single-page simple architecture

When stopping, report:
- the blocker
- the narrowest unblock needed
- the safest fallback, if one exists

## Skill

Use:
- `skills/tranche-builder/SKILL.md`

Do not add more skills unless repetition clearly justifies it.
