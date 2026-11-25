// Latch (chip): a switch with memory. Directional, turned with the part:
//   set    its back (west) side     power here switches it on
//   reset  its south side           power here switches it off (reset wins)
//   out    its front (east) side    steady power while it's on
//
// Two ways to switch it on:
//  - In build mode, flip it on from its card (config.on = 1). It then starts the
//    raid on, sending the inlet's own steady power (strength 6), and that power
//    counts toward the inlet's 3-part limit: a remote switch for the inlet.
//  - In the raid, power on its set pin switches it on (strength 10, sensor power
//    if a sensor set it). It stays on after the set power goes, until a reset.

import { registerPart } from '../core/registry';
import { inputFromSides } from '../core/power';
import { INLET_STRENGTH, SOURCE_STRENGTH } from '../core/types';

const SET = 2;
const RESET = 1;

const sideOn = (p: { x: number; y: number; rot: number }, side: number, c: Uint8Array, t: Uint8Array) => {
  const i = inputFromSides(p.x, p.y, p.rot, [side], c, t);
  return i.c > 0 || i.t > 0;
};

registerPart({
  type: 'latch',
  label: 'Latch',
  kind: 'chip',
  needs: 0,
  rotatable: true,
  defaultConfig: { on: 0 },
  pins: { in: [SET, RESET], out: [0] },
  // Build preview: on while switched on (or steady power reaches its set pin), unless its reset pin is powered.
  previewOn: (p, powerC) => !sideOn(p, RESET, powerC, powerC) && ((p.config?.on ?? 0) > 0 || sideOn(p, SET, powerC, powerC)),
  previewStrength: (p, powerC) => (sideOn(p, SET, powerC, powerC) ? SOURCE_STRENGTH : INLET_STRENGTH),
  initState: (p) => {
    const on = (p.config.on ?? 0) > 0 ? 1 : 0;
    return { on, fromInlet: on, str: on ? INLET_STRENGTH : SOURCE_STRENGTH };
  },
  chip(ctx, p) {
    // Chips read last step's flood (still in the state at this point).
    const st = ctx.state;
    if (sideOn(p, RESET, st.powerC, st.powerT)) p.s.on = 0;
    else if (sideOn(p, SET, st.powerC, st.powerT) && !(p.s.on && p.s.str === SOURCE_STRENGTH)) {
      if (!p.s.on) ctx.emit({ type: 'partFired', partId: p.id });
      p.s.on = 1;
      p.s.str = SOURCE_STRENGTH;
      p.s.fromInlet = sideOn(p, SET, st.sensC, st.sensT) ? 0 : 1;
    }
    p.active = p.s.on === 1;
    return p.active ? { layer: 'c', strength: p.s.str ?? SOURCE_STRENGTH, inlet: p.s.fromInlet === 1 } : null;
  },
});
