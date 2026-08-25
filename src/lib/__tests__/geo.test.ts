import { describe, expect, it } from 'vitest';
import {
  boundsOf,
  cumulativeDistances,
  haversine,
  mergeBounds,
  simplify,
  trackLength
} from '@/lib/geo.ts';

describe('haversine', () => {
  it('is zero for identical points', () => {
    expect(haversine({ lat: 47.5, lon: 10.4 }, { lat: 47.5, lon: 10.4 })).toBe(
      0
    );
  });

  it('matches a known distance', () => {
    // one degree of latitude is ~111.2 km anywhere on the globe
    const d = haversine({ lat: 47, lon: 10 }, { lat: 48, lon: 10 });
    expect(d).toBeGreaterThan(111_000);
    expect(d).toBeLessThan(111_400);
  });

  it('is symmetric', () => {
    const a = { lat: 50.85, lon: 13.95 };
    const b = { lat: 50.92, lon: 14.06 };
    expect(haversine(a, b)).toBeCloseTo(haversine(b, a), 6);
  });
});

describe('trackLength', () => {
  it('is zero for fewer than two points', () => {
    expect(trackLength([])).toBe(0);
    expect(trackLength([{ lat: 47, lon: 10 }])).toBe(0);
  });

  it('sums the legs', () => {
    const pts = [
      { lat: 47.0, lon: 10.0 },
      { lat: 47.1, lon: 10.0 },
      { lat: 47.2, lon: 10.0 }
    ];
    const legs = haversine(pts[0]!, pts[1]!) + haversine(pts[1]!, pts[2]!);
    expect(trackLength(pts)).toBeCloseTo(legs, 6);
  });
});

describe('cumulativeDistances', () => {
  it('starts at zero and ends at the total length', () => {
    const pts = [
      { lat: 47.0, lon: 10.0 },
      { lat: 47.05, lon: 10.02 },
      { lat: 47.1, lon: 10.0 }
    ];
    const cum = cumulativeDistances(pts);
    expect(cum).toHaveLength(pts.length);
    expect(cum[0]).toBe(0);
    expect(cum.at(-1)).toBeCloseTo(trackLength(pts), 6);
  });

  it('increases monotonically', () => {
    const pts = Array.from({ length: 20 }, (_, i) => ({
      lat: 47 + i * 0.01,
      lon: 10 + i * 0.005
    }));
    const cum = cumulativeDistances(pts);
    for (let i = 1; i < cum.length; i += 1) {
      expect(cum[i]!).toBeGreaterThan(cum[i - 1]!);
    }
  });
});

describe('boundsOf', () => {
  it('spans the extremes', () => {
    expect(
      boundsOf([
        { lat: 47.5, lon: 10.4 },
        { lat: 47.2, lon: 10.9 },
        { lat: 47.8, lon: 10.1 }
      ])
    ).toEqual({ minLat: 47.2, minLon: 10.1, maxLat: 47.8, maxLon: 10.9 });
  });

  it('throws on an empty track', () => {
    expect(() => boundsOf([])).toThrow();
  });
});

describe('mergeBounds', () => {
  it('unions the inputs', () => {
    expect(
      mergeBounds([
        { minLat: 47, minLon: 10, maxLat: 47.5, maxLon: 10.5 },
        { minLat: 46.8, minLon: 10.2, maxLat: 47.2, maxLon: 11 }
      ])
    ).toEqual({ minLat: 46.8, minLon: 10, maxLat: 47.5, maxLon: 11 });
  });
});

describe('simplify', () => {
  it('keeps both endpoints', () => {
    const pts = Array.from({ length: 50 }, (_, i) => ({
      lat: 47 + i * 0.001,
      lon: 10 + i * 0.001
    }));
    const out = simplify(pts, 2);
    expect(out[0]).toEqual(pts[0]);
    expect(out.at(-1)).toEqual(pts.at(-1));
  });

  it('collapses a straight line to its endpoints', () => {
    const pts = Array.from({ length: 30 }, (_, i) => ({
      lat: 47,
      lon: 10 + i * 0.001
    }));
    expect(simplify(pts, 1)).toHaveLength(2);
  });

  it('keeps a pronounced detour', () => {
    const pts = [
      { lat: 47, lon: 10 },
      { lat: 47.05, lon: 10.001 },
      { lat: 47, lon: 10.002 }
    ];
    expect(simplify(pts, 1)).toHaveLength(3);
  });

  it('never grows the track', () => {
    const pts = Array.from({ length: 200 }, (_, i) => ({
      lat: 47 + Math.sin(i / 7) * 0.01,
      lon: 10 + i * 0.0005
    }));
    expect(simplify(pts, 3).length).toBeLessThanOrEqual(pts.length);
  });

  it('passes short tracks through untouched', () => {
    const pts = [
      { lat: 47, lon: 10 },
      { lat: 47.1, lon: 10.1 }
    ];
    expect(simplify(pts, 5)).toEqual(pts);
  });
});

describe('buildGrid', () => {
  const tile = (z: number, x: number, y: number) => ({
    key: { z, x, y },
    rgb: new Uint8Array(256 * 256 * 3)
  });

  it('rejects a mix of zoom levels', async () => {
    const { buildGrid } = await import('@/lib/dem.ts');
    // stale tiles from a previous area would otherwise allocate a grid
    // spanning both coordinate systems
    expect(() =>
      buildGrid(12, [tile(12, 100, 100), tile(13, 200, 200)])
    ).toThrow(/mix zoom levels/);
  });

  it('names the levels it found', async () => {
    const { buildGrid } = await import('@/lib/dem.ts');
    expect(() => buildGrid(12, [tile(12, 1, 1), tile(13, 2, 2)])).toThrow(
      /12, 13/
    );
  });

  it('accepts a consistent set', async () => {
    const { buildGrid } = await import('@/lib/dem.ts');
    const grid = buildGrid(12, [tile(12, 10, 10), tile(12, 11, 10)]);
    expect(grid.width).toBe(512);
    expect(grid.height).toBe(256);
    expect(grid.zoom).toBe(12);
  });

  it('needs at least one tile', async () => {
    const { buildGrid } = await import('@/lib/dem.ts');
    expect(() => buildGrid(12, [])).toThrow();
  });
});

describe('pixel/degree round trip', () => {
  it('inverts the longitude projection', async () => {
    const { lonToPixelX, pixelXToLon } = await import('@/lib/geo.ts');
    for (const lon of [-179, -45, 0, 13.95, 90, 179]) {
      for (const z of [8, 12, 15]) {
        expect(pixelXToLon(lonToPixelX(lon, z), z)).toBeCloseTo(lon, 6);
      }
    }
  });

  it('inverts the latitude projection', async () => {
    const { latToPixelY, pixelYToLat } = await import('@/lib/geo.ts');
    for (const lat of [-70, -30, 0, 50.94, 60, 80]) {
      for (const z of [8, 12, 15]) {
        expect(pixelYToLat(latToPixelY(lat, z), z)).toBeCloseTo(lat, 6);
      }
    }
  });
});
