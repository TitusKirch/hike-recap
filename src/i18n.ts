/**
 * Wording, kept out of the components.
 *
 * A locale is a JSON file under `locales/`; `data/tours.json` names which one.
 * Vite bundles them all eagerly — there are two small files, and resolving them
 * lazily would mean a fetch inside the render path, which is exactly what this
 * project does not do.
 */
export type Locale = {
  months: string[];
  stats: {
    distance: string;
    ascent: string;
    descent: string;
    duration: string;
  };
  units: { kilometres: string; metres: string; hours: string; minutes: string };
  attribution: { elevation: string; map: string };
};

const bundles = import.meta.glob<Locale>('../locales/*.json', {
  eager: true,
  import: 'default'
});

const byName = new Map<string, Locale>(
  Object.entries(bundles).map(([path, value]) => [
    /([^/]+)\.json$/.exec(path)![1]!,
    value
  ])
);

export const availableLocales = (): string[] => [...byName.keys()].sort();

/**
 * @param tag a locale name (`de`) or a BCP-47 tag whose language subtag names
 *   one (`de-DE`). Falls back to the first bundle rather than throwing: a
 *   missing translation should not stop a render.
 */
export function loadLocale(tag: string): Locale {
  const exact = byName.get(tag);
  if (exact !== undefined) {
    return exact;
  }
  const language = tag.split('-')[0]!;
  const byLanguage = byName.get(language);
  if (byLanguage !== undefined) {
    return byLanguage;
  }
  const [first] = byName.values();
  if (first === undefined) {
    throw new Error('no locale bundles found under locales/');
  }
  console.warn(`locale "${tag}" not found, falling back`);
  return first;
}

/** `1 h 34 min`, or `45 min` under the hour. */
export function formatDuration(minutes: number, locale: Locale): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const { hours, minutes: min } = locale.units;
  return h === 0
    ? `${m} ${min}`
    : `${h} ${hours} ${String(m).padStart(2, '0')} ${min}`;
}

export function formatKm(km: number, locale: Locale, tag: string): string {
  return `${km.toFixed(1).replace('.', decimalSeparator(tag))} ${locale.units.kilometres}`;
}

export function formatMetres(m: number, locale: Locale, tag: string): string {
  return `${m.toLocaleString(tag)} ${locale.units.metres}`;
}

/** Day and month, as `14. August 2026` or `14 August 2026`. */
export function formatDate(iso: string, locale: Locale, tag: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const month = locale.months[m! - 1] ?? '';
  const ordinal = tag.startsWith('de') ? `${d}.` : `${d}`;
  return `${ordinal} ${month} ${y}`;
}

function decimalSeparator(tag: string): string {
  return (1.1).toLocaleString(tag).includes(',') ? ',' : '.';
}
