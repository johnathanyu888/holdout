// Tesla coil (action, needs 3). Damage scales with strength; wears out. Zaps the nearest zombie within 1.5 tiles for 70,
// and the arc jumps on to the next-nearest zombie within 1.5 tiles of that one.
//  Constant power: zaps every 1.5s (15 steps) while anything is in range.
//  Tick: one zap on the rising edge (if it has recharged).
// Zombies still walking in from the forest are out of reach.

import { registerPart } from '../core/registry';
import type { Zombie } from '../core/types';

export const TESLA_DAMAGE = 70;
export const TESLA_RECHARGE = 15;
export const TESLA_RANGE = 1.5;
const NEEDS = 3;

function nearest(list: Zombie[], x: number, y: number, skip: Zombie | null): Zombie | null {
  let best: Zombie | null = null;
  let bestD = TESLA_RANGE * TESLA_RANGE;
  for (const z of list) {
    if (z === skip) continue;
    const dx = z.x - x;
    const dy = z.y - y;
    const d = dx * dx + dy * dy;
    if (d <= bestD && (!best || d < bestD || z.id < best.id)) {
      best = z;
      bestD = d;
    }
  }
  return best;
}

registerPart({
  type: 'tesla_coil',
  label: 'Tesla coil',
  kind: 'action',
  needs: NEEDS,
  rotatable: false,
  durability: 900,
  range: TESLA_RANGE,
  initState: () => ({ cool: 0, lastT: 0, flash: 0 }),
  act(ctx, p, input) {
    if ((p.s.cool ?? 0) > 0) p.s.cool = (p.s.cool ?? 0) - 1;
    if ((p.s.flash ?? 0) > 0) p.s.flash = (p.s.flash ?? 0) - 1;
    const tickOn = input.t >= NEEDS;
    const rising = tickOn && !p.s.lastT;
    p.s.lastT = tickOn ? 1 : 0;
    const held = input.c >= NEEDS;
    if ((held || rising) && !p.s.cool) {
      const cx = p.x + 0.5;
      const cy = p.y + 0.5;
      const live = ctx.state.zombies.filter((z) => !z.dead && !z.ext.enter);
      const first = nearest(live, cx, cy, null);
      if (first) {
        const second = nearest(live, first.x, first.y, first);
        const to = [{ x: first.x, y: first.y }, ...(second ? [{ x: second.x, y: second.y }] : [])];
        ctx.emit({ type: 'zap', partId: p.id, x: cx, y: cy, to });
        ctx.damage(first, TESLA_DAMAGE, p.id);
        if (second) ctx.damage(second, TESLA_DAMAGE, p.id);
        p.s.cool = TESLA_RECHARGE;
        p.s.flash = 3;
      } else if (rising) p.s.cool = TESLA_RECHARGE; // a tick with nothing in reach is spent
    }
    p.active = held || (p.s.flash ?? 0) > 0;
  },
});
