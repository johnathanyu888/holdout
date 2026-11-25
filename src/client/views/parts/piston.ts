// Piston: the body stays put; its head (a steel rod and a wide pusher plate)
// slides out of the front face into the tile in front while it has power, and
// punches a little further on each shove. With no power it's pulled back in.
// The head is drawn by a Graphics that rides along with the sprite (same spot,
// same turn), under the body so the rod comes out of it.

import Phaser from 'phaser';
import { TILE } from '@shared/grid';
import { PART_SCALE } from '../../core/assets';
import { registerPartView } from '../registry';

/** How far the plate reaches past the body's front face when fully out (world px). */
const REACH = TILE * 0.55;

function head(sprite: Phaser.GameObjects.Image): Phaser.GameObjects.Graphics {
  let g = sprite.getData('head') as Phaser.GameObjects.Graphics | undefined;
  if (!g) {
    const made = sprite.scene.add.graphics();
    sprite.setData('head', made);
    sprite.once(Phaser.GameObjects.Events.DESTROY, () => made.destroy());
    g = made;
  }
  return g;
}

registerPartView({
  type: 'piston',
  update(sprite, ctx) {
    const out = ctx.sim ? ctx.sim.active : ctx.powered;
    const was = sprite.getData('out') === true;
    if (out && !was) sprite.setData('firedAt', ctx.time);
    sprite.setData('out', out);
    // Switching on (or a shove): a quick punch past full reach, then it settles.
    const since = ctx.time - ((sprite.getData('firedAt') as number | undefined) ?? -9);
    const kick = since < 0.25 ? Math.sin((since / 0.25) * Math.PI) : 0;
    const target = out ? 1 + 0.3 * kick : 0;
    const cur = (sprite.getData('ext') as number | undefined) ?? 0;
    const ext = cur + (target - cur) * (target > cur ? 0.45 : 0.2);
    sprite.setData('ext', ext);

    const g = head(sprite);
    g.clear().setPosition(sprite.x, sprite.y).setRotation(sprite.rotation).setDepth(sprite.depth - 0.5);
    const face = TILE * 0.36; // the body's front face, from its centre
    const len = ext * REACH;
    if (len > 1) {
      // rod
      g.fillStyle(0x2b3038, 1).fillRect(face - 4, -5, len + 4, 10);
      g.fillStyle(0x9aa3ad, 1).fillRect(face - 4, -3.5, len + 4, 7);
      g.fillStyle(0xd8dee5, 0.7).fillRect(face - 4, -3.5, len + 4, 2);
      // pusher plate
      const px = face + len;
      g.fillStyle(0x2b3038, 1).fillRoundedRect(px - 1, -TILE * 0.36, 11, TILE * 0.72, 3);
      g.fillStyle(0xc9a24a, 1).fillRoundedRect(px + 1, -TILE * 0.34, 7, TILE * 0.68, 2);
      g.fillStyle(0xffe6a0, 0.6).fillRect(px + 1, -TILE * 0.34, 2, TILE * 0.68);
    }
    sprite.setScale(PART_SCALE * (1 + 0.04 * kick));
    sprite.setTint(ctx.powered || out ? 0xffffff : 0xb8b8b8);
  },
});
