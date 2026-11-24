# hike-recap

Renders one portrait video (1080 × 1920, 30 fps, 30 s, H.264) from the GPX tracks of one hiking holiday. The tours draw one after another on a map whose viewport grows: it opens on the first tour and, before each later one, pulls back just far enough to keep everything drawn so far in view. `IntroCard` opens it, `OutroCard` closes it with three figures, both over the live map.

- **No chapters, panels or per-tour statistics.** An earlier build had them and was rejected as too busy. If that layer returns, it returns as a separate variant, not by growing this one.
- **Personal project, rendered locally** (Linux/WSL2): no music, voiceover, web UI or deployment.
- How the parts work and why: [`docs/1.concepts/`](docs/1.concepts/). Decisions: [`docs/99.adr/`](docs/99.adr/).

## Commands

| Command | What it does |
| :--- | :--- |
| `pnpm fetch:geodata` | Build `data/dem/` and `data/geo/` from the GPX — needed before the first ingest |
| `pnpm ingest` | GPX + `data/tours.json` + DEM → `build/tours.compiled.json` |
| `pnpm dev` | Vite preview at <http://localhost:5174> |
| `pnpm render` | Full reel → `out/hike-recap.mp4` |
| `pnpm render:preview` | First 3 s only |
| `pnpm still 0 300 600` | Single frames → `build/stills/` |
| `pnpm test` / `pnpm test:watch` | Vitest |
| `pnpm check` | The gate: `lint` + `format` + `typecheck` + `check:policy`. It does **not** run the tests |
| `pnpm check:fix` | `lint:fix` + `format:fix` (`pnpm format` only checks) |
| `pnpm skills:update` | Update the project-scoped agent skills |
| `pnpm taze` / `pnpm taze:w` | Dependency upgrade check / write |

## Layout

- **`src/lib/`** — pure functions: no Vue, no I/O, no DOM. A function that needs a mock to test belongs elsewhere.
- **`src/util/`** — non-visual logic: camera, schedule, terrain, labels, palette, attribution, easing. `timing.ts` is the chapter planner of the earlier variant and only its test uses it.
- **`src/scene/`** — `Scene.vue` (frame → per-tour draw fraction), `TerrainCanvas.vue` (hillshade and tint, rasterised once), `MapVector.vue` (everything vector), `IntroCard.vue`, `OutroCard.vue`.
- **`scripts/`** — `fetch-geodata.ts`, `ingest.ts`, `render.ts`, `still.ts`. `check-policy-parity.js` ships from the scaffold — **don't touch it**.
- Tests for `lib/` and `util/` live in `src/lib/__tests__/`.

## Render path

- **The render path reads only `build/tours.compiled.json`** and the local fonts. No GPX parsing, network fetch or filesystem walk inside a component.
- **Nothing animates on its own.** No `requestAnimationFrame`, CSS transitions or `setTimeout`: every animated value is a `computed` of the `frame` ref in `src/frame.ts`.
- **Anything asynchronous holds the frame** via `holdFrame(reason)` in `src/render-bridge.ts` — fonts and image decodes included.
- **The camera moves only between tours, never during one.** Layers are built once per framed extent and the zoom is a CSS transform (`transformBetween()`); a view that changes per frame multiplies the render time.
- **Capture stays JPEG**, not PNG (`scripts/render.ts`).
- The video's shape lives in `src/video.ts`, the time budget (2.1 s lead-in, 0.42 s zoom before every tour but the first, 4 s hold) in `Scene.vue`. Change them there, not in the renderer.
- **Verify a rendered frame** (`pnpm still`), not just the preview: there is no system sans-serif, so a font that failed to load falls back to a serif silently.
- ffmpeg comes from `ffmpeg-static`, Chromium from `pnpm exec playwright install --with-deps chromium`. Never work around a missing library with `--no-sandbox`.

## Draw order and pacing

`util/schedule.ts` decides when each tour draws.

- **The tour count lives in `data/tours.json`, nowhere else.** Schedule, views and colours follow from the data.
- **Draw time is proportional to track length**, never an equal split. A test pins the speed spread below 2 %.
- **The head is positioned by path length, never by vertex index** — `pointAtFraction()` reads the same geometry as the dash reveal.
- **`collapseViews()` holds the camera** where a step would barely move it. Keep it: those frames go to drawing and the layers are not rebuilt.
- **Contour pooling and interval follow `view.scale`** (`MapVector`), never a fixed value.

## Labels

`util/labels.ts`, in order: never overlap another label, never sit on a route, never leave the safe area. A *place* that cannot meet all three is kept; a *peak* is dropped.

- **Every summit marker is an obstacle**, not only the label's own.
- **A peak label's box covers its elevation line** — `LabelInput` takes explicit `above` / `below`.
- **Match summits by coordinate, never by name.** Names repeat within a region.
- **Lake names follow the lake:** rotated onto `principalAxis()`; where that does not fit, beside the outline and only directly above or below it, never sideways.

## Data

- **On-screen figures come from `data/tours.json`**, hand-maintained ground truth; its shape is `ToursFile` in `scripts/ingest.ts`. GPX-derived values go into `compiled.tours[].debug` for log comparison — **never render them**.
- **GPX may lack timestamps and `<ele>`** — the shipped ones are bare `<trkpt lat lon>`. Animation is therefore linear along the route, and elevation comes from the DEM at ingest, never from the GPX.
- **Smooth DEM elevation** (moving average, window 7–9) and ignore gains below ~3 m before summing. If `debug.demAscentM` > 1.5 × `stats.ascentM`, the smoothing is too weak.
- GPX are named `data/gpx/YYYY-MM-DD.gpx` and checked in. `data/dem/`, `data/geo/`, `build/`, `out/` and `.env` are gitignored and stay that way.
- `HIKE_DATA_DIR` points ingest and the geodata fetch elsewhere (e.g. the gitignored `data.local/`), so your own tracks never sit in `data/`.

## Derived, never hard-coded

Nothing is calibrated to one trip ([ADR 0005](docs/99.adr/0005-derive-every-constant-from-the-data.md)). Keep these derived:

- **Wording** in `locales/*.json`, picked by `locale` in `tours.json`. Components hold no user-facing string.
- **Attribution** via `attributionFor()` in `util/attribution.ts`.
- **The elevation ramp** stretches to the terrain's range (`hypsometricFor()`).
- **DEM zoom** comes from the extent (`zoomForBounds()`) and travels in the compiled file. **`View` carries its own zoom** — never project at another one.
- **Route colours** extend past the curated twelve instead of wrapping (`routeColours()`).

Traps:

- **Fetch geodata for the extent the camera sees**, not the tracks' bounding box — the portrait frame reaches far beyond a wide route.
- **Reject DEM tiles of another zoom**; `buildGrid` throws on a mixed set.
- **Overpass needs a User-Agent**; Node's default gets a 406.
- **OSM multipolygons arrive as fragments**; `assembleRings()` joins them by endpoint.

## The map

**No map tiles and no map library** — `maplibre-gl` is deliberately not a dependency ([ADR 0003](docs/99.adr/0003-draw-the-map-instead-of-fetching-tiles.md)). The map is drawn from DEM and OSM data, bottom to top: hillshade and hypsometric tint (canvas), land cover, water, contours, routes, labels.

- **The ground tone comes from elevation** (`hypsometric()`), with tagged land cover over it — never from OSM vegetation alone, because alpine pasture is mostly untagged.
- **Attribution is mandatory and shown by default** — one text line in the outro, never a logo. Terrain Tiles mixes its sources by area, so `attributionFor()` emits the always-true lines, adds regional duties from a bounding-box table and appends `attribution` from `tours.json`. Over-crediting on an overlap is intended.

## Conventions

- **Vue 3 with `<script setup>`, never React** — React-based libraries are ruled out too.
- **TypeScript strict, ESM only.** TypeScript stays on 6.x until `vue-tsc` supports 7; `dependabot.yml` ignores the major.
- **oxlint and oxfmt, not eslint/prettier.** Disable a rule per file rather than weakening the global config.
- **Vitest, not Jest**, tests in `__tests__/`.
- **Conventional Commits** via commitlint. No `--no-verify` unless explicitly asked.
- **Node 24, pnpm 12** (`.nvmrc`, `engines`, `packageManager`). Don't loosen `minimumReleaseAge` or `nodeLinker: isolated` in `pnpm-workspace.yaml` without reason.

## Agent policy

- **`.claude/settings.json` and `.codex/rules/default.rules` carry the same block list — change both together.** `pnpm check:policy` proves the parity; a deliberate gap goes into the script's `DELIBERATE` list and the rules-file header.
- **Never allow a rule that runs arbitrary code** — a raw `pnpm dlx`, a `find . *`, an MCP tool that executes SQL.
- **`.tituskirch-skills.json`** configures the [TitusKirch skills](https://github.com/TitusKirch/skills); change it with the `tituskirch-skills-config` skill.

## Branching and CI

- **Work lands on `dev`.** `promotion-pr.yml` keeps the `dev` → `main` promotion PR open; release-please runs on `main`.
- **`promotion-pr.yml` needs a repository setting:** Settings → Actions → General → *Allow GitHub Actions to create and approve pull requests*. Without it no PR ever appears.
- **Changing the branch model moves these together:** `promotion-pr.yml`; `target-branch` and the security-update blocks in `dependabot.yml`; the branch filters in `ci.yml`, `codeql.yml`, `render.yml` and `queue-branch.yml`; `pr.base`, `release.stages` and `work.branch` in `.tituskirch-skills.json`.
- **Keep the duplicated security-update blocks in `dependabot.yml`** — the file says why.
- **`ci.yml` runs on every pull request**, without `paths-ignore`, because `CI / Gate` is a required check. `render.yml` also runs on pushes to `main` and `dev`: it renders the example (three stills and the preview) and caches `data/dem/` and `data/geo/` keyed on the GPX.
- **`release-please-config.json` is strict JSON** — a comment breaks releases silently.
- **Merge PRs with a merge commit, never a squash**, or release-please cuts nothing.
