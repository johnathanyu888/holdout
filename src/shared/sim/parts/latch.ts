// Latch (chip): memory. Directional, turned with the part:
//   set    its back (west) side     power here switches it on
//   reset  its south side           power here switches it off (reset wins)
//   out    its front (east) side    steady power (strength 10) while it's on
// It stays on after the set power goes away, until something resets it. So one
// pressure plate can switch a trap on for the rest of the raid, and a second
// plate further in can switch it off.
// Its output counts as inlet power if the inlet is what set it (so it still
// counts toward the inlet's 3-part limit).

import { registerPart } from '../core/registry';
import { inputFromSides } from '../core/power';
import { SOURCE_STRENGTH } from '../core/types';

const SET = 2;
const RESET = 1;

registerPart({
  type: 'latch',
  label: 'Latch',
  kind: 'chip',
  needs: 0,
  rotatable: true,
  pins: { in: [SET, RESET], out: [0] },
  // Build preview: on while steady power reaches its set pin and none its reset pin.
  previewOn: (p, powerC) =>
    inputFromSides(p.x, p.y, p.rot, [SET], powerC, powerC).c > 0 &&
    inputFromSides(p.x, p.y, p.rot, [RESET], powerC, powerC).c === 0,
  initState: () => ({ on: 0, fromInlet: 0 }),
  chip(ctx, p) {
    // Chips read last step's flood (still in the state at this point).
    const st = ctx.state;
    const any = (c: Uint8Array, t: Uint8Array, side: number) => {
      const i = inputFromSides(p.x, p.y, p.rot, [side], c, t);
      return i.c > 0 || i.t > 0;
    };
    if (any(st.powerC, st.powerT, RESET)) p.s.on = 0;
    else if (any(st.powerC, st.powerT, SET)) {
      if (!p.s.on) {
        p.s.on = 1;
        p.s.fromInlet = any(st.sensC, st.sensT, SET) ? 0 : 1;
        ctx.emit({ type: 'partFired', partId: p.id });
      }
    }
    p.active = p.s.on === 1;
    return p.active ? { layer: 'c', strength: SOURCE_STRENGTH, inlet: p.s.fromInlet === 1 } : null;
  },
});
