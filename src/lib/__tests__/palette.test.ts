import { describe, expect, it } from 'vitest';
import { hslToHex, routeColours } from '@/util/palette.ts';

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16)
];

/** Rough perceptual distance — enough to tell "different colour" from "same". */
const distance = (a: string, b: string): number => {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.hypot((r1 - r2) * 0.3, (g1 - g2) * 0.59, (b1 - b2) * 0.11);
};

describe('routeColours', () => {
  it('returns exactly what was asked for', () => {
    for (const n of [1, 5, 12, 13, 30]) {
      expect(routeColours(n)).toHaveLength(n);
    }
  });

  it('keeps the curated twelve unchanged', () => {
    const twelve = routeColours(12);
    expect(twelve[0]).toBe('#E8331B');
    expect(twelve[11]).toBe('#263238');
    // asking for more must not disturb the ones already in use
    expect(routeColours(25).slice(0, 12)).toEqual(twelve);
  });

  it('never repeats — the bug that gave two tours one colour', () => {
    for (const n of [13, 20, 40]) {
      const list = routeColours(n);
      expect(new Set(list).size).toBe(n);
    }
  });

  it('keeps generated colours off the green ground', () => {
    // the map's mid-green; nothing may sit close to it
    const ground = '#A9C489';
    for (const c of routeColours(40).slice(12)) {
      expect(distance(c, ground)).toBeGreaterThan(20);
    }
  });

  it('keeps neighbours in the sequence apart', () => {
    const list = routeColours(30);
    for (let i = 1; i < list.length; i += 1) {
      expect(distance(list[i]!, list[i - 1]!)).toBeGreaterThan(8);
    }
  });

  it('is deterministic', () => {
    expect(routeColours(20)).toEqual(routeColours(20));
  });

  it('handles zero', () => {
    expect(routeColours(0)).toEqual([]);
  });
});

describe('hslToHex', () => {
  it('converts the primaries', () => {
    expect(hslToHex(0, 100, 50)).toBe('#FF0000');
    expect(hslToHex(120, 100, 50)).toBe('#00FF00');
    expect(hslToHex(240, 100, 50)).toBe('#0000FF');
  });

  it('handles the achromatic ends', () => {
    expect(hslToHex(0, 0, 0)).toBe('#000000');
    expect(hslToHex(0, 0, 100)).toBe('#FFFFFF');
  });

  it('always emits six hex digits', () => {
    for (let h = 0; h < 360; h += 17) {
      expect(hslToHex(h, 72, 33)).toMatch(/^#[0-9A-F]{6}$/);
    }
  });
});
