// Loads the baked textures with a progress bar, calls /api/init, then starts the world.

import Phaser from 'phaser';
import { ASSET_FILES, TEX, mapChunks } from '../core/assets';
import { session } from '../core/session';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    const { width, height } = this.scale;
    const barW = Math.min(width * 0.6, 480);
    const barH = Math.max(6, Math.round(height * 0.012));
    const x = (width - barW) / 2;
    const y = height / 2;
    const track = this.add.graphics();
    track.fillStyle(0x25282c, 1).fillRoundedRect(x, y, barW, barH, barH / 2);
    const fill = this.add.graphics();
    this.load.on('progress', (v: number) => {
      fill.clear().fillStyle(0xf2b544, 1).fillRoundedRect(x, y, Math.max(barH, barW * v), barH, barH / 2);
    });

    for (const c of mapChunks()) this.load.image(c.key, c.file);
    this.load.atlas(TEX.parts, ASSET_FILES.parts.image, ASSET_FILES.parts.json);
    this.load.atlas(TEX.structures, ASSET_FILES.structures.image, ASSET_FILES.structures.json);
  }

  async create(): Promise<void> {
    try {
      session.init = await session.api.init();
    } catch (e) {
      console.warn('init failed; continuing offline', e);
    }
    this.scene.start('World');
  }
}
