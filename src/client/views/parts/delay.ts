// Delay chip.
//  Wait mode: blinks cyan while a signal is on its way through (counting down),
//    and stays lit while it outputs.
//  Blink mode: flashes amber on every beat (the tick it sends), with a small
//    pulse, in the build preview and the raid alike.

import { PART_SCALE } from '../../core/assets';
import { registerPartView } from '../registry';

registerPartView({
  type: 'delay',
  update(sprite, ctx) {
    const blink = (ctx.sim?.config.blink ?? (sprite.getData('blink') as number | undefined) ?? 0) > 0;
    const on = ctx.on ?? false;
    if (blink) {
      sprite.setTint(on ? 0xffd08a : 0xffffff);
      sprite.setScale(PART_SCALE * (on ? 1.06 : 1));
      return;
    }
    sprite.setScale(PART_SCALE);
    const holding = ctx.sim ? (ctx.sim.s.holding ?? 0) > 0 : false;
    if (holding && !on) sprite.setTint(Math.floor(ctx.time * 8) % 2 ? 0xbff6ff : 0xffffff);
    else if (on) sprite.setTint(0xd8fbff);
    else sprite.setTint(0xffffff);
  },
});
