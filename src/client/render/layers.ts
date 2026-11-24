// Depth bands, bottom to top. Inside a band, things y-sort by adding y (world px).

import { LAWN_ORIGIN, TILE } from '@shared/grid';

export const DEPTH = {
  ground: 0,
  entryEdge: 100,
  grid: 200,
  wires: 1_000,
  parts: 10_000,
  walls: 20_000,
  zombies: 30_000,
  /** The forest's trees (baked canopy layer) and the dark-woods shade over them. */
  canopy: 38_000,
  fx: 40_000,
  ghost: 50_000,
  ui: 60_000,
} as const;

/** World px of a tile-unit coordinate (sim positions are in tiles). */
export function tileUnitToWorld(t: number): number {
  return LAWN_ORIGIN + t * TILE;
}
