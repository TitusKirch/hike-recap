# CLAUDE.md

This file provides guidance to AI coding agents — Claude Code (claude.ai/code) and vendor-neutral tools such as Codex, OpenCode, Cursor, and Copilot — when working with code in this repository.

## Agent instruction files

`CLAUDE.md` and `AGENTS.md` are kept **byte-identical**. `CLAUDE.md` is what Claude Code reads; `AGENTS.md` is what vendor-neutral agent tools read. Two real files, deliberately not a symlink: not every tool resolves one.

**After editing either file, copy it over the other — don't repeat the edit by hand:**

```bash
cp CLAUDE.md AGENTS.md   # or the reverse, whichever you just edited
```

Retyping a change is exactly how the two drift; one reflowed line is enough. `diff CLAUDE.md AGENTS.md` must print nothing. If it ever does, treat it as a defect and fix it by letting one file win wholesale — never by merging them.

## What this repo is

`hike-recap` renders **one portrait video** (1080 × 1920, 30 fps, 30 s, H.264) from the GPX tracks of a single hiking holiday. The tours appear one after another on a map whose **viewport grows**: it opens framed on the first tour alone, and before each later tour pulls back just far enough that everything drawn so far still fits. Tours stay once drawn, so the frame widens as the holiday accumulates.

A title card opens it and three figures close it. In between there are deliberately no chapters, no panels and no per-tour statistics: an earlier build cut to each tour with its own title, elevation profile and numbers, and was rejected as too busy. If that layer ever comes back, it comes back as a *variant*, not by growing this one.

`IntroCard` and `OutroCard` sit over the live map rather than on separate slides — the lead-in and hold-out of the schedule double as their airtime.

It is a **personal memory project, not a product**. No music, no voiceover, no web UI, no deployment — rendering happens locally on the author's machine (Linux/WSL2). Scope decisions should stay anchored to that: this repo renders one specific reel about one specific trip, not a generic GPX-video toolkit.

## Commands

| Command | What it does |
| :--- | :--- |
| `pnpm install` | Install deps and wire husky hooks via the `prepare` script |
| `pnpm ingest` | `data/gpx/*.gpx` + `data/tours.json` + `data/dem/` → `build/tours.compiled.json` |
| `pnpm fetch:geodata` | Fetch `data/geo/` and `data/dem/` for the area the GPX cover — **run before the first ingest** |
| `pnpm dev` | Vite preview of the scene at <http://localhost:5174> |
| `pnpm render` | Render the full reel to `out/hike-recap.mp4` |
| `pnpm render:preview` | Render only the first 3 s — the fast feedback loop |
| `pnpm still 200 900` | Write single frames to `build/stills/` — the fastest way to inspect a chapter |
| `pnpm test` | Vitest unit tests (`vitest run`) |
| `pnpm test:watch` | Vitest in watch mode |
| `pnpm typecheck` | `vue-tsc --noEmit` |
| `pnpm lint` | `oxlint . --deny-warnings` |
| `pnpm format` | `oxfmt --check .` (note: `format` is the check, not the fix) |
| `pnpm check` | `lint` + `format` + `typecheck` + `check:policy` — the CI gate |
| `pnpm check:policy` | Proves the two agent policy files ban the same commands |
| `pnpm lint:fix` / `pnpm format:fix` / `pnpm check:fix` | The auto-fixing variants |
| `pnpm skills:update` | Update project-scoped agent skills via the skills.sh CLI |
| `pnpm taze` / `pnpm taze:w` | Interactive dependency upgrade check / write |

## Architecture

Three layers, deliberately separated:

- **`src/lib/`** — pure functions. No Vue, no I/O, no DOM. `parse.ts` (GPX → normalised point series), `smooth.ts` (elevation moving average + threshold filter), `aggregate.ts` (Σ km / ↑ / ↓ / time), `geo.ts` (bounds, haversine distance, Douglas-Peucker wrapper). Everything here is unit-tested under `src/lib/__tests__/`. If a function needs a mock to test, it probably belongs in one of the other two layers.
- **`src/scene/`** — just three files. `Scene.vue` turns the frame number into a per-tour draw fraction; `TerrainCanvas.vue` rasterises hillshade and hypsometric tint once; `MapVector.vue` draws contours, land cover, water, routes and labels.
- **`src/util/`** — the non-visual logic: `camera.ts` (projection, view transform), `schedule.ts` (which tour is drawn when), `terrain.ts` (marching squares, hillshade, hypsometric ramp), `labels.ts` (collision-avoided placement), `easing.ts`. `timing.ts` holds the chapter planner from the earlier variant and is currently unused. Tested alongside `lib/`.
- **`scripts/`** — glue. `ingest.ts` reads GPX and `tours.json`, calls into `lib/`, writes `build/tours.compiled.json`. `render.ts` drives the browser and ffmpeg. `check-policy-parity.js` ships from the scaffold — **don't touch it**.

**The render path reads only `build/tours.compiled.json`.** No GPX parsing, no network fetch, no filesystem walk inside a component — every frame must be reproducible from that one file plus map tiles. This is what keeps rendering deterministic and fast.

## How rendering works

There is no video framework. The scene is an ordinary Vue app that Vite serves, and `scripts/render.ts` turns it into an MP4:

1. Vite serves the scene; Playwright opens it at exactly 1080 × 1920.
2. For each frame `n`: call `window.__setFrame(n)`, wait for `window.__frameReady`, screenshot `#scene`.
3. Each JPEG is piped straight into ffmpeg's stdin — 1800 files on disk would be gigabytes of pointless I/O.

### Two things that decide the render time

Both were measured, and both cost more than they look:

- **The camera may only move between tours, never during one.** Contours, land cover, routes and labels are `computed` over the view, and rasterising them costs seconds. Layers are therefore built once per *framed extent* — ten times, not 1800 — and the zoom itself is a CSS transform over the finished result (`transformBetween()`). An earlier variant nudged the view every frame and pushed a full render past ten minutes.
- **Capture is JPEG, not PNG.** Encoding a 1080 × 1920 PNG costs ~260 ms per frame against ~95 ms for JPEG at quality 95. H.264 recompresses either way, so the difference is invisible — but it is the difference between five minutes and twenty.

A full render currently runs at ~7 fps, so about four and a half minutes.

**Nothing in the scene animates on its own.** No `requestAnimationFrame`, no CSS transitions, no `setTimeout`. Every animated value is a `computed` derived from the `frame` ref in `src/frame.ts`. A value that moves on wall-clock time instead of frame number will tear or stutter in the output, because the renderer takes ~100 ms of wall-clock time per frame while advancing the timeline by 1/30 s.

**Anything asynchronous must hold the frame.** `holdFrame(reason)` in `src/render-bridge.ts` returns a release function; until every hold is released, `__frameReady` stays false and the renderer waits. Fonts and any image decode need this. Since the map is drawn from local data rather than fetched, there is far less to wait for than a tile-based map would need — but the guard stays, because a font that loads one frame late silently reflows every label.

`pnpm render:preview` renders 3 s instead of 60 s. Use it while iterating; the full render is ~3 minutes at roughly 10 fps.

## Draw order and pacing

`util/schedule.ts` decides when each tour is drawn. The one rule that matters:

**The tour count lives in `data/tours.json`, nowhere else.** Adding a tour means dropping its GPX into `data/gpx/`, adding the entry, and running `pnpm ingest` — the schedule, the viewport sequence and the colour palette all follow from the data. Route colours scale too: `routeColours(count)` in `util/palette.ts` hands out the curated twelve and then extends along the hue circle, so a thirteenth tour gets its own colour instead of repeating one.

**Slots are proportional to track length, never an equal split.** Ten equal shares made the drawing head sprint through the 11.4 km tour and crawl along the 4.9 km one — the single most obvious flaw in an earlier cut. A test pins the resulting speed spread below 2 %.

**The head is positioned by path length, never by vertex index.** `stroke-dashoffset` reveals a fraction of the path's *length*; picking a vertex by index instead drifts, because Douglas-Peucker leaves vertices dense in bends and sparse on straights. Measured against the real tracks that put the dot 4.2 % of the route — some 467 m — away from the line's end. `pointAtFraction()` and the dash reveal now read the same geometry.

**The camera holds still where a step would barely move it.** A tour lying inside the frame already shown widens it by nothing — five of this trip's eleven steps came out at zoom 1.000 and a shift under 6 px, which reads as a twitch rather than a move. `collapseViews()` reuses the previous view for those, so the step animates nothing, its frames go to drawing instead, and the layers keyed on the framed extent are not rebuilt. Twelve tours currently need only seven distinct views.

**Contour detail follows the zoom.** The DEM is a fixed z13 raster, so a tight frame magnifies it heavily; pooling 3× at 50 m spacing leaves a close view almost blank. `MapVector` picks the pooling factor and contour interval from `view.scale`.

## Label rules

Labels follow three rules, in order: never overlap another label, never sit on a route, never leave the safe area. Where a *place* cannot satisfy all three it is kept anyway (the halo carries it, and places are the orientation); a *peak* is dropped instead — a peak that cannot be placed cleanly is worth less than a clean frame. `util/labels.ts` is a pure function with its own tests, because overlapping labels were the most visible defect in every prototype.

Three traps, all hit at least once:

- **Every summit marker is an obstacle, not just a label's own.** `placeLabels` keeps a label off the marker it belongs to; without adding the others, one peak's name lands on a neighbour's triangle.

- **A label's bounding box must cover its elevation line.** A peak label is a name *and* a `1234 m` line underneath. Sizing the box from the name alone is exactly how routes end up drawn through the elevation text — `LabelInput` therefore takes explicit `above` / `below` rather than one height.
- **Match summits by coordinate, never by name.** Peak names repeat within a region — a dozen did in the first area this ran on. Name matching labelled every peak sharing a name with a climbed one, and printed one's elevation on the other.

**Lake names follow the lake.** Set level, a name only fits a lake that happens to be *wide*; rotated onto the outline's principal axis (`principalAxis()`, a closed-form 2×2 PCA) it fits whenever the lake is *long*, which most are. Where even that does not fit — a long lake can still be only 70 px against a 133 px name — the name moves beside the outline instead, and there it may only go directly above or below. Allowed to slide sideways like a place name it drifts far enough to read as naming the *neighbouring* lake, which is worse than leaving it off.

## Ground truth vs. GPX

The stats shown on screen come from **`data/tours.json`**, which is hand-maintained. Values computed from the GPX go into `compiled.tours[].debug` and are for **comparison in logs only** — never render them.

This split exists because the source GPX are Rother app exports: tracks **without per-point timestamps and without `<ele>` elevation**. Verified across every file — they are bare `<trkpt lat lon>` pairs. Consequences:

- Track animation is **linear along the route**, never time-based.
- **Elevation comes from the DEM**, resolved at ingest time and cached into the compiled JSON — never from the GPX, because it isn't in there.
- DEM-derived elevation is 30 m raster and noisy in steep terrain: smooth it (moving average, window 7–9) and ignore gains below ~3 m before summing. Sanity check: if `debug.demAscentM` > 1.5 × `stats.ascentM`, the smoothing is too weak.
- GPX distances are a sanity check only.

## Nothing is calibrated to one trip

The renderer takes GPX plus a `tours.json` and works out the rest. Six things
used to be constants and are now derived — leave them that way:

- **Wording** lives in `locales/*.json`, picked by the `locale` tag in
  `tours.json`. German and English ship. Components never hold a user-facing
  string.
- **Attribution** is resolved at ingest from the area (`util/attribution.ts`).
  See below — this one cannot be fully automated.
- **The elevation ramp** stretches to the terrain's own range
  (`hypsometricFor`). Fixed metres worked for one region only: a 0–200 m coastal
  walk fell on the first stop and rendered flat green.
- **DEM zoom** comes from the extent (`zoomForBounds`) and travels in the
  compiled file, because ingest, geodata fetch and the scene must agree on the
  pixel space. Fixed at 13, a 200 km trail would pull thousands of tiles.
- **Route colours** extend past the curated twelve instead of wrapping
  (`util/palette.ts`), skipping the green band that would vanish into the ground.
- **`data/dem/` and `data/geo/` are not in git.** They are region-specific and
  reproducible from the GPX. `pnpm fetch:geodata` builds them; a fresh clone
  needs it before the first ingest.
- **`HIKE_DATA_DIR`** points ingest and the geodata fetch at another directory,
  so your own tracks never sit in `data/` where the example lives.

### Three traps a second region exposed

All three were invisible while only one area existed:

- **Fetch for the extent the camera sees, not the bounding box of the tracks.**
  The frame is portrait; a wide, shallow route is fitted to the width and the
  view then reaches far above and below it. Fetching only the track box leaves
  bare relief with land cover ending mid-frame.
- **`View` carries its own zoom.** Building a view at one zoom and projecting at
  another places everything off-screen — and silently, since nothing throws.
- **Stale tiles of another zoom must be rejected.** Tile x/y mean different
  things per zoom, so a mixed set spans both coordinate systems and allocates a
  grid orders of magnitude too large; `buildGrid` now says so instead of dying
  with an allocation failure.
- **Overpass needs a User-Agent.** Node's default agent gets a flat 406, so the
  fetch script never worked until this was set — the first dataset had to be
  pulled by hand.

### Attribution cannot be fully derived

Terrain Tiles **mixes its sources by area** — SRTM covers 60°N to 56°S, with
3DEP, EU-DEM, Kartverket and others taking over elsewhere, each with its own
duty to credit — and a downloaded tile does not record which one it came from.
So `attributionFor()` emits the two lines that are always true, matches regional
duties against a coarse bounding-box table, and appends anything listed under
`attribution` in `tours.json`. It over-credits on an overlap by design.

**The line is shown by default and that is not decoration.** A tool that
silently drops attribution makes its users infringe.

## Data model

`data/tours.json` — hand-maintained ground truth:

```jsonc
{
  "title": "…",
  "region": "…",
  "locale": "de-DE",           // names a bundle under locales/
  "attribution": [],           // extra lines the built-in table cannot know
  "period": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" },
  "tours": [
    {
      "id": "day-1-…",          // kebab-case, stable
      "date": "YYYY-MM-DD",
      "title": "…",
      "gpx": "2026-08-07.gpx",  // relative to data/gpx/
      "distanceKm": 0,
      "ascentM": 0,
      "descentM": 0,
      "durationMin": 0
    }
  ]
}
```

`build/tours.compiled.json` — generated, gitignored. Per tour: `stats` (from `tours.json`), simplified `points`, `bounds`, `elevationProfile`, `summits` (resolved to coordinates) and `debug`. Plus top-level `title`, `region`, `locale`, `attribution`, `demZoom`, `period` (with `totalDays` and `days`), `bounds` and `aggregate`.

GPX files are named by date (`data/gpx/YYYY-MM-DD.gpx`) and are checked in — they're the irreplaceable source data.

## Conventions

- **Vue 3 with `<script setup>`, never React.** This is a hard preference, and it rules out React-based libraries wholesale — Remotion was evaluated for the render layer and rejected on exactly these grounds. If the obvious tool for a job is React-based, find the Vue or vanilla equivalent, or build the small piece by hand.
- **TypeScript strict, ESM.** `"type": "module"`; `moduleResolution: bundler`. No CommonJS. TypeScript is pinned to 5.x — `vue-tsc` does not yet work with the TypeScript 7 native port.
- **oxc, not eslint/prettier.** Linting via `oxlint` (`.oxlintrc.json`), formatting via `oxfmt` (`.oxfmtrc.json`). Don't swap them out. If a rule fights a specific file, disable it per-file rather than weakening the global config.
- **Vitest, not Jest.** Tests live next to the code they cover, in `__tests__/`.
- **No runtime fetches in the render path** — fonts are local `.woff2` under `src/assets/fonts/`, data is the compiled JSON. Map tiles are the one network dependency, and they need an API key. There is no system sans-serif in this environment, so an unloaded font silently falls back to a serif: always verify a rendered frame, not just the preview.
- **Conventional Commits** enforced via commitlint. Don't use `--no-verify` unless explicitly asked.
- **Node 24, pnpm 11.** Pinned via `.nvmrc`, `engines`, `packageManager`. `pnpm-workspace.yaml` enforces a 3-day release cooldown (`minimumReleaseAge=4320`) and an isolated node-linker. Don't loosen these without reason.
- **No committed artefacts** — `build/`, `out/`, `.env` and `node_modules` are gitignored and stay that way.

## The map is drawn, not fetched

**There are no map tiles and no map library.** Every tile provider's free tier either brands the map with a logo or restricts video use, so the map is built from raw geodata instead and drawn as SVG plus one canvas layer. That removes the API key, the quota, the logo and the network dependency in one move — and it is why `maplibre-gl` is *not* a dependency.

The look is deliberately abstract: near-black ground, glowing routes, fine contour lines, sparse uppercase labels. Layers, bottom to top:

1. **Hillshade** — computed from the DEM into a `<canvas>`. This is what makes mountains read as mountains.
2. **Water** — lake polygons from OSM, as flat dark shapes.
3. **Contours** — marching squares over the DEM grid. The renderer emits raw segments rather than stitched paths; at these stroke widths the result is visually identical and far simpler.
4. **Routes** — the tracks, current tour glowing in the accent colour, the others dimmed.
5. **Labels** — places and peaks, greedy collision-avoided, capped at ~20 per view.

**Contour density is tied to the chapter.** The overview runs at 50 m spacing and stays calm; a tour chapter switches to 25 m, so zooming in visibly thickens the terrain.

**Green is the base colour, rock is the exception.** Drawing only OSM-tagged vegetation looks wrong here: alpine pasture is largely untagged, so most of the map fell back to bare cream and read as scree. The ground tone therefore comes from *elevation* (`hypsometric()` in `util/terrain.ts`), with tagged woodland painted over it.

### Data sources and attribution

- **Elevation** — Terrain Tiles (`s3.amazonaws.com/elevation-tiles-prod`, terrarium encoding: `(R * 256 + G + B / 256) - 32768`). Attribution is **mandatory**, e.g. *"SRTM data courtesy of the U.S. Geological Survey"* and, for the Austrian part, *"© offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich"*.
- **Places, peaks, lakes, land cover** — Overpass, result checked in under `data/geo/`. Needs *"© OpenStreetMap"*.

`pnpm fetch:geodata` refetches all of it, deriving the area from the GPX themselves. It is not part of the build — the data is committed — but it keeps the provenance reproducible. One thing it must keep doing: **OSM multipolygons arrive as separate shoreline fragments**, and closing each one on its own turns a lake into a fan of triangles. `assembleRings()` joins them by matching endpoints.

All of it is one small text line in the outro — deliberately not a logo on the map. Fetching happens **only at ingest time**; the render path never touches the network.

## AI & skills

- **`.claude/settings.json`** ships the scaffold's baseline permission policy — a long `deny` list, a short `allow` list. `.claude/settings.local.json` (per-machine overrides) is gitignored.
- **`.codex/rules/default.rules`** carries the same policy for Codex, in Starlark. Permission config is not portable, so the block list exists twice and **both must be changed together**. `pnpm check:policy` (`scripts/check-policy-parity.js`) machine-checks the parity in both directions, so "we changed both" is a number rather than a claim. Deliberate gaps must be declared in the script's `DELIBERATE` list and in the rules-file header.
- **Never allow a rule that runs arbitrary code.** A raw `pnpm dlx`, a `find . *` (which covers `-delete` and `-exec rm`), or an MCP tool that executes SQL hands back everything the `deny` list took away. A deny list is only as strong as the weakest allow rule beside it.
- **`.tituskirch-skills.json`** configures the [TitusKirch skills](https://github.com/TitusKirch/skills) per repo. It is runtime config, not an installer — regenerate it with the `tituskirch-skills-config` skill. Install the bundle with `pnpm dlx skills add TitusKirch/skills`.

## Branching model

**`dev` → `main`, as in every other repo here.** Work lands on `dev`; `dev-pr.yml` keeps a draft rollup PR into `main` open, and marking it ready is what lets release-please cut. The same shape as `scaffold`, `envprism`, `glimpse` and `forgemap` — the value is not the staging step, it is that one convention holds across all of them and no repo has to be remembered as the exception.

This was briefly main-only and has been converted back. If it is ever converted again, six things move together: `.github/workflows/dev-pr.yml`, the `target-branch` lines and the security-update blocks in `.github/dependabot.yml`, `INTEGRATION_BRANCH` in `fast-forward-queue.yml`, the `on: branches:` filters in `ci.yml` and `codeql.yml`, and `pr.base` / `release.stages` / `work.branch` in `.tituskirch-skills.json`.

**`dev-pr.yml` needs a repository setting, not just the workflow.** Settings → Actions → General → *Allow GitHub Actions to create and approve pull requests*. Without it the job fails with `GitHub Actions is not permitted to create or approve pull requests` and no rollup PR ever appears — the workflow looks installed and does nothing. `default_workflow_permissions` can stay at `read`: every workflow here declares its own `permissions:` block.

**The duplicated dependabot blocks are load-bearing, not a leftover.** Setting `target-branch` switches off `labels` and `commit-message` for *security* updates, which always target the default branch. The second set of blocks re-declares each ecosystem without `target-branch` so those settings apply there too, with `open-pull-requests-limit: 0` to keep version updates out of them.

**CI also runs on pushes to `main` and `dev`, not only on pull requests.** Gated on pull requests alone, a broken gate on the integration branch stays invisible — which is exactly how a typecheck that failed on every PR went unnoticed.

**If a PR is ever used, merge it with a merge commit, never a squash** — squashing collapses the individual `feat:`/`fix:` commits into the PR's own `chore:` title, and release-please then cuts nothing. Conventional Commits are not optional either way.

## Rendering notes

- Output spec: 1080 × 1920, 30 fps, 900 frames, H.264 CRF 18, `-pix_fmt yuv420p`, `-movflags +faststart`. The numbers live in `src/video.ts`; change them there, not in the renderer.
- Budget: 2.1 s intro, a 0.42 s zoom-out before each tour but the first, the rest drawing at constant speed, 4 s outro. Thirty seconds, not sixty: a silent, steady animation loses people long before a minute is up.
- **CI renders the bundled example on every push and PR** (`.github/workflows/render.yml`) — three stills plus the 3-second preview, uploaded as an artefact. The unit tests cover the pure functions and structurally cannot see a serif fallback, blank terrain or a projection error; a rendered frame can. `data/dem/` and `data/geo/` are cached there, keyed on the GPX, so Overpass is contacted only on a cache miss.
- ffmpeg comes from the `ffmpeg-static` npm package — no system install. Chromium comes from Playwright (`pnpm exec playwright install --with-deps chromium`), which also pulls the system libs WSL2 needs. Don't work around a missing library with `--no-sandbox`.
