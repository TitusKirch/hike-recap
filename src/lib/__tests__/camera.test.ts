import { describe, expect, it } from 'vitest';
import { cumulativeScreenLengths, pointAtFraction } from '@/util/camera.ts';

/** A path whose vertices are deliberately uneven: dense left, sparse right. */
const UNEVEN: Array<[number, number]> = [
  [0, 0],
  [1, 0],
  [2, 0],
  [3, 0],
  [4, 0],
  [5, 0],
  [105, 0]
];

describe('cumulativeScreenLengths', () => {
  it('starts at zero and ends at the total length', () => {
    const cum = cumulativeScreenLengths(UNEVEN);
    expect(cum[0]).toBe(0);
    expect(cum.at(-1)).toBe(105);
  });

  it('is monotonic', () => {
    const cum = cumulativeScreenLengths(UNEVEN);
    for (let i = 1; i < cum.length; i += 1) {
      expect(cum[i]!).toBeGreaterThanOrEqual(cum[i - 1]!);
    }
  });
});

describe('pointAtFraction', () => {
  const cum = cumulativeScreenLengths(UNEVEN);

  it('hits both ends exactly', () => {
    expect(pointAtFraction(UNEVEN, cum, 0)).toEqual([0, 0]);
    expect(pointAtFraction(UNEVEN, cum, 1)).toEqual([105, 0]);
  });

  it('measures by length, not by vertex index', () => {
    // half the *length* is x=52.5; half the *vertices* would be x=3
    expect(pointAtFraction(UNEVEN, cum, 0.5)[0]).toBeCloseTo(52.5, 6);
  });

  it('stays in step with a dash-offset reveal', () => {
    // the line end after revealing `f` of the length is at x = f * total
    for (const f of [0.05, 0.2, 0.37, 0.5, 0.81, 0.99]) {
      const [x] = pointAtFraction(UNEVEN, cum, f);
      expect(x).toBeCloseTo(f * 105, 6);
    }
  });

  it('clamps out-of-range fractions', () => {
    expect(pointAtFraction(UNEVEN, cum, -3)).toEqual([0, 0]);
    expect(pointAtFraction(UNEVEN, cum, 9)).toEqual([105, 0]);
  });

  it('moves at constant speed for equal steps in fraction', () => {
    const xs = [0, 0.25, 0.5, 0.75, 1].map(
      (f) => pointAtFraction(UNEVEN, cum, f)[0]
    );
    const steps = xs.slice(1).map((x, i) => x - xs[i]!);
    for (const s of steps) {
      expect(s).toBeCloseTo(steps[0]!, 6);
    }
  });

  it('interpolates in two dimensions', () => {
    const diag: Array<[number, number]> = [
      [0, 0],
      [10, 10]
    ];
    const [x, y] = pointAtFraction(diag, cumulativeScreenLengths(diag), 0.5);
    expect(x).toBeCloseTo(5, 6);
    expect(y).toBeCloseTo(5, 6);
  });

  it('handles degenerate input', () => {
    expect(pointAtFraction([[7, 7]], [0], 0.5)).toEqual([7, 7]);
    const same: Array<[number, number]> = [
      [1, 1],
      [1, 1]
    ];
    expect(pointAtFraction(same, cumulativeScreenLengths(same), 0.5)).toEqual([
      1, 1
    ]);
    expect(() => pointAtFraction([], [], 0.5)).toThrow();
  });
});

describe('transformBetween', () => {
  const view = (scale: number, centerX: number, centerY: number) => ({
    scale,
    centerX,
    centerY,
    zoom: 13
  });

  it('is the identity when target and current match', async () => {
    const { transformBetween } = await import('@/util/camera.ts');
    const v = view(0.8, 1000, 2000);
    expect(transformBetween(v, v)).toEqual({
      scale: 1,
      offsetX: 0,
      offsetY: 0
    });
  });

  it('scales up when the current view is tighter than the target', async () => {
    const { transformBetween } = await import('@/util/camera.ts');
    const t = transformBetween(view(0.5, 1000, 2000), view(1.5, 1000, 2000));
    expect(t.scale).toBeCloseTo(3, 6);
  });

  it('reproduces the tighter view exactly', async () => {
    const { project, transformBetween } = await import('@/util/camera.ts');
    const target = view(0.5, 1000, 2000);
    const current = view(1.4, 1120, 2080);
    const { scale, offsetX, offsetY } = transformBetween(target, current);

    // a point projected in the target view, then pushed through the transform,
    // must land where the current view would have put it
    for (const [lon, lat] of [
      [14.0, 50.9],
      [14.06, 50.92],
      [13.96, 50.84]
    ] as const) {
      const [tx, ty] = project(target, lon, lat);
      const [cx, cy] = project(current, lon, lat);
      expect((tx - 1080 / 2) * scale + 1080 / 2 + offsetX).toBeCloseTo(cx, 6);
      expect((ty - 1920 / 2) * scale + 1920 / 2 + offsetY).toBeCloseTo(cy, 6);
    }
  });
});

describe('collapseViews', () => {
  const load = () => import('@/util/camera.ts');
  const v = (scale: number, centerX = 1000, centerY = 2000) => ({
    scale,
    centerX,
    centerY,
    zoom: 13
  });

  it('keeps a view that genuinely widens the frame', async () => {
    const { collapseViews } = await load();
    const out = collapseViews([v(2), v(1)]);
    expect(out[1]).not.toBe(out[0]);
  });

  it('holds a view that barely changes', async () => {
    const { collapseViews } = await load();
    const out = collapseViews([v(1), v(1)]);
    expect(out[1]).toBe(out[0]);
  });

  it('holds on a tiny shift but not a real one', async () => {
    const { collapseViews } = await load();
    const held = collapseViews([v(1, 1000), v(1, 1005)]);
    expect(held[1]).toBe(held[0]);
    const moved = collapseViews([v(1, 1000), v(1, 1200)]);
    expect(moved[1]).not.toBe(moved[0]);
  });

  it('compares against the held view, not the raw one', async () => {
    const { collapseViews } = await load();
    // three views that each creep by a little; together they would drift far,
    // so the comparison must be against what is on screen
    const out = collapseViews([v(1, 1000), v(1, 1010), v(1, 1020)]);
    expect(out[1]).toBe(out[0]);
    expect(out[2]).toBe(out[0]);
  });

  it('passes a single view through', async () => {
    const { collapseViews } = await load();
    expect(collapseViews([v(1)])).toHaveLength(1);
  });
});

describe('projection follows the view zoom', () => {
  it('places a point inside the frame it was fitted to', async () => {
    const { project, viewForBounds } = await import('@/util/camera.ts');
    // this failed silently while project() still used a fixed BASE_ZOOM:
    // a view built at z12 was projected at z13 and everything flew off-screen
    for (const zoom of [10, 11, 12, 13, 14]) {
      const bounds = {
        minLat: 50.97,
        minLon: 13.95,
        maxLat: 51.0,
        maxLon: 14.04
      };
      const view = viewForBounds(bounds, 120, 1920, zoom);
      const [x, y] = project(view, bounds.minLon, bounds.maxLat);
      expect(x).toBeGreaterThan(-10);
      expect(x).toBeLessThan(1090);
      expect(y).toBeGreaterThan(-10);
      expect(y).toBeLessThan(1930);
    }
  });

  it('centres the bounds regardless of zoom', async () => {
    const { project, viewForBounds } = await import('@/util/camera.ts');
    const bounds = { minLat: 50.9, minLon: 14.0, maxLat: 51.0, maxLon: 14.2 };
    for (const zoom of [9, 12, 15]) {
      const view = viewForBounds(bounds, 100, 1920, zoom);
      const [x, y] = project(view, 14.1, 50.95);
      expect(x).toBeCloseTo(540, 0);
      expect(y).toBeCloseTo(960, 0);
    }
  });
});
