import { describe, expect, it } from 'vitest';
import { lPath } from '@shared/build/path';
import { demoDay } from '@shared/demo/demoDay';
import { GRID, TILE_COUNT, key } from '@shared/grid';
import { FIELD_INF, computeField, nextTile } from '@shared/sim/core/pathing';
import { floodLayer } from '@shared/sim/core/power';
import { cyrb128, nextFloat, nextInt, seedRng } from '@shared/sim/core/rng';
import {
  buildSchedule,
  createSim,
  hashState,
  powerPreview,
  snapshot,
  step,
  type SimEvent,
  type SimState,
} from '@shared/sim';
import type { Contraption } from '@shared/types/build';
import type { DayConfig } from '@shared/types/day';

const wiresOf = (...ps: [number, number][]) => ps.map(([x, y]) => ({ x, y }));

describe('rng', () => {
  it('is deterministic and seed-sensitive', () => {
    const a = seedRng('x');
    const b = seedRng('x');
    const c = seedRng('y');
    const sa = Array.from({ length: 5 }, () => nextFloat(a));
    expect(Array.from({ length: 5 }, () => nextFloat(b))).toEqual(sa);
    expect(Array.from({ length: 5 }, () => nextFloat(c))).not.toEqual(sa);
    expect(cyrb128('holdout')).toEqual(cyrb128('holdout'));
  });
  it('nextInt stays in range and hits both ends', () => {
    const r = seedRng('range');
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = nextInt(r, 2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });
});

describe('power flood', () => {
  const wire = new Uint8Array(TILE_COUNT);
  const out = new Uint8Array(TILE_COUNT);
  it('drops 1 per wire tile, starting at S-1 next to the source', () => {
    wire.fill(0);
    for (let x = 1; x < GRID; x++) wire[key(x, 0)] = 1;
    floodLayer(wire, [{ k: key(0, 0), layer: 'c', strength: 15 }], out);
    expect(out[key(1, 0)]).toBe(14);
    expect(out[key(14, 0)]).toBe(1);
    expect(out[key(15, 0)]).toBe(0);
  });
  it('branches count down independently and keep the strongest route', () => {
    wire.fill(0);
    // a loop: two routes of different length to (5, 2)
    for (const [x, y] of [
      [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [5, 1], [5, 2],
      [1, 1], [1, 2], [1, 3], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [5, 3],
    ] as const)
      wire[key(x, y)] = 1;
    floodLayer(wire, [{ k: key(0, 0), layer: 'c', strength: 10 }], out);
    expect(out[key(5, 2)]).toBe(3); // short way: 9,8,7,6,5,4,3
    expect(out[key(5, 3)]).toBe(2);
  });
  it('a plate can reach at most 9 wire tiles', () => {
    wire.fill(0);
    for (let x = 1; x < GRID; x++) wire[key(x, 0)] = 1;
    floodLayer(wire, [{ k: key(0, 0), layer: 'c', strength: 10 }], out);
    expect(out[key(9, 0)]).toBe(1);
    expect(out[key(10, 0)]).toBe(0);
  });
  it('does not cross gaps', () => {
    wire.fill(0);
    wire[key(1, 0)] = 1;
    wire[key(3, 0)] = 1;
    floodLayer(wire, [{ k: key(0, 0), layer: 'c', strength: 10 }], out);
    expect(out[key(3, 0)]).toBe(0);
  });
});

describe('flow field', () => {
  it('routes around walls without cutting corners', () => {
    const walls = new Int16Array(TILE_COUNT);
    for (let x = 3; x <= 12; x++) walls[key(x, 10)] = 120; // wall across the middle
    const field = new Int32Array(TILE_COUNT);
    computeField(walls, 8, 12, field);
    expect(field[key(8, 12)]).toBe(0);
    expect(field[key(8, 10)]).toBe(FIELD_INF);
    // Straight down from (8, 8) is blocked: it must go round the end of the wall.
    expect(field[key(8, 8)]!).toBeGreaterThan(40);
    expect(nextTile(field, walls, 8, 11)).toEqual([8, 12]);
    // At the wall's end, the diagonal past its corner is not allowed.
    expect(nextTile(field, walls, 13, 9)).not.toEqual([12, 10]);
  });
  it('marks enclosed tiles unreachable', () => {
    const walls = new Int16Array(TILE_COUNT);
    for (let i = 9; i <= 13; i++) {
      walls[key(i, 9)] = 1;
      walls[key(i, 13)] = 1;
      walls[key(9, i)] = 1;
      walls[key(13, i)] = 1;
    }
    const field = new Int32Array(TILE_COUNT);
    computeField(walls, 11, 11, field);
    expect(field[key(0, 0)]).toBe(FIELD_INF);
    expect(field[key(10, 10)]).toBe(14);
  });
});

describe('spawn schedule', () => {
  const sched = buildSchedule(demoDay.spawns);
  it('is deterministic and complete', () => {
    expect(buildSchedule(demoDay.spawns)).toEqual(sched);
    expect(sched).toHaveLength(16);
    expect(sched[0]!.step).toBe(demoDay.spawns.firstStep);
    for (let i = 1; i < sched.length; i++) expect(sched[i]!.step).toBeGreaterThanOrEqual(sched[i - 1]!.step);
  });
  it('spawns only on edge tiles, from more than one side', () => {
    const sides = new Set<string>();
    for (const e of sched) {
      const edge = e.x === 0 || e.y === 0 || e.x === GRID - 1 || e.y === GRID - 1;
      expect(edge).toBe(true);
      sides.add(e.y === 0 ? 'n' : e.x === GRID - 1 ? 'e' : e.y === GRID - 1 ? 's' : 'w');
    }
    expect(sides.size).toBeGreaterThan(1);
  });
  it('changes with the seed', () => {
    expect(buildSchedule({ ...demoDay.spawns, seed: 'other' })).not.toEqual(sched);
  });
});

// One shambler walks straight down x=12 from the north edge to the house at (12, 14).
const lane = (zombies = 1): DayConfig => ({ ...demoDay, inlet: { x: 14, y: 6 }, raidMaxSeconds: 60 });
const one = [{ step: 0, x: 12, y: 0, type: 'shambler' }];

function run(st: SimState, maxSteps = 1000): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < maxSteps && st.outcome === 'running'; i++) all.push(...step(st));
  return all;
}

describe('raid', () => {
  it('an undefended house is breached', () => {
    const c: Contraption = { house: { x: 12, y: 14 }, parts: [], wires: [], walls: [], nextId: 1 };
    const st = createSim(lane(), c, { schedule: one });
    const ev = run(st);
    expect(st.outcome).toBe('lost');
    expect(ev.at(-1)).toEqual({ type: 'end', outcome: 'lost', reason: 'breach' });
    // 3 tiles walking in from the forest + ~13.5 on the lawn, at 0.9 tiles/s ~= 185 steps
    expect(st.tick).toBeGreaterThan(165);
    expect(st.tick).toBeLessThan(205);
  });

  it('two inlet-powered saws in a row kill a shambler', () => {
    const c: Contraption = {
      house: { x: 12, y: 14 },
      parts: [
        { id: 1, type: 'saw_blade', x: 12, y: 6, rot: 0 },
        { id: 2, type: 'saw_blade', x: 12, y: 7, rot: 0 },
      ],
      wires: wiresOf([13, 6], [13, 7]), // the inlet at (14, 6) feeds (13, 6) at 14
      walls: [],
      nextId: 3,
    };
    const st = createSim(lane(), c, { schedule: one });
    const ev = run(st);
    expect(st.outcome).toBe('won');
    const deaths = ev.filter((e) => e.type === 'death');
    expect(deaths).toHaveLength(1);
    expect(Math.floor((deaths[0] as { y: number }).y)).toBe(7);
  });

  it('a pressure plate powers a saw only while it is held', () => {
    const c: Contraption = {
      house: { x: 12, y: 14 },
      parts: [
        { id: 1, type: 'pressure_plate', x: 12, y: 4, rot: 0 },
        { id: 2, type: 'saw_blade', x: 15, y: 4, rot: 0 }, // off the zombie's path, wired to the plate
      ],
      wires: lPath({ x: 13, y: 4 }, { x: 14, y: 4 }).map((t) => ({ ...t })), // saw gets 10-2 = 8
      walls: [],
      nextId: 3,
    };
    const st = createSim(lane(), c, { schedule: one });
    let sawOnSteps = 0;
    let plateWasOn = false;
    for (let i = 0; i < 400 && st.outcome === 'running'; i++) {
      step(st);
      const plate = st.parts[0]!;
      const saw = st.parts[1]!;
      plateWasOn ||= plate.active;
      if (saw.active) {
        sawOnSteps++;
        expect(plate.active).toBe(true);
      }
    }
    expect(plateWasOn).toBe(true);
    expect(st.parts[1]!.input.c).toBe(0); // off again after the hold
    // crossing the plate tile (~11 steps) + the 5-step hold
    expect(sawOnSteps).toBeGreaterThan(10);
    expect(sawOnSteps).toBeLessThan(25);
  });

  it('the demo day is deterministic: same build -> same hash, every step', () => {
    const c: Contraption = {
      house: { x: 12, y: 12 },
      parts: [
        { id: 1, type: 'saw_blade', x: 14, y: 8, rot: 0 },
        { id: 2, type: 'pressure_plate', x: 6, y: 12, rot: 0 },
        { id: 3, type: 'saw_blade', x: 7, y: 12, rot: 0 },
      ],
      wires: wiresOf([14, 9], [13, 9], [7, 13], [6, 13]),
      walls: [
        { x: 10, y: 10, material: 'wood' },
        { x: 11, y: 10, material: 'wood' },
      ],
      nextId: 4,
    };
    const a = createSim(demoDay, c);
    const b = createSim(demoDay, structuredClone(c));
    const hashes: string[] = [];
    while (a.outcome === 'running') {
      step(a);
      step(b);
      const h = hashState(a);
      expect(hashState(b)).toBe(h);
      hashes.push(h);
    }
    expect(new Set(hashes).size).toBe(hashes.length); // the state really changes every step
    // A snapshot resumes identically.
    const s = createSim(demoDay, c);
    for (let i = 0; i < 50; i++) step(s);
    const copy = snapshot(s);
    for (let i = 0; i < 50; i++) {
      step(s);
      step(copy);
    }
    expect(hashState(copy)).toBe(hashState(s));
  });

  it('powerPreview floods from the inlet only', () => {
    const c: Contraption = {
      house: null,
      parts: [{ id: 1, type: 'saw_blade', x: 10, y: 6, rot: 0 }],
      wires: wiresOf([13, 6], [12, 6], [11, 6]),
      walls: [],
      nextId: 2,
    };
    const p = powerPreview(lane(), c);
    expect(p.powerC[key(11, 6)]).toBe(12);
    expect(p.inputs.get(1)).toEqual({ c: 12, t: 0 });
  });
});
