<div align="center">

# 🥾 hike-recap

**GPX files in, a portrait recap video out — no map service, no API key, no logo in the frame**

</div>

---

```bash
pnpm fetch:geodata && pnpm ingest && pnpm render
```

That's it. Point it at a folder of GPX tracks and it returns a 1080 × 1920 MP4 in which every tour draws itself onto a map that grows to fit them.

## 🤔 Why

Every tile provider's free tier either brands the map with a logo or restricts video use, and their terms are the least interesting thing about a hiking video. So there are no tiles: hillshade and contour lines are computed from public elevation data, land cover and labels come from an OpenStreetMap extract, and everything is drawn as SVG plus one canvas layer. What remains is a small line of attribution — which the data genuinely requires — and nothing else.

## 📦 Install & run

TypeScript, Vue 3 and Vite for the scene; Playwright and ffmpeg for the capture. No video framework and no React.

```bash
pnpm install
pnpm exec playwright install --with-deps chromium
pnpm fetch:geodata   # elevation tiles + OSM extract for the area your GPX cover
pnpm ingest          # GPX + tours.json → build/tours.compiled.json
pnpm render          # → out/hike-recap.mp4
```

> [!IMPORTANT]
> Node 24 and pnpm 11, pinned via `.nvmrc`, `engines` and `packageManager`. Elevation tiles and the OSM extract are **not** committed — they are specific to one region, and `fetch:geodata` rebuilds them from your tracks in a single step.

`data/` ships an eight-stage example walk, so the commands above work on a fresh clone.

> [!TIP]
> `pnpm render:preview` renders the first 3 seconds, and `pnpm still 200 900` writes single frames to `build/stills/`. Both beat waiting out a full render while iterating.

## ✨ Features

- **🗺️ A map without a map server** — no tiles, no key, no quota, no provider branding.
- **🔍 The viewport grows** — it opens framed on the first tour and pulls back before each later one, just far enough that everything already drawn still fits.
- **⏱️ Even pacing** — draw time is proportional to track length, so the moving head keeps a constant speed instead of racing through the long tours.
- **⛰️ Only what you climbed** — summits are named where a track actually passes them, matched by coordinate rather than by name, because peak names repeat within a region.
- **🌍 Any region, any language** — zoom level, elevation ramp, route colours and the attribution line all follow your data; wording comes from a locale file.
- **🧪 Tested core** — 167 Vitest cases over the pure functions, including the label-collision guarantees and the constant-speed rule.

## 📚 Docs

[`docs/`](docs/) holds how the pieces fit together, the guides for feeding it your own trip, and the [decision log](docs/99.adr/).

## 🗂️ Your own tracks

Put GPX files in a directory of your choice with a `tours.json` beside them, then point the scripts at it — so your tracks never sit next to the example, and never end up in a commit by accident:

```bash
HIKE_DATA_DIR=data.local pnpm fetch:geodata && HIKE_DATA_DIR=data.local pnpm ingest
```

Each tour needs a date, a GPX filename and its four figures — distance, ascent, descent and duration. These are what the video shows, and they come from this file rather than from the GPX, because track exports frequently carry no elevation at all and their distances drift. [`data/tours.json`](data/tours.json) is a complete working example.

## ⚙️ Configuration

There is deliberately little to set: zoom, colour ramp, palette and radii are all derived from the tracks.

| Key             | What it controls                                            |
| :-------------- | :---------------------------------------------------------- |
| `locale`        | Which bundle under [`locales/`](locales/) supplies wording. |
| `attribution`   | Extra credit lines the built-in table cannot know.          |
| `HIKE_DATA_DIR` | Which directory holds the GPX, `tours.json` and geodata.    |
| `src/video.ts`  | Resolution, frame rate and length — one number each.        |

### Attribution is not decoration

Terrain tiles mix their sources by area — SRTM globally, with 3DEP, EU-DEM, Kartverket and others taking over in places, each with its own duty to credit — and a downloaded tile does not record which one it came from. So the two lines that always apply are emitted automatically, regional duties are matched against a coarse bounding-box table, and anything else goes in `attribution`. On an overlap it over-credits by design, and the line is shown by default: a tool that quietly drops attribution makes its users infringe.

<details>
<summary>How rendering works</summary>

There is no video framework. Vite serves the scene, Playwright opens it at exactly 1080 × 1920, and for each frame calls `window.__setFrame(n)`, waits for `window.__frameReady`, and screenshots. Each JPEG is piped straight into ffmpeg — 900 files on disk would be gigabytes of pointless I/O.

Nothing in the scene animates on its own: no `requestAnimationFrame`, no CSS transitions, no timers. Every animated value derives from a single frame ref, which is what makes the output deterministic. A value moving on wall-clock time would tear, because the renderer spends far longer than 1/30 s producing each frame.

Two decisions carry the render time, and both were measured. The camera only moves between tours, never during one: contours, land cover and labels are `computed` over the view, so a view that shifts every frame rebuilds all of them 900 times. And capture is JPEG rather than PNG — 95 ms per frame against 260 ms, invisible after an H.264 pass.

</details>

## 🤝 Contributing

PRs welcome. Conventional Commits required (enforced via commitlint). Husky runs the project's linters/formatters on `git commit`.

> [!TIP]
> Run `pnpm check:fix` before pushing — CI will catch what husky missed.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full workflow.

## 🛣️ Versioning

[Semantic Versioning](https://semver.org/) via [release-please](https://github.com/googleapis/release-please) — see [CHANGELOG.md](CHANGELOG.md).

## 📄 License

[MIT](LICENSE) © [Titus Kirch](https://github.com/TitusKirch/) / [IT-Dienstleistungen Titus Kirch](https://kirch.dev)
