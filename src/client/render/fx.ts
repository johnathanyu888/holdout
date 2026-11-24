// Turns sim events into effects: red hit flashes, blood (spray on hits, stains
// and a splat on death that soak into the ground and fade), damage numbers,
// squash-and-fade deaths, part pops, the breach alarm.

import Phaser from 'phaser';
import type { SimEvent } from '@shared/sim';
import { PART_SCALE, ZOMBIE_SCALE } from '../core/assets';
import type { EntityLayer } from './entities';
import { DEPTH, tileUnitToWorld } from './layers';
import { type ZombieLayer, destroyView, flashView } from './zombies';

/** Damage is summed per zombie and shown at most this often (saws hit every step). */
const NUMBER_INTERVAL_MS = 300;
/** Blood spray at most this often per zombie (saws hit every step). */
const SPRAY_INTERVAL_MS = 140;
/** Ground stains kept at once (oldest go first). */
const MAX_STAINS = 70;
const DROP_KEY = 'blood-drop';
const SPLAT_KEYS = ['blood-splat-a', 'blood-splat-b', 'blood-splat-c'];

export class FxLayer {
  private readonly pending = new Map<number, { amount: number; x: number; y: number; since: number }>();
  private readonly lastSpray = new Map<number, number>();
  private stains: Phaser.GameObjects.Image[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly zombies: ZombieLayer,
    private readonly entities: EntityLayer,
  ) {
    this.makeBloodTextures();
  }

  /** A round drop, and three irregular splats (a blob ringed with droplets). */
  private makeBloodTextures(): void {
    const t = this.scene.textures;
    if (!t.exists(DROP_KEY)) {
      const g = this.scene.add.graphics();
      g.fillStyle(0x7a0a0a, 1).fillCircle(8, 8, 7);
      g.fillStyle(0xc4161a, 1).fillCircle(7, 7, 5.5);
      g.generateTexture(DROP_KEY, 16, 16);
      g.destroy();
    }
    SPLAT_KEYS.forEach((key, n) => {
      if (t.exists(key)) return;
      const g = this.scene.add.graphics();
      const c = 40;
      let seed = 17 + n * 31;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const blobs: [number, number, number][] = [[c, c, 15 + rnd() * 3]];
      for (let i = 0; i < 6; i++) {
        const a = rnd() * Math.PI * 2;
        const d = 7 + rnd() * 9;
        blobs.push([c + Math.cos(a) * d, c + Math.sin(a) * d, 6 + rnd() * 6]);
      }
      for (let i = 0; i < 9; i++) {
        const a = rnd() * Math.PI * 2;
        const d = 22 + rnd() * 14;
        blobs.push([c + Math.cos(a) * d, c + Math.sin(a) * d, 1.5 + rnd() * 3]);
      }
      g.fillStyle(0x5c0708, 1);
      for (const [x, y, r] of blobs) g.fillCircle(x, y, r + 1.5);
      g.fillStyle(0x9e1015, 1);
      for (const [x, y, r] of blobs) g.fillCircle(x, y, r);
      g.fillStyle(0xc81b20, 1).fillCircle(c - 4, c - 4, 7);
      g.generateTexture(key, c * 2, c * 2);
      g.destroy();
    });
  }

  /**
   * Tesla arc: a jagged bolt from the coil to its target, then on to the next,
   * drawn twice (wide cyan glow, thin white core) and re-jagged while it fades.
   */
  private lightning(x: number, y: number, to: { x: number; y: number }[]): void {
    const pts = [{ x: tileUnitToWorld(x), y: tileUnitToWorld(y) - 10 }, ...to.map((p) => ({ x: tileUnitToWorld(p.x), y: tileUnitToWorld(p.y) }))];
    const g = this.scene.add.graphics().setDepth(DEPTH.fx + 5).setBlendMode(Phaser.BlendModes.ADD);
    const draw = (alpha: number) => {
      g.clear();
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i] as { x: number; y: number };
        const b = pts[i + 1] as { x: number; y: number };
        const n = 7;
        const path: { x: number; y: number }[] = [a];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        for (let k = 1; k < n; k++) {
          const off = (Math.random() - 0.5) * Math.min(26, len * 0.35);
          path.push({ x: a.x + (dx * k) / n - (dy / len) * off, y: a.y + (dy * k) / n + (dx / len) * off });
        }
        path.push(b);
        for (const [w, col, al] of [
          [10, 0x3fd8ff, 0.35],
          [3, 0xffffff, 0.95],
        ] as const) {
          g.lineStyle(w, col, al * alpha).beginPath();
          g.moveTo(path[0]!.x, path[0]!.y);
          for (const p of path) g.lineTo(p.x, p.y);
          g.strokePath();
        }
        g.fillStyle(0xd8fbff, 0.8 * alpha).fillCircle(b.x, b.y, 9);
      }
    };
    draw(1);
    const state = { t: 1 };
    this.scene.tweens.add({
      targets: state,
      t: 0,
      duration: 260,
      onUpdate: () => draw(state.t),
      onComplete: () => g.destroy(),
    });
  }

  /** A few drops flying off the wound. */
  private spray(wx: number, wy: number, now: number, id: number, n: number): void {
    const last = this.lastSpray.get(id) ?? -1e9;
    if (now - last < SPRAY_INTERVAL_MS) return;
    this.lastSpray.set(id, now);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 14 + Math.random() * 22;
      const s = this.scene.add
        .image(wx, wy, DROP_KEY)
        .setScale(0.5 + Math.random() * 0.4)
        .setDepth(DEPTH.zombies + wy + 2);
      this.scene.tweens.add({
        targets: s,
        x: wx + Math.cos(a) * d,
        y: wy + Math.sin(a) * d + 6,
        scale: 0.18,
        alpha: 0,
        duration: 320 + Math.random() * 160,
        ease: 'Quad.easeOut',
        onComplete: () => s.destroy(),
      });
    }
    if (Math.random() < 0.35) this.stain(wx + (Math.random() - 0.5) * 16, wy + (Math.random() - 0.5) * 16, 0.22 + Math.random() * 0.15, 5000);
  }

  /** A stain on the ground (under parts and zombies) that fades away after a while. */
  private stain(wx: number, wy: number, scale: number, holdMs: number): void {
    const s = this.scene.add
      .image(wx, wy, SPLAT_KEYS[Math.floor(Math.random() * SPLAT_KEYS.length)] as string)
      .setScale(scale * 0.6)
      .setRotation(Math.random() * Math.PI * 2)
      .setAlpha(0.85)
      .setDepth(DEPTH.ground + 3);
    this.scene.tweens.add({ targets: s, scale, duration: 160, ease: 'Quad.easeOut' });
    this.scene.tweens.add({
      targets: s,
      alpha: 0,
      delay: holdMs,
      duration: 2500,
      onComplete: () => {
        s.destroy();
        this.stains = this.stains.filter((x) => x !== s);
      },
    });
    this.stains.push(s);
    while (this.stains.length > MAX_STAINS) this.stains.shift()?.destroy();
  }

  consume(events: readonly SimEvent[], now: number): void {
    for (const e of events) {
      switch (e.type) {
        case 'hit': {
          const v = this.zombies.get(e.id);
          if (v) flashView(this.scene, v);
          this.spray(tileUnitToWorld(e.x), tileUnitToWorld(e.y), now, e.id, e.amount >= 30 ? 7 : 3);
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
          this.lastSpray.delete(e.id);
          this.stain(tileUnitToWorld(e.x), tileUnitToWorld(e.y), 0.85 + Math.random() * 0.3, 8000);
          this.spray(tileUnitToWorld(e.x), tileUnitToWorld(e.y), now + SPRAY_INTERVAL_MS * 2, -e.id, 9);
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
        case 'zap':
          this.lightning(e.x, e.y, e.to);
          break;
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
    this.lastSpray.clear();
    for (const s of this.stains) s.destroy();
    this.stains = [];
  }
}
