// Pressure plate: sinks a little and darkens while a zombie holds it down.

import { PART_SCALE } from '../../core/assets';
import { registerPartView } from '../registry';

registerPartView({
  type: 'pressure_plate',
  update(sprite, ctx) {
    const down = ctx.sim?.active ?? false;
    sprite.setScale(PART_SCALE * (down ? 0.92 : 1));
    sprite.setTint(down ? 0xd8d8d8 : 0xffffff);
  },
});
