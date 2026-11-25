// Battery (trigger): stored power you spend when you choose. It comes charged
// (8 seconds by default) and does nothing until the player activates it during
// the raid (from its card); then it sends steady power (strength 10) into its
// wires until the charge runs out. One use: once empty, it's done.
// Its power counts as sensor power (it isn't the inlet, so no 3-part limit).
//
// Activation reaches the sim through SimState.activate (part ids), which the sim
// applies at the start of the next step, so runs stay deterministic.

import { registerPart } from '../core/registry';
import { SOURCE_STRENGTH } from '../core/types';

/** Default charge, in sim steps (10 a second). */
export const BATTERY_CHARGE = 80;

registerPart({
  type: 'battery',
  label: 'Battery',
  kind: 'trigger',
  needs: 0,
  rotatable: false,
  defaultConfig: { charge: BATTERY_CHARGE },
  initState: (p) => ({ charge: p.config.charge ?? BATTERY_CHARGE, on: 0, go: 0 }),
  sense(ctx, p) {
    if (p.s.go) {
      p.s.go = 0;
      if (!p.s.on && (p.s.charge ?? 0) > 0) {
        p.s.on = 1;
        ctx.emit({ type: 'partFired', partId: p.id });
      }
    }
    if (p.s.on && (p.s.charge ?? 0) > 0) {
      p.s.charge = (p.s.charge ?? 0) - 1;
      p.active = true;
      return { layer: 'c', strength: SOURCE_STRENGTH };
    }
    p.s.on = 0;
    p.active = false;
    return null;
  },
});
