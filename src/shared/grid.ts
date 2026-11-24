// Tile <-> world math shared by the client and the sim.
// World units are map pixels: the base map is 2048x2048 (32x32 tiles of 64px),
// and the 24x24 play area ("lawn") sits at x/y 256..1792.

export const TILE = 64;
export const GRID = 24;
export const MAP_PX = 2048;
export const LAWN_ORIGIN = 256;
export const LAWN_PX = GRID * TILE; // 1536
export const LAWN_END = LAWN_ORIGIN + LAWN_PX; // 1792
export const TILE_COUNT = GRID * GRID; // 576

/**
 * World bounds of the drawn scenery: the original 2048 map plus a generated
 * forest ring (scripts/forest.ts) that the client shades into dark woods, so the
 * camera can zoom out on tall or wide screens without showing past the trees.
 * 768 = 12 tiles each side.
 */
export const FOREST_RING = 768;
export const FOREST_MIN = -FOREST_RING;
export const FOREST_MAX = MAP_PX + FOREST_RING; // 2816

export interface Tile {
  x: number;
  y: number;
}

export interface Point {
  x: number;
  y: number;
}

/** True if (x, y) is a tile on the 24x24 lawn. */
export function inLawn(x: number, y: number): boolean {
  return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < GRID && y < GRID;
}

/** Flat index of a tile: y * 24 + x. Only valid for tiles on the lawn. */
export function key(x: number, y: number): number {
  return y * GRID + x;
}

/** Inverse of key(). */
export function fromKey(k: number): Tile {
  return { x: k % GRID, y: Math.floor(k / GRID) };
}

/** World position of a tile's centre. */
export function tileToWorld(x: number, y: number): Point {
  return { x: LAWN_ORIGIN + x * TILE + TILE / 2, y: LAWN_ORIGIN + y * TILE + TILE / 2 };
}

/** World position of a tile's top-left corner. */
export function tileOrigin(x: number, y: number): Point {
  return { x: LAWN_ORIGIN + x * TILE, y: LAWN_ORIGIN + y * TILE };
}

/**
 * Tile under a world point. Returns tile coords even off the lawn
 * (they can be negative or >= 24); check with inLawn().
 */
export function worldToTile(px: number, py: number): Tile {
  return { x: Math.floor((px - LAWN_ORIGIN) / TILE), y: Math.floor((py - LAWN_ORIGIN) / TILE) };
}

/** Tile under a world point, or null when the point is off the lawn. */
export function pickTile(px: number, py: number): Tile | null {
  const t = worldToTile(px, py);
  return inLawn(t.x, t.y) ? t : null;
}

/** True if the tile is on the outer ring, where zombies walk in. */
export function isEdgeTile(x: number, y: number): boolean {
  return inLawn(x, y) && (x === 0 || y === 0 || x === GRID - 1 || y === GRID - 1);
}

/** The ring of edge tiles (92 for a 24x24 grid), clockwise from the top-left corner. */
export function edgeTiles(): Tile[] {
  const out: Tile[] = [];
  const last = GRID - 1;
  for (let x = 0; x <= last; x++) out.push({ x, y: 0 });
  for (let y = 1; y <= last; y++) out.push({ x: last, y });
  for (let x = last - 1; x >= 0; x--) out.push({ x, y: last });
  for (let y = last - 1; y >= 1; y--) out.push({ x: 0, y });
  return out;
}

/** Chebyshev distance from the lawn edge: 0 on the ring, 11 in the middle. */
export function edgeDistance(x: number, y: number): number {
  return Math.min(x, y, GRID - 1 - x, GRID - 1 - y);
}
