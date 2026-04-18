# Adversarial Review

## Purpose
Attack the design as if trying to prove it will fail.

## Attack 1: “The app will rank garbage”
### Failure mode
Incomplete properties get ranked beside reviewed ones.

### Mitigation
- rankability gate
- default Compare view excludes non-rankable items
- Verification tab shows missing inputs
- acceptance tests assert exclusion

## Attack 2: “The app will quietly use the wrong price”
### Failure mode
Raw listing text becomes the comparison price or assumed purchase price.

### Mitigation
- three separate price concepts
- acceptance tests assert separation
- raw text never used directly for scoring

## Attack 3: “Manual scores will be arbitrary and drift”
### Failure mode
Location and land value become opaque manual numbers.

### Mitigation
- store structured commute inputs
- store land-value estimate/confidence/notes
- only allow override score as explicit exception
- compute scores from those inputs

## Attack 4: “Map-first will become style-first”
### Failure mode
Map looks persuasive while logic stays weak.

### Mitigation
- no fake commute surfaces in T1A
- Compare and Verification remain required
- Map is orientation layer, not truth layer

## Attack 5: “Codex will overbuild”
### Failure mode
Codex adds pages, connectors, auth, or extra tables in T1A.

### Mitigation
- explicit non-goals
- AGENTS guardrails
- tranche-builder skill
- acceptance criteria tied to T1A only

## Attack 6: “Shared settings will cause drift”
### Failure mode
One person’s temporary exploration corrupts the shared defaults.

### Mitigation
- shared presets persisted
- session tweaks not auto-persisted by default

## Attack 7: “The app will become semantically muddy”
### Failure mode
Facts, manual inputs, workflow state, and derived outputs get mixed.

### Mitigation
- semantic split documented
- derived outputs computed live
- no persisted scorecards in T1A

## Go / No-Go
### Go, if:
- formulas and rankability rules are implemented exactly
- acceptance harness exists
- T1A remains provider-free

### No-Go, if:
- raw price fields are collapsed
- non-rankable properties rank by default
- location/land value become arbitrary manual final scores
