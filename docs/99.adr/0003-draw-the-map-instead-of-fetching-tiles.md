---
title: 'Draw the map instead of fetching tiles'
description: 'The map is computed from public elevation data and an OpenStreetMap extract rather than served by a tile provider, so no provider logo appears in the frame.'
status: 'accepted'
date: '2026-08-25'
---

# ADR-0003 — Draw the map instead of fetching tiles

## Context

The video is a map with routes drawn on it, so a basemap is the obvious dependency. Every tile provider's free tier attaches a condition: MapTiler, Mapbox and the rest either brand the map with a logo that must stay visible, or restrict use in video, or both. A logo burned into a personal recap video is the wrong trade, and the terms are the least interesting thing about the result.

A tile-served map also brings an API key, a quota, and a network dependency inside the render path — 900 frames of a moving camera against a rate-limited endpoint.

## Decision

We will not use a tile provider or a map library. The map is computed from raw public data and drawn by us: hillshade and contour lines from terrarium-encoded elevation tiles, land cover, water, places and peaks from an OpenStreetMap extract via Overpass. Output is SVG plus one canvas layer for the hillshade.

The data is fetched at ingest time only, by `pnpm fetch:geodata`, which derives the area from the GPX themselves. The render path never touches the network.

## Consequences

No API key, no quota, no logo and no network dependency during a render — and, because the drawing is ours, a deliberately abstract look that no tile style offers: near-black ground, glowing routes, fine contour lines, sparse uppercase labels.

What it costs is that everything a map library would have done is now ours. Marching squares for contours, hillshade, a hypsometric ramp, label collision avoidance, OSM multipolygon ring assembly, and a projection that must agree across three programs. Several of the resulting bugs were silent: a `View` projected at a different zoom than it was built at put routes two million pixels off-screen without throwing, and mixed-zoom tiles allocated a grid orders of magnitude too large. Both now fail loudly instead.

`maplibre-gl` is not a dependency and must not become one.

**Attribution does not go away, and is in some ways harder.** Terrain Tiles mixes its sources by area and a downloaded tile does not record which one it came from, so `attributionFor()` emits the two lines that are always true, matches regional duties against a coarse bounding-box table, and appends whatever `tours.json` declares. It over-credits on an overlap by design, and the line is shown by default: a tool that silently drops attribution makes its users infringe.

## Alternatives considered

**A paid tile plan.** Removes the logo requirement, but keeps the key, the quota and the network dependency, and makes a personal project carry a subscription.

**A self-hosted tile server** from an OSM extract. No logo and no quota, but it is a service to run and a style to author — considerably more moving parts than computing the four layers this video actually shows.

**Accepting the logo.** The honest baseline, and rejected on the look alone: the whole visual direction is "less is more", and a provider badge in the corner is the one element that could not be reduced away.
