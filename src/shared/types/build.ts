// The player's build ("Contraption"): plain JSON, shared by the client (build mode,
// save), the sim (raid) and the server (validation). Tile coords are 0..23.

import type { Tile } from '../grid';

/** Rotation in quarter turns clockwise: 0 = facing east (+x), 1 = south, 2 = west, 3 = north. */
export type Rot = 0 | 1 | 2 | 3;

export type WallMaterial = 'wood' | 'stone';

export interface PlacedPart {
  /** Unique within the contraption; stable across edits (the sim orders parts by it). */
  id: number;
  /** Part type id, e.g. "pressure_plate", "saw_blade" (see the sim part registry). */
  type: string;
  x: number;
  y: number;
  rot: Rot;
  /** Per-part settings, e.g. { delay: 10 } in sim steps. */
  config?: Record<string, number>;
}

export interface WallTile {
  x: number;
  y: number;
  material: WallMaterial;
}

export interface Contraption {
  house: Tile | null;
  parts: PlacedPart[];
  wires: Tile[];
  walls: WallTile[];
  /** Next part id to hand out. */
  nextId: number;
  /** The map's power inlet setting: blink = 1 pulses it on/off every 0.5s (as ticks); absent = steady. */
  inlet?: { blink?: number };
}

export function emptyContraption(): Contraption {
  return { house: null, parts: [], wires: [], walls: [], nextId: 1 };
}
