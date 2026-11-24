// Draws the build: inlet, house, parts, wires, walls. Diffs the contraption on
// every change (create / update / destroy sprites by key) and refreshes the
// powered look every frame from either the build-mode power preview or the
// running sim.
//
// Joins: wires and walls draw at JOIN_SCALE so neighbouring tiles overlap by a
// texel (no hairline seams). Where a wire meets a part or the inlet, a short wire
// stub runs from the shared edge into the part's tile, under the part, so the
// wire visibly plugs into it instead of stopping at the tile edge.

import Phaser from 'phaser';
import { GRID, TILE, TILE_COUNT, key, tileToWorld } from '@shared/grid';
import { blinkerFloods, hasPartDef, partDef, partInput, powerPreview, type SimState } from '@shared/sim';
import type { Contraption } from '@shared/types/build';
import type { DayConfig } from '@shared/types/day';
import { JOIN_SCALE, PART_SCALE, TEX } from '../core/assets';
import { partView } from '../views/registry';
import { maskOf, wallSprite, wireSprite } from './autotile';
import { DEPTH } from './layers';

const WIRE_DIM = 0x8c7a6c;

/** Neighbour offsets with the quarter turns that point a west-facing wire_end at them. */
const SIDES: [dx: number, dy: number, turns: number][] = [
  [-1, 0, 0],
  [0, -1, 1],
  [1, 0, 2],
  [0, 1, 3],
];

/**
 * 0..1 brightness for a wire at this signal strength: 1 at 15 (next to the inlet),
 * falling evenly to 0.3 at strength 1 so even the weakest live wire still reads
 * as live; 0 when unpowered.
 */
function wireBrightness(strength: number): number {
  if (strength <= 0) return 0;
  return 0.06 + 0.94 * Math.min(1, (strength - 1) / 14) ** 1.3;
}

/** Linear blend between two 0xRRGGBB colours. */
function lerpColour(a: number, b: number, t: number): number {
  const k = Math.max(0, Math.min(1, t));
  const ch = (shift: number) => {
    const x = (a >> shift) & 0xff;
    const y = (b >> shift) & 0xff;
    return Math.round(x + (y - x) * k) << shift;
  };
  return ch(16) | ch(8) | ch(0);
}

interface Stub {
  sprite: Phaser.GameObjects.Image;
  /** Tile key of the wire it continues (its power is what it shows). */
  from: number;
}

export class EntityLayer {
  private readonly parts = new Map<number, Phaser.GameObjects.Image>();
  private readonly wires = new Map<number, Phaser.GameObjects.Image>();
  private readonly walls = new Map<number, Phaser.GameObjects.Image>();
  private readonly stubs = new Map<string, Stub>();
  private house: Phaser.GameObjects.Image | null = null;
  readonly inlet: Phaser.GameObjects.Image;
  private c: Contraption | null = null;
  private preview: ReturnType<typeof powerPreview> | null = null;
  /** Wire tile key -> neighbour mask (N1 E2 S4 W8), for the electricity overlay. */
  private readonly wireMask = new Map<number, number>();
  /** Additive overlay: current running along powered wires. */
  private readonly zap: Phaser.GameObjects.Graphics;
  private sparks: { x: number; y: number; until: number; seed: number }[] = [];
  /** Blinking delays in the build preview, and a scratch tick layer to combine them into. */
  private blinkers: ReturnType<typeof blinkerFloods> = [];
  private readonly livePowerT = new Uint8Array(TILE_COUNT);

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly day: DayConfig,
  ) {
    this.zap = scene.add.graphics().setDepth(DEPTH.wires + 5_000).setBlendMode(Phaser.BlendModes.ADD);
    const p = tileToWorld(day.inlet.x, day.inlet.y);
    this.inlet = scene.add
      .image(p.x, p.y, TEX.structures, 'power_inlet')
      .setScale(PART_SCALE)
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
    this.blinkers = blinkerFloods(c, this.preview);

    // House
    if (c.house) {
      const p = tileToWorld(c.house.x, c.house.y);
      this.house ??= this.scene.add.image(0, 0, TEX.structures, 'home').setScale(PART_SCALE);
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
        s = this.scene.add.image(p.x, p.y, TEX.parts, frame).setScale(PART_SCALE);
        this.parts.set(part.id, s);
      }
      const rotatable = hasPartDef(part.type) && partDef(part.type).rotatable;
      // The frame is set once at creation: views may swap it (e.g. spikes up/down).
      s.setPosition(p.x, p.y).setDepth(DEPTH.parts + p.y).setData('blink', part.config?.blink ?? 0);
      // Spinning parts manage their own rotation; only set it for rotatable ones.
      if (rotatable) s.setAngle(part.rot * 90);
    }
    for (const [id, s] of this.parts)
      if (!seen.has(id)) {
        s.destroy();
        this.parts.delete(id);
      }

    // Wires: connect to wires, parts and the inlet.
    const wireSet = new Set(c.wires.map((w) => key(w.x, w.y)));
    const linkSet = new Set<number>([key(this.day.inlet.x, this.day.inlet.y), ...c.parts.map((p) => key(p.x, p.y))]);
    const inGrid = (x: number, y: number) => x >= 0 && y >= 0 && x < GRID && y < GRID;
    const linked = (x: number, y: number) => inGrid(x, y) && (wireSet.has(key(x, y)) || linkSet.has(key(x, y)));
    this.wireMask.clear();
    this.syncTiles(this.wires, c.wires, (w, s) => {
      const mask = maskOf(w.x, w.y, linked);
      this.wireMask.set(key(w.x, w.y), mask);
      const { frame, turns } = wireSprite(mask);
      s.setFrame(frame).setAngle(turns * 90).setDepth(DEPTH.wires + w.y);
    });

    // Stubs: from each wire into a neighbouring part or the inlet.
    const want = new Map<string, { x: number; y: number; turns: number; from: number }>();
    for (const t of [{ x: this.day.inlet.x, y: this.day.inlet.y }, ...c.parts])
      for (const [dx, dy, turns] of SIDES) {
        const nx = t.x + dx;
        const ny = t.y + dy;
        if (inGrid(nx, ny) && wireSet.has(key(nx, ny))) want.set(`${t.x},${t.y},${turns}`, { x: t.x, y: t.y, turns, from: key(nx, ny) });
      }
    for (const [k, st] of this.stubs)
      if (!want.has(k)) {
        st.sprite.destroy();
        this.stubs.delete(k);
      }
    for (const [k, w] of want) {
      let st = this.stubs.get(k);
      if (!st) {
        const p = tileToWorld(w.x, w.y);
        st = { sprite: this.scene.add.image(p.x, p.y, TEX.parts, 'wire_end').setScale(JOIN_SCALE), from: w.from };
        this.stubs.set(k, st);
      }
      st.from = w.from;
      st.sprite.setAngle(w.turns * 90).setDepth(DEPTH.wires + w.y + 0.5);
    }

    // Walls: connect to walls of either material.
    const wallSet = new Set(c.walls.map((w) => key(w.x, w.y)));
    const walled = (x: number, y: number) => inGrid(x, y) && wallSet.has(key(x, y));
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
        s = this.scene.add.image(p.x, p.y, TEX.parts, '__DEFAULT').setScale(JOIN_SCALE);
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
    let powerT = sim ? sim.powerT : this.preview?.powerT;
    // Build preview: blinking delays beat on the clock (10 steps a second, like the raid).
    const blinkOn = new Set<number>();
    if (!sim && this.preview && this.blinkers.length) {
      const t = this.livePowerT;
      t.set(this.preview.powerT);
      for (const b of this.blinkers) {
        if (Math.floor((time * 10) / b.steps) % 2 !== 0) continue;
        blinkOn.add(b.id);
        for (let i = 0; i < t.length; i++) if ((b.powerT[i] ?? 0) > (t[i] ?? 0)) t[i] = b.powerT[i] ?? 0;
      }
      powerT = t;
    }
    const wireLook = (s: Phaser.GameObjects.Image, k: number) => {
      const strength = Math.max(powerC?.[k] ?? 0, powerT?.[k] ?? 0);
      if (strength > 0) {
        // Copper brightness follows strength: full bright next to the source (15),
        // fading toward the dull unpowered colour as the signal weakens tile by
        // tile. A gentle shimmer so live wires read as live.
        const f = wireBrightness(strength);
        const pulse = 0.94 + 0.06 * Math.sin(time * 6 - k * 0.7);
        s.setTint(lerpColour(WIRE_DIM, 0xffffff, f * pulse)).setAlpha(1);
      } else {
        s.setTint(WIRE_DIM).setAlpha(1);
      }
    };
    for (const [k, s] of this.wires) wireLook(s, k);
    for (const st of this.stubs.values()) wireLook(st.sprite, st.from);
    this.drawCurrent(time, powerC, powerT);

    // The inlet always has power: a slow breath so it reads as live.
    this.inlet.setScale(PART_SCALE * (1 + 0.035 * Math.sin(time * 3)));

    const simParts = sim ? new Map(sim.parts.map((p) => [p.id, p])) : null;
    for (const part of this.c.parts) {
      const s = this.parts.get(part.id);
      if (!s) continue;
      const sp = simParts?.get(part.id) ?? null;
      const input = sp
        ? sp.input
        : this.blinkers.length && powerC && powerT
          ? partInput(part, powerC, powerT)
          : (this.preview?.inputs.get(part.id) ?? { c: 0, t: 0 });
      const def = hasPartDef(part.type) ? partDef(part.type) : null;
      const powered = !def || def.kind !== 'action' || Math.max(input.c, input.t) >= def.needs;
      const view = partView(part.type);
      if (view.update) view.update(s, { time, powered, sim: sp, on: sp ? sp.active : blinkOn.has(part.id) });
      else s.setTint(powered || sp?.active ? 0xffffff : 0xb8b8b8);
    }
  }

  /**
   * Electricity on powered wires: bright pulses that run away from the power
   * source (strength falls 1 per tile, so "distance from the source" is
   * 16 - strength and the pulses travel down that gradient), plus the odd spark
   * crackling at a random live tile.
   */
  private drawCurrent(time: number, powerC?: Uint8Array, powerT?: Uint8Array): void {
    const g = this.zap;
    g.clear();
    const strength = (k: number) => Math.max(powerC?.[k] ?? 0, powerT?.[k] ?? 0);
    const inletK = key(this.day.inlet.x, this.day.inlet.y);
    const live: number[] = [];
    const half = TILE / 2;
    const SEGS = 4;
    for (const [k, mask] of this.wireMask) {
      const s = strength(k);
      if (s <= 0) continue;
      live.push(k);
      // Constant power runs cyan; a tick (tripwire pulse) runs amber.
      const tick = (powerT?.[k] ?? 0) > (powerC?.[k] ?? 0);
      const glow = tick ? 0xffa53a : 0x3fd8ff;
      const core = tick ? 0xfff0c8 : 0xd8fbff;
      // Weaker signal, fainter current; strong wires also glow steadily.
      const bright = wireBrightness(s);
      const fade = 0.1 + 0.9 * bright;
      const halo = bright * bright;
      const x = k % GRID;
      const y = Math.floor(k / GRID);
      const c = tileToWorld(x, y);
      const d0 = 16 - s;
      for (const [bit, dx, dy] of [
        [1, 0, -1],
        [2, 1, 0],
        [4, 0, 1],
        [8, -1, 0],
      ] as const) {
        if (!(mask & bit)) continue;
        const nk = key(x + dx, y + dy);
        const ns = nk === inletK ? 16 : this.wireMask.has(nk) ? strength(nk) : 0;
        const dir = ns > s ? -1 : 1; // toward a stronger neighbour = back toward the source
        // Steady glow along the whole arm, strong near the source, gone at the far end.
        if (halo > 0.02) {
          const ex = c.x + dx * half;
          const ey = c.y + dy * half;
          g.lineStyle(14, glow, 0.16 * halo).lineBetween(c.x, c.y, ex, ey);
          g.lineStyle(5, core, 0.35 * halo).lineBetween(c.x, c.y, ex, ey);
        }
        for (let i = 0; i < SEGS; i++) {
          const u0 = i / SEGS;
          const u1 = (i + 1) / SEGS;
          const d = d0 + dir * 0.5 * ((u0 + u1) / 2);
          const wave = 0.5 + 0.5 * Math.sin(Math.PI * 2 * (time * 1.4 - d * 0.55));
          const a = wave ** 6;
          if (a < 0.03) continue;
          const ax = c.x + dx * half * u0;
          const ay = c.y + dy * half * u0;
          const bx = c.x + dx * half * u1;
          const by = c.y + dy * half * u1;
          g.lineStyle(9, glow, 0.18 * a * fade).lineBetween(ax, ay, bx, by);
          g.lineStyle(3.5, core, 0.85 * a * fade).lineBetween(ax, ay, bx, by);
        }
      }
    }
    // Sparks: a short zigzag that flickers for ~0.15s.
    if (live.length && Math.random() < 0.06 + live.length * 0.004) {
      const k = live[Math.floor(Math.random() * live.length)] as number;
      const c = tileToWorld(k % GRID, Math.floor(k / GRID));
      this.sparks.push({ x: c.x, y: c.y, until: time + 0.15, seed: Math.random() * 100 });
    }
    this.sparks = this.sparks.filter((sp) => sp.until > time);
    for (const sp of this.sparks) {
      const flick = Math.floor(time * 30 + sp.seed);
      const r = (n: number) => Math.sin(sp.seed * 12.9 + n * 78.2 + flick) * 0.5;
      g.lineStyle(2, 0xffffff, 0.9).beginPath();
      g.moveTo(sp.x + r(1) * 10, sp.y + r(2) * 10);
      for (let i = 3; i < 8; i += 2) g.lineTo(sp.x + r(i) * 22, sp.y + r(i + 1) * 22);
      g.strokePath();
    }
  }

  destroy(): void {
    this.zap.destroy();
    for (const m of [this.parts, this.wires, this.walls]) for (const s of m.values()) s.destroy();
    for (const st of this.stubs.values()) st.sprite.destroy();
    this.house?.destroy();
    this.inlet.destroy();
  }
}
