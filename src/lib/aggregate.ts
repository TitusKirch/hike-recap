/** Totals across the trip. Displayed values only ever come from tours.json. */

export type TourStats = {
  distanceKm: number;
  ascentM: number;
  descentM: number;
  durationMin: number;
};

export function aggregate(
  tours: ReadonlyArray<{ stats: TourStats }>
): TourStats {
  const total = tours.reduce(
    (acc, t) => ({
      distanceKm: acc.distanceKm + t.stats.distanceKm,
      ascentM: acc.ascentM + t.stats.ascentM,
      descentM: acc.descentM + t.stats.descentM,
      durationMin: acc.durationMin + t.stats.durationMin
    }),
    { distanceKm: 0, ascentM: 0, descentM: 0, durationMin: 0 }
  );
  return { ...total, distanceKm: Math.round(total.distanceKm * 10) / 10 };
}

/** Inclusive day count between two ISO dates. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) {
    throw new Error(`bad date range: ${from} → ${to}`);
  }
  return Math.round((b - a) / 86_400_000) + 1;
}

/** Every ISO date in the range, inclusive. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const start = Date.parse(`${from}T00:00:00Z`);
  for (let i = 0; i < daysBetween(from, to); i += 1) {
    out.push(new Date(start + i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : `${h} h ${String(m).padStart(2, '0')} min`;
}

export function formatKm(km: number): string {
  return `${km.toFixed(1).replace('.', ',')} km`;
}
