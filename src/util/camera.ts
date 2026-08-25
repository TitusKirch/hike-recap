/**
 * The view transform. One place decides how lon/lat becomes a screen pixel.
 *
 * The camera holds still for the length of a chapter — only a slow Ken Burns
 * drift plays on top. That is deliberate: terrain is expensive to rasterise, so
 * it is built once per chapter and merely transformed per frame.
 */
import { latToPixelY, lonToPixelX, type Bounds } from '@/lib/geo.ts';
import { HEIGHT, WIDTH } from '@/video.ts';

/**
 * Default DEM zoom, and the fallback where none is supplied.
 *
 * The scene works in this tile pixel space throughout, so ingest, geodata fetch
 * and renderer must all agree on it — which is why the resolved value travels
 * in the compiled JSON rather than being recomputed in three places.
 */
export const BASE_ZOOM = 13;

/**
 * Pick the DEM zoom for a given extent.
 *
 * The smallest zoom at which the tracks still fill most of the frame. Going
 * finer multiplies tile count fourfold for detail the video never shows; going
 * coarser means the close frames magnify a blurry raster. Fixed at 13 this
 * suited one region: a 200 km trail would have pulled thousands of tiles, a
 * 2 km loop would have had almost no relief to draw.
 */
export function zoomForBounds(
  bounds: Bounds,
  width = WIDTH,
  height = HEIGHT,
  fill = 0.8,
  range: [number, number] = [6, 15]
): number {
  const [min, max] = range;
  for (let z = min; z <= max; z += 1) {
    const w = lonToPixelX(bounds.maxLon, z) - lonToPixelX(bounds.minLon, z);
    const h = latToPixelY(bounds.minLat, z) - latToPixelY(bounds.maxLat, z);
    if (w >= width * fill || h >= height * fill) {
      return z;
    }
  }
  return max;
}

/**
 * The view transform, including the tile zoom it is expressed in.
 *
 * Carrying the zoom here rather than threading it through every call site is
 * what stops the two drifting apart: a view built at one zoom and projected at
 * another silently places everything in the wrong pixel space.
 */
export type View = {
  scale: number;
  centerX: number;
  centerY: number;
  zoom: number;
};

export function viewForBounds(
  bounds: Bounds,
  padding: number,
  height = HEIGHT,
  zoom = BASE_ZOOM
): View {
  const x0 = lonToPixelX(bounds.minLon, zoom);
  const x1 = lonToPixelX(bounds.maxLon, zoom);
  const y0 = latToPixelY(bounds.maxLat, zoom);
  const y1 = latToPixelY(bounds.minLat, zoom);
  const w = Math.max(x1 - x0, 1e-6);
  const h = Math.max(y1 - y0, 1e-6);
  return {
    scale: Math.min((WIDTH - padding * 2) / w, (height - padding * 2) / h),
    centerX: x0 + w / 2,
    centerY: y0 + h / 2,
    zoom
  };
}

export function project(
  view: View,
  lon: number,
  lat: number
): [number, number] {
  return [
    (lonToPixelX(lon, view.zoom) - view.centerX) * view.scale + WIDTH / 2,
    (latToPixelY(lat, view.zoom) - view.centerY) * view.scale + HEIGHT / 2
  ];
}

/** Screen position of a DEM grid cell, given the grid's pixel origin. */
export function projectGrid(
  view: View,
  originX: number,
  originY: number,
  gx: number,
  gy: number,
  step: number
): [number, number] {
  return [
    (originX + gx * step - view.centerX) * view.scale + WIDTH / 2,
    (originY + gy * step - view.centerY) * view.scale + HEIGHT / 2
  ];
}

/**
 * Shift the camera so its content centres on `screenY` instead of the frame's
 * middle. Needed because the info panel covers the lower third: without this a
 * track is centred on 960 and its bottom disappears behind the panel.
 */
export function centreOn(view: View, screenY: number): View {
  return {
    ...view,
    centerY: view.centerY + (HEIGHT / 2 - screenY) / view.scale
  };
}

/**
 * CSS transform that makes layers rasterised for `target` look like `current`.
 *
 * The expensive layers are rebuilt only when the target frame changes. During
 * a zoom the finished bitmap and SVG are simply transformed instead, which is
 * what keeps a moving camera affordable — recomputing contours per frame is
 * what made an earlier build take twenty minutes.
 *
 * Apply with `transform-origin: 50% 50%` and in this order:
 *   translate(offsetX, offsetY) scale(scale)
 */
export function transformBetween(
  target: View,
  current: View
): { scale: number; offsetX: number; offsetY: number } {
  return {
    scale: current.scale / target.scale,
    offsetX: (target.centerX - current.centerX) * current.scale,
    offsetY: (target.centerY - current.centerY) * current.scale
  };
}

export function lerpView(a: View, b: View, t: number): View {
  return {
    // scale interpolates geometrically, otherwise a zoom feels front-loaded
    scale: a.scale * (b.scale / a.scale) ** t,
    centerX: a.centerX + (b.centerX - a.centerX) * t,
    centerY: a.centerY + (b.centerY - a.centerY) * t,
    zoom: b.zoom
  };
}

/** Running screen-space length at each vertex; first entry is always 0. */
export function cumulativeScreenLengths(
  pts: ReadonlyArray<readonly [number, number]>
): number[] {
  const out: number[] = [0];
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    out.push(out[i - 1]! + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return out;
}

/**
 * Position a fraction of the way along a polyline, measured by **length**.
 *
 * This has to match how the line itself is revealed. `stroke-dashoffset`
 * uncovers a fraction of the path's length, so picking the moving head by
 * vertex index instead makes it drift — Douglas-Peucker leaves vertices dense
 * in bends and sparse on straights, which put the dot up to 4 % of the route
 * ahead of or behind the line end.
 */
export function pointAtFraction(
  pts: ReadonlyArray<readonly [number, number]>,
  cumulative: readonly number[],
  fraction: number
): [number, number] {
  if (pts.length === 0) {
    throw new Error('pointAtFraction needs at least one point');
  }
  if (pts.length === 1) {
    return [pts[0]![0], pts[0]![1]];
  }
  const total = cumulative[cumulative.length - 1]!;
  if (total <= 0) {
    return [pts[0]![0], pts[0]![1]];
  }
  const target = Math.max(0, Math.min(1, fraction)) * total;

  let lo = 0;
  let hi = cumulative.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cumulative[mid]! <= target) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const segment = cumulative[hi]! - cumulative[lo]!;
  const t = segment <= 0 ? 0 : (target - cumulative[lo]!) / segment;
  const a = pts[lo]!;
  const b = pts[hi]!;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/**
 * Collapse camera steps that would barely move the picture.
 *
 * A tour lying entirely inside the frame already shown widens it by nothing —
 * five of this trip's eleven steps came out at zoom 1.000 and a shift of under
 * 6 px. Animating those reads as a twitch rather than a move, so the camera
 * holds instead. Layers keyed on the framed extent are then reused too, which
 * saves a full rebuild each time.
 *
 * Returns the effective view per index; a held step is the *same object* as its
 * predecessor, so callers can compare by identity.
 */
export function collapseViews(
  views: readonly View[],
  minZoom = 1.02,
  minShiftPx = 30
): View[] {
  const out: View[] = [];
  for (let i = 0; i < views.length; i += 1) {
    const next = views[i]!;
    const prev = out[i - 1];
    if (prev === undefined) {
      out.push(next);
      continue;
    }
    const zoom = prev.scale / next.scale;
    const shift =
      Math.hypot(next.centerX - prev.centerX, next.centerY - prev.centerY) *
      next.scale;
    out.push(zoom < minZoom && Math.abs(shift) < minShiftPx ? prev : next);
  }
  return out;
}

export function pathFor(
  view: View,
  points: ReadonlyArray<{ lat: number; lon: number }>
): string {
  let d = '';
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    const [x, y] = project(view, p.lon, p.lat);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}
