import { describe, expect, it } from 'vitest';
import { elevationGain, movingAverage } from '@/lib/smooth.ts';

describe('movingAverage', () => {
  it('returns empty for empty input', () => {
    expect(movingAverage([], 5)).toEqual([]);
  });

  it('leaves a constant series unchanged', () => {
    expect(movingAverage([7, 7, 7, 7, 7], 3)).toEqual([7, 7, 7, 7, 7]);
  });

  it('preserves length', () => {
    expect(movingAverage([1, 5, 2, 8, 3, 9, 4], 5)).toHaveLength(7);
  });

  it('damps a single spike', () => {
    const raw = [10, 10, 40, 10, 10];
    const smoothed = movingAverage(raw, 3);
    expect(smoothed[2]!).toBeLessThan(40);
    expect(smoothed[2]!).toBeGreaterThan(10);
  });

  it('keeps the mean roughly intact', () => {
    const raw = [3, 9, 4, 8, 5, 7, 6];
    const mean = (xs: readonly number[]) =>
      xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(movingAverage(raw, 3))).toBeCloseTo(mean(raw), 0);
  });

  it('treats an even window as the next odd one', () => {
    expect(movingAverage([1, 2, 3, 4, 5], 4)).toEqual(
      movingAverage([1, 2, 3, 4, 5], 5)
    );
  });
});

describe('elevationGain', () => {
  it('is zero for a flat track', () => {
    expect(elevationGain([100, 100, 100, 100])).toEqual({
      ascentM: 0,
      descentM: 0
    });
  });

  it('is zero for fewer than two samples', () => {
    expect(elevationGain([500])).toEqual({ ascentM: 0, descentM: 0 });
  });

  it('sums a pure climb', () => {
    expect(elevationGain([1000, 1100, 1200], 3)).toEqual({
      ascentM: 200,
      descentM: 0
    });
  });

  it('separates up from down', () => {
    expect(elevationGain([1000, 1200, 1050], 3)).toEqual({
      ascentM: 200,
      descentM: 150
    });
  });

  it('ignores noise below the threshold', () => {
    const jittery = [1000, 1001, 1000, 1001, 1000, 1001];
    expect(elevationGain(jittery, 5)).toEqual({ ascentM: 0, descentM: 0 });
  });

  it('still catches a slow climb made of small steps', () => {
    // 1 m steps that never individually clear a 3 m threshold, but do accumulate
    const creep = Array.from({ length: 60 }, (_, i) => 1000 + i);
    const { ascentM } = elevationGain(creep, 3);
    expect(ascentM).toBeGreaterThan(50);
  });

  it('rounds to whole metres', () => {
    const { ascentM } = elevationGain([100, 104.4], 3);
    expect(Number.isInteger(ascentM)).toBe(true);
  });
});
