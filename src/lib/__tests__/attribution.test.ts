import { describe, expect, it } from 'vitest';
import {
  ALWAYS,
  attributionFor,
  layoutAttribution,
  STRIP
} from '@/util/attribution.ts';
import { HEIGHT, WIDTH } from '@/video.ts';

/** Somewhere in Salzburg — inside the Austrian box. */
const AUSTRIA = { minLat: 47.7, minLon: 12.9, maxLat: 47.9, maxLon: 13.2 };
const SAXONY = { minLat: 50.85, minLon: 14.0, maxLat: 51.05, maxLon: 14.4 };
const NORWAY = { minLat: 60.2, minLon: 7.0, maxLat: 61.0, maxLon: 9.0 };

describe('attributionFor', () => {
  it('always credits OSM and SRTM', () => {
    for (const line of ALWAYS) {
      expect(attributionFor(SAXONY)).toContain(line);
    }
  });

  it('adds the Austrian DGM for an area touching Austria', () => {
    expect(attributionFor(AUSTRIA).join(' ')).toContain(
      'offene Daten Österreichs'
    );
  });

  it('leaves it out for an area that does not', () => {
    expect(attributionFor(SAXONY).join(' ')).not.toContain(
      'offene Daten Österreichs'
    );
  });

  it('credits Kartverket in Norway', () => {
    expect(attributionFor(NORWAY).join(' ')).toContain('Kartverket');
  });

  it('credits Copernicus anywhere in Europe', () => {
    // EU-DEM covers the whole continent, so a German walk owes it even where
    // no national entry fires — this was missing while only Austria was listed
    for (const area of [SAXONY, AUSTRIA, NORWAY]) {
      expect(attributionFor(area).join(' ')).toContain('Copernicus');
    }
  });

  it('stacks the national credit on top of the continental one', () => {
    const lines = attributionFor(AUSTRIA).join(' ');
    expect(lines).toContain('Copernicus');
    expect(lines).toContain('offene Daten Österreichs');
  });

  it('leaves Europe out for an area outside it', () => {
    const rockies = {
      minLat: 39.0,
      minLon: -106.5,
      maxLat: 39.4,
      maxLon: -106.0
    };
    const lines = attributionFor(rockies).join(' ');
    expect(lines).not.toContain('Copernicus');
    expect(lines).toContain('3DEP');
  });

  it('over-credits rather than under-credits on an overlap', () => {
    // an area just clipping the Austrian box still gets the line
    const edge = { minLat: 46.2, minLon: 9.4, maxLat: 46.4, maxLon: 9.6 };
    expect(attributionFor(edge).join(' ')).toContain(
      'offene Daten Österreichs'
    );
  });

  it('appends extra lines from the config', () => {
    const out = attributionFor(SAXONY, ['© Someone Else']);
    expect(out).toContain('© Someone Else');
  });

  it('never duplicates a line', () => {
    const out = attributionFor(AUSTRIA, [ALWAYS[0]!, '© OpenStreetMap']);
    expect(new Set(out).size).toBe(out.length);
  });

  it('returns something for any area on earth', () => {
    for (const lat of [-80, -40, 0, 40, 80]) {
      for (const lon of [-170, -60, 0, 60, 170]) {
        const b = {
          minLat: lat,
          minLon: lon,
          maxLat: lat + 1,
          maxLon: lon + 1
        };
        expect(attributionFor(b).length).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe('layoutAttribution', () => {
  const alps = attributionFor({
    minLat: 47.3,
    minLon: 10.4,
    maxLat: 47.6,
    maxLon: 10.8
  });

  it('keeps a short credit on one line', () => {
    expect(layoutAttribution(ALWAYS, WIDTH, HEIGHT).lineCount).toBe(1);
  });

  it('wraps rather than overflowing once the area owes more', () => {
    // set on one line, four credits ran off both edges of the frame
    expect(layoutAttribution(alps, WIDTH, HEIGHT).lineCount).toBeGreaterThan(1);
  });

  it('never lets an estimated line exceed the frame', () => {
    const available = WIDTH - STRIP.bottom * 2 - STRIP.paddingX * 2;
    const text = alps.join(STRIP.separator);
    const perLine =
      (text.length * STRIP.fontSize * 0.52) /
      layoutAttribution(alps, WIDTH, HEIGHT).lineCount;
    expect(perLine).toBeLessThanOrEqual(available);
  });

  it('lifts the label floor as the strip grows', () => {
    const short = layoutAttribution(ALWAYS, WIDTH, HEIGHT);
    const long = layoutAttribution(alps, WIDTH, HEIGHT);
    expect(long.labelBottom).toBeLessThan(short.labelBottom);
    expect(long.labelBottom + long.height + STRIP.bottom + STRIP.gap).toBe(
      HEIGHT
    );
  });

  it('handles an empty credit list', () => {
    const empty = layoutAttribution([], WIDTH, HEIGHT);
    expect(empty.lineCount).toBe(0);
    expect(empty.labelBottom).toBeLessThan(HEIGHT);
  });
});
