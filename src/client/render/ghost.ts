// Ghost previews: translucent sprites where the active tool would place things,
// tinted green when it can and red when it can't, plus a tile outline.

import type Phaser from 'phaser';
import { TILE, tileOrigin, tileToWorld } from '@shared/grid';
import { scaleFor } from '../core/assets';
import { DEPTH } from './layers';

export interface GhostTile {
  x: number;
  y: number;
  tex: string;
  /** null = outline only (e.g. erase). */
  frame: string | null;
  angle: number;
  valid: boolean;
}

export interface Ghost {
  tiles: GhostTile[];
  /** Moving something: a dashed path from where it was to where it's going. */
  line?: { from: { x: number; y: number }; to: { x: number; y: number } };
}

const OK = 0x9dffa0;
const BAD = 0xff7a7a;

export class GhostLayer {
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH.ghost);
  }

  /**
   * The way a picked-up part is going: its old tile outlined in dashes, and a
   * dashed line with an arrowhead from there to the drop tile.
   */
  private drawMovePath(from: { x: number; y: number }, to: { x: number; y: number }, px: number): void {
    if (from.x === to.x && from.y === to.y) return;
    const g = this.g;
    const o = tileOrigin(from.x, from.y);
    const dash = (x1: number, y1: number, x2: number, y2: number, w: number, col: number, a: number) => {
      const len = Math.hypot(x2 - x1, y2 - y1);
      for (let d = 0; d < len; d += 16) {
        const t0 = d / len;
        const t1 = Math.min(len, d + 9) / len;
        g.lineStyle(w, col, a).lineBetween(x1 + (x2 - x1) * t0, y1 + (y2 - y1) * t0, x1 + (x2 - x1) * t1, y1 + (y2 - y1) * t1);
      }
    };
    // the empty spot it came from
    g.fillStyle(0xffffff, 0.08).fillRect(o.x, o.y, TILE, TILE);
    dash(o.x, o.y, o.x + TILE, o.y, 2 * px, 0xffffff, 0.8);
    dash(o.x + TILE, o.y, o.x + TILE, o.y + TILE, 2 * px, 0xffffff, 0.8);
    dash(o.x + TILE, o.y + TILE, o.x, o.y + TILE, 2 * px, 0xffffff, 0.8);
    dash(o.x, o.y + TILE, o.x, o.y, 2 * px, 0xffffff, 0.8);
    // the path, stopping short of the drop tile, with an arrowhead
    const a = tileToWorld(from.x, from.y);
    const b = tileToWorld(to.x, to.y);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const end = { x: b.x - ux * TILE * 0.45, y: b.y - uy * TILE * 0.45 };
    dash(a.x, a.y, end.x, end.y, 6 * px, 0x000000, 0.3);
    dash(a.x, a.y, end.x, end.y, 3.5 * px, 0xffffff, 0.95);
    const h = 12 * px;
    g.fillStyle(0xffffff, 0.95).fillTriangle(end.x + ux * h, end.y + uy * h, end.x - uy * h * 0.7, end.y + ux * h * 0.7, end.x + uy * h * 0.7, end.y - ux * h * 0.7);
  }

  /** px = one screen pixel in world units (keeps outlines a constant width). */
  draw(ghost: Ghost | null, px: number): void {
    this.g.clear();
    const tiles = ghost?.tiles ?? [];
    if (ghost?.line) this.drawMovePath(ghost.line.from, ghost.line.to, px);
    let used = 0;
    for (const t of tiles) {
      const o = tileOrigin(t.x, t.y);
      const col = t.valid ? OK : BAD;
      this.g.fillStyle(col, 0.16).fillRect(o.x, o.y, TILE, TILE);
      this.g.lineStyle(2 * px, col, 0.9).strokeRect(o.x, o.y, TILE, TILE);
      if (!t.frame) continue;
      let s = this.pool[used];
      if (!s) {
        s = this.scene.add.image(0, 0, t.tex, t.frame);
        this.pool.push(s);
      }
      used++;
      const c = tileToWorld(t.x, t.y);
      s.setTexture(t.tex, t.frame)
        .setScale(scaleFor(t.frame))
        .setPosition(c.x, c.y)
        .setAngle(t.angle)
        .setAlpha(0.72)
        .setTint(t.valid ? 0xffffff : BAD)
        .setDepth(DEPTH.ghost + 1)
        .setVisible(true);
    }
    for (let i = used; i < this.pool.length; i++) this.pool[i]?.setVisible(false);
  }
}
