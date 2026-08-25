---
title: 'Derive every constant from the data'
description: 'Zoom, elevation ramp, route palette, wording and attribution are computed from the supplied tracks rather than tuned for one trip.'
status: 'accepted'
date: '2026-08-25'
---

# ADR-0005 — Derive every constant from the data

## Context

The project began as a recap of one specific trip, and a lot of it was tuned to that trip: DEM zoom fixed at 13, an elevation ramp in fixed metres, twelve route colours, German wording in the components, an attribution line written by hand.

Every one of those is correct for exactly one region and silently wrong elsewhere. Preparing the repo to be published — fed with any `tours.json` and any folder of GPX — turned each of them from a constant into a defect.

## Decision

We will derive from the data anything that would otherwise be calibrated to one trip, and keep it that way:

| Was a constant                     | Now                                                                                                |
| :--------------------------------- | :------------------------------------------------------------------------------------------------- |
| German strings in components       | `locales/*.json`, picked by the `locale` tag in `tours.json`                                       |
| A hand-written attribution line    | `attributionFor()` — always-true lines plus a regional bounding-box table plus `tours.json` extras |
| An elevation ramp in fixed metres  | `hypsometricFor()`, stretched to the terrain's own range                                           |
| DEM zoom 13                        | `zoomForBounds()`, travelling in the compiled JSON so ingest, fetch and scene agree                |
| Twelve route colours               | `routeColours(count)` — curated twelve, then extended along the hue circle, skipping green         |
| `data/` as the only data directory | `HIKE_DATA_DIR`                                                                                    |

`data/dem/` and `data/geo/` stay out of git: they are region-specific and reproducible from the GPX by `pnpm fetch:geodata`.

## Consequences

The tool works on a region it has never seen, and each of the six is testable in isolation rather than being a number someone once tuned by eye. Adding a tour means dropping a GPX in and adding an entry — the schedule, the viewport sequence and the palette follow.

The cost is indirection: a reader looking for "what zoom does this use" finds a function, not a number, and the resolved value only exists in `build/tours.compiled.json`. Ingest therefore prints the resolved locale, DEM zoom and attribution lines on every run, so the derived values are visible without opening the compiled file.

A fresh clone now needs `pnpm fetch:geodata` before its first ingest, where previously the data was simply committed.

Each of the six replaced a real failure. A 0–200 m coastal walk fell on the first stop of the fixed ramp and rendered flat green. A 200 km trail at fixed zoom 13 would have pulled thousands of tiles. A thirteenth tour wrapped the palette and gave two tours the same colour. The rule going forward: a new constant that encodes something about _the trip_ rather than about _the video_ is a defect, not a default.

## Alternatives considered

**Configuration keys instead of derivation** — expose zoom, ramp bounds and palette in `tours.json`. Rejected because it moves the calibration problem to the user: they would have to know what zoom suits their trail before they had ever rendered it. The derived values are visible in the ingest log, which covers the case where someone genuinely needs to know.

**Leaving it calibrated and documenting the limits.** Honest, and it would have been less work — but the repo was being prepared for publication, and a tool that only works on one valley is not a tool.
