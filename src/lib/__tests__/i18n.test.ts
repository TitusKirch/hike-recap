import { describe, expect, it } from 'vitest';
import de from '../../../locales/de.json';
import en from '../../../locales/en.json';
import {
  formatDate,
  formatDuration,
  formatKm,
  formatMetres,
  type Locale
} from '@/i18n.ts';

const DE = de as Locale;
const EN = en as Locale;

describe('locale bundles', () => {
  it('carry the same keys', () => {
    const shape = (l: Locale) => [
      l.months.length,
      Object.keys(l.stats).sort().join(),
      Object.keys(l.units).sort().join(),
      Object.keys(l.attribution).sort().join()
    ];
    expect(shape(DE)).toEqual(shape(EN));
  });

  it('name twelve months', () => {
    expect(DE.months).toHaveLength(12);
    expect(EN.months).toHaveLength(12);
  });

  it('leave no string empty', () => {
    for (const bundle of [DE, EN]) {
      for (const value of [
        ...bundle.months,
        ...Object.values(bundle.stats),
        ...Object.values(bundle.units),
        ...Object.values(bundle.attribution)
      ]) {
        expect(value.trim()).not.toBe('');
      }
    }
  });
});

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(227, DE)).toBe('3 h 47 min');
    expect(formatDuration(227, EN)).toBe('3 h 47 min');
  });

  it('drops the hour below sixty minutes', () => {
    expect(formatDuration(45, DE)).toBe('45 min');
  });

  it('pads the minutes on a round hour', () => {
    expect(formatDuration(300, DE)).toBe('5 h 00 min');
  });
});

describe('formatKm', () => {
  it('uses a comma in German and a point in English', () => {
    expect(formatKm(11, DE, 'de-DE')).toBe('11,0 km');
    expect(formatKm(11, EN, 'en-GB')).toBe('11.0 km');
  });
});

describe('formatMetres', () => {
  it('groups thousands per locale', () => {
    expect(formatMetres(4250, DE, 'de-DE')).toBe('4.250 m');
    expect(formatMetres(4250, EN, 'en-GB')).toBe('4,250 m');
  });
});

describe('formatDate', () => {
  it('writes the German ordinal point', () => {
    expect(formatDate('2026-05-14', DE, 'de-DE')).toBe('14. Mai 2026');
  });

  it('omits it in English', () => {
    expect(formatDate('2026-05-14', EN, 'en-GB')).toBe('14 May 2026');
  });

  it('handles every month', () => {
    for (let m = 1; m <= 12; m += 1) {
      const iso = `2026-${String(m).padStart(2, '0')}-01`;
      expect(formatDate(iso, DE, 'de-DE')).toContain(DE.months[m - 1]!);
    }
  });
});
