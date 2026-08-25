import { describe, expect, it } from 'vitest';
import {
  aggregate,
  dateRange,
  daysBetween,
  formatDuration,
  formatKm
} from '@/lib/aggregate.ts';

const stats = (
  distanceKm: number,
  ascentM: number,
  descentM: number,
  durationMin: number
) => ({
  stats: { distanceKm, ascentM, descentM, durationMin }
});

describe('aggregate', () => {
  it('is all zeroes for no tours', () => {
    expect(aggregate([])).toEqual({
      distanceKm: 0,
      ascentM: 0,
      descentM: 0,
      durationMin: 0
    });
  });

  it('sums every field', () => {
    expect(
      aggregate([stats(11, 263, 265, 227), stats(7.6, 638, 806, 319)])
    ).toEqual({
      distanceKm: 18.6,
      ascentM: 901,
      descentM: 1071,
      durationMin: 546
    });
  });

  it('avoids float drift in the distance total', () => {
    const tours = [stats(0.1, 0, 0, 0), stats(0.2, 0, 0, 0)];
    expect(aggregate(tours).distanceKm).toBe(0.3);
  });

  it('sums a full holiday without drift', () => {
    // ten tours of varied length — the shape a real trip has
    const trip = Array.from({ length: 10 }, (_, i) =>
      stats(4 + i * 0.8, 100 + i * 50, 120 + i * 55, 60 + i * 25)
    );
    const total = aggregate(trip);
    expect(total.distanceKm).toBeCloseTo(76, 1);
    expect(total.ascentM).toBe(3250);
    expect(total.descentM).toBe(3675);
    expect(total.durationMin).toBe(1725);
  });
});

describe('daysBetween', () => {
  it('counts inclusively', () => {
    expect(daysBetween('2026-05-01', '2026-05-13')).toBe(13);
    expect(daysBetween('2026-05-01', '2026-05-01')).toBe(1);
  });

  it('handles a month boundary', () => {
    expect(daysBetween('2026-03-30', '2026-04-02')).toBe(4);
  });

  it('throws on an unparseable date', () => {
    expect(() => daysBetween('nope', '2026-05-13')).toThrow();
  });
});

describe('dateRange', () => {
  it('lists every day inclusively', () => {
    expect(dateRange('2026-05-01', '2026-05-04')).toEqual([
      '2026-05-01',
      '2026-05-02',
      '2026-05-03',
      '2026-05-04'
    ]);
  });

  it('matches daysBetween in length', () => {
    expect(dateRange('2026-05-01', '2026-05-13')).toHaveLength(13);
  });
});

describe('formatting', () => {
  it('formats durations', () => {
    expect(formatDuration(227)).toBe('3 h 47 min');
    expect(formatDuration(94)).toBe('1 h 34 min');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(300)).toBe('5 h 00 min');
  });

  it('formats distances with a German decimal comma', () => {
    expect(formatKm(11)).toBe('11,0 km');
    expect(formatKm(7.65)).toBe('7,7 km');
  });
});
