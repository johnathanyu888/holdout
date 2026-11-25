// A day's fixed setup. The demo has exactly one (src/shared/demo/demoDay.ts);
// everything derived from it (spawn schedule, flow fields, power) is computed.

import type { Tile } from '../grid';
import type { Draft } from '../build/draft';

export interface Materials {
  wire: number;
  wood: number;
  stone: number;
}

export interface ZombieGroupSpec {
  /** Zombie type id, e.g. "shambler". */
  type: string;
  count: number;
}

export interface SpawnSpec {
  /** Seed for the spawn schedule (fed through the sim PRNG). */
  seed: string;
  zombies: ZombieGroupSpec[];
  /** First spawn, in sim steps (10 per second). */
  firstStep: number;
  /** Average gap between groups, in steps. */
  groupGap: number;
  /** Group size range (inclusive). */
  groupMin: number;
  groupMax: number;
  /** Optional relative weights for the n, e, s, w edges (default all 1). */
  sideWeights?: [number, number, number, number];
}

export interface DayConfig {
  id: string;
  /** Mutation card name shown in the briefing, e.g. "Shamblers". */
  mutationName: string;
  mutationBlurb: string;
  /** The map's one power inlet (always on, strength 6, powers at most 3 action parts). */
  inlet: Tile;
  /** The house can't go within this many tiles of the lawn edge. */
  houseBand: number;
  /** Parts available, by type id. */
  kit: Record<string, number>;
  materials: Materials;
  /** Build clock, in seconds. */
  buildSeconds: number;
  /** Raid cap, in seconds; zombies still alive then count as a loss. */
  raidMaxSeconds: number;
  spawns: SpawnSpec;
  /** The designer's score for the day (stars: >=70% = 2, beat it = 3). */
  par: number;
  /** Machines already on the map (wire into them, can't move or remove them). */
  fixtures?: Fixture[];
  /** Rocks: block zombies, parts and wire until cleared (costs build time). */
  obstacles?: Obstacle[];
  /** The briefing draft. With one, the kit is the draft's base plus the picks (kit/materials above are ignored). */
  draft?: Draft;
}

export interface Obstacle {
  /** A rock (cleared) or a tree (cut down): both block the same way. */
  type: 'rock' | 'tree';
  /** Top-left tile. */
  x: number;
  y: number;
  /** Size in tiles (default 1 x 1). */
  w?: number;
  h?: number;
  /** Build time it takes to clear, in seconds. */
  clearSeconds: number;
}

/**
 * A machine the day places on the map. A broken one does nothing until the
 * player repairs it, which costs `repairSeconds` off the Build clock; then it
 * works like a part of its type, where it stands.
 */
export interface Fixture {
  type: string;
  x: number;
  y: number;
  /** Quarter turns clockwise (as PlacedPart.rot). */
  rot: 0 | 1 | 2 | 3;
  broken: boolean;
  repairSeconds: number;
}
