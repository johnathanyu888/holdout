// Piston (action, needs 1, rotatable). When power arrives (a rising edge, of
// either kind) it shoves every zombie on the tile in front of it one tile
// further on, in the direction it faces. If a wall, rock or the lawn edge is in
// the way, the zombie slams into it instead and takes 20 (scaled by strength).
// 1s (10-step) cooldown. Steady power pushes once and keeps the head out; a beat
// of ticks pumps it. Each push wears it a little.
// The point: shove zombies into spikes, saws or a Tesla coil's reach.

import { GRID, key } from '../../grid';
import { registerPart } from '../core/registry';
import { powerMul } from '../core/types';

export const PISTON_SLAM = 20;
export const PISTON_COOLDOWN = 10;
const PISTON_WEAR = 10;
const NEEDS = 1;
const SHOW_STEPS = 4;
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

registerPart({
  type: 'piston',
  label: 'Piston',
  kind: 'action',
  needs: NEEDS,
  rotatable: true,
  durability: 300,
  initState: () => ({ last: 0, cool: 0, show: 0 }),
  act(ctx, p, input) {
    if ((p.s.cool ?? 0) > 0) p.s.cool = (p.s.cool ?? 0) - 1;
    if ((p.s.show ?? 0) > 0) p.s.show = (p.s.show ?? 0) - 1;
    const held = input.c >= NEEDS;
    const on = held || input.t >= NEEDS;
    const rising = on && !p.s.last;
    p.s.last = on ? 1 : 0;
    if (rising && !p.s.cool) {
      p.s.cool = PISTON_COOLDOWN;
      p.s.show = SHOW_STEPS;
      ctx.emit({ type: 'partFired', partId: p.id });
      const dx = DX[p.rot] as number;
      const dy = DY[p.rot] as number;
      const fx = p.x + dx;
      const fy = p.y + dy;
      const tx = fx + dx;
      const ty = fy + dy;
      const st = ctx.state;
      const blocked = tx < 0 || ty < 0 || tx >= GRID || ty >= GRID || (st.wallHp[key(tx, ty)] ?? 0) > 0;
      const pushed = fx >= 0 && fy >= 0 && fx < GRID && fy < GRID ? ctx.zombiesOn(fx, fy) : [];
      for (const z of pushed) {
        if (blocked) {
          ctx.damage(z, PISTON_SLAM, p.id);
          continue;
        }
        const fromX = z.x;
        const fromY = z.y;
        z.x += dx;
        z.y += dy;
        ctx.emit({ type: 'push', id: z.id, partId: p.id, fromX, fromY, x: z.x, y: z.y });
      }
      ctx.wear(p, PISTON_WEAR * powerMul(p.s.pw ?? 0));
    }
    p.active = held || (p.s.show ?? 0) > 0;
  },
});
