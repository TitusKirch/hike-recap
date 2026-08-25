/**
 * data/gpx/*.gpx + data/tours.json + data/dem/*.png → build/tours.compiled.json
 *
 * Everything the render path needs ends up in that one file. Elevation comes
 * from the DEM because the GPX have none, and the DEM-derived stats are kept
 * only under `debug` — what the video shows always comes from tours.json.
 */
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile
} from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aggregate, dateRange, daysBetween } from '@/lib/aggregate.ts';
import {
  buildGrid,
  sampleElevation,
  type DemGrid,
  type TileKey
} from '@/lib/dem.ts';
import {
  boundsOf,
  cumulativeDistances,
  mergeBounds,
  simplify,
  trackLength
} from '@/lib/geo.ts';
import { parseGpx } from '@/lib/parse.ts';
import { attributionFor } from '@/util/attribution.ts';
import { zoomForBounds } from '@/util/camera.ts';
import { decodePng } from '@/lib/png.ts';
import { elevationGain, movingAverage } from '@/lib/smooth.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** `data` by default; HIKE_DATA_DIR points it elsewhere. */
const DATA = process.env.HIKE_DATA_DIR ?? 'data';
const OUT = resolve(ROOT, 'build/tours.compiled.json');

/** Keeps animation smooth without turning a ridge into a polygon. */
const SIMPLIFY_TOLERANCE_PX = 0.6;
const SMOOTHING_WINDOW = 9;
const GAIN_THRESHOLD_M = 4;
/** Peaks nearer than this to the track count as climbed — see CLAUDE.md. */
const SUMMIT_RADIUS_M = 200;

type TourInput = {
  id: string;
  date: string;
  title: string;
  gpx: string;
  distanceKm: number;
  ascentM: number;
  descentM: number;
  durationMin: number;
  summits?: string[];
};
type ToursFile = {
  title: string;
  region: string;
  period: { from: string; to: string };
  /** BCP-47 tag naming a bundle under locales/. Defaults to German. */
  locale?: string;
  /** Extra attribution lines for sources the built-in table cannot know. */
  attribution?: string[];
  tours: TourInput[];
};

async function loadDem(): Promise<DemGrid> {
  const dir = resolve(ROOT, DATA, 'dem');
  const names = (await readdir(dir)).filter((n) => n.endsWith('.png'));
  if (names.length === 0) {
    throw new Error('no DEM tiles in data/dem — elevation profiles need them');
  }
  // the newest zoom present wins; older tiles are leftovers from another area
  const zooms = names.map((n) => Number(n.split('_')[0]));
  const zoom = Math.max(...zooms);
  const wanted = names.filter((n) => Number(n.split('_')[0]) === zoom);
  if (wanted.length < names.length) {
    console.warn(
      `  ⚠ ${names.length - wanted.length} DEM-Kacheln anderer Zoomstufen ignoriert ` +
        `(z${[...new Set(zooms)].filter((z) => z !== zoom).join(', z')})`
    );
  }
  const tiles = await Promise.all(
    wanted.map(async (name) => {
      const [z, x, y] = name.replace('.png', '').split('_').map(Number);
      const key: TileKey = { z: z!, x: x!, y: y! };
      const { rgb } = decodePng(await readFile(resolve(dir, name)));
      return { key, rgb };
    })
  );
  return buildGrid(zoom, tiles);
}

function fmt(n: number, width: number): string {
  return String(n).padStart(width);
}

/** Closest approach of a track to a point, in metres. */
function nearestDistance(
  target: { lat: number; lon: number },
  track: ReadonlyArray<{ lat: number; lon: number }>
): number {
  let best = Infinity;
  for (const p of track) {
    const d = Math.hypot(
      (target.lat - p.lat) * 111_320,
      (target.lon - p.lon) * 75_000
    );
    if (d < best) {
      best = d;
    }
  }
  return best;
}

async function main(): Promise<void> {
  const doc = JSON.parse(
    await readFile(resolve(ROOT, DATA, 'tours.json'), 'utf8')
  ) as ToursFile;

  const grid = await loadDem();
  console.info(`DEM ${grid.width}×${grid.height} px at z${grid.zoom}\n`);

  const labels = JSON.parse(
    await readFile(resolve(ROOT, DATA, 'geo/labels.json'), 'utf8')
  ) as {
    places: Array<{ n: string; lat: number; lon: number; rank: number }>;
    peaks: Array<{ n: string; lat: number; lon: number; ele: number }>;
  };

  console.info(
    'Tour                    pts   km(gpx/soll)     ↑ dem/soll    ↓ dem/soll  ele'
  );
  const compiled = [];
  for (const tour of doc.tours) {
    const xml = await readFile(resolve(ROOT, DATA, 'gpx', tour.gpx), 'utf8');
    const parsed = parseGpx(xml);
    if (parsed.points.length < 2) {
      throw new Error(`${tour.gpx} has no usable track`);
    }

    const points = simplify(parsed.points, SIMPLIFY_TOLERANCE_PX);
    const cum = cumulativeDistances(points);
    const rawEle = points.map((p) => sampleElevation(grid, p));
    const covered = rawEle.filter((e) => e !== null).length;
    const filled = rawEle.map(
      (e, i) => e ?? rawEle.find((v, j) => v !== null && j >= i) ?? 0
    );
    const smoothed = movingAverage(filled, SMOOTHING_WINDOW);
    const gain = elevationGain(smoothed, GAIN_THRESHOLD_M);

    const gpxKm = trackLength(parsed.points) / 1000;
    const summits = labels.peaks
      .map((pk) => {
        let best = Infinity;
        for (const p of parsed.points) {
          const d = Math.hypot(
            (pk.lat - p.lat) * 111_320,
            (pk.lon - p.lon) * 75_000
          );
          if (d < best) best = d;
        }
        return { name: pk.n, ele: pk.ele, distanceM: Math.round(best) };
      })
      .filter((s) => s.distanceM <= SUMMIT_RADIUS_M)
      .sort((a, b) => a.distanceM - b.distanceM);

    console.info(
      `${tour.title.padEnd(20)} ${fmt(points.length, 5)}   ` +
        `${gpxKm.toFixed(1)}/${tour.distanceKm.toFixed(1)}      ` +
        `${fmt(gain.ascentM, 4)}/${fmt(tour.ascentM, 4)}     ` +
        `${fmt(gain.descentM, 4)}/${fmt(tour.descentM, 4)}  ` +
        `${Math.round((covered / points.length) * 100)}%`
    );

    compiled.push({
      id: tour.id,
      date: tour.date,
      title: tour.title,
      stats: {
        distanceKm: tour.distanceKm,
        ascentM: tour.ascentM,
        descentM: tour.descentM,
        durationMin: tour.durationMin
      },
      /**
       * Resolved to coordinates, not just names.
       *
       * Summit names repeat within a region — a dozen of them did in the
       * first area this ran on — so matching by name alone puts a label on
       * every peak sharing it, including ones nobody went near. For each name
       * we take the peak the track came closest to.
       */
      summits: (tour.summits ?? summits.map((s) => s.name))
        .map((name) => {
          const matches = labels.peaks
            .filter((pk) => pk.n === name)
            .map((pk) => ({ pk, d: nearestDistance(pk, parsed.points) }))
            .sort((a, b) => a.d - b.d);
          const best = matches[0];
          if (best === undefined) {
            console.warn(
              `  ⚠ ${tour.id}: Gipfel "${name}" nicht in den OSM-Daten`
            );
            return null;
          }
          return { name, lat: best.pk.lat, lon: best.pk.lon, ele: best.pk.ele };
        })
        .filter((s) => s !== null),
      points: points.map((p, i) => ({
        lat: +p.lat.toFixed(6),
        lon: +p.lon.toFixed(6),
        ele: smoothed[i] === undefined ? null : Math.round(smoothed[i]!)
      })),
      bounds: boundsOf(points),
      elevationProfile: points.map((_, i) => ({
        d: Math.round(cum[i]!),
        ele: Math.round(smoothed[i]!)
      })),
      debug: {
        gpxDistanceKm: +gpxKm.toFixed(2),
        demAscentM: gain.ascentM,
        demDescentM: gain.descentM,
        demCoverage: +(covered / points.length).toFixed(3),
        rawPointCount: parsed.points.length,
        hadTimestamps: parsed.hadTimestamps,
        hadElevation: parsed.hadElevation,
        summitCandidates: summits
      }
    });
  }

  const totals = aggregate(compiled);
  const bounds = mergeBounds(compiled.map((t) => t.bounds));
  /**
   * Resolved once, here, and carried in the compiled file.
   *
   * The scene, the geodata fetch and this script must all work in the same tile
   * pixel space; deriving it in three places would be three chances to disagree.
   */
  const demZoom = zoomForBounds(bounds);

  const out = {
    title: doc.title,
    region: doc.region,
    locale: doc.locale ?? 'de-DE',
    attribution: attributionFor(bounds, doc.attribution ?? []),
    demZoom,
    period: {
      ...doc.period,
      totalDays: daysBetween(doc.period.from, doc.period.to),
      days: dateRange(doc.period.from, doc.period.to)
    },
    tours: compiled,
    bounds,
    aggregate: totals,
    geo: {
      landcover: JSON.parse(
        await readFile(resolve(ROOT, DATA, 'geo/landcover.json'), 'utf8')
      ) as unknown,
      water: JSON.parse(
        await readFile(resolve(ROOT, DATA, 'geo/water.json'), 'utf8')
      ) as unknown,
      places: labels.places,
      peaks: labels.peaks
    }
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, `${JSON.stringify(out)}\n`);

  /**
   * Stage the DEM tiles under build/ as well.
   *
   * The scene resolves its data through Vite globs, which take a literal
   * pattern and so cannot follow HIKE_DATA_DIR. Copying here keeps that one
   * path fixed and makes the documented rule literally true: the render path
   * reads build/ and nothing else.
   */
  const demOut = resolve(ROOT, 'build/dem');
  await mkdir(demOut, { recursive: true });
  const demDir = resolve(ROOT, DATA, 'dem');
  const tiles = (await readdir(demDir)).filter((n) => n.endsWith('.png'));
  const existing = new Set(await readdir(demOut));
  for (const name of tiles) {
    if (!existing.has(name)) {
      await copyFile(resolve(demDir, name), resolve(demOut, name));
    }
  }
  for (const stale of existing) {
    if (!tiles.includes(stale)) {
      await rm(resolve(demOut, stale));
    }
  }
  console.info(`  DEM-Kacheln:          ${tiles.length} unter build/dem/`);

  console.info('\nHinweise:');
  const timed = compiled.filter((t) => t.debug.hadTimestamps);
  const eled = compiled.filter((t) => t.debug.hadElevation);
  console.info(
    `  GPX mit Zeitstempeln: ${timed.length === 0 ? 'keine' : timed.map((t) => t.id).join(', ')}`
  );
  console.info(
    `  GPX mit <ele>:        ${eled.length === 0 ? 'keine' : eled.map((t) => t.id).join(', ')}`
  );
  for (const t of compiled) {
    if (t.debug.demAscentM > t.stats.ascentM * 1.5) {
      console.warn(
        `  ⚠ ${t.id}: DEM-Aufstieg ${t.debug.demAscentM} m > 1,5 × ${t.stats.ascentM} m — Glättung zu schwach`
      );
    }
  }
  console.info(`  Sprache:              ${out.locale}`);
  console.info(`  DEM-Zoom:             z${demZoom}`);
  console.info(`  Attribution:          ${out.attribution.length} Zeilen`);
  for (const line of out.attribution) {
    console.info(`    · ${line}`);
  }
  console.info(
    `\n✓ ${OUT}\n  ${compiled.length} Touren · ${totals.distanceKm} km · ` +
      `↑ ${totals.ascentM} m · ↓ ${totals.descentM} m · ${out.period.totalDays} Tage`
  );
}

await main();
