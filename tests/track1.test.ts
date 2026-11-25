import { describe, expect, it } from 'vitest';
import { eraseAt, movePart, placePart } from '@shared/build/rules';
import { FIXTURE_ID_BASE } from '@shared/build/fixtures';
import { demoDay } from '@shared/demo/demoDay';
import { key } from '@shared/grid';
import { FIELD_INF, blinkerFloods, createSim, partDef, powerPreview, spawnZombie, step, type SimCtx, type SimEvent, type SimState } from '@shared/sim';
import { ROCK_HP } from '@shared/build/rocks';
import type { Contraption, PlacedPart } from '@shared/types/build';
import type { DayConfig } from '@shared/types/day';

const wires = (...ps: [number, number][]) => ps.map(([x, y]) => ({ x, y }));
const day = (inlet: { x: number; y: number }): DayConfig => ({ ...demoDay, inlet, raidMaxSeconds: 60, fixtures: [], obstacles: [] });
// One shambler walks in from the north down x = 12.5 to the house at (12, 14).
const one = [{ step: 0, x: 12, y: 0, type: 'shambler' }];
const build = (parts: PlacedPart[], w: { x: number; y: number }[], house = { x: 12, y: 14 }): Contraption => ({
  house,
  parts,
  wires: w,
  walls: [],
  nextId: 100,
});

function run(st: SimState, steps: number, each?: (st: SimState, ev: SimEvent[]) => void): SimEvent[] {
  const all: SimEvent[] = [];
  for (let i = 0; i < steps && st.outcome === 'running'; i++) {
    const ev = step(st);
    all.push(...ev);
    each?.(st, ev);
  }
  return all;
}

describe('tripwire', () => {
  it('sends one 0.5s tick when a zombie walks through it', () => {
    const c = build([{ id: 1, type: 'tripwire', x: 12, y: 4, rot: 0 }], []);
    const st = createSim(day({ x: 1, y: 15 }), c, { schedule: one });
    let onSteps = 0;
    const ev = run(st, 300, (s) => {
      if (s.parts[0]!.active) onSteps++;
    });
    expect(ev.filter((e) => e.type === 'partFired' && e.partId === 1)).toHaveLength(1);
    expect(onSteps).toBe(5);
  });
  it('ignores a zombie walking along the cord instead of across it', () => {
    // Cord runs north-south (rot 1) on the zombie's own line: it never crosses x = 12.5.
    const c = build([{ id: 1, type: 'tripwire', x: 12, y: 4, rot: 1 }], []);
    const st = createSim(day({ x: 1, y: 15 }), c, { schedule: one });
    const ev = run(st, 300);
    expect(ev.filter((e) => e.type === 'partFired')).toHaveLength(0);
  });
});

describe('delay', () => {
  it('passes constant power on after its delay, refreshed to strength 10', () => {
    const c = build(
      [
        { id: 1, type: 'delay', x: 5, y: 3, rot: 0, config: { delay: 5 } },
        { id: 2, type: 'saw_blade', x: 7, y: 3, rot: 0 },
      ],
      wires([4, 3], [6, 3]),
    );
    const st = createSim(day({ x: 3, y: 3 }), c, { schedule: [] });
    const sawOnAt: number[] = [];
    run(st, 20, (s) => {
      if (s.parts[1]!.active) sawOnAt.push(s.tick);
    });
    expect(sawOnAt[0]).toBeGreaterThanOrEqual(6);
    expect(sawOnAt[0]).toBeLessThanOrEqual(8);
    expect(st.powerC[key(6, 3)]).toBe(9);
    // Directional: the delay never pushes power back into its input wire (the inlet's 6 gives 5 here).
    expect(st.powerC[key(4, 3)]).toBe(5);
  });
  it('is directional: power arriving on its output side does nothing', () => {
    const c = build(
      [
        { id: 1, type: 'delay', x: 5, y: 3, rot: 2 }, // turned around: input east, output west
        { id: 2, type: 'saw_blade', x: 7, y: 3, rot: 0 },
      ],
      wires([4, 3], [6, 3]),
    );
    const st = createSim(day({ x: 3, y: 3 }), c, { schedule: [] });
    run(st, 30);
    expect(st.parts[1]!.active).toBe(false);
  });
  it('turns a tripwire tick into a late spike punch that lands on the zombie', () => {
    const c = build(
      [
        { id: 1, type: 'tripwire', x: 12, y: 4, rot: 0 },
        { id: 2, type: 'delay', x: 14, y: 4, rot: 0, config: { delay: 20 } },
        { id: 3, type: 'spike_floor', x: 12, y: 6, rot: 0 },
      ],
      wires([13, 4], [15, 4], [15, 5], [15, 6], [14, 6], [13, 6]),
    );
    const st = createSim(day({ x: 1, y: 15 }), c, { schedule: one });
    const ev = run(st, 300);
    const punches = ev.filter((e) => e.type === 'hit' && e.partId === 3);
    expect(punches).toHaveLength(1);
    expect((punches[0] as { amount: number }).amount).toBe(25); // 5 wire tiles from the delay: 45 x 5/9
  });
  it('shows up in the build preview: constant power through a delay reaches the saw', () => {
    const c = build(
      [
        { id: 1, type: 'delay', x: 5, y: 3, rot: 0 },
        { id: 2, type: 'saw_blade', x: 7, y: 3, rot: 0 },
      ],
      wires([4, 3], [6, 3]),
      { x: 12, y: 12 },
    );
    expect(powerPreview(day({ x: 3, y: 3 }), c).inputs.get(2)).toEqual({ c: 9, t: 0 });
  });
});

describe('delay: blink mode', () => {
  // inlet (3, 3) -> wire (4, 3) -> blinking delay (5, 3) -> wire (6, 3) -> part at (7, 3)
  const blinker = (d: number, target = 'spike_floor') =>
    build(
      [
        { id: 1, type: 'delay', x: 5, y: 3, rot: 0, config: { delay: d, blink: 1 } },
        { id: 2, type: target, x: 7, y: 3, rot: 0 },
      ],
      wires([4, 3], [6, 3]),
    );

  it('turns steady power into a beat: on d steps, off d steps, as ticks', () => {
    const st = createSim(day({ x: 3, y: 3 }), blinker(5), { schedule: [] });
    const out: string[] = [];
    run(st, 40, (s) => out.push(s.powerT[key(6, 3)]! > 0 ? '1' : '0'));
    expect(st.powerC[key(6, 3)]).toBe(0); // never steady power
    const beat = out.join('').replace(/^0+/, '');
    expect(beat.slice(0, 20)).toBe('11111000001111100000');
  });
  it('a spike floor fed by a blinker punches on every beat', () => {
    const st = createSim(day({ x: 3, y: 3 }), blinker(5), { schedule: [] });
    const ev = run(st, 60);
    // beats start every 10 steps; the spike's 10-step cooldown lets every one through
    expect(ev.filter((e) => e.type === 'partFired' && e.partId === 2).length).toBeGreaterThanOrEqual(5);
  });
  it('stops when its power goes away, and the build preview shows it as a blinker', () => {
    const c = blinker(10);
    expect(powerPreview(day({ x: 3, y: 3 }), c).inputs.get(2)).toEqual({ c: 0, t: 0 }); // no steady power downstream
    const pv = powerPreview(day({ x: 3, y: 3 }), c);
    const floods = blinkerFloods(c, pv);
    expect(floods).toHaveLength(1);
    expect(floods[0]!.steps).toBe(10);
    expect(floods[0]!.powerT[key(6, 3)]).toBe(9);
    // No inlet next to it: nothing blinks.
    const st = createSim(day({ x: 0, y: 15 }), c, { schedule: [] });
    run(st, 30);
    expect(st.parts[0]!.active).toBe(false);
  });
});

describe('spike floor', () => {
  it('held up on the inlet: one stab per zombie (20 at full power, 11 at the inlet\'s 5), and it crosses at half speed', () => {
    const c = build([{ id: 1, type: 'spike_floor', x: 12, y: 5, rot: 0 }], wires([13, 5]));
    const st = createSim(day({ x: 14, y: 5 }), c, { schedule: one });
    let onTile = 0;
    const ev = run(st, 400, (s) => {
      const z = s.zombies[0];
      if (z && Math.floor(z.x) === 12 && Math.floor(z.y) === 5) onTile++;
    });
    const hits = ev.filter((e) => e.type === 'hit' && e.partId === 1);
    expect(hits).toHaveLength(1);
    expect((hits[0] as { amount: number }).amount).toBe(11); // round(20 * 5 / 9)
    // A shambler crosses a tile in ~11 steps; at half speed it takes ~22.
    expect(onTile).toBeGreaterThanOrEqual(18);
  });
  it('a tick only punches once per cooldown', () => {
    // A clock-like source: tripwire ticks can't repeat this fast, so drive the tick layer directly.
    const c = build([{ id: 1, type: 'spike_floor', x: 12, y: 5, rot: 0 }], wires([13, 5]));
    const st = createSim(day({ x: 1, y: 15 }), c, { schedule: [] });
    const p = st.parts[0]!;
    let punches = 0;
    for (let i = 0; i < 12; i++) {
      // rising edge every other step
      p.input = { c: 0, t: i % 2 === 0 ? 9 : 0 };
      const events: SimEvent[] = [];
      // call act through one sim-style ctx
      const ctx: SimCtx = { state: st, emit: (e) => events.push(e), zombiesOn: () => [], damage: () => {}, wear: () => {} };
      partDef('spike_floor').act?.(ctx, p, p.input);
      if (events.some((e) => e.type === 'partFired')) punches++;
    }
    expect(punches).toBe(2); // at i = 0 and once the 10-step cooldown ends (i = 10)
  });
});

describe('map machines (broken Tesla coil)', () => {
  // A coil at (12, 6), wired straight to an inlet at (14, 6) through (13, 6):
  // the shambler walking down x = 12.5 passes right over it.
  const withCoil = (broken: boolean): DayConfig => ({
    ...day({ x: 14, y: 6 }),
    fixtures: [{ type: 'tesla_coil', x: 12, y: 6, rot: 0, broken, repairSeconds: 120 }],
  });
  const c = build([], wires([13, 6]));

  it('does nothing while broken', () => {
    const st = createSim(withCoil(true), c, { schedule: one });
    const ev = run(st, 400);
    expect(ev.filter((e) => e.type === 'zap')).toHaveLength(0);
  });
  it('once repaired it zaps zombies in reach (70 at full power, 39 on the inlet\'s 5)', () => {
    const st = createSim(withCoil(false), c, { schedule: one });
    const ev = run(st, 400);
    const zaps = ev.filter((e) => e.type === 'zap');
    expect(zaps.length).toBeGreaterThanOrEqual(1);
    const hits = ev.filter((e) => e.type === 'hit' && e.partId === FIXTURE_ID_BASE);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((h) => (h as { amount: number }).amount === 39)).toBe(true);
  });
  it("can't be built on or removed", () => {
    const d = withCoil(true);
    expect(placePart(d, c, 'saw_blade', 12, 6)).toEqual({ ok: false, reason: 'A machine is here' });
    expect(eraseAt(d, c, 12, 6)).toEqual({ ok: false, reason: "You can't remove a machine on the map" });
    expect(eraseAt(d, c, 14, 6)).toEqual({ ok: false, reason: "You can't remove the power inlet" });
  });
});

describe('power inlet: weak and limited', () => {
  // inlet (3, 3), a wire east along y = 3, and four saws under it at strengths 5, 4, 3, 2.
  const four = build(
    [
      { id: 1, type: 'saw_blade', x: 4, y: 4, rot: 0 },
      { id: 2, type: 'saw_blade', x: 5, y: 4, rot: 0 },
      { id: 3, type: 'saw_blade', x: 6, y: 4, rot: 0 },
      { id: 4, type: 'saw_blade', x: 7, y: 4, rot: 0 },
    ],
    wires([4, 3], [5, 3], [6, 3], [7, 3]),
  );
  it('is strength 6 and powers only the 3 parts it reaches strongest', () => {
    const pv = powerPreview(day({ x: 3, y: 3 }), four);
    expect(pv.powerC[key(4, 3)]).toBe(5);
    expect(pv.loaded).toEqual([1, 2, 3]);
    const st = createSim(day({ x: 3, y: 3 }), four, { schedule: [] });
    run(st, 5);
    expect(st.parts.map((p) => p.active)).toEqual([true, true, true, false]);
  });
  it('sensor power has no limit: the 4th saw still runs on a plate', () => {
    const c = build([...four.parts, { id: 5, type: 'pressure_plate', x: 8, y: 4, rot: 0 }], [...four.wires, { x: 8, y: 3 }]);
    const st = createSim(day({ x: 3, y: 3 }), c, { schedule: [] });
    spawnZombie(st, 'shambler', 8, 4);
    st.zombies[0]!.speed = 0;
    run(st, 5);
    expect(st.parts[3]!.active).toBe(true); // saw 4 gets the plate's power
  });
  it('inlet power through a delay still counts toward the limit', () => {
    const c = build(
      [
        { id: 1, type: 'delay', x: 5, y: 3, rot: 0 },
        { id: 2, type: 'saw_blade', x: 7, y: 3, rot: 0 }, // fed by the delay at 9
        { id: 3, type: 'saw_blade', x: 3, y: 5, rot: 0 },
        { id: 4, type: 'saw_blade', x: 2, y: 4, rot: 0 },
        { id: 5, type: 'saw_blade', x: 4, y: 4, rot: 0 },
      ],
      wires([4, 3], [6, 3], [3, 4]),
    );
    const pv = powerPreview(day({ x: 3, y: 3 }), c);
    expect(pv.loaded[0]).toBe(2); // strongest first
    expect(pv.loaded).toHaveLength(3);
  });
});

describe('strength: damage and wear', () => {
  it('a part past its durability wears out and stops for the raid', () => {
    const c = build([{ id: 1, type: 'spike_floor', x: 12, y: 5, rot: 0 }], wires([13, 5]));
    const st = createSim(day({ x: 14, y: 5 }), c, { schedule: one });
    st.parts[0]!.s.wear = 598; // durability 600: the next stab (11 x 5/9 = 6.1 wear) finishes it
    const ev = run(st, 400);
    expect(ev.filter((e) => e.type === 'worn')).toEqual([{ type: 'worn', partId: 1 }]);
    expect(st.parts[0]!.active).toBe(false);
  });
  it('stronger power hits harder: a saw on a plate cuts 6 a step, on the inlet 3', () => {
    const plate = build(
      [
        { id: 1, type: 'pressure_plate', x: 12, y: 4, rot: 0 },
        { id: 2, type: 'saw_blade', x: 12, y: 5, rot: 0 },
      ],
      wires([11, 4], [11, 5]),
    );
    const a = run(createSim(day({ x: 1, y: 15 }), plate, { schedule: one }), 300);
    const amounts = a.filter((e) => e.type === 'hit' && e.partId === 2).map((e) => (e as { amount: number }).amount);
    expect(Math.max(...amounts)).toBe(5); // plate 10 -> wire 9 -> wire 8: 6 x 8/9
    const inlet = build([{ id: 2, type: 'saw_blade', x: 12, y: 5, rot: 0 }], wires([13, 5]));
    const b = run(createSim(day({ x: 14, y: 5 }), inlet, { schedule: one }), 300);
    expect(b.find((e) => e.type === 'hit' && e.partId === 2)).toMatchObject({ amount: 3 }); // 6 x 5/9
  });
});

describe('piston', () => {
  it('shoves a zombie on the tile in front one tile on when power arrives', () => {
    // piston (11, 5) facing east, powered by the inlet at (10, 4) through (11, 4)
    const c = build([{ id: 1, type: 'piston', x: 11, y: 5, rot: 0 }], wires([11, 4]));
    const st = createSim(day({ x: 10, y: 4 }), c, { schedule: [] });
    spawnZombie(st, 'shambler', 12, 5);
    const ev = step(st);
    expect(ev.some((e) => e.type === 'push')).toBe(true);
    expect(Math.floor(st.zombies[0]!.x)).toBe(13);
  });
  it('slams a zombie into a wall instead of pushing it through', () => {
    const c = { ...build([{ id: 1, type: 'piston', x: 11, y: 5, rot: 0 }], wires([11, 4])), walls: [{ x: 13, y: 5, material: 'stone' as const }] };
    const st = createSim(day({ x: 10, y: 4 }), c, { schedule: [] });
    spawnZombie(st, 'shambler', 12, 5);
    const ev = step(st);
    expect(ev.some((e) => e.type === 'push')).toBe(false);
    expect(ev.find((e) => e.type === 'hit')).toMatchObject({ amount: 11 }); // 20 x 5/9
  });
});

describe('latch', () => {
  // latch (5, 3) facing east: set on its west (4, 3), reset on its south (5, 4), out east (6, 3).
  // The inlet at (4, 4) touches both (4, 3) and (5, 4), so wires switch it.
  const c = build([{ id: 1, type: 'latch', x: 5, y: 3, rot: 0 }], wires([4, 3], [6, 3]));
  it('switches on from its set pin and stays on when that power goes', () => {
    const st = createSim(day({ x: 4, y: 4 }), c, { schedule: [] });
    run(st, 3);
    expect(st.parts[0]!.active).toBe(true);
    expect(st.powerC[key(6, 3)]).toBe(9);
    expect(st.inletC[key(6, 3)]).toBe(9); // the inlet set it, so it's inlet power
    st.wire[key(4, 3)] = 0; // cut the set wire
    run(st, 5);
    expect(st.parts[0]!.active).toBe(true);
  });
  it('switches off from its reset pin', () => {
    const st = createSim(day({ x: 4, y: 4 }), c, { schedule: [] });
    run(st, 3);
    st.wire[key(5, 4)] = 1; // reset wire touching the inlet
    run(st, 3);
    expect(st.parts[0]!.active).toBe(false);
  });
});

describe('rocks', () => {
  const rocky: DayConfig = { ...day({ x: 1, y: 15 }), obstacles: [{ type: 'rock', x: 8, y: 8, clearSeconds: 30 }] };
  it("block building, wiring and erasing", () => {
    const c = build([], []);
    expect(placePart(rocky, c, 'saw_blade', 8, 8)).toEqual({ ok: false, reason: 'A rock is in the way' });
    expect(eraseAt(rocky, c, 8, 8)).toEqual({ ok: false, reason: 'Tap the rock to clear it' });
  });
  it('are solid to zombies', () => {
    const st = createSim(rocky, build([], []), { schedule: [] });
    expect(st.wallHp[key(8, 8)]).toBe(ROCK_HP);
    expect(st.field[key(8, 8)]).toBe(FIELD_INF);
  });
});

describe('piston on steady power', () => {
  it('fires on a zombie that walks onto the tile in front', () => {
    // piston (11, 5) facing east onto (12, 5), on the inlet at (10, 4) via (11, 4);
    // the shambler walks down x = 12.5 and gets shoved east to x = 13.
    const c = build([{ id: 1, type: 'piston', x: 11, y: 5, rot: 0 }], wires([11, 4]));
    const st = createSim(day({ x: 10, y: 4 }), c, { schedule: one });
    const ev = run(st, 200);
    const push = ev.find((e) => e.type === 'push');
    expect(push).toBeDefined();
    expect(Math.floor((push as { x: number }).x)).toBe(13);
  });
});

describe('big rocks and moving parts', () => {
  const rocky: DayConfig = { ...day({ x: 1, y: 15 }), obstacles: [{ type: 'rock', x: 8, y: 8, w: 2, h: 2, clearSeconds: 60 }] };
  it('a 2x2 rock covers all four tiles', () => {
    const st = createSim(rocky, build([], []), { schedule: [] });
    for (const [x, y] of [[8, 8], [9, 8], [8, 9], [9, 9]] as const) expect(st.wallHp[key(x, y)]).toBe(ROCK_HP);
    expect(st.wallHp[key(10, 8)]).toBe(0);
    expect(placePart(rocky, build([], []), 'saw_blade', 9, 9)).toEqual({ ok: false, reason: 'A rock is in the way' });
  });
  it('a placed part can move to a free tile, keeping its id and turn, but not onto a rock', () => {
    const c = build([{ id: 7, type: 'piston', x: 3, y: 3, rot: 2 }], []);
    const moved = movePart(rocky, c, 7, 4, 3);
    expect(moved.ok && moved.c.parts[0]).toEqual({ id: 7, type: 'piston', x: 4, y: 3, rot: 2 });
    expect(movePart(rocky, c, 7, 8, 9)).toEqual({ ok: false, reason: 'A rock is in the way' });
  });
});

describe('latch switched on in build mode', () => {
  // latch (5, 3) facing east, nothing on its pins, flipped on from its card; a saw on its output wire.
  const c = build(
    [
      { id: 1, type: 'latch', x: 5, y: 3, rot: 0, config: { on: 1 } },
      { id: 2, type: 'saw_blade', x: 7, y: 3, rot: 0 },
    ],
    wires([6, 3]),
  );
  it("is a power source: the inlet's strength, counted on the inlet's 3 slots", () => {
    const pv = powerPreview(day({ x: 12, y: 12 }), c);
    expect(pv.powerC[key(6, 3)]).toBe(5);
    expect(pv.loaded).toEqual([2]);
    const st = createSim(day({ x: 12, y: 12 }), c, { schedule: [] });
    run(st, 3);
    expect(st.parts[0]!.active).toBe(true);
    expect(st.parts[1]!.active).toBe(true);
    expect(st.inletC[key(6, 3)]).toBe(5);
  });
  it('off (the default) it sends nothing', () => {
    const off = { ...c, parts: c.parts.map((p) => (p.id === 1 ? { ...p, config: { on: 0 } } : p)) };
    const st = createSim(day({ x: 12, y: 12 }), off, { schedule: [] });
    run(st, 3);
    expect(st.parts[1]!.active).toBe(false);
  });
});

describe('piston: always out on steady power', () => {
  it('is extended (active) the whole time it has steady power', () => {
    const c = build([{ id: 1, type: 'piston', x: 11, y: 5, rot: 0 }], wires([11, 4]));
    const st = createSim(day({ x: 10, y: 4 }), c, { schedule: [] });
    run(st, 20);
    expect(st.parts[0]!.active).toBe(true);
  });
});
