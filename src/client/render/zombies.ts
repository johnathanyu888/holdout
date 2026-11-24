// Draws the sim's zombies, interpolating between sim steps for smooth motion.

import Phaser from 'phaser';
import type { SimState, Zombie } from '@shared/sim';
import { SPRITE_SCALE, TEX } from '../core/assets';
import { DEPTH, tileUnitToWorld } from './layers';

export class ZombieLayer {
  private readonly sprites = new Map<number, Phaser.GameObjects.Image>();

  constructor(private readonly scene: Phaser.Scene) {}

  get(id: number): Phaser.GameObjects.Image | undefined {
    return this.sprites.get(id);
  }

  /** Hands a sprite over (e.g. to the death effect); the layer forgets it. */
  release(id: number): Phaser.GameObjects.Image | undefined {
    const s = this.sprites.get(id);
    this.sprites.delete(id);
    return s;
  }

  /** alpha = fraction of the way from the previous sim step to the current one. */
  update(st: SimState, alpha: number, time: number): void {
    const live = new Set<number>();
    for (const z of st.zombies) {
      if (z.dead) continue;
      live.add(z.id);
      let s = this.sprites.get(z.id);
      if (!s) {
        s = this.scene.add.image(0, 0, TEX.parts, frameFor(z)).setScale(SPRITE_SCALE);
        s.rotation = facing(z, 0);
        this.sprites.set(z.id, s);
      }
      const x = tileUnitToWorld(z.px + (z.x - z.px) * alpha);
      const y = tileUnitToWorld(z.py + (z.y - z.py) * alpha);
      // A slight shamble: bob in scale as it walks.
      const bob = 1 + 0.04 * Math.sin(time * 9 + z.id * 1.7);
      s.setPosition(x, y).setDepth(DEPTH.zombies + y).setScale(SPRITE_SCALE * bob);
      s.rotation = facing(z, s.rotation);
    }
    for (const [id, s] of this.sprites)
      if (!live.has(id)) {
        s.destroy();
        this.sprites.delete(id);
      }
  }

  clear(): void {
    for (const s of this.sprites.values()) s.destroy();
    this.sprites.clear();
  }
}

function frameFor(z: Zombie): string {
  return z.type; // atlas frame per zombie type (art/zombies/<type>.svg)
}

/** Turns smoothly toward the walking direction (the client may use atan2; the sim may not). */
function facing(z: Zombie, current: number): number {
  if (z.vx === 0 && z.vy === 0) return current;
  const target = Math.atan2(z.vy, z.vx);
  const diff = Phaser.Math.Angle.Wrap(target - current);
  return current + diff * 0.25;
}
