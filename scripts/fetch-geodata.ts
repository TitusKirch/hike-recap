/**
 * Refetches everything under data/geo/ and data/dem/ from public sources.
 *
 * The results are checked in, so this is not part of the normal build — it
 * exists so the data's provenance is reproducible rather than a one-off. Run
 * it if the area changes or a source improves:
 *
 *   pnpm fetch:geodata
 *
 * Sources and their attribution obligations are listed in CLAUDE.md.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { boundsOf, pixelXToLon, pixelYToLat } from '@/lib/geo.ts';
import { viewForBounds, zoomForBounds } from '@/util/camera.ts';
import { HEIGHT, OVER_HEIGHT, OVER_WIDTH } from '@/video.ts';
import { parseGpx } from '@/lib/parse.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** `data` by default; HIKE_DATA_DIR points it elsewhere. */
const DATA = process.env.HIKE_DATA_DIR ?? 'data';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
/**
 * Overpass rejects the default undici agent with 406, and OSM services expect
 * a caller to identify itself. Without this the fetch fails every time — which
 * is why the first dataset for this repo had to be pulled by hand.
 */
const USER_AGENT = 'hike-recap (+https://github.com/TitusKirch/hike-recap)';
const TERRAIN = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
/** Fallback only; the real value comes from the compiled file when present. */
const FALLBACK_ZOOM = 13;

type OverpassElement = {
  type: string;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
  geometry?: Array<{ lat: number; lon: number }>;
  members?: Array<{
    role: string;
    geometry?: Array<{ lat: number; lon: number }>;
  }>;
};

/**
 * Overpass, with retries.
 *
 * The public instances are shared and rate-limited; a 429, 504 or a bare 400
 * under load is routine and usually succeeds moments later. Failing the whole
 * fetch on the first refusal would make this script feel broken when it is only
 * being throttled.
 */
async function overpass(
  query: string,
  attempts = 4
): Promise<OverpassElement[]> {
  let lastError = '';
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const res = await fetch(OVERPASS, {
      method: 'POST',
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      body: new URLSearchParams({ data: query })
    });
    if (res.ok) {
      return (
        ((await res.json()) as { elements?: OverpassElement[] }).elements ?? []
      );
    }
    lastError = `${res.status} ${(await res.text()).slice(0, 120)}`;
    if (attempt < attempts) {
      const wait = attempt * 15;
      console.warn(
        `  Overpass ${res.status}, neuer Versuch in ${wait}s (${attempt}/${attempts})`
      );
      await new Promise((r) => setTimeout(r, wait * 1000));
    }
  }
  throw new Error(`Overpass gab auf: ${lastError}`);
}

/** Ground resolution of one tile pixel, in metres, at a given zoom and latitude. */
const metresPerPixel = (zoom: number, lat: number): number =>
  (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;

/** Shoelace area of a ring in square metres. */
function ringArea(ring: Array<[number, number]>, lat: number): number {
  let a = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    a += x1 * y2 - x2 * y1;
  }
  const scale = 111_320 * 111_320 * Math.cos((lat * Math.PI) / 180);
  return Math.abs(a / 2) * scale;
}

/** Halve the vertex count; 5 m detail is invisible at this scale. */
const thin = (
  g: Array<{ lat: number; lon: number }>
): Array<[number, number]> =>
  g
    .filter((_, i, a) => i % 2 === 0 || i === a.length - 1)
    .map((p) => [+p.lon.toFixed(5), +p.lat.toFixed(5)]);

/**
 * Join relation members into closed rings.
 *
 * OSM multipolygons arrive as separate shoreline fragments. Closing each
 * fragment on its own turns a lake into a fan of triangles rather than a lake —
 * which is exactly what happens without this.
 */
function assembleRings(
  members: NonNullable<OverpassElement['members']>
): Array<Array<{ lat: number; lon: number }>> {
  const key = (p: { lat: number; lon: number }): string =>
    `${p.lon.toFixed(7)},${p.lat.toFixed(7)}`;
  const pool = members
    .filter(
      (m) =>
        m.role !== 'inner' && m.geometry !== undefined && m.geometry.length > 1
    )
    .map((m) => [...m.geometry!]);
  const rings: Array<Array<{ lat: number; lon: number }>> = [];

  while (pool.length > 0) {
    let ring = pool.shift()!;
    let joined = true;
    while (joined && key(ring[0]!) !== key(ring[ring.length - 1]!)) {
      joined = false;
      for (let i = 0; i < pool.length; i += 1) {
        const cand = pool[i]!;
        const end = key(ring[ring.length - 1]!);
        if (key(cand[0]!) === end) {
          ring = ring.concat(cand.slice(1));
        } else if (key(cand[cand.length - 1]!) === end) {
          ring = ring.concat(cand.slice(0, -1).reverse());
        } else {
          continue;
        }
        pool.splice(i, 1);
        joined = true;
        break;
      }
    }
    if (ring.length >= 5) {
      rings.push(ring);
    }
  }
  return rings;
}

function classify(tags: Record<string, string>): string | null {
  const { natural, landuse } = tags;
  if (natural === 'wood' || landuse === 'forest') return 'wood';
  if (natural === 'scrub') return 'scrub';
  if (natural === 'grassland' || landuse === 'meadow') return 'grass';
  if (natural === 'fell' || natural === 'heath') return 'alp';
  if (landuse === 'farmland' || landuse === 'grass') return 'farm';
  if (natural === 'bare_rock' || natural === 'scree' || natural === 'glacier')
    return 'rock';
  if (
    landuse === 'residential' ||
    landuse === 'industrial' ||
    landuse === 'retail'
  )
    return 'built';
  return null;
}

/** Prefer the zoom already chosen by ingest; fall back to computing it. */
async function compiledZoom(
  bounds: ReturnType<typeof boundsOf>
): Promise<number> {
  try {
    const raw = await readFile(
      resolve(ROOT, 'build/tours.compiled.json'),
      'utf8'
    );
    const parsed = JSON.parse(raw) as { demZoom?: number };
    if (typeof parsed.demZoom === 'number') {
      return parsed.demZoom;
    }
  } catch {
    // no compiled file yet — first run, before ingest
  }
  return zoomForBounds(bounds) || FALLBACK_ZOOM;
}

async function main(): Promise<void> {
  const gpxDir = resolve(ROOT, DATA, 'gpx');
  const points = (
    await Promise.all(
      (await readdir(gpxDir))
        .filter((n) => n.endsWith('.gpx'))
        .map(
          async (n) =>
            parseGpx(await readFile(resolve(gpxDir, n), 'utf8')).points
        )
    )
  ).flat();
  const b = boundsOf(points);
  // must match what ingest resolved, or the scene projects into a different
  // pixel space than the tiles were fetched for
  const ZOOM = await compiledZoom(b);
  console.info(`DEM-Zoom: z${ZOOM}`);
  /**
   * Query the area the camera *sees*, not the area the tracks cover.
   *
   * The frame is portrait and the view is fitted to the tracks, so on a wide,
   * shallow route the visible extent reaches well beyond them. Asking Overpass
   * only for the track box leaves land cover ending mid-frame with bare relief
   * above and below it — the same mistake as fetching too few DEM tiles.
   */
  const view = viewForBounds(b, 120, HEIGHT, ZOOM);
  const halfW = OVER_WIDTH / 2 / view.scale;
  const halfH = OVER_HEIGHT / 2 / view.scale;
  const visible = {
    minLon: pixelXToLon(view.centerX - halfW, ZOOM),
    maxLon: pixelXToLon(view.centerX + halfW, ZOOM),
    maxLat: pixelYToLat(view.centerY - halfH, ZOOM),
    minLat: pixelYToLat(view.centerY + halfH, ZOOM)
  };
  const box = [visible.minLat, visible.minLon, visible.maxLat, visible.maxLon]
    .map((v) => v.toFixed(4))
    .join(',');
  console.info(`Sichtbarer Bereich: ${box}`);
  console.info(
    `  ${(visible.maxLon - visible.minLon).toFixed(2)}° × ` +
      `${(visible.maxLat - visible.minLat).toFixed(2)}°\n`
  );

  await mkdir(resolve(ROOT, DATA, 'geo'), { recursive: true });
  await mkdir(resolve(ROOT, DATA, 'dem'), { recursive: true });

  // --- labels ---
  const nodes = await overpass(`[out:json][timeout:180];
    ( node["place"~"^(city|town|village|hamlet)$"](${box});
      node["natural"="peak"]["name"](${box}); );
    out tags center;`);
  const places = nodes
    .filter((e) => e.tags?.place !== undefined && e.tags.name !== undefined)
    .map((e) => ({
      n: e.tags!.name!,
      lat: e.lat!,
      lon: e.lon!,
      rank: { city: 0, town: 1, village: 2, hamlet: 3 }[e.tags!.place!] ?? 3
    }));
  const peaks = nodes
    .filter((e) => e.tags?.natural === 'peak' && e.tags.name !== undefined)
    .map((e) => ({
      n: e.tags!.name!,
      lat: e.lat!,
      lon: e.lon!,
      ele: Math.round(Number(e.tags!.ele ?? 0))
    }));
  await writeFile(
    resolve(ROOT, DATA, 'geo/labels.json'),
    JSON.stringify({ places, peaks })
  );
  console.info(`labels.json     ${places.length} Orte, ${peaks.length} Gipfel`);

  // --- land cover ---
  const areas = await overpass(`[out:json][timeout:300];
    ( way["natural"~"^(wood|scrub|grassland|bare_rock|scree|fell|heath|glacier)$"](${box});
      way["landuse"~"^(forest|meadow|farmland|grass|residential|industrial|retail)$"](${box}); );
    out geom;`);
  /**
   * Drop anything smaller than a few pixels on screen.
   *
   * Coverage varies wildly by region: one area gave 3,500 polygons, another
   * 34,000 for the same map size, most of them under 200 m² — less than a
   * single pixel. Keeping them would bloat the compiled file without changing
   * one rendered frame.
   */
  const midLat = (b.minLat + b.maxLat) / 2;
  const minArea = (metresPerPixel(ZOOM, midLat) * 2) ** 2;
  let dropped = 0;
  const landcover = areas
    .filter((e) => e.geometry !== undefined && e.geometry.length >= 5)
    .map((e) => ({ k: classify(e.tags ?? {}), r: thin(e.geometry!) }))
    .filter(
      (a): a is { k: string; r: Array<[number, number]> } =>
        a.k !== null && a.r.length >= 5
    )
    .filter((a) => {
      if (ringArea(a.r, midLat) >= minArea) {
        return true;
      }
      dropped += 1;
      return false;
    });
  await writeFile(
    resolve(ROOT, DATA, 'geo/landcover.json'),
    JSON.stringify(landcover)
  );
  console.info(
    `landcover.json  ${landcover.length} Flächen ` +
      `(${dropped} unter ${(minArea / 10_000).toFixed(2)} ha verworfen)`
  );

  // --- water, ways and relations ---
  const waterEls = await overpass(`[out:json][timeout:300];
    ( way["natural"="water"](${box}); relation["natural"="water"](${box}); );
    out geom;`);
  const water: Array<{ n: string; ring: Array<[number, number]> }> = [];
  for (const e of waterEls) {
    if (
      e.type === 'way' &&
      e.geometry !== undefined &&
      e.geometry.length >= 5
    ) {
      water.push({ n: e.tags?.name ?? '', ring: thin(e.geometry) });
    } else if (e.type === 'relation' && e.members !== undefined) {
      for (const ring of assembleRings(e.members)) {
        const r = thin(ring);
        if (r.length >= 5) {
          water.push({ n: e.tags?.name ?? '', ring: r });
        }
      }
    }
  }
  await writeFile(resolve(ROOT, DATA, 'geo/water.json'), JSON.stringify(water));
  console.info(`water.json      ${water.length} Flächen`);

  /**
   * DEM tiles for what the camera *sees*, not just for the tracks.
   *
   * The frame is portrait and the view is fitted to the tracks, so on a wide,
   * shallow area the visible extent reaches far above and below them. Fetching
   * only the track bounding box leaves the scene background showing along the
   * top and bottom of every frame — exactly what a wide example route revealed.
   */
  const tile = (px: number): number => Math.floor(px / 256);
  const x0 = tile(view.centerX - halfW);
  const x1 = tile(view.centerX + halfW);
  const y0 = tile(view.centerY - halfH);
  const y1 = tile(view.centerY + halfH);
  console.info(
    `  Sichtfeld ${Math.round(halfW * 2)}×${Math.round(halfH * 2)} px → ` +
      `${(x1 - x0 + 1) * (y1 - y0 + 1)} Kacheln`
  );
  let fetched = 0;
  let cached = 0;
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) {
      const path = resolve(ROOT, DATA, `dem/${ZOOM}_${x}_${y}.png`);
      if (existsSync(path)) {
        cached += 1;
        continue;
      }
      const res = await fetch(`${TERRAIN}/${ZOOM}/${x}/${y}.png`, {
        headers: { 'User-Agent': USER_AGENT }
      });
      if (!res.ok) {
        console.warn(`  Kachel ${x}/${y}: HTTP ${res.status}`);
        continue;
      }
      await writeFile(path, Buffer.from(await res.arrayBuffer()));
      fetched += 1;
    }
  }
  console.info(`data/dem/       ${fetched} geladen, ${cached} vorhanden`);
  console.info(
    '\nAttribution siehe CLAUDE.md → "Data sources and attribution".'
  );
}

await main();
