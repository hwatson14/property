# Start Here

This is the Codex handoff pack for the Brisbane Property Decision Cockpit.

## Read in this order
1. `AGENTS.md`
2. `docs/product_spec.md`
3. `docs/architecture.md`
4. `docs/handoff.md`
5. `docs/formulas_and_rules.md`
6. `docs/schema_and_ui_contract.md`
7. `docs/tranches/tranche_1.md`
7. `docs/tranches/tranche_1b.md`
8. `docs/tranches/tranche_2.md`
9. `docs/tranches/tranche_3.md`
11. `docs/reviews/adversarial_review.md`
12. `docs/reviews/cold_review.md`

## Current goal
Build T1A only:
- single-page Streamlit app with tabs
- manual property add/edit
- CSV import/export
- listings + settings persistence
- structured manual commute and land-value inputs
- computed ranking and finance outputs
- review/rankability workflow
- acceptance tests

## Important rules
- do not create multiple app pages in T1A
- do not add provider connectors in T1A
- do not add auth logic in app code in T1A
- do not add extra metric tables in T1A
- do not replace structured manual inputs with arbitrary final manual scores
- do not default-rank incomplete properties


## Readiness note
T1A should not begin until the implementer has read `docs/schema_and_ui_contract.md`.
