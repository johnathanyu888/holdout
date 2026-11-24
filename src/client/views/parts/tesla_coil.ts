// Tesla coil: hums when it has enough power (a slow cyan breathing), and pops
// bright on each zap (the arc itself is drawn by the fx layer).

import { PART_SCALE } from '../../core/assets';
import { registerPartView } from '../registry';

registerPartView({
  type: 'tesla_coil',
  update(sprite, ctx) {
    const firing = ctx.sim ? (ctx.sim.s.flash ?? 0) > 0 : false;
    if (firing) {
      sprite.setTint(0xe6fdff).setScale(PART_SCALE * 1.08);
      return;
    }
    sprite.setScale(PART_SCALE);
    if (!ctx.powered) return void sprite.setTint(0xb8b8b8);
    const hum = 0.5 + 0.5 * Math.sin(ctx.time * 5);
    const g = Math.round(225 + 30 * hum);
    sprite.setTint((g << 16) | (255 << 8) | 255);
  },
});
