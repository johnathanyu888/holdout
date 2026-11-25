// Delay (chip). Directional: input on its west side, output on its east side
// (turned with the part). Two modes (config.blink):
//
//  Wait (blink 0): passes its input on `delay` steps later (0.5 / 1 / 2 s),
//    keeping the kind (a tick stays a tick, constant stays constant) and
//    refreshing the strength to 10, so it also carries power across long runs.
//
//  Blink (blink 1): turns steady power into a beat. While anything powers its
//    input it sends ticks (strength 10): on for `delay` steps, off for `delay`
//    steps, on again... starting with "on" the step after power arrives. Each
//    "on" is a fresh tick, so a spike floor punches on every beat and a saw
//    spins in bursts. Power off: it stops and the beat restarts next time.
//
// It also remembers where its power came from: inlet power stays inlet power on
// the far side (so it still counts toward the inlet's 3-part limit).
//
// State: the last 21 steps of input per layer as bits (bit 0 = newest), plus which
// of those steps had sensor power, and the blink phase, so it stays plain numbers
// (structuredClone-able, hashable).

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
  defaultConfig: { delay: 5, blink: 0 },
  pins: { in: [2], out: [0] },
  // In the build preview: waiting delays pass steady power on; blinkers make ticks, not steady power.
  passesConstant: (config) => !config.blink,
  initState: () => ({ cBits: 0, tBits: 0, sBits: 0, phase: 0 }),
  chip(ctx, p, last) {
    const d = Math.max(1, Math.min(20, p.config.delay ?? 5));
    const powered = last.c > 0 || last.t > 0;
    const fromSensor = p.sens.c > 0 || p.sens.t > 0;

    if (p.config.blink) {
      p.s.phase = powered ? (p.s.phase ?? 0) + 1 : 0;
      const on = powered && Math.floor(((p.s.phase ?? 1) - 1) / d) % 2 === 0;
      if (on && !p.active) ctx.emit({ type: 'partFired', partId: p.id });
      p.active = on;
      p.s.holding = powered && !on ? 1 : 0;
      return on ? { layer: 't', strength: SOURCE_STRENGTH, inlet: !fromSensor } : null;
    }

    p.s.cBits = (((p.s.cBits ?? 0) << 1) | (last.c > 0 ? 1 : 0)) & MASK;
    p.s.tBits = (((p.s.tBits ?? 0) << 1) | (last.t > 0 ? 1 : 0)) & MASK;
    p.s.sBits = (((p.s.sBits ?? 0) << 1) | (fromSensor ? 1 : 0)) & MASK;
    const inlet = ((p.s.sBits >> d) & 1) === 0;
    const c = ((p.s.cBits >> d) & 1) === 1;
    const t = ((p.s.tBits >> d) & 1) === 1;
    const on = c || t;
    if (on && !p.active) ctx.emit({ type: 'partFired', partId: p.id });
    p.active = on;
    // "Holding" = something is on its way through (for the view's countdown blink).
    p.s.holding = ((p.s.cBits | p.s.tBits) & ((1 << d) - 1)) !== 0 ? 1 : 0;
    if (c) return { layer: 'c', strength: SOURCE_STRENGTH, inlet };
    if (t) return { layer: 't', strength: SOURCE_STRENGTH, inlet };
    return null;
  },
});
