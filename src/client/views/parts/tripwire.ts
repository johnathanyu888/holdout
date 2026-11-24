// Tripwire: flashes hot and twangs (a quick shiver) when a zombie walks through.

import { registerPartView } from '../registry';

registerPartView({
  type: 'tripwire',
  update(sprite, ctx) {
    const on = ctx.sim?.active ?? false;
    const base = (sprite.getData('baseAngle') as number | undefined) ?? sprite.angle;
    if (sprite.getData('baseAngle') === undefined || !on) sprite.setData('baseAngle', sprite.angle);
    if (on) {
      sprite.setTint(Math.floor(ctx.time * 14) % 2 ? 0xffb4a8 : 0xffffff);
      sprite.setAngle(base + Math.sin(ctx.time * 60) * 4);
    } else {
      sprite.setTint(0xffffff);
    }
  },
});
