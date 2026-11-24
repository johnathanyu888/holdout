// Saw blade: spins whenever it has power, in build mode too (the inlet's constant
// power reaches it through the wires), and in the raid while the sim says it's
// running. It spins up and winds down instead of starting and stopping dead.

import { registerPartView } from '../registry';

/** Full speed in radians per second (~3 turns a second). */
const SPIN = 18;

registerPartView({
  type: 'saw_blade',
  update(sprite, ctx) {
    const running = ctx.sim ? ctx.sim.active : ctx.powered;
    const last = (sprite.getData('t') as number | undefined) ?? ctx.time;
    const dt = Math.min(0.1, Math.max(0, ctx.time - last));
    let v = (sprite.getData('v') as number | undefined) ?? 0;
    v += ((running ? SPIN : 0) - v) * Math.min(1, dt * (running ? 6 : 2.5));
    sprite.rotation += v * dt;
    sprite.setData('t', ctx.time).setData('v', v);
    sprite.setTint(ctx.powered || running ? 0xffffff : 0xb8b8b8);
  },
});
