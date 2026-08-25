/**
 * Everything the scene reads, loaded once at start-up.
 *
 * Vite bundles the JSON and hands back URLs for the DEM tiles, so there is no
 * fetch against anything but the dev server itself — the render path stays
 * network-free by construction.
 */
import type { Bounds } from './lib/geo.ts';

export type CompiledPoint = { lat: number; lon: number; ele: number | null };
export type CompiledTour = {
  id: string;
  date: string;
  title: string;
  stats: {
    distanceKm: number;
    ascentM: number;
    descentM: number;
    durationMin: number;
  };
  summits: Array<{ name: string; lat: number; lon: number; ele: number }>;
  points: CompiledPoint[];
  bounds: Bounds;
  elevationProfile: Array<{ d: number; ele: number }>;
};
export type Compiled = {
  title: string;
  region: string;
  /** BCP-47 tag; names a bundle under locales/. */
  locale: string;
  /** Ready-to-print attribution lines, resolved at ingest. */
  attribution: string[];
  /** Tile zoom every projection in the scene works in. */
  demZoom: number;
  period: { from: string; to: string; totalDays: number; days: string[] };
  tours: CompiledTour[];
  bounds: Bounds;
  aggregate: {
    distanceKm: number;
    ascentM: number;
    descentM: number;
    durationMin: number;
  };
  /** Land cover, water and labels travel with the tours — one file for the scene. */
  geo: {
    landcover: Area[];
    water: WaterArea[];
    places: Place[];
    peaks: Peak[];
  };
};

export type Area = { k: string; r: Array<[number, number]> };
export type WaterArea = { n: string; ring: Array<[number, number]> };
export type Place = { n: string; lat: number; lon: number; rank: number };
export type Peak = { n: string; lat: number; lon: number; ele: number };

export type SceneData = {
  compiled: Compiled;
  landcover: Area[];
  water: WaterArea[];
  places: Place[];
  peaks: Peak[];
  dem: {
    data: Float32Array;
    width: number;
    height: number;
    originX: number;
    originY: number;
  };
};

const TILE = 256;

async function loadDem(): Promise<SceneData['dem']> {
  const mods = import.meta.glob('../build/dem/*.png', {
    eager: true,
    query: '?url',
    import: 'default'
  });
  const tiles = Object.entries(mods).map(([path, url]) => {
    const [, x, y] = /(\d+)_(\d+)_(\d+)\.png$/
      .exec(path)!
      .slice(1)
      .map(Number) as [number, number, number];
    return { x: x!, y: y!, url: url as string };
  });
  const minX = Math.min(...tiles.map((t) => t.x));
  const maxX = Math.max(...tiles.map((t) => t.x));
  const minY = Math.min(...tiles.map((t) => t.y));
  const maxY = Math.max(...tiles.map((t) => t.y));
  const width = (maxX - minX + 1) * TILE;
  const height = (maxY - minY + 1) * TILE;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  await Promise.all(
    tiles.map(
      (t) =>
        new Promise<void>((done) => {
          const img = new Image();
          img.onload = () => {
            ctx.drawImage(img, (t.x - minX) * TILE, (t.y - minY) * TILE);
            done();
          };
          img.onerror = () => done();
          img.src = t.url;
        })
    )
  );

  const bytes = ctx.getImageData(0, 0, width, height).data;
  const data = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i += 1, p += 4) {
    const v = bytes[p]! * 256 + bytes[p + 1]! + bytes[p + 2]! / 256 - 32768;
    data[i] = v < -400 ? NaN : v;
  }
  return { data, width, height, originX: minX * TILE, originY: minY * TILE };
}

export async function loadSceneData(): Promise<SceneData> {
  const [compiled, dem] = await Promise.all([
    import('../build/tours.compiled.json').then(
      (m) => m.default as unknown as Compiled
    ),
    loadDem()
  ]);
  const geo = compiled.geo;
  return {
    compiled,
    landcover: geo.landcover,
    water: geo.water,
    places: geo.places,
    peaks: geo.peaks,
    dem
  };
}
