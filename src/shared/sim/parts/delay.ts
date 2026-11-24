// Delay (chip): passes its input on `delay` steps later (0.5 / 1 / 2 s), keeping
// the kind (a tick stays a tick, constant stays constant) and refreshing the
// strength to 10, so it also carries power across long runs. Directional: input
// on its west side, output on its east side (turned with the part).
//
// State: the last 21 steps of input per layer as bits (bit 0 = newest), so it
// stays plain numbers (structuredClone-able, hashable).

import { registerPart } from '../core/registry';
import { SOURCE_STRENGTH } from '../core/types';

export const DELAY_OPTIONS = [5, 10, 20] as const;
const MASK = (1 << 21) - 1;

registerPart({
  type: 'delay',
  label: 'Delay',
  kind: 'chip',
  needs: 0,
  rotatable: true,
  defaultConfig: { delay: 5 },
  pins: { in: [2], out: [0] },
  initState: () => ({ cBits: 0, tBits: 0 }),
  chip(ctx, p, last) {
    const d = Math.max(1, Math.min(20, p.config.delay ?? 5));
    p.s.cBits = (((p.s.cBits ?? 0) << 1) | (last.c > 0 ? 1 : 0)) & MASK;
    p.s.tBits = (((p.s.tBits ?? 0) << 1) | (last.t > 0 ? 1 : 0)) & MASK;
    const c = ((p.s.cBits >> d) & 1) === 1;
    const t = ((p.s.tBits >> d) & 1) === 1;
    const on = c || t;
    if (on && !p.active) ctx.emit({ type: 'partFired', partId: p.id });
    p.active = on;
    // "Holding" = something is on its way through (for the view's countdown ring).
    p.s.holding = ((p.s.cBits | p.s.tBits) & ((1 << d) - 1)) !== 0 ? 1 : 0;
    if (c) return { layer: 'c', strength: SOURCE_STRENGTH };
    if (t) return { layer: 't', strength: SOURCE_STRENGTH };
    return null;
  },
});
