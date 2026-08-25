/** Easing curves. All map [0,1] → [0,1] and are pure. */

export const clamp01 = (t: number): number => Math.max(0, Math.min(1, t));

export const easeInOutCubic = (t: number): number => {
  const x = clamp01(t);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};

export const easeOutCubic = (t: number): number => 1 - (1 - clamp01(t)) ** 3;

export const easeOutQuint = (t: number): number => 1 - (1 - clamp01(t)) ** 5;

/** Ramp from 0 to 1 across [from,to] of the whole span, flat outside. */
export const ramp = (t: number, from: number, to: number): number =>
  to <= from ? (t >= to ? 1 : 0) : clamp01((t - from) / (to - from));

/** 0 → 1 → 0, held at 1 between `inEnd` and `outStart`. */
export const pulse = (t: number, inEnd: number, outStart: number): number =>
  Math.min(ramp(t, 0, inEnd), 1 - ramp(t, outStart, 1));
