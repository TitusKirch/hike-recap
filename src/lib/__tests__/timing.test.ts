import { describe, expect, it } from 'vitest';
import { chapterAt, planChapters, progressIn } from '@/util/timing.ts';
import { TOTAL_FRAMES } from '@/video.ts';

describe('planChapters', () => {
  const chapters = planChapters(10);

  it('covers every frame with no gap and no overlap', () => {
    expect(chapters[0]!.start).toBe(0);
    expect(chapters.at(-1)!.end).toBe(TOTAL_FRAMES);
    for (let i = 1; i < chapters.length; i += 1) {
      expect(chapters[i]!.start).toBe(chapters[i - 1]!.end);
    }
  });

  it('produces intro + one per tour + outro', () => {
    expect(chapters).toHaveLength(12);
    expect(chapters[0]!.kind).toBe('intro');
    expect(chapters.at(-1)!.kind).toBe('outro');
    expect(chapters.filter((c) => c.kind === 'tour')).toHaveLength(10);
  });

  it('gives every tour a non-empty, near-equal slot', () => {
    const spans = chapters
      .filter((c) => c.kind === 'tour')
      .map((c) => c.end - c.start);
    expect(Math.min(...spans)).toBeGreaterThan(0);
    expect(Math.max(...spans) - Math.min(...spans)).toBeLessThanOrEqual(1);
  });

  it('numbers the tours in order', () => {
    const tours = chapters.filter((c) => c.kind === 'tour');
    tours.forEach((c, i) => expect(c.tourIndex).toBe(i));
  });

  it('rejects impossible plans', () => {
    expect(() => planChapters(0)).toThrow();
    expect(() => planChapters(5, 10)).toThrow();
  });
});

describe('chapterAt', () => {
  const chapters = planChapters(10);

  it('finds the chapter containing a frame', () => {
    expect(chapterAt(chapters, 0).kind).toBe('intro');
    expect(chapterAt(chapters, TOTAL_FRAMES - 1).kind).toBe('outro');
  });

  it('never returns undefined across the whole timeline', () => {
    for (let f = 0; f < TOTAL_FRAMES; f += 7) {
      expect(chapterAt(chapters, f)).toBeDefined();
    }
  });

  it('is exclusive at the upper bound', () => {
    const first = chapters[0]!;
    expect(chapterAt(chapters, first.end).kind).not.toBe('intro');
  });
});

describe('progressIn', () => {
  const chapter = { kind: 'tour' as const, tourIndex: 0, start: 100, end: 200 };

  it('runs 0 → 1 across the chapter', () => {
    expect(progressIn(chapter, 100)).toBe(0);
    expect(progressIn(chapter, 199)).toBe(1);
  });

  it('clamps outside the chapter', () => {
    expect(progressIn(chapter, 50)).toBe(0);
    expect(progressIn(chapter, 500)).toBe(1);
  });

  it('is monotonic', () => {
    let prev = -1;
    for (let f = 100; f < 200; f += 1) {
      const p = progressIn(chapter, f);
      expect(p).toBeGreaterThanOrEqual(prev);
      prev = p;
    }
  });
});

describe('centreOn', () => {
  it('moves content to the requested screen row', async () => {
    const { centreOn, project, viewForBounds } =
      await import('@/util/camera.ts');
    const bounds = { minLat: 50.9, minLon: 14.0, maxLat: 50.95, maxLon: 14.05 };
    const view = centreOn(viewForBounds(bounds, 150, 1180), 590);
    const midLat = (bounds.minLat + bounds.maxLat) / 2;
    const midLon = (bounds.minLon + bounds.maxLon) / 2;
    const [, y] = project(view, midLon, midLat);
    expect(y).toBeCloseTo(590, 0);
  });

  it('keeps a whole tour above the info panel', async () => {
    const { centreOn, project, viewForBounds } =
      await import('@/util/camera.ts');
    const bounds = { minLat: 50.9, minLon: 14.0, maxLat: 50.96, maxLon: 14.03 };
    const view = centreOn(viewForBounds(bounds, 150, 1180), 590);
    const corners: Array<[number, number]> = [
      [bounds.minLon, bounds.minLat],
      [bounds.maxLon, bounds.maxLat],
      [bounds.minLon, bounds.maxLat],
      [bounds.maxLon, bounds.minLat]
    ];
    for (const [lon, lat] of corners) {
      const [x, y] = project(view, lon, lat);
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(1180);
      expect(x).toBeGreaterThan(0);
      expect(x).toBeLessThan(1080);
    }
  });
});
