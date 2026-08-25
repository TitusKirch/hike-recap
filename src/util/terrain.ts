/**
 * Terrain rasterisation: contour lines and hillshade from the DEM grid.
 *
 * Both are expensive, so both are computed once per chapter and then only
 * transformed. Contours emit raw segments rather than stitched polylines —
 * at these stroke widths that is visually identical and far less code.
 */

export type Grid = {
  data: Float32Array;
  width: number;
  height: number;
  step: number;
};

/** Average-pool the DEM so contours read as landform rather than sensor noise. */
export function coarsen(
  data: Float32Array,
  width: number,
  height: number,
  factor: number
): Grid {
  const w = Math.floor(width / factor);
  const h = Math.floor(height / factor);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let sum = 0;
      let n = 0;
      for (let dy = 0; dy < factor; dy += 1) {
        for (let dx = 0; dx < factor; dx += 1) {
          const v = data[(y * factor + dy) * width + (x * factor + dx)]!;
          if (!Number.isNaN(v)) {
            sum += v;
            n += 1;
          }
        }
      }
      out[y * w + x] = n === 0 ? NaN : sum / n;
    }
  }
  return { data: out, width: w, height: h, step: factor };
}

export type Segment = [number, number, number, number];

/** Marching squares at one level, in grid coordinates. */
export function isoSegments(grid: Grid, level: number): Segment[] {
  const { data, width, height } = grid;
  const segs: Segment[] = [];
  const at = (x: number, y: number): number => data[y * width + x]!;
  const ip = (a: number, b: number): number => (level - a) / (b - a);

  for (let y = 0; y < height - 1; y += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const tl = at(x, y);
      const tr = at(x + 1, y);
      const br = at(x + 1, y + 1);
      const bl = at(x, y + 1);
      if (
        Number.isNaN(tl) ||
        Number.isNaN(tr) ||
        Number.isNaN(br) ||
        Number.isNaN(bl)
      ) {
        continue;
      }
      let code = 0;
      if (tl > level) code |= 8;
      if (tr > level) code |= 4;
      if (br > level) code |= 2;
      if (bl > level) code |= 1;
      if (code === 0 || code === 15) {
        continue;
      }
      const top = (): [number, number] => [x + ip(tl, tr), y];
      const right = (): [number, number] => [x + 1, y + ip(tr, br)];
      const bottom = (): [number, number] => [x + ip(bl, br), y + 1];
      const left = (): [number, number] => [x, y + ip(tl, bl)];
      const push = (p: [number, number], q: [number, number]): void => {
        segs.push([p[0], p[1], q[0], q[1]]);
      };
      switch (code) {
        case 1:
        case 14:
          push(left(), bottom());
          break;
        case 2:
        case 13:
          push(bottom(), right());
          break;
        case 3:
        case 12:
          push(left(), right());
          break;
        case 4:
        case 11:
          push(top(), right());
          break;
        case 5:
          push(left(), top());
          push(bottom(), right());
          break;
        case 6:
        case 9:
          push(top(), bottom());
          break;
        case 7:
        case 8:
          push(left(), top());
          break;
        case 10:
          push(top(), right());
          push(left(), bottom());
          break;
        default:
          break;
      }
    }
  }
  return segs;
}

export function gridExtent(grid: Grid): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const v of grid.data) {
    if (!Number.isNaN(v)) {
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
  }
  return { min, max };
}

/**
 * Elevation → base colour. Green is the ground state; rock only up high.
 *
 * The stops are given as *fractions* of the terrain's own range rather than as
 * metres, so the ramp stretches to whatever it is handed. Fixed metres worked
 * only for one region: a 0–200 m coastal walk fell entirely on the first stop
 * and rendered flat green, and a Himalayan range fell entirely on the last.
 */
const RAMP: Array<[number, [number, number, number]]> = [
  [0, [123, 150, 92]],
  [0.22, [137, 161, 99]],
  [0.45, [161, 178, 112]],
  [0.64, [190, 193, 140]],
  [0.78, [206, 199, 175]],
  [1, [203, 197, 190]]
];

export type ElevationRange = { min: number; max: number };

/** Below this, relief is treated as noise rather than landform. */
const MIN_SPAN = 250;

/**
 * Build a colour lookup for a given terrain range.
 *
 * Ranges under MIN_SPAN are widened around their midpoint: on genuinely flat
 * ground the ramp would otherwise turn sensor noise into visible banding. At
 * 250 m a 12 m wobble uses 5 % of the ramp and stays invisible, while a real
 * 200 m coastal range still gets most of it.
 */
export function hypsometricFor(
  range: ElevationRange
): (ele: number) => [number, number, number] {
  const mid = (range.min + range.max) / 2;
  const span = Math.max(range.max - range.min, MIN_SPAN);
  const lo = Math.min(range.min, mid - span / 2);

  return (ele: number): [number, number, number] => {
    // no data reads as the lowest ground present, not as the ramp's first stop:
    // on a widened range those are different colours
    const value = Number.isNaN(ele) ? range.min : ele;
    const t = Math.max(0, Math.min(1, (value - lo) / span));
    for (let i = 1; i < RAMP.length; i += 1) {
      const [hi, chi] = RAMP[i]!;
      if (t <= hi) {
        const [start, clo] = RAMP[i - 1]!;
        const k = hi === start ? 0 : (t - start) / (hi - start);
        return [
          clo[0] + (chi[0] - clo[0]) * k,
          clo[1] + (chi[1] - clo[1]) * k,
          clo[2] + (chi[2] - clo[2]) * k
        ];
      }
    }
    return RAMP[RAMP.length - 1]![1];
  };
}

export type ShadeOptions = {
  width: number;
  height: number;
  /** Screen → grid mapping. */
  originX: number;
  originY: number;
  centerX: number;
  centerY: number;
  scale: number;
  azimuthDeg?: number;
  altitudeDeg?: number;
  exaggeration?: number;
  strength?: number;
  /** Terrain range the colour ramp is stretched across. */
  range: ElevationRange;
};

/**
 * Paint hypsometric tint plus hillshade into RGBA bytes.
 *
 * Written as a flat loop over destination pixels: for every screen pixel it
 * finds the source DEM cell, so the result is already in view space and needs
 * no further resampling.
 */
export function renderTerrain(
  dem: Float32Array,
  demWidth: number,
  demHeight: number,
  out: Uint8ClampedArray,
  opts: ShadeOptions
): void {
  const {
    width,
    height,
    originX,
    originY,
    centerX,
    centerY,
    scale,
    azimuthDeg = 315,
    altitudeDeg = 42,
    exaggeration = 3,
    strength = 0.5,
    range
  } = opts;
  const hypsometric = hypsometricFor(range);
  const az = (azimuthDeg * Math.PI) / 180;
  const alt = (altitudeDeg * Math.PI) / 180;
  const sx = Math.cos(alt) * Math.cos(az);
  const sy = Math.cos(alt) * Math.sin(az);
  const sz = Math.sin(alt);
  const inv = 1 / scale;

  for (let py = 0; py < height; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const i = (py * width + px) * 4;
      const gx = Math.round((px - width / 2) * inv + centerX - originX);
      const gy = Math.round((py - height / 2) * inv + centerY - originY);
      if (gx < 1 || gy < 1 || gx >= demWidth - 1 || gy >= demHeight - 1) {
        out[i] = 236;
        out[i + 1] = 238;
        out[i + 2] = 228;
        out[i + 3] = 255;
        continue;
      }
      const here = dem[gy * demWidth + gx]!;
      const l = dem[gy * demWidth + gx - 1]!;
      const r = dem[gy * demWidth + gx + 1]!;
      const u = dem[(gy - 1) * demWidth + gx]!;
      const d = dem[(gy + 1) * demWidth + gx]!;
      const base = hypsometric(here);
      if (
        Number.isNaN(l) ||
        Number.isNaN(r) ||
        Number.isNaN(u) ||
        Number.isNaN(d)
      ) {
        out[i] = base[0];
        out[i + 1] = base[1];
        out[i + 2] = base[2];
        out[i + 3] = 255;
        continue;
      }
      const nx = ((l - r) / 60) * exaggeration;
      const ny = ((d - u) / 60) * exaggeration;
      const len = Math.hypot(nx, ny, 1);
      const lit =
        (Math.max(0, Math.min(1, (nx * sx + ny * sy + sz) / len)) - 0.5) * 2;
      // light lifts towards white, shadow sinks towards a desaturated green-grey
      const a = ((lit >= 0 ? lit * 78 : -lit * 104) * strength) / 255;
      const c = lit >= 0 ? 255 : 61;
      const cg = lit >= 0 ? 255 : 74;
      const cb = lit >= 0 ? 255 : 58;
      out[i] = base[0] * (1 - a) + c * a;
      out[i + 1] = base[1] * (1 - a) + cg * a;
      out[i + 2] = base[2] * (1 - a) + cb * a;
      out[i + 3] = 255;
    }
  }
}
