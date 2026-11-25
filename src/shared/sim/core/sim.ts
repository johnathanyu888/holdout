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
import { workingFixtures } from '../../build/fixtures';
import type { Contraption, WallMaterial } from '../../types/build';
import type { DayConfig } from '../../types/day';
import type { SimEvent } from './events';
import { FIELD_INF, computeField, nextTile } from './pathing';
import { type Source, flood, floodLayer, inputAt, inputFromSides, sideKey } from './power';
import { ROCK_HP, rockTiles } from '../../build/rocks';
import { hasPartDef, partDef, zombieDef } from './registry';
import { seedRng } from './rng';
import { buildSchedule } from './spawn';
import {
  FULL_POWER,
  INLET_MAX_LOAD,
  INLET_STRENGTH,
  SOURCE_STRENGTH,
  powerMul,
  STEP_SECONDS,
  STEPS_PER_SECOND,
  type PowerIn,
  type Signal,
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
  // The player's parts plus the map's working (repaired) machines.
  const parts: SimPart[] = [...c.parts, ...workingFixtures(day)]
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
        sens: { c: 0, t: 0 },
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
  // Rocks: solid for the whole raid (zombies path round them).
  for (const k of rockTiles(day)) wallHp[k] = ROCK_HP;
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
    sensC: new Uint8Array(TILE_COUNT),
    sensT: new Uint8Array(TILE_COUNT),
    inletC: new Uint8Array(TILE_COUNT),
    inletT: new Uint8Array(TILE_COUNT),
    inletLoad: powerPreview(day, c).loaded,
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
  const wear = (p: SimPart, amount: number) => {
    const dur = hasPartDef(p.type) ? partDef(p.type).durability : undefined;
    if (!dur || p.s.worn || amount <= 0) return;
    p.s.wear = (p.s.wear ?? 0) + amount;
    if ((p.s.wear ?? 0) >= dur) {
      p.s.worn = 1;
      p.active = false;
      events.push({ type: 'worn', partId: p.id });
    }
  };
  return {
    state: st,
    emit: (e) => events.push(e),
    zombiesOn: (x, y) => st.zombies.filter((z) => !z.dead && Math.floor(z.x) === x && Math.floor(z.y) === y),
    wear,
    damage: (z, base, partId) => {
      if (z.dead || base <= 0) return;
      // Stronger power hits harder, and wears the part by the damage times the same factor.
      const p = st.parts.find((q) => q.id === partId);
      const m = p ? powerMul(p.s.pw ?? FULL_POWER) : 1;
      const amount = Math.max(1, Math.round(base * m));
      if (p) wear(p, amount * m);
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

/** How far out in the forest (tiles past the lawn edge) walking-in zombies start. */
export const WALK_IN_TILES = 3;

/**
 * Adds a zombie at a tile centre (used by the schedule and the sandbox).
 * With walkIn and an edge tile, it starts WALK_IN_TILES out in the forest beyond
 * that edge and walks straight in to the tile before it starts pathing.
 */
export function spawnZombie(
  st: SimState,
  type: string,
  tx: number,
  ty: number,
  events?: SimEvent[],
  opts: { walkIn?: boolean } = {},
): Zombie {
  const def = zombieDef(type);
  let x = tx + 0.5;
  let y = ty + 0.5;
  const ext: Record<string, number> = {};
  if (opts.walkIn) {
    const last = GRID - 1;
    const ox = tx === 0 ? -1 : tx === last ? 1 : 0;
    const oy = ty === 0 ? -1 : ty === last ? 1 : 0;
    // Corners: come in along one axis (the one the schedule's side picked is unknown; prefer vertical).
    const [dx, dy] = oy !== 0 ? [0, oy] : [ox, 0];
    if (dx !== 0 || dy !== 0) {
      ext.enter = 1;
      ext.ex = x;
      ext.ey = y;
      x += dx * WALK_IN_TILES;
      y += dy * WALK_IN_TILES;
    }
  }
  const z: Zombie = {
    id: st.nextZombieId++,
    type,
    x,
    y,
    px: x,
    py: y,
    hp: def.hp,
    maxHp: def.hp,
    speed: def.speed,
    radius: def.radius,
    slowMul: 1,
    vx: 0,
    vy: 0,
    dead: false,
    ext,
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
    spawnZombie(st, e.type, e.x, e.y, events, { walkIn: true });
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

  // 4. act (worn-out parts are done for the raid)
  for (const p of st.parts) {
    if (!hasPartDef(p.type)) continue;
    if (p.s.worn) {
      p.active = false;
      continue;
    }
    // The strength it runs at (kept through a tick's short window after the power is gone).
    const pw = Math.max(p.input.c, p.input.t);
    if (pw > 0) p.s.pw = pw;
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
  // Inlet-made and sensor-made power flood separately, so the inlet's load can be capped.
  const sources: Source[] = [{ k: key(st.day.inlet.x, st.day.inlet.y), layer: 'c', strength: INLET_STRENGTH, inlet: true }];
  for (const p of st.parts) if (p.output) sources.push(...partSources(p, p.output));
  flood(st.wire, sources.filter((s) => !s.inlet), st.sensC, st.sensT);
  flood(st.wire, sources.filter((s) => s.inlet), st.inletC, st.inletT);
  for (let k = 0; k < TILE_COUNT; k++) {
    st.powerC[k] = Math.max(st.sensC[k] as number, st.inletC[k] as number);
    st.powerT[k] = Math.max(st.sensT[k] as number, st.inletT[k] as number);
  }
  const load = new Set(st.inletLoad);
  for (const p of st.parts) {
    const s = partInput(p, st.sensC, st.sensT);
    p.sens = s;
    const action = hasPartDef(p.type) && partDef(p.type).kind === 'action';
    if (action && !load.has(p.id)) p.input = s;
    else {
      const i = partInput(p, st.inletC, st.inletT);
      p.input = { c: Math.max(s.c, i.c), t: Math.max(s.t, i.t) };
    }
  }
}

/** Where a part's output goes: all four sides, or only its `out` pins. */
function partSources(p: { x: number; y: number; rot: number; type: string }, out: Signal): Source[] {
  const k = key(p.x, p.y);
  const pins = hasPartDef(p.type) ? partDef(p.type).pins : undefined;
  if (!pins) return [{ k, ...out }];
  return pins.out.map((s) => sideKey(p.x, p.y, s, p.rot)).filter((n) => n >= 0).map((to) => ({ k, ...out, to }));
}

/**
 * Build preview for blinking delays: for each blinker that gets steady power, the
 * tick flood it sends out while "on", and its half-period in steps. The client
 * switches these on and off with the clock so the beat shows while building.
 */
export function blinkerFloods(
  c: Contraption,
  preview: { powerC: Uint8Array; powerT: Uint8Array },
  day?: DayConfig,
): { id: number; steps: number; powerT: Uint8Array }[] {
  const all = day ? [...c.parts, ...workingFixtures(day)] : c.parts;
  const wire = new Uint8Array(TILE_COUNT);
  for (const w of c.wires) wire[key(w.x, w.y)] = 1;
  const out: { id: number; steps: number; powerT: Uint8Array }[] = [];
  for (const p of all) {
    if (!hasPartDef(p.type) || partDef(p.type).kind !== 'chip') continue;
    const cfg = { ...partDef(p.type).defaultConfig, ...p.config };
    if (!cfg.blink) continue;
    const got = partInput(p, preview.powerC, preview.powerT);
    if (got.c <= 0 && got.t <= 0) continue;
    const t = new Uint8Array(TILE_COUNT);
    floodLayer(wire, partSources(p, { layer: 't', strength: SOURCE_STRENGTH }), t);
    out.push({ id: p.id, steps: Math.max(1, cfg.delay ?? 5), powerT: t });
  }
  return out;
}

/** What reaches a part: the strongest wire on any side, or only on its `in` pins. */
export function partInput(p: { x: number; y: number; rot: number; type: string }, powerC: Uint8Array, powerT: Uint8Array): PowerIn {
  const pins = hasPartDef(p.type) ? partDef(p.type).pins : undefined;
  return pins ? inputFromSides(p.x, p.y, p.rot, pins.in, powerC, powerT) : inputAt(key(p.x, p.y), powerC, powerT);
}

function moveZombies(st: SimState, events: SimEvent[]): void {
  const hx = st.house.x + 0.5;
  const hy = st.house.y + 0.5;
  const live = st.zombies.filter((z) => !z.dead);

  for (const z of live) {
    // A zombie shoved this step (piston) moves on from where it was shoved from.
    z.px = z.ext.pushed ? (z.ext.pfx as number) : z.x;
    z.py = z.ext.pushed ? (z.ext.pfy as number) : z.y;
    z.ext.pushed = 0;
    if (z.ext.enter) {
      // Walking in out of the forest: straight to the edge tile, then path as normal.
      const dx = (z.ext.ex as number) - z.x;
      const dy = (z.ext.ey as number) - z.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const stepLen = z.speed * STEP_SECONDS * z.slowMul;
      if (len <= stepLen) {
        z.x = z.ext.ex as number;
        z.y = z.ext.ey as number;
        z.ext.enter = 0;
      } else {
        z.x += (dx / len) * stepLen;
        z.y += (dy / len) * stepLen;
      }
      continue;
    }
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
    z.vx = z.x - z.px;
    z.vy = z.y - z.py;
    if (z.ext.enter) {
      z.slowMul = 1;
      continue; // still in the forest: no lawn clamp, walls or breach yet
    }
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
 * Build-mode power preview: the steady state with no zombies. Floods from the
 * inlet, and lets chips pass constant power through (a delay fed constant power
 * outputs constant power once it has waited), repeating until nothing changes.
 * Triggers don't fire (no zombies). Reports what reaches each part. Needs no house.
 */
export function powerPreview(
  day: DayConfig,
  c: Contraption,
): { powerC: Uint8Array; powerT: Uint8Array; inputs: Map<number, PowerIn>; loaded: number[] } {
  const wire = new Uint8Array(TILE_COUNT);
  for (const w of c.wires) wire[key(w.x, w.y)] = 1;
  const powerC = new Uint8Array(TILE_COUNT);
  const powerT = new Uint8Array(TILE_COUNT);
  const inlet: Source = { k: key(day.inlet.x, day.inlet.y), layer: 'c', strength: INLET_STRENGTH, inlet: true };
  const all = [...c.parts, ...workingFixtures(day)];
  const chips = all.filter((p) => hasPartDef(p.type) && partDef(p.type).kind === 'chip');
  const passing = new Set<number>();
  for (let pass = 0; pass <= chips.length; pass++) {
    const sources: Source[] = [inlet];
    for (const p of chips)
      if (passing.has(p.id))
        sources.push(...partSources(p, { layer: 'c', strength: partDef(p.type).previewStrength?.(p, powerC) ?? SOURCE_STRENGTH }));
    flood(wire, sources, powerC, powerT);
    let changed = false;
    for (const p of chips) {
      const def = partDef(p.type);
      const pc = def.passesConstant;
      const passes = typeof pc === 'function' ? pc({ ...def.defaultConfig, ...p.config }) : pc !== false;
      const on = def.previewOn ? def.previewOn(p, powerC) : partInput(p, powerC, powerT).c > 0 && passes;
      if (on !== passing.has(p.id)) {
        changed = true;
        if (on) passing.add(p.id);
        else passing.delete(p.id);
      }
    }
    if (!changed) break;
  }
  const inputs = new Map<number, PowerIn>();
  for (const p of all) inputs.set(p.id, partInput(p, powerC, powerT));
  // Blinking delays send ticks, not steady power; their beat counts as reaching a part too.
  const beat = new Uint8Array(TILE_COUNT);
  for (const b of blinkerFloods(c, { powerC, powerT }, day))
    for (let k = 0; k < TILE_COUNT; k++) if ((b.powerT[k] as number) > (beat[k] as number)) beat[k] = b.powerT[k] as number;
  // The inlet's load: the INLET_MAX_LOAD action parts it reaches strongest (ties: placed first).
  const reach = all
    .filter((p) => hasPartDef(p.type) && partDef(p.type).kind === 'action')
    .map((p) => {
      const got = partInput(p, powerC, beat);
      return { id: p.id, s: Math.max(got.c, got.t), needs: partDef(p.type).needs };
    })
    .filter((r) => r.s > 0 && r.s >= r.needs)
    .sort((a, b) => b.s - a.s || a.id - b.id);
  const loaded = reach.slice(0, INLET_MAX_LOAD).map((r) => r.id);
  return { powerC, powerT, inputs, loaded };
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
