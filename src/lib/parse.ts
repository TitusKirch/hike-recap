/**
 * GPX → point series.
 *
 * The Rother exports are bare `<trkpt lat lon>` with no `<ele>` and no `<time>`,
 * so this deliberately reports what a file *did* contain: the ingest logs it,
 * and a file that suddenly has timestamps should be noticed, not silently used.
 */
import type { Point } from './geo.ts';

export type ParsedGpx = {
  name: string | null;
  points: Point[];
  elevations: Array<number | null>;
  hadTimestamps: boolean;
  hadElevation: boolean;
};

const TRACK_POINT =
  /<(?:trkpt|rtept)\s+[^>]*?lat="([-\d.]+)"[^>]*?lon="([-\d.]+)"[^>]*?>/g;
const POINT_WITH_BODY =
  /<(?:trkpt|rtept)\s+[^>]*?lat="([-\d.]+)"[^>]*?lon="([-\d.]+)"[^>]*?(?:\/>|>([\s\S]*?)<\/(?:trkpt|rtept)>)/g;
const ELEVATION = /<ele>\s*([-\d.]+)\s*<\/ele>/;
const TRACK_NAME = /<trk>[\s\S]*?<name>([^<]*)<\/name>/;

export function parseGpx(xml: string): ParsedGpx {
  const points: Point[] = [];
  const elevations: Array<number | null> = [];
  let hadElevation = false;

  POINT_WITH_BODY.lastIndex = 0;
  let match = POINT_WITH_BODY.exec(xml);
  while (match !== null) {
    points.push({ lat: Number(match[1]), lon: Number(match[2]) });
    const body = match[3];
    const ele = body === undefined ? null : ELEVATION.exec(body);
    if (ele === null) {
      elevations.push(null);
    } else {
      elevations.push(Number(ele[1]));
      hadElevation = true;
    }
    match = POINT_WITH_BODY.exec(xml);
  }

  // A <time> inside metadata is the export stamp, not a per-point timestamp.
  const body = xml.replace(/<metadata>[\s\S]*?<\/metadata>/, '');
  const hadTimestamps = /<(?:trkpt|rtept)[\s\S]*?<time>/.test(body);
  const name = TRACK_NAME.exec(xml)?.[1]?.trim() ?? null;

  return {
    name: name === '' ? null : name,
    points,
    elevations,
    hadTimestamps,
    hadElevation
  };
}

/** How many `<trkpt>`/`<rtept>` elements the file declares, ignoring their bodies. */
export function countTrackPoints(xml: string): number {
  TRACK_POINT.lastIndex = 0;
  let count = 0;
  while (TRACK_POINT.exec(xml) !== null) {
    count += 1;
  }
  return count;
}
