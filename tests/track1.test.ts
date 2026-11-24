import { describe, expect, it } from 'vitest';
import { demoDay } from '@shared/demo/demoDay';
import { key } from '@shared/grid';
import { blinkerFloods, createSim, partDef, powerPreview, step, type SimCtx, type SimEvent, type SimState } from '@shared/sim';
import type { Contraption, PlacedPart } from '@shared/types/build';
import type { DayConfig } from '@shared/types/day';

const wires = (...ps: [number, number][]) => ps.map(([x, y]) => ({ x, y }));
const day = (inlet: { x: number; y: number }): DayConfig => ({ ...demoDay, inlet, raidMaxSeconds: 60 });
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
    // Directional: the delay never pushes power back into its input wire.
    expect(st.powerC[key(4, 3)]).toBe(14);
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
    expect((punches[0] as { amount: number }).amount).toBe(45);
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
  it('held up on constant power: 2 damage a step, and zombies cross at half speed', () => {
    const c = build([{ id: 1, type: 'spike_floor', x: 12, y: 5, rot: 0 }], wires([13, 5]));
    const st = createSim(day({ x: 14, y: 5 }), c, { schedule: one });
    const ev = run(st, 400);
    const hits = ev.filter((e) => e.type === 'hit' && e.partId === 1);
    // A shambler crosses a tile in ~11 steps; at half speed it takes ~22.
    expect(hits.length).toBeGreaterThanOrEqual(18);
    expect(hits.every((h) => (h as { amount: number }).amount === 2)).toBe(true);
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
      const ctx: SimCtx = { state: st, emit: (e) => events.push(e), zombiesOn: () => [], damage: () => {} };
      partDef('spike_floor').act?.(ctx, p, p.input);
      if (events.some((e) => e.type === 'partFired')) punches++;
    }
    expect(punches).toBe(2); // at i = 0 and once the 10-step cooldown ends (i = 10)
  });
});
