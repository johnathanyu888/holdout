// Draws the build: inlet, house, parts, wires, walls. Diffs the contraption on
// every change (create / update / destroy sprites by key) and refreshes the
// powered look every frame from either the build-mode power preview or the
// running sim.

import type Phaser from 'phaser';
import { GRID, key, tileToWorld } from '@shared/grid';
import { hasPartDef, partDef, powerPreview, type SimState } from '@shared/sim';
import type { Contraption } from '@shared/types/build';
import type { DayConfig } from '@shared/types/day';
import { SPRITE_SCALE, TEX } from '../core/assets';
import { partView } from '../views/registry';
import { maskOf, wallSprite, wireSprite } from './autotile';
import { DEPTH } from './layers';

const WIRE_DIM = 0x8c7a6c;

export class EntityLayer {
  private readonly parts = new Map<number, Phaser.GameObjects.Image>();
  private readonly wires = new Map<number, Phaser.GameObjects.Image>();
  private readonly walls = new Map<number, Phaser.GameObjects.Image>();
  private house: Phaser.GameObjects.Image | null = null;
  readonly inlet: Phaser.GameObjects.Image;
  private c: Contraption | null = null;
  private preview: ReturnType<typeof powerPreview> | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly day: DayConfig,
  ) {
    const p = tileToWorld(day.inlet.x, day.inlet.y);
    this.inlet = scene.add
      .image(p.x, p.y, TEX.structures, 'power_inlet')
      .setScale(SPRITE_SCALE)
      .setDepth(DEPTH.parts + p.y);
  }

  /** Sprite of a placed part (for effects). */
  partSprite(id: number): Phaser.GameObjects.Image | undefined {
    return this.parts.get(id);
  }

  houseSprite(): Phaser.GameObjects.Image | null {
    return this.house;
  }

  /** Rebuilds sprites to match the contraption. */
  sync(c: Contraption): void {
    this.c = c;
    this.preview = powerPreview(this.day, c);

    // House
    if (c.house) {
      const p = tileToWorld(c.house.x, c.house.y);
      this.house ??= this.scene.add.image(0, 0, TEX.structures, 'home').setScale(SPRITE_SCALE);
      this.house.setPosition(p.x, p.y).setDepth(DEPTH.parts + p.y);
    } else if (this.house) {
      this.house.destroy();
      this.house = null;
    }

    // Parts (keyed by id)
    const seen = new Set<number>();
    for (const part of c.parts) {
      seen.add(part.id);
      const p = tileToWorld(part.x, part.y);
      const frame = partView(part.type).frame ?? part.type;
      let s = this.parts.get(part.id);
      if (!s) {
        s = this.scene.add.image(p.x, p.y, TEX.parts, frame).setScale(SPRITE_SCALE);
        this.parts.set(part.id, s);
      }
      const rotatable = hasPartDef(part.type) && partDef(part.type).rotatable;
      s.setPosition(p.x, p.y)
        .setFrame(frame)
        .setAngle(rotatable ? part.rot * 90 : 0)
        .setDepth(DEPTH.parts + p.y);
    }
    for (const [id, s] of this.parts)
      if (!seen.has(id)) {
        s.destroy();
        this.parts.delete(id);
      }

    // Wires: connect to wires, parts, the inlet and the house.
    const wireSet = new Set(c.wires.map((w) => key(w.x, w.y)));
    const linkSet = new Set<number>([key(this.day.inlet.x, this.day.inlet.y), ...c.parts.map((p) => key(p.x, p.y))]);
    const linked = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < GRID && y < GRID && (wireSet.has(key(x, y)) || linkSet.has(key(x, y)));
    this.syncTiles(this.wires, c.wires, (w, s) => {
      const { frame, turns } = wireSprite(maskOf(w.x, w.y, linked));
      s.setFrame(frame).setAngle(turns * 90).setDepth(DEPTH.wires + w.y);
    });

    // Walls: connect to walls of either material.
    const wallSet = new Set(c.walls.map((w) => key(w.x, w.y)));
    const walled = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID && y < GRID && wallSet.has(key(x, y));
    this.syncTiles(this.walls, c.walls, (w, s) => {
      s.setFrame(wallSprite(w.material, maskOf(w.x, w.y, walled), w.x, w.y)).setDepth(
        DEPTH.walls + tileToWorld(w.x, w.y).y,
      );
    });
  }

  private syncTiles<T extends { x: number; y: number }>(
    map: Map<number, Phaser.GameObjects.Image>,
    items: readonly T[],
    style: (item: T, s: Phaser.GameObjects.Image) => void,
  ): void {
    const seen = new Set<number>();
    for (const it of items) {
      const k = key(it.x, it.y);
      seen.add(k);
      let s = map.get(k);
      if (!s) {
        const p = tileToWorld(it.x, it.y);
        s = this.scene.add.image(p.x, p.y, TEX.parts, '__DEFAULT').setScale(SPRITE_SCALE);
        map.set(k, s);
      }
      style(it, s);
    }
    for (const [k, s] of map)
      if (!seen.has(k)) {
        s.destroy();
        map.delete(k);
      }
  }

  /** Per-frame powered look. Pass the sim during a raid, null in build mode. */
  update(time: number, sim: SimState | null): void {
    if (!this.c) return;
    const powerC = sim ? sim.powerC : this.preview?.powerC;
    const powerT = sim ? sim.powerT : this.preview?.powerT;
    for (const [k, s] of this.wires) {
      const strength = Math.max(powerC?.[k] ?? 0, powerT?.[k] ?? 0);
      if (strength > 0) {
        // Brighter with strength; a gentle shimmer so live wires read as live.
        const pulse = 0.9 + 0.1 * Math.sin(time * 6 - k * 0.7);
        s.setTint(0xffffff).setAlpha(Math.min(1, (0.75 + strength / 60) * pulse + 0.1));
      } else {
        s.setTint(WIRE_DIM).setAlpha(1);
      }
    }
    const simParts = sim ? new Map(sim.parts.map((p) => [p.id, p])) : null;
    for (const part of this.c.parts) {
      const s = this.parts.get(part.id);
      if (!s) continue;
      const sp = simParts?.get(part.id) ?? null;
      const input = sp ? sp.input : (this.preview?.inputs.get(part.id) ?? { c: 0, t: 0 });
      const def = hasPartDef(part.type) ? partDef(part.type) : null;
      const powered = !def || def.kind !== 'action' || Math.max(input.c, input.t) >= def.needs;
      const view = partView(part.type);
      if (view.update) view.update(s, { time, powered, sim: sp });
      else s.setTint(powered || sp?.active ? 0xffffff : 0xb8b8b8);
    }
  }

  destroy(): void {
    for (const m of [this.parts, this.wires, this.walls]) for (const s of m.values()) s.destroy();
    this.house?.destroy();
    this.inlet.destroy();
  }
}
