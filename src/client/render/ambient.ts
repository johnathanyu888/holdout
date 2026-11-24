// Ambient wind: leaves blowing across the map and faint gust streaks.
//
// One wind for the whole scene: a fixed direction (roughly west-north-west to
// east-south-east) with a strength that swells and eases in slow gusts. Leaves
// ride it: each drifts with the wind, flutters side to side, spins and tumbles
// (its width flipping as it turns over), fades in where it appears and out
// before it goes. Leaves fly under the tree canopy, so they slip beneath the
// trees and show over the lawn; the gust streaks are drawn over everything, very
// faint, and come out mostly when the wind picks up.
//
// Purely cosmetic: client-side randomness is fine here (none of it touches the sim).

import type Phaser from 'phaser';
import { LAWN_END, LAWN_ORIGIN } from '@shared/grid';
import { DEPTH } from './layers';

const LEAF_KEYS = ['leaf-a', 'leaf-b', 'leaf-c', 'leaf-d'];
const LEAF_COLOURS: [fill: number, rib: number][] = [
  [0x6fbf45, 0x3f7f2a],
  [0x9acd4a, 0x5a8a28],
  [0xe3b23c, 0x9a6a1c],
  [0xd9772e, 0x8a3f14],
];
const MAX_LEAVES = 14;
const MAX_STREAKS = 12;
/** Wind direction (unit vector) and base speed in world px per second. */
const WIND_DIR = { x: 0.94, y: 0.34 };
const WIND_SPEED = 70;

interface Leaf {
  s: Phaser.GameObjects.Image;
  x: number;
  y: number;
  age: number;
  life: number;
  spin: number;
  flutter: number;
  phase: number;
  size: number;
  /** Personal speed factor (light leaves race, heavy ones lag). */
  drag: number;
  /** Blew in from off-screen (no fade-in; it lives until it leaves the view). */
  edge: boolean;
}

interface Streak {
  x: number;
  y: number;
  age: number;
  life: number;
  len: number;
  wave: number;
  phase: number;
}

export class AmbientLayer {
  private readonly leaves: Leaf[] = [];
  private streaks: Streak[] = [];
  private readonly g: Phaser.GameObjects.Graphics;
  private last = 0;
  private readonly calm: boolean;

  constructor(private readonly scene: Phaser.Scene) {
    this.makeTextures();
    this.g = scene.add.graphics().setDepth(DEPTH.canopy + 3);
    this.calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const n = this.calm ? Math.round(MAX_LEAVES / 3) : MAX_LEAVES;
    for (let i = 0; i < n; i++) {
      const leaf = this.spawn(scene.add.image(0, 0, LEAF_KEYS[i % LEAF_KEYS.length] as string));
      leaf.age = -Math.random() * 8; // stagger the first arrivals
      leaf.s.setAlpha(0);
      this.leaves.push(leaf);
    }
  }

  /** Small leaf textures: a pointed oval with a midrib and a stub of stem. */
  private makeTextures(): void {
    const t = this.scene.textures;
    LEAF_COLOURS.forEach(([fill, rib], i) => {
      const key = LEAF_KEYS[i] as string;
      if (t.exists(key)) return;
      const g = this.scene.add.graphics();
      const w = 22;
      const h = 12;
      g.fillStyle(0x1e2a1e, 1).fillEllipse(w / 2 + 1, h / 2, w, h); // dark outline
      g.fillStyle(fill, 1).fillEllipse(w / 2 + 1, h / 2, w - 3, h - 3);
      g.fillStyle(0xffffff, 0.22).fillEllipse(w / 2 - 1, h / 2 - 1.5, w - 10, h - 8); // light side
      g.lineStyle(1.4, rib, 1).lineBetween(3, h / 2, w - 2, h / 2);
      g.lineStyle(1.6, rib, 1).lineBetween(0, h / 2, 3, h / 2);
      g.generateTexture(key, w + 2, h);
      g.destroy();
    });
  }

  /** What the camera sees, in world px. */
  private view(): { x: number; y: number; w: number; h: number } {
    const v = this.scene.cameras.main.worldView;
    return { x: v.x, y: v.y, w: Math.max(1, v.width), h: Math.max(1, v.height) };
  }

  /**
   * (Re)starts a leaf with fresh traits. Two kinds, mixed:
   *  - blown in from outside the window: just past the upwind (left or top) edge
   *    of the view, so it sails in across the screen;
   *  - shaken loose from a tree: somewhere in view off the lawn (the forest), fading in.
   */
  private spawn(s: Phaser.GameObjects.Image, leaf?: Leaf): Leaf {
    const v = this.view();
    const edge = Math.random() < 0.6;
    let x: number;
    let y: number;
    if (edge) {
      // Left edge or top edge, weighted by how much wind crosses each.
      if (Math.random() < WIND_DIR.x / (WIND_DIR.x + WIND_DIR.y)) {
        x = v.x - 40;
        y = v.y - v.h * 0.2 + Math.random() * v.h;
      } else {
        x = v.x - v.w * 0.2 + Math.random() * v.w;
        y = v.y - 40;
      }
    } else {
      // A spot in view that isn't lawn (try a few times; fall back to anywhere).
      x = v.x + Math.random() * v.w;
      y = v.y + Math.random() * v.h;
      for (let i = 0; i < 6 && x > LAWN_ORIGIN && x < LAWN_END && y > LAWN_ORIGIN && y < LAWN_END; i++) {
        x = v.x + Math.random() * v.w;
        y = v.y + Math.random() * v.h;
      }
    }
    const size = 0.95 + Math.random() * 0.7;
    const l: Leaf = leaf ?? ({ s } as Leaf);
    Object.assign(l, {
      s,
      x,
      y,
      age: 0,
      life: edge ? 40 : 6 + Math.random() * 6,
      spin: (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 2.2),
      flutter: 10 + Math.random() * 22,
      phase: Math.random() * Math.PI * 2,
      size,
      drag: 0.7 + Math.random() * 0.6,
      edge,
    });
    s.setTexture(LEAF_KEYS[Math.floor(Math.random() * LEAF_KEYS.length)] as string)
      .setDepth(DEPTH.zombies + 6_000 + Math.random() * 100)
      .setRotation(Math.random() * Math.PI * 2)
      .setAlpha(0);
    return l;
  }

  /** Gust strength right now: a slow swell made of two waves, 0.45..1.8. */
  private gust(t: number): number {
    return 1 + 0.5 * Math.sin(t * 0.37) + 0.3 * Math.sin(t * 0.91 + 1.3);
  }

  update(time: number): void {
    const dt = this.last ? Math.min(0.05, time - this.last) : 0;
    this.last = time;
    const gust = this.gust(time);
    const speed = WIND_SPEED * gust;

    for (const l of this.leaves) {
      l.age += dt;
      if (l.age < 0) continue; // waiting for its first turn
      const v = this.view();
      if (l.age >= l.life || l.x > v.x + v.w + 80 || l.y > v.y + v.h + 80) {
        this.spawn(l.s, l);
        continue;
      }
      // Ride the wind, plus a sideways flutter across it.
      const sway = Math.sin(time * 2.2 + l.phase) * l.flutter;
      l.x += WIND_DIR.x * speed * l.drag * dt;
      l.y += WIND_DIR.y * speed * l.drag * dt + 6 * dt; // a little fall
      const px = l.x - WIND_DIR.y * sway;
      const py = l.y + WIND_DIR.x * sway;
      // Fade in and out over the first and last second.
      const a = l.edge ? Math.min(1, (l.life - l.age) / 1.0) : Math.min(1, l.age / 0.8, (l.life - l.age) / 1.0);
      // Tumble: the leaf's width flips as it turns over.
      const tumble = Math.cos(time * (1.5 + Math.abs(l.spin)) + l.phase);
      l.s
        .setPosition(px, py)
        .setRotation(l.s.rotation + l.spin * dt * (0.6 + gust * 0.5))
        .setScale(l.size * (0.35 + 0.65 * Math.abs(tumble)), l.size)
        .setAlpha(0.95 * Math.max(0, a));
    }

    // Gust streaks: always a few in the air, more as the wind picks up.
    const sv = this.view();
    if (!this.calm && this.streaks.length < MAX_STREAKS && Math.random() < dt * (0.9 + gust * 1.6)) {
      this.streaks.push({
        x: sv.x - sv.w * 0.15 + Math.random() * sv.w * 1.1,
        y: sv.y - sv.h * 0.15 + Math.random() * sv.h * 1.1,
        age: 0,
        life: 1.4 + Math.random() * 1.2,
        len: 130 + Math.random() * 150,
        wave: 4 + Math.random() * 6,
        phase: Math.random() * Math.PI * 2,
      });
    }
    this.streaks = this.streaks.filter((s) => (s.age += dt) < s.life);
    const g = this.g;
    g.clear();
    for (const s of this.streaks) {
      const k = s.age / s.life;
      s.x += WIND_DIR.x * speed * 2.2 * dt;
      s.y += WIND_DIR.y * speed * 2.2 * dt;
      // grows in, then the tail catches up: a short wisp sliding along
      const head = Math.min(1, k * 2.2);
      const tail = Math.max(0, k * 2.2 - 1.2);
      const alpha = 0.42 * Math.sin(Math.PI * k);
      if (alpha <= 0.01 || head <= tail) continue;
      g.lineStyle(3.2, 0xffffff, alpha).beginPath();
      const steps = 10;
      for (let i = 0; i <= steps; i++) {
        const u = tail + ((head - tail) * i) / steps;
        const along = (u - 0.5) * s.len;
        const across = Math.sin(u * Math.PI * 2 + s.phase + time * 3) * s.wave;
        const x = s.x + WIND_DIR.x * along - WIND_DIR.y * across;
        const y = s.y + WIND_DIR.y * along + WIND_DIR.x * across;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokePath();
    }
  }

  destroy(): void {
    for (const l of this.leaves) l.s.destroy();
    this.g.destroy();
  }
}
