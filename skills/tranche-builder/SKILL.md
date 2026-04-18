---
name: tranche-builder
description: Use this skill when implementing a tranche of the Brisbane Property Decision Cockpit. Enforces narrow scope, single-page tranche discipline, and clear ownership boundaries.
---

# Tranche Builder

## Purpose
Use this skill when building or changing a tranche of the property cockpit.

This skill exists to prevent:
- overbuilding
- business logic leaking into the UI
- tranche drift
- file sprawl
- premature provider work

## When to use
Use this skill when the task involves:
- implementing T1A cockpit behaviour
- wiring new user-visible workflow into the app
- adding or changing scoring or finance logic
- connecting storage to the UI

## Principles
1. Build the smallest useful slice.
2. Keep T1A single-page.
3. Put scoring in `core/scoring.py`.
4. Put finance in `core/finance.py`.
5. Put DB access in `storage/db.py`.
6. Keep the repo small.
7. Finish tranche-complete behaviour before chasing completeness.

## Required workflow

### Step 1: Read before coding
Read:
- `START_HERE.md`
- `AGENTS.md`
- `docs/product_spec.md`
- `docs/architecture.md`
- `docs/formulas_and_rules.md`
- the relevant tranche doc

### Step 2: Define the tranche slice
State:
- tranche goal
- exact user-visible outcome
- files expected to change
- acceptance criteria

### Step 3: Check ownership
Before editing:
- UI stays in `app.py`
- scoring stays in `core/scoring.py`
- finance stays in `core/finance.py`
- DB access stays in `storage/db.py`

### Step 4: Implement the narrowest useful slice
Prefer:
- one complete workflow
- one clearly owned change
- one tranche-complete behaviour

Avoid:
- broad refactors unless necessary
- speculative abstractions
- provider work outside current tranche scope
- polish that does not improve decision usefulness

### Step 5: Test
At minimum:
- add or update deterministic tests for changed logic
- verify no business logic leaked into `app.py`
- verify the tranche outcome works end to end

### Step 6: Update docs if behaviour changed
Update the relevant doc only if behaviour, scope, or ownership changed.

### Step 7: Report residue
Report:
- what was completed
- files changed
- tests added/updated
- what remains
- risks or residue
