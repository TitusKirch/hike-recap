import { describe, expect, it } from 'vitest';
import {
  estimateTextWidth,
  placeLabels,
  type LabelInput
} from '@/util/labels.ts';

const SAFE = { x0: 30, y0: 40, x1: 1050, y1: 1150 };

const label = (over: Partial<LabelInput> & { id: string }): LabelInput => ({
  kind: 'peak',
  x: 500,
  y: 500,
  width: 200,
  above: 17,
  below: 28,
  priority: 5,
  ...over
});

const boxOf = (p: {
  labelX: number;
  labelY: number;
  width: number;
  above: number;
  below: number;
}) => ({
  x0: p.labelX - p.width / 2,
  y0: p.labelY - p.above,
  x1: p.labelX + p.width / 2,
  y1: p.labelY + p.below
});

const overlap = (a: ReturnType<typeof boxOf>, b: ReturnType<typeof boxOf>) =>
  !(a.x1 < b.x0 || a.x0 > b.x1 || a.y1 < b.y0 || a.y0 > b.y1);

describe('placeLabels', () => {
  it('places an isolated label', () => {
    const out = placeLabels([label({ id: 'a' })], {
      obstacles: [],
      safe: SAFE,
      max: 20
    });
    expect(out).toHaveLength(1);
  });

  it('never lets two labels overlap', () => {
    // twelve anchors crowded into one small area
    const crowd = Array.from({ length: 12 }, (_, i) =>
      label({
        id: `p${i}`,
        x: 500 + (i % 4) * 25,
        y: 500 + Math.floor(i / 4) * 25
      })
    );
    const out = placeLabels(crowd, { obstacles: [], safe: SAFE, max: 20 });
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        expect(overlap(boxOf(out[i]!), boxOf(out[j]!))).toBe(false);
      }
    }
  });

  it('drops what does not fit rather than stacking it', () => {
    const crowd = Array.from({ length: 30 }, (_, i) =>
      label({ id: `p${i}`, x: 500, y: 500 + i })
    );
    const out = placeLabels(crowd, { obstacles: [], safe: SAFE, max: 20 });
    expect(out.length).toBeLessThan(crowd.length);
  });

  it('honours the cap', () => {
    const many = Array.from({ length: 40 }, (_, i) =>
      label({
        id: `p${i}`,
        x: 60 + (i % 8) * 120,
        y: 80 + Math.floor(i / 8) * 200
      })
    );
    expect(
      placeLabels(many, { obstacles: [], safe: SAFE, max: 6 })
    ).toHaveLength(6);
  });

  it('keeps every label inside the safe area', () => {
    const edges = [
      label({ id: 'topleft', x: 35, y: 45 }),
      label({ id: 'botright', x: 1045, y: 1145 }),
      label({ id: 'mid', x: 500, y: 600 })
    ];
    for (const p of placeLabels(edges, {
      obstacles: [],
      safe: SAFE,
      max: 20
    })) {
      const b = boxOf(p);
      expect(b.x0).toBeGreaterThanOrEqual(SAFE.x0);
      expect(b.x1).toBeLessThanOrEqual(SAFE.x1);
      expect(b.y0).toBeGreaterThanOrEqual(SAFE.y0);
      expect(b.y1).toBeLessThanOrEqual(SAFE.y1);
    }
  });

  it('never puts a peak label on top of a route', () => {
    // a dense horizontal line of route points right through the anchor
    const obstacles: Array<[number, number]> = Array.from(
      { length: 400 },
      (_, i) => [300 + i, 500]
    );
    const out = placeLabels([label({ id: 'peak' })], {
      obstacles,
      safe: SAFE,
      max: 20
    });
    for (const p of out) {
      const b = boxOf(p);
      expect(
        obstacles.some(
          ([x, y]) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1
        )
      ).toBe(false);
    }
  });

  it('keeps a place label even when only route-covered spots remain', () => {
    // routes crossing every candidate position around the anchor
    const obstacles: Array<[number, number]> = [];
    for (let dy = -120; dy <= 120; dy += 2) {
      for (let dx = -300; dx <= 300; dx += 2) {
        obstacles.push([500 + dx, 500 + dy]);
      }
    }
    const out = placeLabels(
      [label({ id: 'town', kind: 'place', priority: 0 })],
      {
        obstacles,
        safe: SAFE,
        max: 20
      }
    );
    expect(out).toHaveLength(1);
  });

  it('drops a peak when only route-covered spots remain', () => {
    const obstacles: Array<[number, number]> = [];
    for (let dy = -120; dy <= 120; dy += 2) {
      for (let dx = -300; dx <= 300; dx += 2) {
        obstacles.push([500 + dx, 500 + dy]);
      }
    }
    expect(
      placeLabels([label({ id: 'peak' })], { obstacles, safe: SAFE, max: 20 })
    ).toHaveLength(0);
  });

  it('protects the elevation line under a peak name from routes', () => {
    // a route running just below where the name would sit
    const obstacles: Array<[number, number]> = Array.from(
      { length: 400 },
      (_, i) => [310 + i, 500 - 26 + 20]
    );
    for (const p of placeLabels([label({ id: 'peak' })], {
      obstacles,
      safe: SAFE,
      max: 20
    })) {
      const b = boxOf(p);
      expect(
        obstacles.some(
          ([x, y]) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1
        )
      ).toBe(false);
    }
  });

  it('never covers a peak marker with its own text', () => {
    const out = placeLabels([label({ id: 'peak' })], {
      obstacles: [],
      safe: SAFE,
      max: 20
    });
    for (const p of out) {
      const b = boxOf(p);
      const marker = { x0: p.x - 14, y0: p.y - 14, x1: p.x + 14, y1: p.y + 14 };
      expect(overlap(b, marker)).toBe(false);
    }
  });

  it('prefers higher priority when space is tight', () => {
    const out = placeLabels(
      [label({ id: 'low', priority: 9 }), label({ id: 'high', priority: 0 })],
      { obstacles: [], safe: SAFE, max: 1 }
    );
    expect(out[0]!.id).toBe('high');
  });

  it('is deterministic', () => {
    const input = Array.from({ length: 15 }, (_, i) =>
      label({
        id: `p${i}`,
        x: 200 + (i % 5) * 150,
        y: 200 + Math.floor(i / 5) * 180
      })
    );
    const a = placeLabels(input, { obstacles: [], safe: SAFE, max: 12 });
    const b = placeLabels(input, { obstacles: [], safe: SAFE, max: 12 });
    expect(a).toEqual(b);
  });
});

describe('estimateTextWidth', () => {
  it('grows with length, size and tracking', () => {
    expect(estimateTextWidth('ABCD', 20, 0.2)).toBeGreaterThan(
      estimateTextWidth('AB', 20, 0.2)
    );
    expect(estimateTextWidth('AB', 30, 0.2)).toBeGreaterThan(
      estimateTextWidth('AB', 20, 0.2)
    );
    expect(estimateTextWidth('AB', 20, 0.4)).toBeGreaterThan(
      estimateTextWidth('AB', 20, 0.1)
    );
  });
});

describe('foreign summit markers', () => {
  it("keeps a label clear of another peak's marker", () => {
    // two peaks close together: the second must not have its text run through
    // the first one's triangle
    const peaks: LabelInput[] = [
      label({ id: 'a', x: 500, y: 500 }),
      label({ id: 'b', x: 560, y: 520, width: 240 })
    ];
    const markers: Array<[number, number]> = peaks.flatMap((p) => {
      const out: Array<[number, number]> = [];
      for (let dx = -11; dx <= 11; dx += 11) {
        for (let dy = -11; dy <= 11; dy += 11) {
          out.push([p.x + dx, p.y + dy]);
        }
      }
      return out;
    });
    const placed = placeLabels(peaks, {
      obstacles: markers,
      safe: SAFE,
      max: 20
    });
    for (const p of placed) {
      const b = boxOf(p);
      for (const [mx, my] of markers) {
        expect(mx >= b.x0 && mx <= b.x1 && my >= b.y0 && my <= b.y1).toBe(
          false
        );
      }
    }
  });
});

describe('foreign summit markers', () => {
  it("keeps a label clear of another peak's marker", () => {
    const peaks: LabelInput[] = [
      label({ id: 'a', x: 500, y: 500 }),
      label({ id: 'b', x: 560, y: 520, width: 240 })
    ];
    const markers: Array<[number, number]> = peaks.flatMap((pk) => {
      const out: Array<[number, number]> = [];
      for (let dx = -11; dx <= 11; dx += 11) {
        for (let dy = -11; dy <= 11; dy += 11) {
          out.push([pk.x + dx, pk.y + dy]);
        }
      }
      return out;
    });
    for (const p of placeLabels(peaks, {
      obstacles: markers,
      safe: SAFE,
      max: 20
    })) {
      const b = boxOf(p);
      for (const [mx, my] of markers) {
        expect(mx >= b.x0 && mx <= b.x1 && my >= b.y0 && my <= b.y1).toBe(
          false
        );
      }
    }
  });
});

describe('principalAxis', () => {
  const load = () => import('@/util/labels.ts');

  it('finds a horizontal shape', async () => {
    const { principalAxis } = await load();
    const box: Array<[number, number]> = [
      [0, 0],
      [100, 0],
      [100, 10],
      [0, 10]
    ];
    const a = principalAxis(box);
    expect(Math.abs(a.angle)).toBeLessThan(1);
    expect(a.length).toBeGreaterThan(a.width);
  });

  it('finds a vertical shape', async () => {
    const { principalAxis } = await load();
    const box: Array<[number, number]> = [
      [0, 0],
      [10, 0],
      [10, 100],
      [0, 100]
    ];
    expect(Math.abs(principalAxis(box).angle)).toBeCloseTo(90, 0);
  });

  it('follows a diagonal shape', async () => {
    const { principalAxis } = await load();
    // a thin bar along the 45° diagonal
    const pts: Array<[number, number]> = [];
    for (let t = 0; t <= 100; t += 5) {
      pts.push([t, t], [t + 3, t - 3]);
    }
    expect(principalAxis(pts).angle).toBeCloseTo(45, 0);
  });

  it('never returns an upside-down angle', async () => {
    const { principalAxis } = await load();
    for (const deg of [10, 80, 100, 170, 190, 260, 350]) {
      const r = (deg * Math.PI) / 180;
      const pts: Array<[number, number]> = [];
      for (let t = -50; t <= 50; t += 5) {
        pts.push([t * Math.cos(r), t * Math.sin(r)]);
      }
      const a = principalAxis(pts);
      expect(a.angle).toBeGreaterThanOrEqual(-90);
      expect(a.angle).toBeLessThanOrEqual(90);
    }
  });

  it('reports the centre', async () => {
    const { principalAxis } = await load();
    const box: Array<[number, number]> = [
      [10, 20],
      [30, 20],
      [30, 40],
      [10, 40]
    ];
    const a = principalAxis(box);
    expect(a.x).toBeCloseTo(20, 6);
    expect(a.y).toBeCloseTo(30, 6);
  });

  it('measures a long shape as longer than it is wide', async () => {
    const { principalAxis } = await load();
    // a typical mountain lake: long, narrow, tilted off the axes
    const pts: Array<[number, number]> = [];
    for (let t = 0; t <= 120; t += 4) {
      pts.push([t * 0.4, t], [t * 0.4 + 22, t - 6]);
    }
    const a = principalAxis(pts);
    expect(a.length).toBeGreaterThan(a.width * 2);
  });

  it('handles a circle without blowing up', async () => {
    const { principalAxis } = await load();
    const pts: Array<[number, number]> = [];
    for (let d = 0; d < 360; d += 10) {
      const r = (d * Math.PI) / 180;
      pts.push([Math.cos(r) * 50, Math.sin(r) * 50]);
    }
    const a = principalAxis(pts);
    expect(a.length).toBeCloseTo(a.width, 0);
    expect(Number.isFinite(a.angle)).toBe(true);
  });

  it('throws on empty input', async () => {
    const { principalAxis } = await load();
    expect(() => principalAxis([])).toThrow();
  });
});

describe('water labels', () => {
  it('never slides sideways onto a neighbouring lake', () => {
    const lake = label({
      id: 'lake',
      kind: 'water',
      x: 500,
      y: 500,
      width: 200
    });
    const placed = placeLabels([lake], { obstacles: [], safe: SAFE, max: 20 });
    for (const p of placed) {
      // only vertical offsets are allowed, so it stays over its own outline
      expect(p.labelX).toBe(p.x);
    }
  });

  it('is dropped rather than moved far when both slots are taken', () => {
    const blocker = label({
      id: 'blocker',
      kind: 'place',
      priority: 0,
      x: 500,
      y: 470,
      width: 300
    });
    const blocker2 = label({
      id: 'blocker2',
      kind: 'place',
      priority: 0,
      x: 500,
      y: 535,
      width: 300
    });
    const lake = label({
      id: 'lake',
      kind: 'water',
      priority: 9,
      x: 500,
      y: 500,
      width: 200
    });
    const placed = placeLabels([blocker, blocker2, lake], {
      obstacles: [],
      safe: SAFE,
      max: 20
    });
    expect(placed.find((p) => p.id === 'lake')).toBeUndefined();
  });

  it('is kept when only a route crosses it, like a place', () => {
    const obstacles: Array<[number, number]> = Array.from(
      { length: 600 },
      (_, i) => [250 + i, 482]
    );
    const lake = label({
      id: 'lake',
      kind: 'water',
      x: 500,
      y: 500,
      width: 200
    });
    expect(
      placeLabels([lake], { obstacles, safe: SAFE, max: 20 })
    ).toHaveLength(1);
  });
});

describe('hypsometricFor', () => {
  const load = () => import('@/util/terrain.ts');

  it('spans the full ramp across an alpine range', async () => {
    const { hypsometricFor } = await load();
    const ramp = hypsometricFor({ min: 600, max: 2400 });
    const low = ramp(600);
    const high = ramp(2400);
    // green valley floor against pale rock: clearly different colours
    expect(Math.abs(low[0] - high[0])).toBeGreaterThan(50);
  });

  it('also spans it across a coastal range — the old fixed scale did not', async () => {
    const { hypsometricFor } = await load();
    const ramp = hypsometricFor({ min: 0, max: 200 });
    expect(Math.abs(ramp(0)[0] - ramp(200)[0])).toBeGreaterThan(50);
  });

  it('and across a Himalayan one', async () => {
    const { hypsometricFor } = await load();
    const ramp = hypsometricFor({ min: 2000, max: 5000 });
    expect(Math.abs(ramp(2000)[0] - ramp(5000)[0])).toBeGreaterThan(50);
  });

  it('does not amplify noise on flat ground', async () => {
    const { hypsometricFor } = await load();
    // 12 m of relief is sensor noise, not landform — it must stay quiet
    const ramp = hypsometricFor({ min: 100, max: 112 });
    expect(Math.abs(ramp(100)[0] - ramp(112)[0])).toBeLessThan(12);
  });

  it('clamps outside the range instead of running off the ramp', async () => {
    const { hypsometricFor } = await load();
    const ramp = hypsometricFor({ min: 500, max: 1500 });
    expect(ramp(-200)).toEqual(ramp(500));
    expect(ramp(9000)).toEqual(ramp(1500));
  });

  it('is continuous — no banding at the stops', async () => {
    const { hypsometricFor } = await load();
    const ramp = hypsometricFor({ min: 0, max: 1000 });
    let prev = ramp(0);
    for (let e = 10; e <= 1000; e += 10) {
      const cur = ramp(e);
      for (let c = 0; c < 3; c += 1) {
        expect(Math.abs(cur[c]! - prev[c]!)).toBeLessThan(12);
      }
      prev = cur;
    }
  });

  it('reads missing data as the lowest ground present', async () => {
    const { hypsometricFor } = await load();
    const ramp = hypsometricFor({ min: 40, max: 900 });
    expect(ramp(NaN)).toEqual(ramp(40));
  });
});
