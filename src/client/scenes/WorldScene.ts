// The world view: base map, camera, input router, tile hover/selection.
// Later phases add the entity layers and tools on top of this scene.

import Phaser from 'phaser';
import { TILE, type Tile, tileOrigin, tileToWorld } from '@shared/grid';
import { MAP_SCALE, SPRITE_SCALE, TEX, mapChunks } from '../core/assets';
import { CameraController } from '../core/camera';
import { InputRouter, type PointerInfo, type ToolHandler } from '../core/input';
import { session } from '../core/session';
import { DebugOverlay } from '../render/debugOverlay';
import { VIEWPORT_EVENT, type ViewportSize } from '../core/viewport';

/** Depth bands, bottom to top. Entities add y-based offsets inside their band. */
export const DEPTH = {
  ground: 0,
  entryEdge: 100,
  grid: 200,
  wires: 1_000,
  parts: 10_000,
  walls: 20_000,
  zombies: 30_000,
  fx: 40_000,
  ghost: 50_000,
} as const;

export class WorldScene extends Phaser.Scene {
  camera!: CameraController;
  input2!: InputRouter;
  private debug!: DebugOverlay;
  private hoverG!: Phaser.GameObjects.Graphics;
  private selectG!: Phaser.GameObjects.Graphics;
  private hover: PointerInfo | null = null;
  private selected: Tile | null = null;

  constructor() {
    super('World');
  }

  create(): void {
    const vp = this.registry.get('viewport') as ViewportSize;

    for (const c of mapChunks())
      this.add.image(c.x, c.y, c.key).setOrigin(0, 0).setScale(1 / MAP_SCALE).setDepth(DEPTH.ground);
    this.hoverG = this.add.graphics().setDepth(DEPTH.ghost);
    this.selectG = this.add.graphics().setDepth(DEPTH.ghost + 1);

    this.camera = new CameraController(this.cameras.main, { w: vp.w, h: vp.h }, vp.dpr);
    this.input2 = new InputRouter(this.game.canvas, this.camera, {
      hover: (p) => {
        this.hover = p;
      },
    });
    this.input2.setTool(this.selectTool());

    this.debug = new DebugOverlay(document.getElementById('app') ?? document.body);

    if (new URLSearchParams(location.search).has('gallery')) this.showGallery();

    const onViewport = (s: ViewportSize) => {
      this.cameras.main.setSize(s.w * s.dpr, s.h * s.dpr);
      this.camera.resize({ w: s.w, h: s.h }, s.dpr);
    };
    this.game.events.on(VIEWPORT_EVENT, onViewport);

    const onKey = (e: KeyboardEvent) => this.onKey(e);
    window.addEventListener('keydown', onKey);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.events.off(VIEWPORT_EVENT, onViewport);
      window.removeEventListener('keydown', onKey);
      this.input2.destroy();
      this.debug.destroy();
    });
  }

  override update(): void {
    // Keep outlines a constant screen thickness at every zoom.
    const px = 1 / this.cameras.main.zoom; // one device pixel in world units
    const dpr = (this.registry.get('viewport') as ViewportSize).dpr;

    this.hoverG.clear();
    const ht = this.hover?.tile;
    if (ht) {
      const o = tileOrigin(ht.x, ht.y);
      this.hoverG.fillStyle(0xffffff, 0.14).fillRect(o.x, o.y, TILE, TILE);
      this.hoverG.lineStyle(2 * dpr * px, 0xffffff, 0.6).strokeRect(o.x, o.y, TILE, TILE);
    }

    this.selectG.clear();
    if (this.selected) {
      const o = tileOrigin(this.selected.x, this.selected.y);
      this.selectG.fillStyle(0xf2b544, 0.18).fillRect(o.x, o.y, TILE, TILE);
      this.selectG.lineStyle(3 * dpr * px, 0xf2b544, 1).strokeRect(o.x, o.y, TILE, TILE);
    }

    const v = this.camera.current;
    this.debug.update({
      fps: this.game.loop.actualFps,
      zoom: v.zoom,
      dpr,
      view: v,
      screen: this.camera.size,
      tile: this.hover?.tile ?? null,
      world: this.hover?.world ?? null,
      entities: this.children.length,
      gesture: `${this.input2.gesture}${this.input2.handMode ? ' (hand)' : ''}`,
      api: `${session.api.mode}${session.init?.userName ? ` as ${session.init.userName}` : ''}`,
    });
  }

  /** Phase 1 default tool: tap selects a tile; drags pan. */
  private selectTool(): ToolHandler {
    return {
      capturesDrag: false,
      onTap: (p) => {
        this.selected = p.tile && this.selected && p.tile.x === this.selected.x && p.tile.y === this.selected.y
          ? null
          : p.tile;
      },
    };
  }

  private onKey(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    switch (e.key) {
      case '`':
        this.debug.toggle();
        break;
      case 'f':
      case 'F':
      case '0':
        this.camera.fit();
        break;
      case '+':
      case '=':
        this.camera.zoomBy(1.25);
        break;
      case '-':
      case '_':
        this.camera.zoomBy(0.8);
        break;
      case 'h':
      case 'H':
        this.input2.handMode = !this.input2.handMode;
        break;
      case 'Escape':
        this.selected = null;
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  /** ?gallery: every baked frame laid out on the lawn, to check the asset pipeline. */
  private showGallery(): void {
    const frames = [
      ...this.textures.get(TEX.structures).getFrameNames().map((f) => [TEX.structures, f] as const),
      ...this.textures.get(TEX.parts).getFrameNames().map((f) => [TEX.parts, f] as const),
    ].sort((a, b) => a[1].localeCompare(b[1]));
    let i = 0;
    for (const [tex, frame] of frames) {
      const x = 1 + (i % 11) * 2;
      const y = 1 + Math.floor(i / 11) * 2;
      if (y > 22) break;
      const c = tileToWorld(x, y);
      this.add.image(c.x, c.y, tex, frame).setScale(SPRITE_SCALE).setDepth(DEPTH.parts + c.y);
      i++;
    }
    console.info(`gallery: ${i} of ${frames.length} frames shown`);
  }
}
