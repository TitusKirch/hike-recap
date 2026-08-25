---
title: 'hike-recap documentation'
description: 'How hike-recap turns a folder of GPX tracks into a portrait recap video, and why it is built the way it is.'
---

# hike-recap

`hike-recap` renders one portrait video (1080 × 1920, 30 fps, 30 s, H.264) from the GPX tracks of a single trip. The tours draw themselves one after another onto a map whose viewport grows to fit them.

These pages hold what the source cannot state: how the parts fit together, how to feed the tool your own trip, and the decisions that shaped it. What the code already says — what a function does, which options exist — stays in the code.

## Sections

- [Concepts](1.concepts/) — how the pipeline, the map, the camera and the labels work, and why.
- [Guides](2.guides/) — rendering your own trip, and adding a language.
- [Architecture decisions](99.adr/) — the decision log.

Install and first run live in the [README](../README.md). The repo's working conventions — stack, tooling, commit format, branching — live in [`CLAUDE.md`](../CLAUDE.md), which is kept byte-identical with `AGENTS.md`.
