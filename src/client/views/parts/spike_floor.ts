// Spike floor: retracted (holes) until it fires; spikes up while held on constant
// power (build preview too) or for a moment after a tick's punch, with a pop.

import { PART_SCALE } from '../../core/assets';
import { registerPartView } from '../registry';

registerPartView({
  type: 'spike_floor',
  frame: 'spike_floor_down',
  update(sprite, ctx) {
    const up = ctx.sim ? ctx.sim.active : ctx.powered;
    const was = sprite.getData('up') === true;
    if (up !== was) {
      sprite.setFrame(up ? 'spike_floor' : 'spike_floor_down').setData('up', up);
      if (up) sprite.setData('popAt', ctx.time);
    }
    // A quick overshoot when the spikes shoot up.
    const since = ctx.time - ((sprite.getData('popAt') as number | undefined) ?? -9);
    const pop = up && since < 0.18 ? 1 + 0.14 * (1 - since / 0.18) : 1;
    sprite.setScale(PART_SCALE * pop);
    sprite.setTint(up || ctx.powered ? 0xffffff : 0xc4c9cf);
  },
});
