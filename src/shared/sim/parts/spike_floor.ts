// Spike floor (action, needs 2).
//  Tick: on the rising edge, spikes punch up: 45 damage to every zombie on the
//        tile, then a 1s (10-step) cooldown before the next punch. Repeated
//        damage needs repeated ticks (a tripwire, a Blink delay...).
//  Constant: spikes held up. Each zombie that crosses gets stabbed once (20
//        damage, the step it first steps onto the tile) and moves at half speed
//        while it's on the spikes. Steady power alone can't grind zombies down.
// `active` = spikes visibly up (held, or for 3 steps after a punch).

import { registerPart } from '../core/registry';

export const SPIKE_PUNCH = 45;
export const SPIKE_HELD_STAB = 20;
export const SPIKE_COOLDOWN = 10;
export const SPIKE_SLOW = 0.5;
const NEEDS = 2;
const SHOW_STEPS = 3;

registerPart({
  type: 'spike_floor',
  label: 'Spike floor',
  kind: 'action',
  needs: NEEDS,
  rotatable: false,
  initState: () => ({ lastT: 0, cool: 0, show: 0 }),
  act(ctx, p, input) {
    if ((p.s.cool ?? 0) > 0) p.s.cool = (p.s.cool ?? 0) - 1;
    if ((p.s.show ?? 0) > 0) p.s.show = (p.s.show ?? 0) - 1;
    const tickOn = input.t >= NEEDS;
    const rising = tickOn && !p.s.lastT;
    p.s.lastT = tickOn ? 1 : 0;
    const held = input.c >= NEEDS;
    const on = ctx.zombiesOn(p.x, p.y);

    if (rising && !p.s.cool) {
      p.s.cool = SPIKE_COOLDOWN;
      p.s.show = SHOW_STEPS;
      ctx.emit({ type: 'partFired', partId: p.id });
      for (const z of on) ctx.damage(z, SPIKE_PUNCH, p.id);
    }
    if (held) {
      if (!p.active) ctx.emit({ type: 'partFired', partId: p.id });
      // One stab per zombie per crossing: remembered on the zombie, keyed by this part.
      const mark = `spike${p.id}`;
      for (const z of on) {
        z.slowMul = Math.min(z.slowMul, SPIKE_SLOW);
        if (!z.ext[mark]) {
          z.ext[mark] = 1;
          ctx.damage(z, SPIKE_HELD_STAB, p.id);
        }
      }
    }
    p.active = held || (p.s.show ?? 0) > 0;
  },
});
