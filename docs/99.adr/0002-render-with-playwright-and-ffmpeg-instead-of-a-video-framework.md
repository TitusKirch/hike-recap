---
title: 'Render with Playwright and ffmpeg instead of a video framework'
description: 'The renderer drives the Vue scene frame by frame through a browser and pipes JPEGs into ffmpeg, rather than adopting a video framework.'
status: 'accepted'
date: '2026-08-25'
---

# ADR-0002 — Render with Playwright and ffmpeg instead of a video framework

## Context

[ADR-0001](0001-build-the-scene-in-vue-instead-of-react.md) rules out the React-based video frameworks, so the project has to turn a browser scene into an MP4 itself. The requirements are modest — one fixed output spec, one scene, no compositing, no audio — but the output has to be deterministic: a silent 30-second animation makes any stutter or tear immediately visible.

## Decision

We will drive the scene with Playwright and encode with ffmpeg. `scripts/render.ts` opens the Vite-served scene at exactly 1080 × 1920 and, for each frame, calls `window.__setFrame(n)`, waits for `window.__frameReady`, screenshots `#scene` and pipes the JPEG straight into ffmpeg's stdin. `src/render-bridge.ts` owns that contract, including `holdFrame(reason)` for anything asynchronous.

Two rules come with it, and both are correctness rules rather than style:

- **Nothing in the scene animates on its own.** Every animated value is a `computed` derived from the `frame` ref. The renderer takes ~100 ms of wall-clock time per frame while advancing the timeline by 1/30 s, so anything moving on wall-clock time tears.
- **Anything asynchronous holds the frame.** Until every `holdFrame` hold is released, `__frameReady` stays false and the renderer waits.

Two measured choices then decide the render time: the camera may only move between tours, so the expensive layers are rasterised once per framed extent and a zoom is a CSS transform over the result; and capture is JPEG at quality 95 rather than PNG.

## Consequences

The pipeline is ours to maintain, and its failure modes are silent by nature — a font that loads one frame late reflows every label, and a value on a timer stutters without erroring. That is the price, and it is why the two rules above are written down rather than assumed.

What we get is a full render in about four and a half minutes at roughly 7 fps, no frames on disk (900 PNGs would be gigabytes of pointless I/O), and a scene that is an ordinary web page during development. `pnpm render:preview` and `pnpm still` fall out of the same mechanism for free.

The numbers behind the two choices were measured, not guessed. PNG capture cost ~260 ms per frame against ~95 ms for JPEG at quality 95, and H.264 recompresses either way, so the difference is invisible in the output and is the difference between a five-minute render and a twenty-minute one. An earlier variant that nudged the view every frame invalidated every layer `computed` and pushed a full render past ten minutes.

## Alternatives considered

**A headless-Chrome screen recording** — play the scene in real time and capture the screen. Rejected: it ties frame timing to wall-clock performance, which is exactly the non-determinism the frame-stepping design exists to remove.

**Rendering to PNG frames on disk, then encoding in a second pass.** Simpler to resume after a failure, but gigabytes of I/O for an artifact that is regenerated from scratch anyway. Piping into ffmpeg's stdin costs nothing and a failed render is cheap to repeat.
