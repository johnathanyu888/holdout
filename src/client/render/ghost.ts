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
}

const OK = 0x9dffa0;
const BAD = 0xff7a7a;

export class GhostLayer {
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH.ghost);
  }

  /** px = one screen pixel in world units (keeps outlines a constant width). */
  draw(ghost: Ghost | null, px: number): void {
    this.g.clear();
    const tiles = ghost?.tiles ?? [];
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
