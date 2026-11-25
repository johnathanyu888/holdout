// Saw blade (needs strength 1). Constant power: spins non-stop, 60 DPS at full
// power (6 per step, scaled by strength) to every zombie on its tile after a
// 0.2s (2-step) spin-up. Tick power: one 0.5s (5-step) spin. Wears out.


import { registerPart } from '../core/registry';

export const SAW_DAMAGE_PER_STEP = 6;
export const SAW_SPIN_UP_STEPS = 2;
export const SAW_TICK_STEPS = 5;
const NEEDS = 1;

registerPart({
  type: 'saw_blade',
  label: 'Saw blade',
  kind: 'action',
  needs: NEEDS,
  rotatable: false,
  durability: 800,
  initState: () => ({ spin: 0, window: 0, lastT: 0 }),
  act(ctx, p, input) {
    const needs = NEEDS;
    const tickOn = input.t >= needs;
    if (tickOn && !p.s.lastT) p.s.window = SAW_TICK_STEPS; // rising edge of a tick
    p.s.lastT = tickOn ? 1 : 0;
    const powered = input.c >= needs || (p.s.window ?? 0) > 0;
    if ((p.s.window ?? 0) > 0) p.s.window = (p.s.window ?? 0) - 1;

    if (!powered) {
      p.s.spin = 0;
      p.active = false;
      return;
    }
    if (!p.active) ctx.emit({ type: 'partFired', partId: p.id });
    p.active = true;
    p.s.spin = (p.s.spin ?? 0) + 1;
    if ((p.s.spin ?? 0) <= SAW_SPIN_UP_STEPS) return;
    for (const z of ctx.zombiesOn(p.x, p.y)) ctx.damage(z, SAW_DAMAGE_PER_STEP, p.id);
  },
});
