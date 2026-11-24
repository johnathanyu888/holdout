// The raid simulation: createSim() from a day + contraption, then step() at
// 10 steps per second until the outcome is decided. See types.ts for the
// determinism rules every piece of sim code follows.
//
// Step order (one step = 0.1s):
//  1. spawn   release schedule entries due this step
//  2. sense   triggers read the world and emit; chips emit from last step's input
//  3. power   flood from the inlet + every emitting part
//  4. act     actions use this step's power
//  5. move    zombies follow the flow field, separate, collide, breach
//  6. cleanup remove the dead, refresh the field, decide the outcome, tick++

import { GRID, TILE_COUNT, key } from '../../grid';
import type { Contraption, WallMaterial } from '../../types/build';
import type { DayConfig } from '../../types/day';
import type { SimEvent } from './events';
import { FIELD_INF, computeField, nextTile } from './pathing';
import { type Source, flood, inputAt } from './power';
import { hasPartDef, partDef, zombieDef } from './registry';
import { seedRng } from './rng';
import { buildSchedule } from './spawn';
import {
  INLET_STRENGTH,
  STEP_SECONDS,
  STEPS_PER_SECOND,
  type PowerIn,
  type SimCtx,
  type SimPart,
  type SimState,
  type SpawnEntry,
  type Zombie,
} from './types';

export const WALL_HP: Record<WallMaterial, number> = { wood: 120, stone: 300 };
/** Zombies closer than this (centre to centre, tiles) push apart. */
export const SEPARATION = 0.5;
/** A zombie whose centre gets this close to the house centre breaches it. */
export const BREACH_RADIUS = 0.5;

export interface SimOptions {
  /** Override the computed spawn schedule (sandbox, tests). */
  schedule?: SpawnEntry[];
}

export function createSim(day: DayConfig, c: Contraption, opts: SimOptions = {}): SimState {
  if (!c.house) throw new Error('createSim: the contraption has no house');
  const parts: SimPart[] = [...c.parts]
    .sort((a, b) => a.id - b.id)
    .map((p) => {
      const sp: SimPart = {
        id: p.id,
        type: p.type,
        x: p.x,
        y: p.y,
        rot: p.rot,
        config: { ...(hasPartDef(p.type) ? partDef(p.type).defaultConfig : {}), ...p.config },
        s: {},
        input: { c: 0, t: 0 },
        output: null,
        active: false,
      };
      // Types with no registered behaviour yet stay inert.
      if (hasPartDef(p.type)) sp.s = partDef(p.type).initState(sp);
      return sp;
    });
  const partAt = new Int16Array(TILE_COUNT).fill(-1);
  parts.forEach((p, i) => (partAt[key(p.x, p.y)] = i));
  const wire = new Uint8Array(TILE_COUNT);
  for (const w of c.wires) wire[key(w.x, w.y)] = 1;
  const wallHp = new Int16Array(TILE_COUNT);
  const wallMat: (WallMaterial | null)[] = new Array(TILE_COUNT).fill(null);
  for (const w of c.walls) {
    wallHp[key(w.x, w.y)] = WALL_HP[w.material];
    wallMat[key(w.x, w.y)] = w.material;
  }
  const st: SimState = {
    day,
    tick: 0,
    rng: seedRng(`${day.spawns.seed}:sim`),
    house: { ...c.house },
    parts,
    partAt,
    wire,
    wallHp,
    wallMat,
    powerC: new Uint8Array(TILE_COUNT),
    powerT: new Uint8Array(TILE_COUNT),
    zombies: [],
    nextZombieId: 1,
    schedule: opts.schedule ? [...opts.schedule].sort((a, b) => a.step - b.step) : buildSchedule(day.spawns),
    scheduleIdx: 0,
    field: new Int32Array(TILE_COUNT),
    fieldDirty: true,
    outcome: 'running',
    stats: { spawned: 0, killed: 0, breachBy: null },
  };
  refreshField(st);
  return st;
}

function refreshField(st: SimState): void {
  if (!st.fieldDirty) return;
  computeField(st.wallHp, st.house.x, st.house.y, st.field);
  st.fieldDirty = false;
}

function makeCtx(st: SimState, events: SimEvent[]): SimCtx {
  return {
    state: st,
    emit: (e) => events.push(e),
    zombiesOn: (x, y) => st.zombies.filter((z) => !z.dead && Math.floor(z.x) === x && Math.floor(z.y) === y),
    damage: (z, amount, partId) => {
      if (z.dead || amount <= 0) return;
      z.hp -= amount;
      events.push({ type: 'hit', id: z.id, partId, amount, x: z.x, y: z.y });
      if (z.hp <= 0) {
        z.dead = true;
        st.stats.killed++;
        events.push({ type: 'death', id: z.id, partId, x: z.x, y: z.y });
      }
    },
  };
}

/** Adds a zombie at a tile centre (used by the schedule and the sandbox). */
export function spawnZombie(st: SimState, type: string, tx: number, ty: number, events?: SimEvent[]): Zombie {
  const def = zombieDef(type);
  const z: Zombie = {
    id: st.nextZombieId++,
    type,
    x: tx + 0.5,
    y: ty + 0.5,
    px: tx + 0.5,
    py: ty + 0.5,
    hp: def.hp,
    maxHp: def.hp,
    speed: def.speed,
    radius: def.radius,
    slowMul: 1,
    vx: 0,
    vy: 0,
    dead: false,
    ext: {},
  };
  st.zombies.push(z);
  st.stats.spawned++;
  events?.push({ type: 'spawn', id: z.id, zombieType: type, x: z.x, y: z.y });
  return z;
}

export function step(st: SimState): SimEvent[] {
  if (st.outcome !== 'running') return [];
  const events: SimEvent[] = [];
  const ctx = makeCtx(st, events);

  // 1. spawn
  while (st.scheduleIdx < st.schedule.length && (st.schedule[st.scheduleIdx] as SpawnEntry).step <= st.tick) {
    const e = st.schedule[st.scheduleIdx++] as SpawnEntry;
    spawnZombie(st, e.type, e.x, e.y, events);
  }

  // 2. sense (triggers) and chips (from last step's input)
  for (const p of st.parts) {
    if (!hasPartDef(p.type)) continue;
    const def = partDef(p.type);
    if (def.sense) p.output = def.sense(ctx, p);
    else if (def.chip) p.output = def.chip(ctx, p, p.input);
  }

  // 3. power
  runFlood(st);

  // 4. act
  for (const p of st.parts) {
    if (!hasPartDef(p.type)) continue;
    partDef(p.type).act?.(ctx, p, p.input);
  }

  // 5. move
  moveZombies(st, events);

  // 6. cleanup
  st.zombies = st.zombies.filter((z) => !z.dead);
  refreshField(st);
  decideOutcome(st, events);
  st.tick++;
  return events;
}

function runFlood(st: SimState): void {
  const sources: Source[] = [{ k: key(st.day.inlet.x, st.day.inlet.y), layer: 'c', strength: INLET_STRENGTH }];
  for (const p of st.parts) if (p.output) sources.push({ k: key(p.x, p.y), ...p.output });
  flood(st.wire, sources, st.powerC, st.powerT);
  for (const p of st.parts) p.input = inputAt(key(p.x, p.y), st.powerC, st.powerT);
}

function moveZombies(st: SimState, events: SimEvent[]): void {
  const hx = st.house.x + 0.5;
  const hy = st.house.y + 0.5;
  const live = st.zombies.filter((z) => !z.dead);

  for (const z of live) {
    z.px = z.x;
    z.py = z.y;
    const cx = Math.floor(z.x);
    const cy = Math.floor(z.y);
    let tx: number;
    let ty: number;
    if (cx === st.house.x && cy === st.house.y) {
      tx = hx;
      ty = hy;
    } else {
      const nt = nextTile(st.field, st.wallHp, cx, cy);
      if (nt) {
        tx = nt[0] + 0.5;
        ty = nt[1] + 0.5;
      } else if ((st.field[key(cx, cy)] ?? FIELD_INF) >= FIELD_INF) {
        continue; // no route to the house (fully walled in): wait
      } else {
        tx = cx + 0.5; // already at the best tile: settle onto its centre
        ty = cy + 0.5;
      }
    }
    const dx = tx - z.x;
    const dy = ty - z.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const stepLen = z.speed * STEP_SECONDS * z.slowMul;
    if (len <= stepLen || len === 0) {
      z.x = tx;
      z.y = ty;
    } else {
      z.x += (dx / len) * stepLen;
      z.y += (dy / len) * stepLen;
    }
  }

  // Crowd separation, in id order.
  for (let i = 0; i < live.length; i++) {
    const a = live[i] as Zombie;
    for (let j = i + 1; j < live.length; j++) {
      const b = live[j] as Zombie;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= SEPARATION * SEPARATION) continue;
      if (d2 === 0) {
        a.x -= SEPARATION / 4;
        b.x += SEPARATION / 4;
        continue;
      }
      const d = Math.sqrt(d2);
      const push = (SEPARATION - d) / 2;
      a.x -= (dx / d) * push;
      a.y -= (dy / d) * push;
      b.x += (dx / d) * push;
      b.y += (dy / d) * push;
    }
  }

  for (const z of live) {
    // Stay on the lawn and out of walls.
    z.x = Math.max(0.01, Math.min(GRID - 0.01, z.x));
    z.y = Math.max(0.01, Math.min(GRID - 0.01, z.y));
    if ((st.wallHp[key(Math.floor(z.x), Math.floor(z.y))] ?? 0) > 0) {
      z.x = z.px;
      z.y = z.py;
    }
    z.vx = z.x - z.px;
    z.vy = z.y - z.py;
    z.slowMul = 1;
    const bx = z.x - hx;
    const by = z.y - hy;
    if (st.stats.breachBy === null && bx * bx + by * by < BREACH_RADIUS * BREACH_RADIUS) {
      st.stats.breachBy = z.id;
      events.push({ type: 'breach', id: z.id });
    }
  }
}

function decideOutcome(st: SimState, events: SimEvent[]): void {
  if (st.stats.breachBy !== null) {
    st.outcome = 'lost';
    events.push({ type: 'end', outcome: 'lost', reason: 'breach' });
  } else if (st.scheduleIdx >= st.schedule.length && st.zombies.length === 0 && st.stats.spawned > 0) {
    st.outcome = 'won';
    events.push({ type: 'end', outcome: 'won', reason: 'cleared' });
  } else if (st.tick + 1 >= st.day.raidMaxSeconds * STEPS_PER_SECOND) {
    st.outcome = 'lost';
    events.push({ type: 'end', outcome: 'lost', reason: 'timeout' });
  }
}

/** Deep copy of the state (for replay snapshots). */
export function snapshot(st: SimState): SimState {
  return structuredClone(st);
}

/**
 * Build-mode power preview: floods from the inlet only (no zombies, so no
 * triggers fire) and reports what reaches each part. Needs no house.
 */
export function powerPreview(
  day: DayConfig,
  c: Contraption,
): { powerC: Uint8Array; powerT: Uint8Array; inputs: Map<number, PowerIn> } {
  const wire = new Uint8Array(TILE_COUNT);
  for (const w of c.wires) wire[key(w.x, w.y)] = 1;
  const powerC = new Uint8Array(TILE_COUNT);
  const powerT = new Uint8Array(TILE_COUNT);
  flood(wire, [{ k: key(day.inlet.x, day.inlet.y), layer: 'c', strength: INLET_STRENGTH }], powerC, powerT);
  const inputs = new Map<number, PowerIn>();
  for (const p of c.parts) inputs.set(p.id, inputAt(key(p.x, p.y), powerC, powerT));
  return { powerC, powerT, inputs };
}

// ---- hashing (determinism goldens) ------------------------------------------

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);

/** FNV-1a over everything that matters in the state. Equal hashes = equal runs. */
export function hashState(st: SimState): string {
  let h = 0x811c9dc5;
  const word = (n: number) => {
    h ^= n >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  const num = (n: number) => {
    f64[0] = n;
    word(u32[0] as number);
    word(u32[1] as number);
  };
  num(st.tick);
  word(st.outcome === 'running' ? 0 : st.outcome === 'won' ? 1 : 2);
  word(st.rng.a);
  word(st.rng.b);
  word(st.rng.c);
  word(st.rng.d);
  for (const z of st.zombies) {
    word(z.id);
    num(z.x);
    num(z.y);
    num(z.hp);
  }
  for (const p of st.parts) {
    word(p.id);
    for (const k of Object.keys(p.s).sort()) num(p.s[k] as number);
  }
  for (let k = 0; k < TILE_COUNT; k++) {
    word(st.wallHp[k] as number);
    word(((st.powerC[k] as number) << 8) | (st.powerT[k] as number));
  }
  num(st.stats.spawned);
  num(st.stats.killed);
  return h.toString(16).padStart(8, '0');
}
