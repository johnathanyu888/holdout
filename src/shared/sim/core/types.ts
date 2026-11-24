// Sim types and the extension contracts (PartDef, ZombieDef).
//
// Determinism rules for everything under src/shared/sim:
//  - time is the integer `tick` (10 steps per second), never wall-clock
//  - randomness only from the state's RngState, never Math.random
//  - floats only through + - * / and Math.sqrt (no sin/cos/atan2/pow/exp)
//  - iterate in a stable order (ids ascending), never object-key order
//  - SimState is plain data (structuredClone-able): no functions, no class instances

import type { Tile } from '../../grid';
import type { Rot, WallMaterial } from '../../types/build';
import type { DayConfig } from '../../types/day';
import type { SimEvent } from './events';
import type { RngState } from './rng';

export const STEPS_PER_SECOND = 10;
export const STEP_SECONDS = 1 / STEPS_PER_SECOND;

/** Signal strength from the power inlet and from triggers/chips. */
export const INLET_STRENGTH = 15;
export const SOURCE_STRENGTH = 10;

export type Layer = 'c' | 't';

/** A source's output this step: constant ('c') or tick ('t') power at a strength. */
export interface Signal {
  layer: Layer;
  strength: number;
}

/** Power arriving at a part this step, per layer (0 = none). */
export interface PowerIn {
  c: number;
  t: number;
}

export interface Zombie {
  id: number;
  type: string;
  /** Position in tile units: tile (x, y) spans [x, x+1); its centre is x + 0.5. */
  x: number;
  y: number;
  /** Position at the start of the current step (for interpolation and edge-crossing). */
  px: number;
  py: number;
  hp: number;
  maxHp: number;
  /** Tiles per second. */
  speed: number;
  radius: number;
  /** Speed multiplier for this step; reset to 1 each step, parts lower it. */
  slowMul: number;
  /** Last movement (tiles per step), for facing. */
  vx: number;
  vy: number;
  dead: boolean;
  /** Per-feature extra state (keyed by feature name). */
  ext: Record<string, number>;
}

export interface SimPart {
  id: number;
  type: string;
  x: number;
  y: number;
  rot: Rot;
  config: Record<string, number>;
  /** The part's own state (its PartDef owns the shape). */
  s: Record<string, number>;
  /** Power that reached the part in the latest flood. */
  input: PowerIn;
  /** What the part emits into the next flood (triggers this step, chips one step later). */
  output: Signal | null;
  /** True while the part is visibly working (for the renderer: spinning, spikes up...). */
  active: boolean;
}

export interface SpawnEntry {
  step: number;
  x: number;
  y: number;
  type: string;
}

export type Outcome = 'running' | 'won' | 'lost';

export interface SimState {
  day: DayConfig;
  tick: number;
  rng: RngState;
  house: Tile;
  parts: SimPart[]; // sorted by id
  /** Index into `parts` per tile, -1 if none. */
  partAt: Int16Array;
  wire: Uint8Array;
  /** Wall HP per tile (0 = no wall). */
  wallHp: Int16Array;
  wallMat: (WallMaterial | null)[];
  /** Latest flood: strength per tile, per layer. */
  powerC: Uint8Array;
  powerT: Uint8Array;
  zombies: Zombie[]; // sorted by id
  nextZombieId: number;
  schedule: SpawnEntry[];
  scheduleIdx: number;
  /** Flow-field distance to the house per tile (FIELD_INF = unreachable). */
  field: Int32Array;
  fieldDirty: boolean;
  outcome: Outcome;
  stats: { spawned: number; killed: number; breachBy: number | null };
}

/** Helpers handed to part and zombie code each step. */
export interface SimCtx {
  readonly state: SimState;
  emit(e: SimEvent): void;
  /** Live zombies whose centre is in tile (x, y), in id order. */
  zombiesOn(x: number, y: number): Zombie[];
  /** Deals damage (emits hit, and death when it kills). */
  damage(z: Zombie, amount: number, partId: number): void;
}

/**
 * A part's behaviour. Register one per file in src/shared/sim/parts/ with
 * registerPart(); the sim picks it up automatically.
 */
export interface PartDef {
  type: string;
  label: string;
  kind: 'trigger' | 'chip' | 'action';
  /** Minimum signal strength an action needs to work. */
  needs: number;
  rotatable: boolean;
  /** Default config for new parts (e.g. { delay: 5 }). */
  defaultConfig?: Record<string, number>;
  initState(part: SimPart): Record<string, number>;
  /** Triggers: read the world, return what to emit into this step's flood. */
  sense?(ctx: SimCtx, part: SimPart): Signal | null;
  /** Chips: return the output from last step's input (1-step latency). */
  chip?(ctx: SimCtx, part: SimPart, lastInput: PowerIn): Signal | null;
  /** Actions: act on this step's input. */
  act?(ctx: SimCtx, part: SimPart, input: PowerIn): void;
}

export interface ZombieDef {
  type: string;
  label: string;
  hp: number;
  /** Tiles per second. */
  speed: number;
  radius: number;
}
