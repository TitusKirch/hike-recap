/** Pure geometry helpers. No I/O, no DOM — everything here is unit-tested. */

export type Point = { lat: number; lon: number };
export type Bounds = {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
};

const EARTH_RADIUS_M = 6_371_000;
const TILE_SIZE = 256;

/** Web Mercator pixel X at a given zoom. */
export function lonToPixelX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * 2 ** zoom * TILE_SIZE;
}

/** Web Mercator pixel Y at a given zoom. */
export function latToPixelY(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  const merc = Math.log(Math.tan(rad) + 1 / Math.cos(rad));
  return ((1 - merc / Math.PI) / 2) * 2 ** zoom * TILE_SIZE;
}

/** Inverse of {@link lonToPixelX}. */
export function pixelXToLon(px: number, zoom: number): number {
  return (px / (2 ** zoom * TILE_SIZE)) * 360 - 180;
}

/** Inverse of {@link latToPixelY}. */
export function pixelYToLat(py: number, zoom: number): number {
  const merc = (1 - (2 * py) / (2 ** zoom * TILE_SIZE)) * Math.PI;
  return (Math.atan(Math.sinh(merc)) * 180) / Math.PI;
}

/** Great-circle distance in metres. */
export function haversine(a: Point, b: Point): number {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Total length of a track in metres. */
export function trackLength(points: readonly Point[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    total += haversine(points[i - 1]!, points[i]!);
  }
  return total;
}

/** Cumulative distance in metres at each point; first entry is always 0. */
export function cumulativeDistances(points: readonly Point[]): number[] {
  const out: number[] = [0];
  for (let i = 1; i < points.length; i += 1) {
    out.push(out[i - 1]! + haversine(points[i - 1]!, points[i]!));
  }
  return out;
}

export function boundsOf(points: readonly Point[]): Bounds {
  if (points.length === 0) {
    throw new Error('boundsOf needs at least one point');
  }
  let minLat = Infinity;
  let minLon = Infinity;
  let maxLat = -Infinity;
  let maxLon = -Infinity;
  for (const p of points) {
    minLat = Math.min(minLat, p.lat);
    minLon = Math.min(minLon, p.lon);
    maxLat = Math.max(maxLat, p.lat);
    maxLon = Math.max(maxLon, p.lon);
  }
  return { minLat, minLon, maxLat, maxLon };
}

export function mergeBounds(list: readonly Bounds[]): Bounds {
  if (list.length === 0) {
    throw new Error('mergeBounds needs at least one bounds');
  }
  return list.reduce((a, b) => ({
    minLat: Math.min(a.minLat, b.minLat),
    minLon: Math.min(a.minLon, b.minLon),
    maxLat: Math.max(a.maxLat, b.maxLat),
    maxLon: Math.max(a.maxLon, b.maxLon)
  }));
}

/**
 * Douglas-Peucker in Mercator pixel space, so tolerance is screen-ish rather
 * than degrees — a degree of longitude is not a degree of latitude.
 */
export function simplify(
  points: readonly Point[],
  tolerancePx: number,
  zoom = 14
): Point[] {
  if (points.length <= 2) {
    return [...points];
  }
  const xs = points.map((p) => lonToPixelX(p.lon, zoom));
  const ys = points.map((p) => latToPixelY(p.lat, zoom));
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;

  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    let maxDist = -1;
    let index = -1;
    const x1 = xs[first]!;
    const y1 = ys[first]!;
    const x2 = xs[last]!;
    const y2 = ys[last]!;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    for (let i = first + 1; i < last; i += 1) {
      const px = xs[i]! - x1;
      const py = ys[i]! - y1;
      const t =
        lenSq === 0 ? 0 : Math.max(0, Math.min(1, (px * dx + py * dy) / lenSq));
      const dist = Math.hypot(px - t * dx, py - t * dy);
      if (dist > maxDist) {
        maxDist = dist;
        index = i;
      }
    }
    if (maxDist > tolerancePx && index > 0) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}
