/**
 * Elevation smoothing.
 *
 * DEM samples are a 30 m raster: along a track they wobble by a few metres from
 * one point to the next even on flat ground. Summing raw differences therefore
 * inflates ascent badly, so a track is smoothed first and small steps ignored.
 */

/** Centred moving average. `window` is clamped to odd and to the series length. */
export function movingAverage(
  values: readonly number[],
  window: number
): number[] {
  if (values.length === 0) {
    return [];
  }
  const w = Math.max(
    1,
    Math.min(values.length, window % 2 === 0 ? window + 1 : window)
  );
  const half = Math.floor(w / 2);
  const out: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    const from = Math.max(0, i - half);
    const to = Math.min(values.length - 1, i + half);
    let sum = 0;
    for (let j = from; j <= to; j += 1) {
      sum += values[j]!;
    }
    out.push(sum / (to - from + 1));
  }
  return out;
}

export type Gain = { ascentM: number; descentM: number };

/**
 * Sum ascent and descent, ignoring runs smaller than `thresholdM`.
 *
 * The threshold applies to an accumulated run rather than a single step —
 * otherwise a long, gentle climb made of 1 m steps would vanish entirely.
 */
export function elevationGain(values: readonly number[], thresholdM = 3): Gain {
  let ascentM = 0;
  let descentM = 0;
  if (values.length < 2) {
    return { ascentM, descentM };
  }
  let anchor = values[0]!;
  for (let i = 1; i < values.length; i += 1) {
    const delta = values[i]! - anchor;
    if (Math.abs(delta) >= thresholdM) {
      if (delta > 0) {
        ascentM += delta;
      } else {
        descentM -= delta;
      }
      anchor = values[i]!;
    }
  }
  return { ascentM: Math.round(ascentM), descentM: Math.round(descentM) };
}
