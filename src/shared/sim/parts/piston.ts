// Piston (action, needs 1, rotatable). Shoves every zombie on the tile in front
// of it one tile further on, in the direction it faces. If a wall, rock or the
// lawn edge is in the way, the zombie slams into it instead and takes 20 (scaled
// by strength).
//  Steady power: armed. It fires whenever a zombie is on the front tile, then
//    needs 1s (10 steps) to reset.
//  Tick: one shot on the rising edge, if anything is in front.
// Each push wears it a little.
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
    const tickOn = input.t >= NEEDS;
    const rising = tickOn && !p.s.last;
    p.s.last = tickOn ? 1 : 0;
    const dx = DX[p.rot] as number;
    const dy = DY[p.rot] as number;
    const fx = p.x + dx;
    const fy = p.y + dy;
    const inFront = fx >= 0 && fy >= 0 && fx < GRID && fy < GRID ? ctx.zombiesOn(fx, fy).filter((z) => !z.ext.enter) : [];
    if ((held || rising) && !p.s.cool && inFront.length) {
      p.s.cool = PISTON_COOLDOWN;
      p.s.show = SHOW_STEPS;
      ctx.emit({ type: 'partFired', partId: p.id });
      const tx = fx + dx;
      const ty = fy + dy;
      const st = ctx.state;
      const blocked = tx < 0 || ty < 0 || tx >= GRID || ty >= GRID || (st.wallHp[key(tx, ty)] ?? 0) > 0;
      for (const z of inFront) {
        if (blocked) {
          ctx.damage(z, PISTON_SLAM, p.id);
          continue;
        }
        const fromX = z.x;
        const fromY = z.y;
        // Remember where it was, so this step's motion (and the slide on screen) starts there.
        if (!z.ext.pushed) {
          z.ext.pushed = 1;
          z.ext.pfx = fromX;
          z.ext.pfy = fromY;
        }
        z.x += dx;
        z.y += dy;
        ctx.emit({ type: 'push', id: z.id, partId: p.id, fromX, fromY, x: z.x, y: z.y });
      }
      ctx.wear(p, PISTON_WEAR * powerMul(p.s.pw ?? 0));
    }
    // Shown punched out for a moment after each shot.
    p.active = (p.s.show ?? 0) > 0;
  },
});
