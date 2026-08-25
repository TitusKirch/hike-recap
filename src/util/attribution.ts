/**
 * Attribution lines for the data actually used.
 *
 * This cannot be fully derived, and the reason is in the data: Terrain Tiles
 * mixes its sources by area. SRTM covers 60°N to 56°S; outside that, and in
 * several countries inside it, other datasets take over — 3DEP in the US,
 * EU-DEM, Kartverket in Norway, the DGM in Austria — each with its own duty to
 * credit. A downloaded tile does not say which one it came from.
 *
 * So: two lines that are always true are emitted automatically, regional ones
 * are matched by bounding box, and `tours.json` can add whatever else applies.
 * The result is deliberately shown by default — a tool that quietly omits
 * attribution makes its users infringe.
 *
 * The table follows Terrain Tiles' own source list. One entry there is left
 * out on purpose: ETOPO1 (NOAA) supplies ocean bathymetry, and this renders
 * land relief for a walked track. Add it to `attribution` in `tours.json` for
 * a coastal trip if the sea floor is visibly part of the frame.
 */
import type { Bounds } from '@/lib/geo.ts';

export type AttributionSource = {
  /** Rough box: minLat, minLon, maxLat, maxLon. */
  box: [number, number, number, number];
  text: string;
};

/**
 * Regional obligations for the terrain tiles, coarse on purpose.
 *
 * A box that merely overlaps the area is enough to require the credit — over-
 * crediting is harmless, under-crediting is not.
 */
export const REGIONAL: AttributionSource[] = [
  {
    // Copernicus covers the whole of Europe, so it fires alongside the national
    // entries below rather than instead of them.
    box: [34.0, -25.0, 72.0, 45.0],
    text: 'Produced using Copernicus data and information funded by the European Union - EU-DEM layers.'
  },
  {
    box: [46.3, 9.5, 49.1, 17.2],
    text: '© offene Daten Österreichs – Digitales Geländemodell (DGM) Österreich.'
  },
  {
    box: [57.9, 4.0, 71.4, 31.6],
    text: '© Kartverket'
  },
  {
    box: [49.8, -8.2, 61.0, 1.8],
    text: '© Environment Agency copyright and/or database right 2015. All rights reserved.'
  },
  {
    box: [24.4, -125.0, 49.5, -66.9],
    text: '3DEP data courtesy of the U.S. Geological Survey'
  },
  {
    box: [14.5, -118.4, 32.7, -86.7],
    text: 'Source: INEGI, Continental relief, 2016'
  },
  {
    box: [41.7, -141.0, 83.1, -52.6],
    text: 'Contains information licensed under the Open Government Licence – Canada.'
  },
  {
    box: [-47.3, 166.4, -34.0, 178.6],
    text: 'Copyright 2011 Crown copyright (c) Land Information New Zealand and the New Zealand Government.'
  },
  {
    box: [-43.7, 112.9, -10.0, 153.7],
    text: '© Commonwealth of Australia (Geoscience Australia) 2017.'
  },
  {
    box: [60.0, -180.0, 90.0, 180.0],
    text:
      'DEM(s) were created from DigitalGlobe, Inc., imagery and funded under ' +
      'National Science Foundation awards 1043681, 1559691, and 1542736.'
  }
];

/** Always true: OSM supplies every label and area, SRTM the global elevation. */
export const ALWAYS = [
  'SRTM data courtesy of the U.S. Geological Survey',
  '© OpenStreetMap'
];

const overlaps = (bounds: Bounds, box: AttributionSource['box']): boolean => {
  const [minLat, minLon, maxLat, maxLon] = box;
  return (
    bounds.minLat <= maxLat &&
    bounds.maxLat >= minLat &&
    bounds.minLon <= maxLon &&
    bounds.maxLon >= minLon
  );
};

/**
 * @param extra lines from `tours.json`, for sources this table cannot know
 */
export function attributionFor(
  bounds: Bounds,
  extra: readonly string[] = []
): string[] {
  const regional = REGIONAL.filter((s) => overlaps(bounds, s.box)).map(
    (s) => s.text
  );
  return [...new Set([...ALWAYS, ...regional, ...extra])];
}

/**
 * Geometry of the attribution strip at the foot of the frame.
 *
 * The strip has to hold every line the data obliges, and that count is not
 * fixed: a walk in the Alps owes SRTM, OSM, Copernicus and the Austrian DGM
 * where a coastal one owes two lines. Set on one line it ran off both edges of
 * the frame as soon as a fourth credit appeared — so it wraps, and the labels
 * above it have to know how much room that leaves.
 *
 * The wrap is estimated rather than measured, deliberately: measuring means a
 * DOM read per frame, and everything in this scene has to be derivable before
 * the first paint.
 */
export const STRIP = {
  fontSize: 14,
  lineHeight: 1.4,
  paddingY: 8,
  paddingX: 16,
  /** Distance from the strip's own foot to the frame's. */
  bottom: 24,
  /** Clearance kept between the strip and the lowest label. */
  gap: 24,
  separator: ' · '
};

export type StripLayout = {
  /** How many lines the joined text wraps onto. */
  lineCount: number;
  /** Height of the whole strip, padding included. */
  height: number;
  /** Lowest y a label may occupy without touching the strip. */
  labelBottom: number;
};

/**
 * @param lines the attribution lines, unjoined
 * @param frameWidth the frame's width in pixels
 * @param frameHeight the frame's height in pixels
 * @param measure width of a string at the strip's font size; overridable so a
 *   test can pin the wrap without depending on the estimator's constants
 */
export function layoutAttribution(
  lines: readonly string[],
  frameWidth: number,
  frameHeight: number,
  measure: (text: string) => number = (text) =>
    text.length * STRIP.fontSize * 0.52
): StripLayout {
  const available = frameWidth - STRIP.bottom * 2 - STRIP.paddingX * 2;
  const words = lines
    .join(STRIP.separator)
    .split(' ')
    .filter((w) => w !== '');

  let lineCount = words.length === 0 ? 0 : 1;
  let current = '';
  for (const word of words) {
    const candidate = current === '' ? word : `${current} ${word}`;
    if (current !== '' && measure(candidate) > available) {
      lineCount += 1;
      current = word;
    } else {
      current = candidate;
    }
  }

  const height =
    lineCount * STRIP.fontSize * STRIP.lineHeight + STRIP.paddingY * 2;
  return {
    lineCount,
    height,
    labelBottom: frameHeight - STRIP.bottom - height - STRIP.gap
  };
}
