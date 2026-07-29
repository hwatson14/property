---
document: LemonCheck Integrated Project Register
version: 0.2
date: 2026-07-29
status: Working integrated register for founder review
contributors: Matt workspace handoff, Harry workspace implementation and Founder Business Case
canonical_scope: LemonCheck Brisbane-first MVP
---

# LemonCheck Integrated Project Register v0.2

## Status labels

| Label | Meaning |
|---|---|
| **CONFIRMED — FOUNDER REQUIREMENT** | Directly stated or approved by a founder. |
| **REGISTERED PROJECT PRINCIPLE** | Accepted project rule requiring implementation detail. |
| **HISTORICAL OUTPUT** | Prior output or model result; not current truth. |
| **PROPOSED** | Design or commercial recommendation awaiting formal founder approval. |
| **ASSUMPTION** | Working premise requiring validation. |
| **OPEN** | Material unresolved decision or missing evidence. |
| **EXCLUDED / CONSTRAINED** | Product boundary or prohibited dependency. |
| **IMPLEMENTED — PROTOTYPE** | Working implementation that is not yet an approved production model. |

## 1. Product thesis

**CONFIRMED — FOUNDER REQUIREMENT**

LemonCheck is an address-first, AI-assisted property decision platform for ordinary residential buyers. It should answer:

> Is this property suitable for me at this price, and what must I investigate before proceeding?

The product combines stable property facts with separate decision lenses, hard flags, evidence and next actions. The surface experience must remain simple and mobile-friendly while supporting source-level drill-down.

## 2. Launch boundary

**CONFIRMED — FOUNDER REQUIREMENT**

- Geography: Brisbane City Council first.
- Initial property class: established residential houses.
- Primary user: active homebuyers, including first-home buyers and owner-occupiers.
- Investors may use the product, but investor-specific market, rent and portfolio modules are not required for the first paid pilot.

**EXCLUDED / CONSTRAINED**

- No national launch before Brisbane source adapters, scoring and user comprehension are validated.
- No strata model in the initial house MVP.
- No professional legal, planning, valuation, engineering, inspection or financial conclusion.

## 3. Five-score architecture

**CONFIRMED — FOUNDER REQUIREMENT**

All public scores run in the same direction: **higher is better**.

| Lens | Public meaning | Current MVP evidence |
|---|---|---|
| **Lemon Score** | Objective property soundness, independent of price and buyer preferences | Mapped hazard and parcel complexity only |
| **Deal Score** | Price attractiveness after user-supplied risk-adjusted value and costs | User inputs until licensed valuation data is connected |
| **Personal Fit** | Alignment with the buyer's goal and tolerance | Optional buyer inputs plus mapped facts |
| **Development Potential** | Preliminary flexibility after mapped planning constraints | Zoning presence and mapped constraints; capped until feasibility data exists |
| **Confidence** | Authority and completeness of evidence | Key source availability and provenance |

**REGISTERED PROJECT PRINCIPLE**

- Unknown evidence does not reduce Lemon Score.
- Unknown evidence reduces Confidence or creates a hard flag.
- Price cannot rescue a physically or legally problematic property inside Lemon Score.
- Personal preferences cannot rewrite objective property facts.
- Hard flags remain separate from composite scores.

## 4. Decision summary

**IMPLEMENTED — PROTOTYPE**

The current deterministic summary uses the following ordered states:

1. Professional review required.
2. Insufficient evidence.
3. Price looks unfavourable.
4. Likely poor fit.
5. Investigate before offering.
6. Proceed only after targeted checks.
7. Worth shortlisting.

The summary is decision support, not a buying recommendation.

## 5. Hard flags

**REGISTERED PROJECT PRINCIPLE**

Hard flags cannot disappear through averaging. Current prototype classes:

- Critical: property identity or parcel chain unresolved.
- Material: flood screening record, bushfire overlay, mapped easement or major intended-use conflict.
- Advisory: heritage, character, pre-1911 or multi-parcel complexity.
- Unresolved: missing evidence that prevents reliance.

**OPEN**

Founder approval is still required for production score caps, assessment gates and severity policies.

## 6. Current technical implementation

**IMPLEMENTED — PROTOTYPE**

The public Brisbane site currently provides:

- Queensland address search.
- Address-to-lot-to-parcel resolution.
- Multi-parcel handling.
- Brisbane planning and constraint screens.
- Brisbane parcel-level flood records.
- Mapped easement screening.
- Street and satellite context with official outlines.
- Evidence provenance and raw source records.
- Responsive desktop and mobile reports.
- Automated live-source and public-deployment browser tests.

The client-side architecture is a prototype. Production should move source access, caching, snapshots and score runs behind a controlled backend.

## 7. Current score model

**IMPLEMENTED — PROTOTYPE; NOT APPROVED MODEL**

Model version: `LC-BNE-5L-v0.2.0`

### Lemon Score

Starts at 100 and deducts only mapped objective risk contributors:

- overland-flow records;
- river or creek records;
- storm-tide or coastal records;
- bushfire overlay;
- waterway corridor;
- mapped easement intersection;
- multiple parcels.

Planning controls such as heritage and character do not directly reduce Lemon Score.

### Deal Score

Uses user-supplied:

- proposed price;
- risk-adjusted fair value;
- known costs or contingency.

This is a scenario tool, not a valuation.

### Personal Fit

Uses buyer goal, risk tolerance, intended works and preference for a simple single-lot property. Investor fit is withheld until market and rental evidence is connected.

### Development Potential

Constraint-based screening only. The score is capped at 80 until height, setbacks, site cover, servicing, approval pathway, costs and market feasibility are connected.

### Confidence

Uses weighted evidence gates for address, parcel, parcel area, zoning, flood, mapped easements, planning/constraint coverage and provenance.

## 8. Consumer product and pricing

**PROPOSED FOUNDER BUSINESS CASE**

- A$59 for a 14-day House Hunt Pass.
- A$79 for a 30-day House Hunt Pass.
- Unlimited standard LemonChecks subject to fair use and caching.
- Premium third-party records, document analysis and professional review may be separate charges.

**OPEN**

Pricing remains a test hypothesis until per-report data, AI, support and acquisition costs are measured.

## 9. Immediate development sequence

**CONFIRMED DIRECTION**

1. Complete the five-score decision layer and hard flags.
2. Validate score comprehension on real buyers.
3. Build saved property comparison.
4. Validate licensing for commercial property, sales and valuation data.
5. Add Deal Score data support.
6. Add document ingestion for building, pest and contract material.
7. Add outcome and calibration capture.
8. Move live source adapters to a backend with source snapshots and versioned score runs.

## 10. Validation gates

**REGISTERED PROJECT PRINCIPLE**

- Correct address-to-parcel resolution.
- Every material claim linked to evidence.
- No missing source shown as clear.
- Every score reproducible by model version and input snapshot.
- Hard flags tested separately from scores.
- User can identify the top risks, unknowns and next actions.
- No score represented as outcome-calibrated until a labelled validation set exists.

## 11. Open founder decisions

1. Final name and trademark position.
2. Founder equity, vesting, IP assignment and governance.
3. Final House Hunt Pass pricing and fair-use policy.
4. Commercial property-data provider.
5. Production hard-flag and score-cap policy.
6. Minimum Confidence required to display each lens.
7. Whether professional review is bundled or referred.
8. Data retention and privacy policy for buyer finances and preferences.
9. Validation sample size and release accuracy thresholds.

## 12. Superseded prototype behaviour

**HISTORICAL OUTPUT**

The previous public prototype displayed a higher-is-worse `Prototype Lemon Risk`, penalised missing evidence inside the risk score and treated planning complexity as direct property risk. This is superseded by the five-score architecture above.
