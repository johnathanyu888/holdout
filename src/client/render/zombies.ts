// Draws the sim's zombies, interpolating between sim steps for smooth motion.
//
// Each zombie is a container (body + two arms) over a flat ground shadow. The
// walk cycle is driven by distance walked, not time, so feet-speed matches
// ground-speed at any playback rate: the arms reach out in turn, the shoulders
// sway, and the head bobs. A zombie still in the forest (walking in from off the
// lawn) is dark, as if under the canopy, and lightens as it steps out.

import Phaser from 'phaser';
import { GRID } from '@shared/grid';
import type { SimState, Zombie } from '@shared/sim';
import { TEX, ZOMBIE_SCALE } from '../core/assets';
import { DEPTH, tileUnitToWorld } from './layers';

/** Shoulder pins in body-texture px (the atlas is baked at 2x: body is 192x192, arm 96x48). */
const SHOULDER_X = -18;
const SHOULDER_Y = 38;
/** Radians of walk cycle per world px walked. */
const STRIDE = 0.11;
const SHADOW_KEY = 'zombie-shadow';

export interface ZombieView {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  armL: Phaser.GameObjects.Image;
  armR: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  phase: number;
  lastX: number;
  lastY: number;
  facing: number;
}

export class ZombieLayer {
  private readonly views = new Map<number, ZombieView>();

  constructor(private readonly scene: Phaser.Scene) {
    if (!scene.textures.exists(SHADOW_KEY)) {
      const g = scene.add.graphics();
      g.fillStyle(0x000000, 1).fillEllipse(32, 24, 60, 44);
      g.generateTexture(SHADOW_KEY, 64, 48);
      g.destroy();
    }
  }

  get(id: number): ZombieView | undefined {
    return this.views.get(id);
  }

  /** Hands a view over (e.g. to the death effect); the layer forgets it. */
  release(id: number): ZombieView | undefined {
    const v = this.views.get(id);
    this.views.delete(id);
    return v;
  }

  private create(z: Zombie): ZombieView {
    const s = this.scene;
    const armL = s.add.image(SHOULDER_X, -SHOULDER_Y, TEX.parts, `${z.type}_arm`).setOrigin(0.04, 0.5);
    const armR = s.add.image(SHOULDER_X, SHOULDER_Y, TEX.parts, `${z.type}_arm`).setOrigin(0.04, 0.5);
    const body = s.add.image(0, 0, TEX.parts, `${z.type}_body`);
    const root = s.add.container(0, 0, [armL, armR, body]).setScale(ZOMBIE_SCALE);
    const shadow = s.add.image(0, 0, SHADOW_KEY).setAlpha(0.22).setScale(0.62);
    const facing = Math.atan2(GRID / 2 - z.y, GRID / 2 - z.x); // start facing the lawn's centre
    return { root, body, armL, armR, shadow, phase: z.id * 1.7, lastX: Number.NaN, lastY: Number.NaN, facing };
  }

  /** alpha = fraction of the way from the previous sim step to the current one. */
  update(st: SimState, alpha: number, time: number): void {
    const live = new Set<number>();
    for (const z of st.zombies) {
      if (z.dead) continue;
      live.add(z.id);
      let v = this.views.get(z.id);
      if (!v) {
        v = this.create(z);
        this.views.set(z.id, v);
      }
      const tx = z.px + (z.x - z.px) * alpha;
      const ty = z.py + (z.y - z.py) * alpha;
      const x = tileUnitToWorld(tx);
      const y = tileUnitToWorld(ty);

      // Walk cycle from distance travelled; idle zombies (bashing, waiting) sway slowly.
      const moved = Number.isNaN(v.lastX) ? 0 : Math.hypot(x - v.lastX, y - v.lastY);
      v.phase += moved > 0.01 ? moved * STRIDE : 0.02;
      v.lastX = x;
      v.lastY = y;
      if (z.vx !== 0 || z.vy !== 0) {
        const target = Math.atan2(z.vy, z.vx);
        v.facing += Phaser.Math.Angle.Wrap(target - v.facing) * 0.2;
      }
      const sw = Math.sin(v.phase);
      v.root.setPosition(x, y).setRotation(v.facing + 0.1 * sw).setDepth(DEPTH.zombies + y);
      // Arms reach out in turn (one forward while the other drops back) and swing a little.
      v.armL.setScale(0.86 * (1 + 0.16 * sw), 1).setRotation(-0.08 + 0.1 * sw);
      v.armR.setScale(0.86 * (1 - 0.16 * sw), 1).setRotation(0.08 + 0.1 * sw);
      // Head bob: twice per stride.
      v.body.setScale(1 + 0.035 * Math.abs(Math.cos(v.phase)));
      v.shadow.setPosition(x + 4, y + 7).setDepth(DEPTH.zombies + y - 1);

      // Still in the woods (the canopy layer draws over them): in shade, so a little
      // darker, brightening as they step out onto the lawn.
      const out = Math.max(-tx, tx - GRID, -ty, ty - GRID, 0);
      const shade = Math.min(1, out / 1.6);
      const c = Math.round(255 - 110 * shade);
      const tint = Phaser.Display.Color.GetColor(c, c, c);
      if (!v.root.getData('flash')) for (const p of [v.body, v.armL, v.armR]) p.setTint(tint);
      v.shadow.setAlpha(0.22 * (1 - shade));
    }
    for (const [id, v] of this.views)
      if (!live.has(id)) {
        destroyView(v);
        this.views.delete(id);
      }
  }

  clear(): void {
    for (const v of this.views.values()) destroyView(v);
    this.views.clear();
  }
}

export function destroyView(v: ZombieView): void {
  v.root.destroy();
  v.shadow.destroy();
}

/** Brief white flash on a hit. */
export function flashView(scene: Phaser.Scene, v: ZombieView): void {
  v.root.setData('flash', true);
  for (const p of [v.body, v.armL, v.armR]) p.setTintFill(0xffffff);
  scene.time.delayedCall(60, () => {
    if (!v.root.active) return;
    v.root.setData('flash', false);
    for (const p of [v.body, v.armL, v.armR]) p.clearTint();
  });
}
