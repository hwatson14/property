# Tranche 1B

## 1. Goal
Deploy the already-correct T1A shell for shared use by Harry and Candace without changing the product contract.

T1B exists to make the product usable in a shared environment.
It does **not** exist to redesign the product, add providers, or reopen tranche-1 logic decisions.

## 2. Prerequisite
T1A must already be complete and accepted.

T1B must not begin if any of the following are still unresolved:
- acceptance fixtures failing
- rankability gating not working
- raw price / comparison price / assumed purchase price not separated
- CSV round-trip incomplete
- Map / Compare / Verification tabs not stable

## 3. In scope

### Deployment hardening
- deploy the single-page Streamlit shell to a shared environment
- wire environment variables and secrets cleanly
- connect the app to the chosen hosted DB through `storage/db.py`
- verify shared persistence works for both users

### Operational basics
- seed or migrate the DB if required
- confirm CSV import/export still works in deployed mode
- confirm persisted settings survive restarts
- confirm map, compare, and verification tabs behave the same as local/dev mode

### Minimal access control
Keep access control minimal and deployment-level where possible.
Do not build custom auth logic into app code in T1B unless deployment constraints force it.

## 4. Out of scope
Do not implement in T1B:
- Domain ingestion
- routed commute providers
- land-value providers
- REA assist
- formula redesign
- workflow redesign
- page splitting
- cosmetic redesign

## 5. Required user-visible behaviour
At the end of T1B, the users must be able to:
1. open the deployed app
2. view the same single-page tabbed cockpit as T1A
3. see persisted listings and settings
4. add/edit properties and retain changes
5. import/export CSV successfully
6. see deterministic scores and rankability behaviour match T1A

## 6. Acceptance criteria

### Product acceptance
- deployed shell behaves the same as accepted T1A
- both users can access the app
- persisted data survives restart/redeploy
- ranking, verification, and workflow state all remain intact

### Architecture acceptance
- no new product-layer complexity introduced
- app remains single-page
- provider connectors still absent
- DB access still isolated to `storage/db.py`

### Quality acceptance
- a smoke test or manual verification checklist confirms deployed parity with T1A
- no tranche-1 logic regressions are introduced during deployment

## 7. Definition of done
T1B is done when the accepted T1A shell is shareable and stable in its hosted environment without changing the product contract.
