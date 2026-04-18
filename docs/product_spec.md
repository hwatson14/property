# Product Spec

## Product name
Working name: Brisbane Property Decision Cockpit

## Users
- Harry
- Candace

## Geography
- Brisbane only

## Primary goal
Help the users decide where to buy.

## Product purpose
This product turns candidate property listings into a map-first, ranked, filterable, comparable shortlist.

It should help the users:
- collect candidate properties
- see them spatially first
- compare them consistently
- adjust filters and score weights
- assess shortlist quality quickly
- keep incomplete properties out of the main ranking
- include simple finance signals in the decision process

## Core tabs
- Map
- Compare
- Verification

## Core scoring pillars
- location
- land-value attractiveness
- property fit
- price attractiveness
- finance
- cost drag

## Product principle
This is a decision cockpit, not a browsing portal.

## MVP principle
Prefer useful comparison and trustworthy gating over data completeness and polish.

## Tranche roadmap

### T1A
Single-page manual-first decision shell:
- Map / Compare / Verification tabs
- manual listing add/edit
- CSV import/export
- persisted listings + settings
- structured manual location inputs
- structured manual land-value inputs
- computed property-fit / price / finance / cost-drag scoring
- computed location / land-value scoring from structured inputs
- review/rankability workflow
- acceptance harness

### T1B
Shared deployment hardening.

### T2
Real location intelligence and automated ingestion:
- Domain search connector
- routed commute inputs with provenance and validation
- manual override retained

### T3
Land-value provider chain, REA assisted import, and product hardening.

## Non-goals in T1A
- public property portal
- full mortgage-broker engine
- live provider integrations
- map-derived fake commute surfaces
- multi-service backend
- provider-heavy architecture
- perfect market completeness
