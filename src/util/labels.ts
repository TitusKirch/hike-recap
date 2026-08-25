/**
 * Label placement.
 *
 * Overlapping labels were the single most visible defect in the prototypes, so
 * this is a pure function with its own tests rather than something improvised
 * inside a component. Rules, in order of importance:
 *
 *  1. never overlap another label
 *  2. never sit on a route, because the route is the subject
 *  3. never leave the safe area (margins, and the info panel at the bottom)
 *
 * Rule 2 is relaxed for places: they carry the orientation, and a halo keeps
 * them readable over a line. Peaks are dropped instead — a peak that cannot be
 * placed cleanly is worth less than a clean frame.
 */

export type Box = { x0: number; y0: number; x1: number; y1: number };

export type LabelInput = {
  id: string;
  /**
   * `water` behaves like `place` during placement — both carry orientation and
   * are kept even where only a route-crossed slot is left. Only `peak` is
   * dropped rather than compromised.
   */
  kind: 'place' | 'peak' | 'water';
  /** Anchor in screen pixels — the thing being named. */
  x: number;
  y: number;
  width: number;
  /** Ink above the text baseline. */
  above: number;
  /**
   * Ink below the baseline. For a peak this must include the elevation line
   * underneath the name — leaving it out is exactly how a route ends up drawn
   * through "1338 m".
   */
  below: number;
  /** Lower sorts first. */
  priority: number;
  /** Free-form payload carried through placement untouched. */
  ele?: number;
};

export type PlacedLabel = LabelInput & { labelX: number; labelY: number };

export type PlacementOptions = {
  obstacles: ReadonlyArray<[number, number]>;
  safe: Box;
  max: number;
  /** Free space required between two labels. */
  gap?: number;
  /** Marker footprint at a peak's anchor, kept clear of text. */
  markerRadius?: number;
};

const intersects = (a: Box, b: Box, gap: number): boolean =>
  !(
    a.x1 + gap < b.x0 ||
    a.x0 - gap > b.x1 ||
    a.y1 + gap < b.y0 ||
    a.y0 - gap > b.y1
  );

const contains = (b: Box, x: number, y: number): boolean =>
  x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;

const inside = (inner: Box, outer: Box): boolean =>
  inner.x0 >= outer.x0 &&
  inner.x1 <= outer.x1 &&
  inner.y0 >= outer.y0 &&
  inner.y1 <= outer.y1;

/** Candidate offsets, best first: above, below, right, left, then further out. */
function candidates(label: LabelInput): Array<[number, number]> {
  const up = label.kind === 'peak' ? -26 : -20;
  const down = label.kind === 'peak' ? 44 : 34;
  const side = label.width / 2 + 30;
  return [
    [0, up],
    [0, down],
    [side, 6],
    [-side, 6],
    [0, up - 34],
    [0, down + 34],
    [side, up],
    [-side, up]
  ];
}

function boxFor(label: LabelInput, cx: number, cy: number): Box {
  return {
    x0: cx - label.width / 2,
    y0: cy - label.above,
    x1: cx + label.width / 2,
    y1: cy + label.below
  };
}

export function placeLabels(
  labels: readonly LabelInput[],
  options: PlacementOptions
): PlacedLabel[] {
  const { obstacles, safe, max, gap = 16, markerRadius = 18 } = options;
  const taken: Box[] = [];
  const placed: PlacedLabel[] = [];

  const ordered = [...labels].sort(
    (a, b) => a.priority - b.priority || a.id.localeCompare(b.id)
  );

  for (const label of ordered) {
    if (placed.length >= max) {
      break;
    }
    let fallback: { box: Box; x: number; y: number } | null = null;

    for (const [dx, dy] of candidates(label)) {
      const cx = label.x + dx;
      const cy = label.y + dy;
      const box = boxFor(label, cx, cy);

      if (!inside(box, safe)) {
        continue;
      }
      // a peak's own marker must not end up under its text
      if (
        label.kind === 'peak' &&
        intersects(
          box,
          {
            x0: label.x - markerRadius,
            y0: label.y - markerRadius,
            x1: label.x + markerRadius,
            y1: label.y + markerRadius
          },
          0
        )
      ) {
        continue;
      }
      if (taken.some((t) => intersects(box, t, gap))) {
        continue;
      }
      if (obstacles.some(([ox, oy]) => contains(box, ox, oy))) {
        if (fallback === null) {
          fallback = { box, x: cx, y: cy };
        }
        continue;
      }
      taken.push(box);
      placed.push({ ...label, labelX: cx, labelY: cy });
      fallback = null;
      break;
    }

    if (fallback !== null && label.kind !== 'peak') {
      taken.push(fallback.box);
      placed.push({ ...label, labelX: fallback.x, labelY: fallback.y });
    }
  }

  return placed;
}

export type Axis = {
  /** Centre of the shape. */
  x: number;
  y: number;
  /** Rotation of the long axis in degrees, always within [-90, 90]. */
  angle: number;
  /** Extent along the long axis. */
  length: number;
  /** Extent across it. */
  width: number;
};

/**
 * Principal axis of a polygon, for setting a label along its length.
 *
 * Map convention: a lake's name follows the lake. Written horizontally, a name
 * only fits a shape that happens to be wide; rotated onto the long axis it fits
 * whenever the shape is long, which is what most lakes are.
 *
 * This is a 2x2 PCA, which has a closed form — no iteration, no matrix library.
 */
export function principalAxis(
  points: ReadonlyArray<readonly [number, number]>
): Axis {
  const n = points.length;
  if (n === 0) {
    throw new Error('principalAxis needs at least one point');
  }
  let mx = 0;
  let my = 0;
  for (const [x, y] of points) {
    mx += x;
    my += y;
  }
  mx /= n;
  my /= n;

  let cxx = 0;
  let cyy = 0;
  let cxy = 0;
  for (const [x, y] of points) {
    const dx = x - mx;
    const dy = y - my;
    cxx += dx * dx;
    cyy += dy * dy;
    cxy += dx * dy;
  }
  cxx /= n;
  cyy /= n;
  cxy /= n;

  // eigenvector direction of the larger eigenvalue
  const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const ux = Math.cos(theta);
  const uy = Math.sin(theta);

  let alongMin = Infinity;
  let alongMax = -Infinity;
  let acrossMin = Infinity;
  let acrossMax = -Infinity;
  for (const [x, y] of points) {
    const dx = x - mx;
    const dy = y - my;
    const along = dx * ux + dy * uy;
    const across = -dx * uy + dy * ux;
    alongMin = Math.min(alongMin, along);
    alongMax = Math.max(alongMax, along);
    acrossMin = Math.min(acrossMin, across);
    acrossMax = Math.max(acrossMax, across);
  }

  // keep text upright: a label is never set upside down
  let angle = (theta * 180) / Math.PI;
  while (angle > 90) {
    angle -= 180;
  }
  while (angle < -90) {
    angle += 180;
  }

  return {
    x: mx,
    y: my,
    angle,
    length: alongMax - alongMin,
    width: acrossMax - acrossMin
  };
}

/** Rough text width. Measured widths are preferred; this is the headless fallback. */
export function estimateTextWidth(
  text: string,
  fontSize: number,
  letterSpacingEm: number
): number {
  return text.length * fontSize * (0.62 + letterSpacingEm);
}
