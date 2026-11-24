// Tripwire (trigger): a cord across the middle of its tile between two stakes.
// rot 0/2: the cord runs east-west (zombies walking north or south trip it);
// rot 1/3: it runs north-south. When a zombie's step crosses the cord inside the
// tile, it sends a tick (strength 10) for 0.5s (5 steps), then re-arms 1s (10
// steps) after it fired. Crossing test: the step's start and end are on opposite
// sides of the cord line, and the crossing point lies within the tile.

import { registerPart } from '../core/registry';
import { SOURCE_STRENGTH, type Zombie } from '../core/types';

export const TRIP_TICK_STEPS = 5;
export const TRIP_REARM_STEPS = 10;

/** Did this zombie's last step cross the cord of a tripwire at (x, y) with the given rot? */
export function crossesCord(z: Zombie, x: number, y: number, rot: number): boolean {
  const vertical = rot % 2 === 1;
  // Work in the cord's frame: `a` across the cord, `b` along it.
  const a0 = vertical ? z.px : z.py;
  const a1 = vertical ? z.x : z.y;
  const b0 = vertical ? z.py : z.px;
  const b1 = vertical ? z.y : z.x;
  const line = (vertical ? x : y) + 0.5;
  const lo = vertical ? y : x;
  const d0 = a0 - line;
  const d1 = a1 - line;
  if (d0 === d1 || (d0 > 0 && d1 > 0) || (d0 < 0 && d1 < 0)) return false;
  if (d0 === 0) return false; // started on the line: counted on the step that reached it
  const t = d0 / (d0 - d1);
  const b = b0 + (b1 - b0) * t;
  return b >= lo && b <= lo + 1;
}

registerPart({
  type: 'tripwire',
  label: 'Tripwire',
  kind: 'trigger',
  needs: 0,
  rotatable: true,
  initState: () => ({ window: 0, cool: 0 }),
  sense(ctx, p) {
    if ((p.s.cool ?? 0) > 0) p.s.cool = (p.s.cool ?? 0) - 1;
    if ((p.s.window ?? 0) > 0) p.s.window = (p.s.window ?? 0) - 1;
    if (!p.s.cool) {
      // Zombies that moved last step: anyone within a tile of this one could have crossed.
      const tripped = ctx.state.zombies.some(
        (z) => !z.dead && Math.abs(z.x - (p.x + 0.5)) < 1.6 && Math.abs(z.y - (p.y + 0.5)) < 1.6 && crossesCord(z, p.x, p.y, p.rot),
      );
      if (tripped) {
        p.s.window = TRIP_TICK_STEPS;
        p.s.cool = TRIP_REARM_STEPS;
        ctx.emit({ type: 'partFired', partId: p.id });
      }
    }
    p.active = (p.s.window ?? 0) > 0;
    return p.active ? { layer: 't', strength: SOURCE_STRENGTH } : null;
  },
});
