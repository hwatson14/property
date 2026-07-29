---
document: LemonCheck Model Delta
version: 0.2.1
date: 2026-07-29
status: Implemented prototype correction pending founder review
base_model: LC-BNE-5L-v0.2.0
new_model: LC-BNE-5L-v0.2.1
---

# LemonCheck Model Delta v0.2.1

## Reason for change

The first green five-score implementation produced technically valid but misleading governance outputs:

- public-source Confidence could reach 100 even though building, pest, title, contract, valuation and insurance evidence were absent;
- advisory planning and parcel-complexity items were counted in the hard-flag total.

The implementation passed its original technical gate, but those semantics conflicted with the integrated project principles.

## Changes

### Confidence

**REGISTERED PROJECT PRINCIPLE IMPLEMENTED**

Confidence now distinguishes:

1. **Connected public-source confidence**: completeness and authority of the currently connected address, parcel, planning, flood and mapped-constraint sources.
2. **Whole-assessment confidence**: how complete the assessment is relative to the eventual LemonCheck product.

In `LC-BNE-5L-v0.2.1`, the public-data vertical slice contributes a maximum of 55 points to whole-assessment Confidence. The remaining modules are shown explicitly as missing:

- building and pest evidence;
- contract, approvals and title review;
- market value and comparable sales;
- insurance availability and terms.

This 55% cap is a prototype governance assumption, not an empirically validated weighting.

### Hard flags and advisories

**REGISTERED PROJECT PRINCIPLE IMPLEMENTED**

The visible hard-flag total now includes only:

- critical;
- material;
- unresolved.

The following remain visible but are listed separately as advisories unless a buyer's intended use makes them material:

- heritage controls;
- character controls;
- pre-1911 controls;
- multi-parcel complexity.

### Decision summary

The decision summary remains a shortlist-stage output. It now explicitly states that building, title, contract, valuation and insurance evidence are not included.

## Unchanged principles

- All five public scores remain higher-is-better.
- Missing evidence does not reduce Lemon Score.
- Price remains isolated in Deal Score.
- Buyer preferences affect Personal Fit, not objective facts.
- Planning constraints primarily affect Development Potential.
- Every model run remains deterministic and versioned.

## Validation requirement

The browser acceptance suite must confirm:

- model version `LC-BNE-5L-v0.2.1`;
- public-source confidence retained separately;
- whole-assessment Confidence does not exceed 55 in the current vertical slice;
- hard flags exclude advisories;
- advisory items remain visible;
- Deal Score and Personal Fit recalculate after buyer inputs;
- both live Brisbane property examples and mobile rendering still pass.
