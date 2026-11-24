// Saw blade: spins while active (raid); still otherwise.

import { registerPartView } from '../registry';

registerPartView({
  type: 'saw_blade',
  update(sprite, ctx) {
    const active = ctx.sim?.active ?? false;
    if (active) sprite.rotation = ctx.time * 18; // ~3 turns a second
    sprite.setTint(ctx.powered || active ? 0xffffff : 0xb8b8b8);
  },
});
