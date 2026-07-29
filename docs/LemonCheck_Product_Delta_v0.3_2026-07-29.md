---
document: LemonCheck Product Delta
version: 0.3
date: 2026-07-29
status: Implemented prototype pending validation
feature: Saved property comparison
---

# LemonCheck Product Delta v0.3

## Purpose

Active buyers rarely assess only one property. This iteration converts individual LemonChecks into a house-hunt workflow without introducing another opaque overall ranking.

## Implemented behaviour

**IMPLEMENTED — PROTOTYPE**

- Save or update the current property assessment in the user's browser.
- Preserve address, property ID, model version, decision summary, five scores, hard-flag count and advisory count.
- Compare up to 12 saved properties side by side.
- Treat missing score lenses as missing, not zero.
- Show the highest saved score for each individual lens without declaring a single overall winner.
- Warn when saved properties were assessed under different model versions.
- Open a saved property report or remove it from the shortlist.
- Keep saved properties and buyer inputs local to the browser in the current public prototype.

## Governance rules

**REGISTERED PROJECT PRINCIPLE IMPLEMENTED**

- Comparison does not average the five lenses.
- A high Deal Score does not hide a low Lemon Score or hard flag.
- A high Lemon Score does not imply attractive price.
- Missing Deal or Personal Fit inputs remain blank.
- Properties assessed under different model versions are not silently treated as directly comparable.
- Saved snapshots retain the model version used at the time of saving.

## Current limitations

- Browser-local storage is not an account or durable cloud record.
- Saved properties are not synchronised between devices.
- A refreshed source record does not automatically update an older saved snapshot; the user must reopen and update it.
- No shareable comparison link or export exists yet.
- No ranking or recommendation model has been approved.

## Validation gate

The browser suite must:

1. load two independent live Brisbane properties;
2. calculate buyer-specific Deal and Personal Fit scores;
3. save each property;
4. open the comparison dialog;
5. show both addresses and all five score lenses;
6. preserve model `LC-BNE-5L-v0.2.1`;
7. show no horizontal overflow or browser console error.
