// Battery: plain while it waits; while it runs it glows and pulses (brighter as
// it starts, dimming as the charge runs down); once empty it goes grey.

import { PART_SCALE } from '../../core/assets';
import { registerPartView } from '../registry';

registerPartView({
  type: 'battery',
  update(sprite, ctx) {
    const sp = ctx.sim;
    if (!sp) {
      sprite.setScale(PART_SCALE).setTint(0xffffff);
      return;
    }
    const charge = sp.s.charge ?? 0;
    if (sp.s.on && charge > 0) {
      const full = sp.config.charge ?? 80;
      const k = charge / full;
      const pulse = 0.5 + 0.5 * Math.sin(ctx.time * 9);
      const g = Math.round(200 + 55 * pulse * k);
      sprite.setScale(PART_SCALE * (1 + 0.05 * pulse)).setTint((255 << 16) | (g << 8) | Math.round(140 + 60 * k));
    } else if (charge <= 0) {
      sprite.setScale(PART_SCALE).setTint(0x6d6a66);
    } else {
      sprite.setScale(PART_SCALE).setTint(0xffffff);
    }
  },
});
