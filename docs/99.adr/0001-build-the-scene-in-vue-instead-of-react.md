---
title: 'Build the scene in Vue instead of React'
description: 'The scene is Vue 3 with script setup; React-based tooling is ruled out wholesale, Remotion included.'
status: 'accepted'
date: '2026-08-25'
---

# ADR-0001 — Build the scene in Vue instead of React

## Context

The project needs a frame-accurate animated scene rendered to video. The obvious tooling for that job is React-based: Remotion is the mature option, and most of the surrounding ecosystem — component libraries, timeline helpers, example code — assumes React too.

The author writes Vue and vanilla JavaScript and does not write React. A stack nobody on the project maintains fluently is a stack that stops being maintained.

## Decision

We will build the scene in Vue 3 with `<script setup>`, and treat "no React" as a hard constraint rather than a preference. Where the obvious tool for a job is React-based, we find the Vue or vanilla equivalent, or build the small piece by hand.

## Consequences

Remotion is out, and with it the whole class of ready-made video frameworks — which is what forces [ADR-0002](0002-render-with-playwright-and-ffmpeg-instead-of-a-video-framework.md). The render layer had to be written by hand, roughly 200 lines of Playwright plus ffmpeg, and its correctness rules (nothing animates on wall-clock time; anything asynchronous holds the frame) are ours to enforce rather than the framework's.

In exchange, the whole codebase is one language the author actually maintains, and the scene is an ordinary Vite app that can be opened in a browser and inspected frame by frame — which turned out to be the fastest debugging tool in the project.

## Alternatives considered

**Remotion.** The natural fit for the problem and evaluated first. Rejected on React alone, not on capability.

**A headless renderer with no component framework at all** — build the frames in plain canvas or SVG from a render function. Viable, and it would have avoided the framework question entirely, but it gives up reactive `computed` values, which is exactly the mechanism this scene leans on: every animated value derives from one frame ref, and the framework's dependency tracking is what makes "rebuild the expensive layers only when the framed extent changes" a one-line concern instead of a cache to maintain by hand.
