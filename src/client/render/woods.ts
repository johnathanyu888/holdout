// "Dark woods": a shade over the map's outer forest and the generated forest
// ring, clear near the lawn and fading into near-black night woods further out.
// Drawn above the ground but below everything placed on it. The empty
// bands around the lawn on tall or wide screens then read as deep woods where the
// zombies come from, not as a repeated wall of trees.
//
// One small canvas texture (16 world px per texel) stretched over the ring with
// linear filtering gives a smooth gradient for almost no memory.

import type Phaser from 'phaser';
import { FOREST_MAX, FOREST_MIN, MAP_PX } from '@shared/grid';

const TEXEL = 16; // world px per texel
/**
 * Signed distance from the map edge (world px; negative = inside the map) where
 * the shade starts, and where it's darkest. It starts inside the map's own outer
 * forest (the lawn begins 256 px in, so the lawn and its margin stay bright).
 */
const FADE_START = -190;
const FADE_END = 740; // almost the whole ring (768): a long, gradual fade
const MAX_ALPHA = 0.97;
/** Night-forest colour: very dark green with a hint of blue. */
const SHADE = [8, 19, 15] as const;

const KEY = 'woods-shade';

/** Ease-in-out over [a, b], softened toward linear so the middle doesn't drop off steeply. */
function fade(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  const smooth = t * t * (3 - 2 * t);
  return 0.5 * smooth + 0.5 * t;
}

export function addWoodsShade(scene: Phaser.Scene, depth: number): Phaser.GameObjects.Image {
  if (!scene.textures.exists(KEY)) {
    const n = Math.ceil((FOREST_MAX - FOREST_MIN) / TEXEL);
    const canvas = document.createElement('canvas');
    canvas.width = n;
    canvas.height = n;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d canvas unavailable');
    const img = ctx.createImageData(n, n);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = FOREST_MIN + (i + 0.5) * TEXEL;
        const y = FOREST_MIN + (j + 0.5) * TEXEL;
        // Signed distance from the map square: negative inside, rounded outside the corners.
        const dx = Math.max(0 - x, 0, x - MAP_PX);
        const dy = Math.max(0 - y, 0, y - MAP_PX);
        const inside = Math.min(x, y, MAP_PX - x, MAP_PX - y);
        const d = inside > 0 ? -inside : Math.sqrt(dx * dx + dy * dy);
        const o = (j * n + i) * 4;
        img.data[o] = SHADE[0];
        img.data[o + 1] = SHADE[1];
        img.data[o + 2] = SHADE[2];
        img.data[o + 3] = Math.round(255 * MAX_ALPHA * fade(FADE_START, FADE_END, d));
      }
    ctx.putImageData(img, 0, 0);
    scene.textures.addCanvas(KEY, canvas);
  }
  return scene.add.image(FOREST_MIN, FOREST_MIN, KEY).setOrigin(0, 0).setScale(TEXEL).setDepth(depth);
}
