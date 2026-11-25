// Is a trap actually wired to something that can power it? Used by the build
// guide that steers new players toward the key idea: traps need wire, run from
// the power inlet (or from a sensor).
//
// Works on wiring alone (no strengths): wires join their 4 neighbours, and
// chips (delays, latches) pass a connection through. A trap counts as wired if
// its group of wires touches the inlet or a sensor.

import { GRID, key } from '../grid';
import { hasPartDef, partDef } from '../sim';
import type { Contraption } from '../types/build';
import type { DayConfig } from '../types/day';

const D = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Ids of the action parts (traps, pistons) whose wiring reaches the inlet or a
 * sensor; with inletOnly, just the ones whose wiring reaches the inlet itself.
 */
export function wiredTraps(day: DayConfig, c: Contraption, inletOnly = false): Set<number> {
  const wires = new Set(c.wires.map((w) => key(w.x, w.y)));
  const partAt = new Map(c.parts.map((p) => [key(p.x, p.y), p]));
  const kind = (k: number) => {
    const p = partAt.get(k);
    return p && hasPartDef(p.type) ? partDef(p.type).kind : null;
  };
  // Flood each connected group of wires (chips join groups), noting what it touches.
  const group = new Map<number, number>();
  const powered: boolean[] = [];
  const inletK = key(day.inlet.x, day.inlet.y);
  let g = 0;
  for (const start of wires) {
    if (group.has(start)) continue;
    let hasPower = false;
    const stack = [start];
    group.set(start, g);
    while (stack.length) {
      const k = stack.pop() as number;
      const x = k % GRID;
      const y = (k - x) / GRID;
      for (const [dx, dy] of D) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
        const n = key(nx, ny);
        if (n === inletK || (!inletOnly && kind(n) === 'trigger')) hasPower = true;
        if (group.has(n)) continue;
        if (wires.has(n) || kind(n) === 'chip') {
          group.set(n, g);
          stack.push(n);
        }
      }
    }
    powered[g] = hasPower;
    g++;
  }
  const out = new Set<number>();
  for (const p of c.parts) {
    if (!hasPartDef(p.type) || partDef(p.type).kind !== 'action') continue;
    for (const [dx, dy] of D) {
      const gi = group.get(key(p.x + dx, p.y + dy));
      if (gi !== undefined && powered[gi]) out.add(p.id);
    }
  }
  return out;
}

/** Is any trap wired to the power inlet? (Until one is, the inlet calls for attention.) */
export function inletInUse(day: DayConfig, c: Contraption): boolean {
  return wiredTraps(day, c, true).size > 0;
}

/** The three first steps: house placed, a trap placed, a trap wired to the inlet. */
export function buildSteps(day: DayConfig, c: Contraption): { house: boolean; trap: boolean; wired: boolean } {
  const trap = c.parts.some((p) => hasPartDef(p.type) && partDef(p.type).kind === 'action');
  return { house: !!c.house, trap, wired: trap && wiredTraps(day, c, true).size > 0 };
}
