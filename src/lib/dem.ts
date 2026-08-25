/**
 * Elevation lookup over a mosaic of terrarium-encoded terrain tiles.
 *
 * Terrarium packs metres into RGB as `(R * 256 + G + B / 256) - 32768`.
 * Tiles are stitched into one grid once, then sampled bilinearly — nearest
 * neighbour would step in 30 m plateaus and show up as staircases in a profile.
 */
import { latToPixelY, lonToPixelX, type Point } from './geo.ts';

export const TILE_SIZE = 256;

export type TileKey = { z: number; x: number; y: number };
export type DemGrid = {
  zoom: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
  data: Float32Array;
};

export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** Build one grid from tiles that form a rectangular block. */
export function buildGrid(
  zoom: number,
  tiles: ReadonlyArray<{ key: TileKey; rgb: Uint8Array }>
): DemGrid {
  if (tiles.length === 0) {
    throw new Error('buildGrid needs at least one tile');
  }
  /**
   * All tiles must share one zoom.
   *
   * Tile x/y mean different things at different zooms, so a mixed set spans a
   * bounding box covering both coordinate systems — which allocates a grid
   * orders of magnitude too large and dies with an allocation failure rather
   * than a useful message. This happens whenever an area changes and stale
   * tiles are left behind.
   */
  const wrong = tiles.filter((t) => t.key.z !== zoom);
  if (wrong.length > 0) {
    const seen = [...new Set(tiles.map((t) => t.key.z))].sort();
    throw new Error(
      `DEM tiles mix zoom levels (${seen.join(', ')}); expected z${zoom} only. ` +
        `Delete the stale ones — they are left over from a different area.`
    );
  }
  const xs = tiles.map((t) => t.key.x);
  const ys = tiles.map((t) => t.key.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = (maxX - minX + 1) * TILE_SIZE;
  const height = (maxY - minY + 1) * TILE_SIZE;
  const data = new Float32Array(width * height).fill(NaN);

  for (const { key, rgb } of tiles) {
    const ox = (key.x - minX) * TILE_SIZE;
    const oy = (key.y - minY) * TILE_SIZE;
    for (let y = 0; y < TILE_SIZE; y += 1) {
      for (let x = 0; x < TILE_SIZE; x += 1) {
        const s = (y * TILE_SIZE + x) * 3;
        const ele = decodeTerrarium(rgb[s]!, rgb[s + 1]!, rgb[s + 2]!);
        data[(oy + y) * width + (ox + x)] = ele < -400 ? NaN : ele;
      }
    }
  }

  return {
    zoom,
    originX: minX * TILE_SIZE,
    originY: minY * TILE_SIZE,
    width,
    height,
    data
  };
}

/** Bilinear elevation sample in metres, or null outside the grid. */
export function sampleElevation(grid: DemGrid, point: Point): number | null {
  const fx = lonToPixelX(point.lon, grid.zoom) - grid.originX;
  const fy = latToPixelY(point.lat, grid.zoom) - grid.originY;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  if (x0 < 0 || y0 < 0 || x0 + 1 >= grid.width || y0 + 1 >= grid.height) {
    return null;
  }
  const tx = fx - x0;
  const ty = fy - y0;
  const at = (x: number, y: number): number => grid.data[y * grid.width + x]!;
  const v00 = at(x0, y0);
  const v10 = at(x0 + 1, y0);
  const v01 = at(x0, y0 + 1);
  const v11 = at(x0 + 1, y0 + 1);
  if (
    Number.isNaN(v00) ||
    Number.isNaN(v10) ||
    Number.isNaN(v01) ||
    Number.isNaN(v11)
  ) {
    return null;
  }
  const top = v00 + (v10 - v00) * tx;
  const bottom = v01 + (v11 - v01) * tx;
  return top + (bottom - top) * ty;
}
