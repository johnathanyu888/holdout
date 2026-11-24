// Turns sim events into effects: hit flashes, damage numbers, squash-and-fade
// deaths, part pops, the breach alarm.

import Phaser from 'phaser';
import type { SimEvent } from '@shared/sim';
import { PART_SCALE, ZOMBIE_SCALE } from '../core/assets';
import type { EntityLayer } from './entities';
import { DEPTH, tileUnitToWorld } from './layers';
import { type ZombieLayer, destroyView, flashView } from './zombies';

/** Damage is summed per zombie and shown at most this often (saws hit every step). */
const NUMBER_INTERVAL_MS = 300;

export class FxLayer {
  private readonly pending = new Map<number, { amount: number; x: number; y: number; since: number }>();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly zombies: ZombieLayer,
    private readonly entities: EntityLayer,
  ) {}

  consume(events: readonly SimEvent[], now: number): void {
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          const v = this.zombies.get(e.id);
          if (v) flashView(this.scene, v);
          const p = this.pending.get(e.id);
          if (p) {
            p.amount += e.amount;
            p.x = e.x;
            p.y = e.y;
          } else this.pending.set(e.id, { amount: e.amount, x: e.x, y: e.y, since: now });
          break;
        }
        case 'death': {
          this.flushOne(e.id);
          const v = this.zombies.release(e.id);
          if (v) {
            for (const p of [v.body, v.armL, v.armR]) p.clearTint();
            v.root.setData('flash', false);
            this.scene.tweens.add({
              targets: v.root,
              scaleX: ZOMBIE_SCALE * 1.35,
              scaleY: ZOMBIE_SCALE * 0.15,
              alpha: 0,
              duration: 380,
              ease: 'Quad.easeIn',
              onComplete: () => destroyView(v),
            });
            this.scene.tweens.add({ targets: v.shadow, alpha: 0, duration: 380 });
          }
          break;
        }
        case 'partFired': {
          const s = this.entities.partSprite(e.partId);
          if (s) {
            this.scene.tweens.add({
              targets: s,
              scale: { from: PART_SCALE * 1.18, to: PART_SCALE },
              duration: 180,
              ease: 'Back.easeOut',
            });
          }
          break;
        }
        case 'breach': {
          const h = this.entities.houseSprite();
          if (h) {
            h.setTint(0xff6b6b);
            this.scene.tweens.add({ targets: h, scale: PART_SCALE * 1.15, yoyo: true, repeat: 3, duration: 120 });
          }
          this.scene.cameras.main.shake(350, 0.006);
          break;
        }
        default:
          break;
      }
    }
  }

  /** Call every frame: shows damage numbers that have collected long enough. */
  update(now: number): void {
    for (const [id, p] of this.pending) if (now - p.since >= NUMBER_INTERVAL_MS) this.flushOne(id);
  }

  private flushOne(id: number): void {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    const amount = Math.round(p.amount);
    if (amount <= 0) return;
    const x = tileUnitToWorld(p.x);
    const y = tileUnitToWorld(p.y) - 18;
    const t = this.scene.add
      .text(x, y, `${amount}`, {
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        fontStyle: '900',
        fontSize: '22px',
        color: '#ffffff',
        stroke: '#25282C',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setResolution(3)
      .setDepth(DEPTH.fx + y);
    this.scene.tweens.add({
      targets: t,
      y: y - 30,
      alpha: { from: 1, to: 0 },
      scale: { from: 1.15, to: 0.9 },
      duration: 750,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  clear(): void {
    this.pending.clear();
  }
}
