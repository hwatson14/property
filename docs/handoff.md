# Handoff

## What this repo is
This repo is a private Brisbane property decision cockpit for two users.

Its purpose is to help the users decide where to buy by:
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
- supporting shortlist decisions through Map / Compare / Verification tabs

## Build order
1. T1A: make the product correct
2. T1B: make the product shared
3. T2: add routed commute intelligence and ingestion
4. T3: add land-value intelligence and REA assist

## Tranche docs
- `docs/tranches/tranche_1.md` defines T1A
- `docs/tranches/tranche_1b.md` defines T1B
- `docs/tranches/tranche_2.md` defines T2
- `docs/tranches/tranche_3.md` defines T3

## Core rules
1. The app is single-page in T1A.
2. The default opening surface is Map.
3. Default ranking excludes non-rankable properties.
4. Manual commute inputs are structured truth inputs, not arbitrary final scores.
5. Land-value inputs retain estimate/confidence/notes and only use override when necessary.
6. Raw price text, comparison price, and assumed purchase price are separate.
7. Do not add providers in T1A.
8. Do not add fake commute surfaces in T1A.
9. Keep repo runtime small; make docs and tests carry the precision.

## Runtime scope in T1A
- app.py
- core/scoring.py
- core/finance.py
- core/services.py
- storage/db.py

## Trust rules adopted from uploaded packs
- no fake commute surfaces or drive-time proxies
- provenance and geocode ambiguity matter once routing exists
- validate live commute outputs before polishing
- use verification surfaces, not just ranking surfaces
- keep business logic out of UI
- use fixture-backed acceptance, not prose-only handoff

## Acceptance posture
T1A is complete only when:
- one-screen tabs work
- CSV import/export works
- rankings are deterministic
- incomplete properties are excluded by default from ranking
- price concepts remain separate
- acceptance fixtures pass
