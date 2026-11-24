// Pressure plate: constant power (strength 10) while a zombie stands on it,
// held on for at least 0.5s (5 steps) after the last one leaves.

import { registerPart } from '../core/registry';
import { SOURCE_STRENGTH } from '../core/types';

export const PLATE_HOLD_STEPS = 5;

registerPart({
  type: 'pressure_plate',
  label: 'Pressure plate',
  kind: 'trigger',
  needs: 0,
  rotatable: false,
  initState: () => ({ hold: 0 }),
  sense(ctx, p) {
    const occupied = ctx.zombiesOn(p.x, p.y).length > 0;
    p.s.hold = occupied ? PLATE_HOLD_STEPS : Math.max(0, (p.s.hold ?? 0) - 1);
    const on = occupied || (p.s.hold ?? 0) > 0;
    if (on && !p.active) ctx.emit({ type: 'partFired', partId: p.id });
    p.active = on;
    return on ? { layer: 'c', strength: SOURCE_STRENGTH } : null;
  },
});
