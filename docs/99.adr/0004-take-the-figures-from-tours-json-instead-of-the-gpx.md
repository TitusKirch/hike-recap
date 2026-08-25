---
title: 'Take the figures from tours.json instead of the GPX'
description: 'Distance, ascent, descent and duration come from a hand-maintained file; values computed from the GPX are kept for comparison in logs only.'
status: 'accepted'
date: '2026-08-25'
---

# ADR-0004 — Take the figures from tours.json instead of the GPX

## Context

A GPX file looks like it should be the source of truth for a tour's figures. The source tracks here are not: they are Rother app exports, and every file was verified to be bare `<trkpt lat lon>` pairs — **no per-point timestamps and no `<ele>` elevation**. There is nothing in them to compute a duration or an ascent from.

Elevation can be recovered by sampling a digital elevation model at each point, but a 30 m raster is noisy in steep terrain, and summed naively it overstates ascent badly.

## Decision

We will treat `data/tours.json` as ground truth. Distance, ascent, descent and duration are hand-maintained there, and those are the values the video shows. Everything computed from the GPX or the DEM goes into `compiled.tours[].debug` and is **for comparison in logs only — never rendered**.

Two rules follow:

- Track animation is **linear along the route**, never time-based.
- Elevation comes from the DEM, resolved at ingest and cached into the compiled JSON. It is smoothed with a moving average (window 7–9) and gains below ~3 m are ignored before summing.

Ingest prints both columns side by side and warns when `debug.demAscentM` exceeds 1.5 × `stats.ascentM`, which means the smoothing is too weak for that terrain.

## Consequences

The figures on screen are the ones the walker actually recorded, and they cannot drift with the quality of a track export. The cost is a hand-maintained file: adding a tour means typing four numbers, and nothing validates them beyond the sanity comparison in the ingest log.

It also fixes the shape of the tool for everyone else. Any user feeding it their own tracks writes those four numbers too — see [Render your own trip](../2.guides/1.render-your-own-trip.md) — even where their GPX would have supported computing them. That is a deliberate simplification: one code path, and the log tells them if the file and the track disagree.

## Alternatives considered

**Compute everything from the GPX, falling back to `tours.json` where the data is missing.** Two code paths, and the fallback would be the one that runs on this project's own data — so the computed path would be the untested one. Rejected on that alone.

**Compute ascent from the DEM and render it.** Tried, and the numbers were wrong in the way DEM-derived ascent is always wrong: a 30 m raster sampled along a track in steep terrain accumulates noise into hundreds of phantom metres. Smoothing brings it close, but "close" is not a figure worth printing next to a real one.
