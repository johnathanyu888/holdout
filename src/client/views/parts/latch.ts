// Latch: glows warm while it's switched on (remembering), plain when off.

import { PART_SCALE } from '../../core/assets';
import { registerPartView } from '../registry';

registerPartView({
  type: 'latch',
  update(sprite, ctx) {
    const on = ctx.sim ? ctx.sim.active : (ctx.on ?? false);
    const glow = 0.5 + 0.5 * Math.sin(ctx.time * 3);
    sprite.setScale(PART_SCALE * (on ? 1.03 : 1));
    sprite.setTint(on ? (255 << 16) | (Math.round(225 + 20 * glow) << 8) | Math.round(170 + 30 * glow) : 0xffffff);
  },
});
