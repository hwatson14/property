# Tranche 3

## 1. Goal
Replace manual land-value truth inputs with a provider-backed land-value chain, add REA-assisted import, and harden the product for ongoing shared use.

T3 is the land-value and product-hardening tranche.
It exists to make land-value reasoning more real while preserving trust, confidence visibility, and workflow clarity.

## 2. Prerequisites
T2 should be complete unless there is a compelling reason to do land-value work before routed commute intelligence.

Do not begin T3 if:
- T1A or T2 acceptance criteria are not stable
- land-value scoring still depends on ambiguous price semantics
- confidence handling is not already visible in the app

## 3. In scope

### Land-value provider chain
Add a land-value provider chain with the following conceptual order:
1. official/statutory source where usable
2. proxy estimator
3. manual override

Required behaviour:
- preserve method
- preserve confidence
- preserve notes
- do not imply proxy values are official truth
- keep override path explicit

### REA assisted/manual import
Add REA-assisted/manual import support without making unsupported automation a hidden dependency.

Required behaviour:
- preserve canonical listing schema
- preserve price-model separation
- keep manual review flow where provider certainty is weak

### Product hardening
Add shared-use hardening where necessary, such as:
- access/privacy hardening
- operational resilience
- clearer environment/config management
- optional UI split only if the one-screen/tabbed workflow is genuinely too dense

### Verification expansion
Add visibility for:
- land-value source/method
- confidence differences between provider-backed and override-backed land-value inputs
- unresolved or low-confidence land-value cases

## 4. Out of scope
Do not implement in T3:
- broad unrelated platform expansion
- speculative market analytics outside the property decision purpose
- UI sprawl that obscures the trust model

## 5. Required user-visible behaviour
At the end of T3, the users must be able to:
1. use provider-backed land-value inputs where available
2. see confidence/method/notes clearly
3. retain manual override when provider certainty is weak
4. bring REA properties into the workflow through an assisted/manual path
5. continue using the same trusted ranking and verification workflow

## 6. Acceptance criteria

### Product acceptance
- land-value scoring no longer relies mainly on manual estimate entry
- confidence and method are visible
- REA-assisted/manual import works within canonical schema
- product remains trustworthy and understandable

### Architecture acceptance
- provider chain remains outside core scoring semantics
- scoring still consumes canonical truth inputs
- one-screen app is only split if the current workflow is demonstrably too dense

### Quality acceptance
- land-value provider tests exist
- override-path tests exist
- REA-assisted import tests exist where applicable
- confidence/verification behaviour remains explicit

## 7. Definition of done
T3 is done when land-value inputs are provider-backed where appropriate, manual override remains honest and explicit, and the product is hardened for ongoing shared use without sacrificing trust or simplicity.
