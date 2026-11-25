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

const day = { ...demoDay, obstacles: [] }; // no rocks in the way of these placements
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
    expect(draftedKit(d, [])).toEqual({ kit: { pressure_plate: 2, tripwire: 1 }, materials: { wire: 20, wood: 9, stone: 0 } });
    const k = draftedKit(d, [0, 1, 0, 0, 1]);
    expect(Object.keys(k.kit)).toEqual(['pressure_plate', 'tripwire', 'saw_blade', 'spike_floor', 'delay', 'latch']);
    expect(k.kit).toMatchObject({ saw_blade: 2, delay: 2, latch: 1, tripwire: 3, spike_floor: 1 });
    expect(k.materials.wire).toBe(34);
  });
});
