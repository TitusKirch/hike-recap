import { describe, expect, it } from 'vitest';
import { countTrackPoints, parseGpx } from '@/lib/parse.ts';

const ROTHER = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GPX RubyGem 1.0.4">
  <metadata><name/><time>2026-05-01T13:24:32+02:00</time></metadata>
  <trk><name>Day one</name><trkseg>
    <trkpt lat="50.912340" lon="14.056780"/>
    <trkpt lat="50.912510" lon="14.057020"/>
    <trkpt lat="50.912690" lon="14.057410"/>
  </trkseg></trk>
</gpx>`;

const WITH_ELE_AND_TIME = `<?xml version="1.0"?>
<gpx version="1.1"><trk><name>Timed</name><trkseg>
  <trkpt lat="50.9" lon="14.0"><ele>1200.5</ele><time>2026-05-01T08:00:00Z</time></trkpt>
  <trkpt lat="50.91" lon="14.01"><ele>1250</ele><time>2026-05-01T08:10:00Z</time></trkpt>
</trkseg></trk></gpx>`;

describe('parseGpx', () => {
  it('reads self-closing trackpoints', () => {
    const r = parseGpx(ROTHER);
    expect(r.points).toHaveLength(3);
    expect(r.points[0]).toEqual({ lat: 50.91234, lon: 14.05678 });
  });

  it('reports the Rother exports as having neither elevation nor timestamps', () => {
    const r = parseGpx(ROTHER);
    expect(r.hadElevation).toBe(false);
    expect(r.hadTimestamps).toBe(false);
    expect(r.elevations).toEqual([null, null, null]);
  });

  it('does not mistake the metadata stamp for per-point timestamps', () => {
    // the fixture has <time> in <metadata> — that is the export time
    expect(ROTHER).toContain('<time>');
    expect(parseGpx(ROTHER).hadTimestamps).toBe(false);
  });

  it('picks up the track name', () => {
    expect(parseGpx(ROTHER).name).toBe('Day one');
  });

  it('reads elevation and timestamps when a file does have them', () => {
    const r = parseGpx(WITH_ELE_AND_TIME);
    expect(r.hadElevation).toBe(true);
    expect(r.hadTimestamps).toBe(true);
    expect(r.elevations).toEqual([1200.5, 1250]);
  });

  it('handles route points as well as track points', () => {
    const rte = `<gpx><rte><rtept lat="50.1" lon="14.1"/><rtept lat="50.2" lon="14.2"/></rte></gpx>`;
    expect(parseGpx(rte).points).toHaveLength(2);
  });

  it('returns an empty series for a file with no points', () => {
    const r = parseGpx('<gpx></gpx>');
    expect(r.points).toEqual([]);
    expect(r.name).toBeNull();
  });
});

describe('countTrackPoints', () => {
  it('counts declared points', () => {
    expect(countTrackPoints(ROTHER)).toBe(3);
    expect(countTrackPoints(WITH_ELE_AND_TIME)).toBe(2);
  });
});
