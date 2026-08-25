import { describe, expect, it } from 'vitest';
import { cameraAt, drawnFraction, planDrawSchedule } from '@/util/schedule.ts';

/**
 * Ten tours in metres, spanning a 2.3x range from shortest to longest —
 * the spread that makes equal time slots visibly wrong.
 */
const LENGTHS = [11000, 7600, 5200, 7300, 11400, 6600, 8500, 4900, 7500, 5200];
const OPTS = { totalFrames: 1800, leadIn: 30, holdOut: 60, zoomFrames: 15 };

describe('planDrawSchedule', () => {
  it('gives every tour a phase, in order, without overlap', () => {
    const { phases } = planDrawSchedule(LENGTHS, OPTS);
    expect(phases).toHaveLength(LENGTHS.length);
    phases.forEach((p, i) => expect(p.index).toBe(i));
    for (let i = 1; i < phases.length; i += 1) {
      expect(phases[i]!.zoomStart).toBe(phases[i - 1]!.drawEnd);
    }
  });

  it('opens without a zoom — the camera starts framed on tour one', () => {
    const { phases } = planDrawSchedule(LENGTHS, OPTS);
    expect(phases[0]!.zoomEnd).toBe(phases[0]!.zoomStart);
    expect(phases[0]!.drawStart).toBe(30);
  });

  it('zooms out before every later tour', () => {
    const { phases } = planDrawSchedule(LENGTHS, OPTS);
    for (let i = 1; i < phases.length; i += 1) {
      expect(phases[i]!.zoomEnd - phases[i]!.zoomStart).toBe(15);
    }
  });

  it('draws at a constant speed — this is the whole point', () => {
    const { phases } = planDrawSchedule(LENGTHS, OPTS);
    const speeds = phases.map(
      (p, i) => LENGTHS[i]! / (p.drawEnd - p.drawStart)
    );
    const min = Math.min(...speeds);
    const max = Math.max(...speeds);
    // within 2 % across a 2.3x spread in tour length
    expect((max - min) / min).toBeLessThan(0.02);
  });

  it('gives the longest tour the most draw frames', () => {
    const { phases } = planDrawSchedule(LENGTHS, OPTS);
    const frames = phases.map((p) => p.drawEnd - p.drawStart);
    expect(frames.indexOf(Math.max(...frames))).toBe(
      LENGTHS.indexOf(Math.max(...LENGTHS))
    );
    expect(frames.indexOf(Math.min(...frames))).toBe(
      LENGTHS.indexOf(Math.min(...LENGTHS))
    );
  });

  it('leaves the requested hold at the end', () => {
    const { holdFrom } = planDrawSchedule(LENGTHS, OPTS);
    expect(1800 - holdFrom).toBeGreaterThanOrEqual(60);
    expect(1800 - holdFrom).toBeLessThanOrEqual(62);
  });

  it('rejects impossible input', () => {
    expect(() => planDrawSchedule([], OPTS)).toThrow();
    expect(() => planDrawSchedule([1, 2, 3], { totalFrames: 2 })).toThrow();
    expect(() => planDrawSchedule([0, 0], OPTS)).toThrow();
  });
});

describe('cameraAt', () => {
  const plan = planDrawSchedule(LENGTHS, OPTS);

  it('holds on tour one through the lead-in and its draw', () => {
    expect(cameraAt(plan, 0)).toEqual({ target: 0, from: -1, t: 1 });
    expect(cameraAt(plan, 40)).toEqual({ target: 0, from: -1, t: 1 });
  });

  it('reports a zoom from the previous frame to the new one', () => {
    const second = plan.phases[1]!;
    const mid = Math.floor((second.zoomStart + second.zoomEnd) / 2);
    const cam = cameraAt(plan, mid);
    expect(cam.target).toBe(1);
    expect(cam.from).toBe(0);
    expect(cam.t).toBeGreaterThan(0);
    expect(cam.t).toBeLessThan(1);
  });

  it('rests once a zoom has finished', () => {
    const second = plan.phases[1]!;
    expect(cameraAt(plan, second.drawStart + 5)).toEqual({
      target: 1,
      from: -1,
      t: 1
    });
  });

  it('never leaves the camera undefined across the whole timeline', () => {
    for (let f = 0; f < 1800; f += 1) {
      const cam = cameraAt(plan, f);
      expect(cam.target).toBeGreaterThanOrEqual(0);
      expect(cam.target).toBeLessThan(LENGTHS.length);
      expect(cam.t).toBeGreaterThanOrEqual(0);
      expect(cam.t).toBeLessThanOrEqual(1);
    }
  });

  it('only ever widens — the target never goes backwards', () => {
    let prev = 0;
    for (let f = 0; f < 1800; f += 1) {
      const { target } = cameraAt(plan, f);
      expect(target).toBeGreaterThanOrEqual(prev);
      prev = target;
    }
  });

  it('holds the widest frame after the last tour', () => {
    expect(cameraAt(plan, 1799)).toEqual({ target: 9, from: -1, t: 1 });
  });
});

describe('drawnFraction', () => {
  const phase = {
    index: 0,
    zoomStart: 90,
    zoomEnd: 100,
    drawStart: 100,
    drawEnd: 200
  };

  it('is 0 during the zoom and before the draw', () => {
    expect(drawnFraction(phase, 95)).toBe(0);
    expect(drawnFraction(phase, 100)).toBe(0);
  });

  it('is 1 at and after the end', () => {
    expect(drawnFraction(phase, 200)).toBe(1);
    expect(drawnFraction(phase, 999)).toBe(1);
  });

  it('is halfway at the midpoint and monotonic throughout', () => {
    expect(drawnFraction(phase, 150)).toBeCloseTo(0.5, 5);
    let prev = -1;
    for (let f = 100; f <= 200; f += 1) {
      const v = drawnFraction(phase, f);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

describe('holding the camera still', () => {
  it('spends no frames on a tour that does not move the camera', () => {
    const needsZoom = [
      false,
      true,
      false,
      true,
      false,
      true,
      false,
      true,
      false,
      true
    ];
    const plan = planDrawSchedule(LENGTHS, { ...OPTS, needsZoom });
    plan.phases.forEach((p, i) => {
      expect(p.zoomEnd - p.zoomStart).toBe(needsZoom[i] ? 15 : 0);
    });
  });

  it('gives the reclaimed frames to drawing', () => {
    const all = planDrawSchedule(LENGTHS, OPTS);
    const some = planDrawSchedule(LENGTHS, {
      ...OPTS,
      needsZoom: LENGTHS.map((_, i) => i % 2 === 1)
    });
    const drawn = (p: ReturnType<typeof planDrawSchedule>) =>
      p.phases.reduce((a, x) => a + (x.drawEnd - x.drawStart), 0);
    expect(drawn(some)).toBeGreaterThan(drawn(all));
  });

  it('still covers the timeline without gaps', () => {
    const plan = planDrawSchedule(LENGTHS, {
      ...OPTS,
      needsZoom: [
        false,
        false,
        true,
        false,
        true,
        false,
        false,
        true,
        false,
        false
      ]
    });
    for (let i = 1; i < plan.phases.length; i += 1) {
      expect(plan.phases[i]!.zoomStart).toBe(plan.phases[i - 1]!.drawEnd);
    }
    expect(1800 - plan.holdFrom).toBeGreaterThanOrEqual(60);
  });

  it('keeps drawing speed constant regardless of which zooms are skipped', () => {
    const plan = planDrawSchedule(LENGTHS, {
      ...OPTS,
      needsZoom: LENGTHS.map((_, i) => i % 3 === 0)
    });
    const speeds = plan.phases.map(
      (p, i) => LENGTHS[i]! / (p.drawEnd - p.drawStart)
    );
    expect(
      (Math.max(...speeds) - Math.min(...speeds)) / Math.min(...speeds)
    ).toBeLessThan(0.03);
  });
});
