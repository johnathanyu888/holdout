// Piston: a punch forward (toward the way it faces) each time it fires, then it
// settles back; held out (slightly forward) while steady power keeps it extended.

import { PART_SCALE } from '../../core/assets';
import { registerPartView } from '../registry';

registerPartView({
  type: 'piston',
  update(sprite, ctx) {
    const out = ctx.sim ? ctx.sim.active : false;
    const was = sprite.getData('out') === true;
    if (out && !was) sprite.setData('firedAt', ctx.time);
    sprite.setData('out', out);
    const since = ctx.time - ((sprite.getData('firedAt') as number | undefined) ?? -9);
    const kick = since < 0.22 ? 1 - since / 0.22 : 0;
    // Nudge along the facing: the sprite's rotation is the facing (0 = east).
    const home = sprite.getData('home') as { x: number; y: number } | undefined;
    const base = home ?? { x: sprite.x, y: sprite.y };
    if (!home) sprite.setData('home', base);
    const push = (out ? 4 : 0) + 10 * kick;
    sprite.setPosition(base.x + Math.cos(sprite.rotation) * push, base.y + Math.sin(sprite.rotation) * push);
    sprite.setScale(PART_SCALE * (1 + 0.06 * kick));
    sprite.setTint(ctx.powered || out ? 0xffffff : 0xb8b8b8);
  },
});
