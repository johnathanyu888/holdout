// Delay chip: blinks cyan while a signal is on its way through (counting down),
// and stays lit while it outputs.

import { registerPartView } from '../registry';

registerPartView({
  type: 'delay',
  update(sprite, ctx) {
    const holding = ctx.sim ? (ctx.sim.s.holding ?? 0) > 0 : false;
    const out = ctx.sim ? ctx.sim.active : ctx.powered;
    if (holding && !out) sprite.setTint(Math.floor(ctx.time * 8) % 2 ? 0xbff6ff : 0xffffff);
    else if (out) sprite.setTint(0xd8fbff);
    else sprite.setTint(0xffffff);
  },
});
