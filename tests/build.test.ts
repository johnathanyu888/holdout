import { describe, expect, it } from 'vitest';
import { extendPath, lPath } from '@shared/build/path';
import {
  eraseAt,
  placeHouse,
  placePart,
  placeWall,
  placeWires,
  remaining,
  validate,
} from '@shared/build/rules';
import { demoDay } from '@shared/demo/demoDay';
import { type Contraption, emptyContraption } from '@shared/types/build';

const day = { ...demoDay, obstacles: [], materials: { ...demoDay.materials, stone: 0 } }; // no rocks in the way; no stone (tests "Out of Stone")
const ok = (r: ReturnType<typeof placeHouse>): Contraption => {
  if (!r.ok) throw new Error(r.reason);
  return r.c;
};

describe('lPath', () => {
  it('goes along the longer axis first', () => {
    expect(lPath({ x: 0, y: 0 }, { x: 3, y: 1 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 1 },
    ]);
    expect(lPath({ x: 5, y: 5 }, { x: 4, y: 2 })).toEqual([
      { x: 5, y: 5 },
      { x: 5, y: 4 },
      { x: 5, y: 3 },
      { x: 5, y: 2 },
      { x: 4, y: 2 },
    ]);
  });
  it('is a single tile for a == b, and every step is orthogonal', () => {
    expect(lPath({ x: 2, y: 2 }, { x: 2, y: 2 })).toEqual([{ x: 2, y: 2 }]);
    const p = extendPath(extendPath([{ x: 1, y: 1 }], { x: 4, y: 3 }), { x: 2, y: 6 });
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1]!;
      const b = p[i]!;
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
    }
  });
});

describe('house', () => {
  it('can go on open ground, not in the edge band or on the inlet', () => {
    const c = emptyContraption();
    expect(placeHouse(day, c, 12, 12).ok).toBe(true);
    expect(placeHouse(day, c, 1, 12)).toEqual({ ok: false, reason: 'Too close to the edge' });
    expect(placeHouse(day, c, day.inlet.x, day.inlet.y).ok).toBe(false);
  });
  it('moves when placed again', () => {
    let c = ok(placeHouse(day, emptyContraption(), 12, 12));
    c = ok(placeHouse(day, c, 10, 10));
    expect(c.house).toEqual({ x: 10, y: 10 });
  });
});

describe('parts', () => {
  it('spend the kit and refuse when it runs out', () => {
    let c = emptyContraption();
    for (let i = 0; i < day.kit.saw_blade!; i++) c = ok(placePart(day, c, 'saw_blade', 3 + i, 3));
    expect(remaining(day, c).parts.saw_blade).toBe(0);
    expect(placePart(day, c, 'saw_blade', 3, 9)).toEqual({ ok: false, reason: 'None left in the kit' });
    expect(placePart(day, c, 'shredder', 3, 9).ok).toBe(false);
  });
  it('get unique, increasing ids', () => {
    let c = ok(placePart(day, emptyContraption(), 'saw_blade', 3, 3));
    c = ok(placePart(day, c, 'pressure_plate', 4, 3));
    expect(c.parts.map((p) => p.id)).toEqual([1, 2]);
    expect(c.nextId).toBe(3);
  });
  it("can't stack", () => {
    const c = ok(placePart(day, emptyContraption(), 'saw_blade', 3, 3));
    expect(placePart(day, c, 'pressure_plate', 3, 3)).toEqual({ ok: false, reason: 'Tile occupied' });
    expect(placeWall(day, c, 'wood', 3, 3).ok).toBe(false);
  });
});

describe('wires', () => {
  it('cost 1 each; existing wire is free; occupied tiles are skipped', () => {
    let c = ok(placePart(day, emptyContraption(), 'saw_blade', 5, 3));
    c = ok(placeWires(day, c, lPath({ x: 2, y: 3 }, { x: 8, y: 3 })));
    expect(c.wires).toHaveLength(6); // 7 tiles minus the saw
    expect(remaining(day, c).materials.wire).toBe(day.materials.wire - 6);
    const again = placeWires(day, c, lPath({ x: 2, y: 3 }, { x: 4, y: 3 }));
    expect(again.ok && again.c).toBe(c); // all existing: unchanged
  });
  it('stop when Wire runs out', () => {
    const tight = { ...day, materials: { ...day.materials, wire: 3 } };
    const c = ok(placeWires(tight, emptyContraption(), lPath({ x: 2, y: 3 }, { x: 9, y: 3 })));
    expect(c.wires).toHaveLength(3);
    expect(placeWires(tight, c, [{ x: 10, y: 3 }])).toEqual({ ok: false, reason: 'Out of Wire' });
  });
});

describe('walls and erase', () => {
  it('walls cost 3 of their material', () => {
    let c = emptyContraption();
    const walls = day.materials.wood / 3;
    for (let i = 0; i < walls; i++) c = ok(placeWall(day, c, 'wood', 3 + (i % 10), 12 + Math.floor(i / 10)));
    expect(remaining(day, c).materials.wood).toBe(0);
    expect(placeWall(day, c, 'wood', 3, 14)).toEqual({ ok: false, reason: 'Out of Wood' });
    expect(placeWall(day, c, 'stone', 3, 14)).toEqual({ ok: false, reason: 'Out of Stone' });
  });
  it('erase refunds exactly', () => {
    let c = ok(placeHouse(day, emptyContraption(), 12, 12));
    c = ok(placePart(day, c, 'saw_blade', 3, 3));
    c = ok(placeWires(day, c, lPath({ x: 4, y: 3 }, { x: 6, y: 3 })));
    c = ok(placeWall(day, c, 'wood', 8, 8));
    for (const [x, y] of [
      [12, 12],
      [3, 3],
      [5, 3],
      [8, 8],
    ] as const)
      c = ok(eraseAt(day, c, x, y));
    const inv = remaining(day, c);
    expect(c.house).toBeNull();
    expect(inv.parts.saw_blade).toBe(day.kit.saw_blade);
    expect(inv.materials).toEqual({ ...day.materials, wire: day.materials.wire - 2 });
    expect(eraseAt(day, c, day.inlet.x, day.inlet.y).ok).toBe(false);
  });
});

describe('validate', () => {
  it('passes a legal build and catches cheats', () => {
    let c = ok(placeHouse(day, emptyContraption(), 12, 12));
    c = ok(placePart(day, c, 'saw_blade', 3, 3));
    expect(validate(day, c)).toEqual([]);
    const cheat: Contraption = {
      ...c,
      parts: [...c.parts, { id: 9, type: 'saw_blade', x: 3, y: 3, rot: 0 }],
      walls: Array.from({ length: day.materials.wood / 3 + 1 }, (_, i) => ({ x: i % 10, y: 14 - Math.floor(i / 10), material: 'wood' as const })),
    };
    const problems = validate(day, cheat);
    expect(problems).toContain('two things on 3,3');
    expect(problems).toContain('not enough wood');
    expect(problems).toContain('part id 9 >= nextId');
  });
});

describe('draft', () => {
  it('the kit is the base plus each pick, in a stable order', async () => {
    const { draftedKit } = await import('@shared/build/draft');
    const d = demoDay.draft!;
    expect(draftedKit(d, [])).toEqual({ kit: { pressure_plate: 2, tripwire: 1, battery: 1 }, materials: { wire: 24, wood: 18, stone: 9 } });
    const k = draftedKit(d, [0, 1, 0, 1, 0, 1, 0]);
    expect(Object.keys(k.kit)).toEqual(['pressure_plate', 'tripwire', 'battery', 'saw_blade', 'spike_floor', 'delay', 'latch']);
    expect(k.kit).toMatchObject({ saw_blade: 4, spike_floor: 4, delay: 3, latch: 1, pressure_plate: 5, tripwire: 2 });
    expect(k.materials).toEqual({ wire: 44, wood: 33, stone: 18 });
  });
  it('every way through the draft ends with 2 or 3 attack picks', async () => {
    const { draftedKit } = await import('@shared/build/draft');
    const d = demoDay.draft!;
    const attack = (o: { parts?: Record<string, number> }) => Object.keys(o.parts ?? {}).some((t) => t === 'saw_blade' || t === 'spike_floor');
    for (let mask = 0; mask < 1 << d.rounds.length; mask++) {
      const picks = d.rounds.map((_, i) => ((mask >> i) & 1) as 0 | 1);
      const n = picks.filter((p, i) => attack(d.rounds[i]![p])).length;
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(3);
      expect(Object.keys(draftedKit(d, picks).kit).length).toBeGreaterThan(0);
    }
  });
});

describe('build guide: is a trap wired to power?', () => {
  it('counts a trap only when its wire reaches the inlet or a sensor (through chips too)', async () => {
    const { wiredTraps, buildSteps } = await import('@shared/build/connect');
    const d = { ...demoDay, inlet: { x: 3, y: 3 }, obstacles: [], fixtures: [] };
    const base = { house: { x: 8, y: 8 }, walls: [], nextId: 10 };
    const saw = { id: 1, type: 'saw_blade', x: 6, y: 3, rot: 0 as const };
    expect(wiredTraps(d, { ...base, parts: [saw], wires: [] }).size).toBe(0);
    expect(buildSteps(d, { ...base, parts: [saw], wires: [] })).toEqual({ house: true, trap: true, wired: false });
    const run = [{ x: 4, y: 3 }, { x: 5, y: 3 }];
    expect([...wiredTraps(d, { ...base, parts: [saw], wires: run })]).toEqual([1]);
    // through a delay: inlet, wire, delay, wire, saw
    const viaDelay = { ...base, parts: [{ id: 2, type: 'delay', x: 5, y: 3, rot: 0 as const }, { ...saw, x: 7, y: 3 }], wires: [{ x: 4, y: 3 }, { x: 6, y: 3 }] };
    expect([...wiredTraps(d, viaDelay)]).toEqual([1]);
  });
});

describe('inlet hint', () => {
  it('stays on until an attack part is powered by the inlet (in reach, in a slot)', async () => {
    const { inletInUse } = await import('@shared/build/connect');
    const d = { ...demoDay, inlet: { x: 3, y: 3 }, obstacles: [], fixtures: [] };
    const base = { house: null, walls: [], nextId: 10 };
    const saw = { id: 1, type: 'saw_blade', x: 6, y: 3, rot: 0 as const };
    expect(inletInUse(d, { ...base, parts: [], wires: [] })).toBe(false);
    const plate = { id: 2, type: 'pressure_plate', x: 6, y: 5, rot: 0 as const };
    expect(inletInUse(d, { ...base, parts: [saw, plate], wires: [{ x: 6, y: 4 }] })).toBe(false);
    expect(inletInUse(d, { ...base, parts: [saw], wires: [{ x: 4, y: 3 }, { x: 5, y: 3 }] })).toBe(true);
    // wired, but too far: the signal (6, minus 1 a tile) runs out before the saw
    const far = { ...saw, x: 10 };
    const long = [4, 5, 6, 7, 8, 9].map((x) => ({ x, y: 3 }));
    expect(inletInUse(d, { ...base, parts: [far], wires: long })).toBe(false);
    // a piston alone doesn't count: it doesn't attack
    expect(inletInUse(d, { ...base, parts: [{ ...saw, type: 'piston' }], wires: [{ x: 4, y: 3 }, { x: 5, y: 3 }] })).toBe(false);
  });
});
