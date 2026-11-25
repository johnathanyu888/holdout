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
import { workingFixtures } from '@shared/build/fixtures';
import {
  blinkerFloods,
  hasPartDef,
  partDef,
  partInput,
  powerPreview,
  type SimState,
} from '@shared/sim';
import type { PlacedPart } from '@shared/types/build';
import type { Contraption } from '@shared/types/build';
import type { DayConfig } from '@shared/types/day';
import { JOIN_SCALE, PART_SCALE, TEX } from '../core/assets';
import { partView } from '../views/registry';
import { maskOf, wallSprite, wireSprite } from './autotile';
import { DEPTH } from './layers';

const WIRE_DIM = 0x8c7a6c;

/** Neighbour offsets with the quarter turns that point a west-facing wire_end at them. */
/** A small round warning badge with a wrench: "broken, tap to repair". */
function brokenBadge(scene: Phaser.Scene): string {
  const key = 'broken-badge';
  if (scene.textures.exists(key)) return key;
  const g = scene.add.graphics();
  g.fillStyle(0x0d1116, 1).fillCircle(13, 13, 13);
  g.fillStyle(0xf2b544, 1).fillCircle(13, 13, 10.5);
  // wrench: a handle and an open jaw
  g.lineStyle(3.2, 0x2a1d05, 1).lineBetween(8, 18, 15, 11);
  g.fillStyle(0x2a1d05, 1).fillCircle(16.5, 9.5, 4);
  g.fillStyle(0xf2b544, 1).fillCircle(18.5, 7.5, 2.2);
  g.generateTexture(key, 26, 26);
  g.destroy();
  return key;
}

const SIDES: [dx: number, dy: number, turns: number][] = [
  [-1, 0, 0],
  [0, -1, 1],
  [1, 0, 2],
  [0, 1, 3],
];

/**
 * 0..1 brightness for a wire at this signal strength: 1 at full power (9+, next
 * to a sensor or delay), falling toward dim at strength 1; 0 when unpowered.
 * The weak inlet (6) reads as clearly dimmer than sensor power.
 */
function wireBrightness(strength: number): number {
  if (strength <= 0) return 0;
  return 0.06 + 0.94 * Math.min(1, (strength - 1) / 8) ** 1.3;
}

/** One boulder from above: shadow, body in three tones, cracks. Centre (cx, cy), size rx x ry. */
function drawBoulder(g: Phaser.GameObjects.Graphics, cx: number, cy: number, rx: number, ry: number): void {
  g.fillStyle(0x000000, 0.28).fillEllipse(cx + rx * 0.08, cy + ry * 0.3, rx * 2.05, ry * 1.75);
  g.fillStyle(0x5d5a55, 1).fillEllipse(cx, cy, rx * 2, ry * 2);
  g.fillStyle(0x76726b, 1).fillEllipse(cx - rx * 0.07, cy - ry * 0.13, rx * 1.7, ry * 1.65);
  g.fillStyle(0x8f8a82, 1).fillEllipse(cx - rx * 0.25, cy - ry * 0.35, rx * 0.95, ry * 0.8);
  g.fillStyle(0x6a6660, 1).fillEllipse(cx + rx * 0.42, cy + ry * 0.22, rx * 0.65, ry * 0.5);
  g.lineStyle(1.6, 0x45423e, 0.9)
    .lineBetween(cx - rx * 0.03, cy - ry * 0.65, cx + rx * 0.14, cy - ry * 0.13)
    .lineBetween(cx + rx * 0.14, cy - ry * 0.13, cx + rx * 0.04, cy + ry * 0.35);
  g.lineStyle(1.4, 0x45423e, 0.7).lineBetween(cx - rx * 0.57, cy + ry * 0.04, cx - rx * 0.25, cy + ry * 0.17);
}

/**
 * A rock covering w x h tiles, from above, drawn once per size into a texture:
 * one big boulder filling the block, with smaller stones round it on the
 * bigger sizes and a tuft of moss.
 */
function rockTexture(scene: Phaser.Scene, w: number, h: number, seed: number): string {
  // Loose stones round it: none to three (one at most on a single tile), picked per rock.
  const big = w * h > 1;
  const stones = big ? seed % 4 : seed % 3 === 0 ? 1 : 0;
  const first = Math.floor(seed / 4) % 4;
  const key = `map-rock-${w}x${h}-${stones}-${first}`;
  if (scene.textures.exists(key)) return key;
  const T = 64;
  const W = w * T;
  const H = h * T;
  const g = scene.add.graphics();
  drawBoulder(g, W / 2, H / 2 - 2, W * (big ? 0.4 : 0.42), H * (big ? 0.38 : 0.36));
  // corner spots for loose stones (fraction of the block), taken in turn from `first`
  const spots: [number, number, number][] = [
    [0.17, 0.8, 0.16],
    [0.86, 0.2, 0.13],
    [0.84, 0.82, 0.12],
    [0.15, 0.18, 0.11],
  ];
  for (let i = 0; i < stones; i++) {
    const [sx, sy, r] = spots[(first + i) % 4] as [number, number, number];
    const k = big ? 1 : 0.7;
    drawBoulder(g, W * sx, H * sy, T * r * k, T * r * 0.82 * k);
  }
  if (seed % 2 === 0) g.fillStyle(0x4f7a3a, 0.9).fillEllipse(W * 0.22, H * 0.86, 12, 5); // moss
  g.generateTexture(key, W, H);
  g.destroy();
  return key;
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
  private allParts: PlacedPart[] = [];
  /** Broken map machines: the dark machine, a warning badge, and its sputtering sparks. */
  private readonly broken = new Map<number, { sprite: Phaser.GameObjects.Image; badge: Phaser.GameObjects.Image; nextSpark: number }>();
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
  /** Rocks on the map, by tile key. */
  private readonly rocks = new Map<number, Phaser.GameObjects.Image>();

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

  /** The build-mode power preview (for the teaching overlays). */
  get previewData(): ReturnType<typeof powerPreview> | null {
    return this.preview;
  }

  /** The player's parts plus the map's working machines. */
  get placedParts(): PlacedPart[] {
    return this.allParts;
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
    // The player's parts plus the map's repaired machines; broken ones draw apart.
    this.allParts = [...c.parts, ...workingFixtures(this.day)];
    this.syncBroken();
    this.syncRocks();
    this.blinkers = blinkerFloods(c, this.preview, this.day);

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
    for (const part of this.allParts) {
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
      s.setPosition(p.x, p.y).setDepth(DEPTH.parts + p.y).setData('blink', part.config?.blink ?? 0).setData('home', { x: p.x, y: p.y });
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
    const fixtureTiles = (this.day.fixtures ?? []).map((f) => ({ x: f.x, y: f.y }));
    const linkSet = new Set<number>([
      key(this.day.inlet.x, this.day.inlet.y),
      ...c.parts.map((p) => key(p.x, p.y)),
      ...fixtureTiles.map((f) => key(f.x, f.y)),
    ]);
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
    for (const t of [{ x: this.day.inlet.x, y: this.day.inlet.y }, ...c.parts, ...fixtureTiles])
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

  /** Creates / removes rock sprites to match the day's rocks (cleared ones go). */
  private syncRocks(): void {
    const want = new Set<number>();
    for (const o of this.day.obstacles ?? []) {
      const k = key(o.x, o.y);
      want.add(k);
      if (this.rocks.has(k)) continue;
      const w = o.w ?? 1;
      const h = o.h ?? 1;
      // Centre of the block it covers.
      const a = tileToWorld(o.x, o.y);
      const b = tileToWorld(o.x + w - 1, o.y + h - 1);
      // Single stones get a little turn and size each so they don't look stamped;
      // bigger rocks flip instead (their shape has to stay inside the block).
      const v = (o.x * 7 + o.y * 13) % 5;
      const s = this.scene.add
        .image((a.x + b.x) / 2, (a.y + b.y) / 2 + 2, rockTexture(this.scene, w, h, o.x * 7 + o.y * 13 + w * 5))
        .setAngle(w === 1 && h === 1 ? v * 37 : 0)
        .setFlipX(v % 2 === 1)
        .setScale(w === 1 && h === 1 ? 0.92 + v * 0.03 : 1)
        .setDepth(DEPTH.parts + b.y);
      this.rocks.set(k, s);
    }
    for (const [k, s] of this.rocks)
      if (!want.has(k)) {
        // Cleared: crumble away.
        this.scene.tweens.add({ targets: s, alpha: 0, scale: s.scale * 0.6, duration: 280, onComplete: () => s.destroy() });
        this.rocks.delete(k);
      }
  }

  /** Creates / removes the broken-machine sprites to match the day's fixtures. */
  private syncBroken(): void {
    const fixtures = this.day.fixtures ?? [];
    fixtures.forEach((f, i) => {
      const have = this.broken.get(i);
      if (!f.broken) {
        if (have) {
          have.sprite.destroy();
          have.badge.destroy();
          this.broken.delete(i);
        }
        return;
      }
      if (have) return;
      const p = tileToWorld(f.x, f.y);
      const frame = partView(f.type).frame ?? f.type;
      const sprite = this.scene.add
        .image(p.x, p.y, TEX.parts, frame)
        .setScale(PART_SCALE)
        .setAngle(f.rot * 90 - 8)
        .setTint(0x6d6560)
        .setDepth(DEPTH.parts + p.y);
      const badge = this.scene.add
        .image(p.x + 20, p.y - 20, brokenBadge(this.scene))
        .setDepth(DEPTH.parts + p.y + 1);
      this.broken.set(i, { sprite, badge, nextSpark: 0 });
    });
  }

  /** Broken machines sputter: a dim flicker and the odd spark; the badge bobs. */
  private updateBroken(time: number): void {
    for (const [, b] of this.broken) {
      const flicker = Math.sin(time * 23) > 0.92 ? 0x9a8f86 : 0x6d6560;
      b.sprite.setTint(flicker);
      b.badge.setScale(1 + 0.08 * Math.sin(time * 4)).setY(b.sprite.y - 20 + Math.sin(time * 2.2) * 1.5);
      if (time > b.nextSpark) {
        b.nextSpark = time + 0.7 + Math.random() * 1.6;
        this.sparks.push({ x: b.sprite.x + (Math.random() - 0.5) * 30, y: b.sprite.y + (Math.random() - 0.5) * 30, until: time + 0.12, seed: Math.random() * 100 });
      }
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
    this.updateBroken(time);
    this.drawCurrent(time, powerC, powerT);

    // The inlet is always on: a slow breath so it reads as live.
    this.inlet.setScale(PART_SCALE * (1 + 0.035 * Math.sin(time * 3)));
    const loaded = new Set(this.preview?.loaded ?? []);

    const simParts = sim ? new Map(sim.parts.map((p) => [p.id, p])) : null;
    this.poweredIds.clear();
    for (const part of this.allParts) {
      const s = this.parts.get(part.id);
      if (!s) continue;
      const sp = simParts?.get(part.id) ?? null;
      const input = sp
        ? sp.input
        : this.blinkers.length && powerC && powerT
          ? partInput(part, powerC, powerT)
          : (this.preview?.inputs.get(part.id) ?? { c: 0, t: 0 });
      const def = hasPartDef(part.type) ? partDef(part.type) : null;
      // Worn out: dark and still for the rest of the raid.
      if (sp?.s.worn) {
        s.setTint(0x55504c).setScale(PART_SCALE * 0.96);
        continue;
      }
      // Build preview: an action only runs if it's one of the inlet's few parts.
      const capped = !sp && def?.kind === 'action' && !loaded.has(part.id);
      const powered = !def || def.kind !== 'action' || (!capped && Math.max(input.c, input.t) >= def.needs);
      if (powered && def?.kind === 'action') this.poweredIds.add(part.id);
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

  private glow: Phaser.GameObjects.Image | null = null;
  private rangeG: Phaser.GameObjects.Graphics | null = null;
  private rangeFx: Phaser.GameObjects.Graphics | null = null;
  /** Action parts with enough power this frame (only these show a range circle). */
  private readonly poweredIds = new Set<number>();

  /**
   * Range circles for ranged parts (e.g. the Tesla coil): a white, see-through
   * disc showing how far it reaches. Only drawn while the part is powered and
   * working; faint normally, brighter and breathing when selected.
   */
  private drawRanges(sel: { x: number; y: number } | null, time: number): void {
    this.rangeG ??= this.scene.add.graphics().setDepth(DEPTH.parts - 50);
    this.rangeFx ??= this.scene.add.graphics().setDepth(DEPTH.parts - 49).setBlendMode(Phaser.BlendModes.ADD);
    const g = this.rangeG;
    const fx = this.rangeFx;
    g.clear();
    fx.clear();
    for (const p of this.allParts) {
      const range = hasPartDef(p.type) ? partDef(p.type).range : undefined;
      if (!range || !this.poweredIds.has(p.id)) continue;
      const selected = !!sel && sel.x === p.x && sel.y === p.y;
      const c = tileToWorld(p.x, p.y);
      const r = range * TILE;
      const boost = selected ? 1.6 : 1;
      // The reach itself: a faint disc and rim, always there.
      g.fillStyle(0xffffff, 0.04 * boost).fillCircle(c.x, c.y, r);
      g.lineStyle(selected ? 2.5 : 1.5, 0xffffff, 0.22 * boost).strokeCircle(c.x, c.y, r);
      // A pulse: a see-through disc that widens from the part out to the rim, then
      // starts again (each part offset a little so they don't beat in step).
      const period = 1.7;
      const k = (((time + p.id * 0.37) % period) + period) % period / period;
      const e = 1 - (1 - k) ** 3;
      const fade = k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25;
      g.fillStyle(0xffffff, 0.09 * fade * boost).fillCircle(c.x, c.y, r * e);
      g.lineStyle(2, 0xffffff, 0.45 * fade * boost).strokeCircle(c.x, c.y, r * e);
      if (p.type === 'tesla_coil') this.drawRimArcs(fx, c.x, c.y, r, time, p.id, boost);
    }
  }

  /**
   * Tesla coils crackle round the edge of their reach: a few short jagged arcs
   * that crawl along the rim, re-rolled several times a second.
   */
  private drawRimArcs(g: Phaser.GameObjects.Graphics, cx: number, cy: number, r: number, time: number, id: number, boost: number): void {
    const frame = Math.floor(time * 14);
    const rnd = (n: number) => {
      const x = Math.sin((frame * 12.9898 + id * 78.233 + n * 37.719) * 43758.5453);
      return x - Math.floor(x);
    };
    const arcs = 4;
    for (let a = 0; a < arcs; a++) {
      const start = (a / arcs) * Math.PI * 2 + time * 0.9 + rnd(a) * 0.8;
      const span = 0.35 + rnd(a + 10) * 0.35;
      const pts: { x: number; y: number }[] = [];
      const n = 8;
      for (let i = 0; i <= n; i++) {
        const t = start + (span * i) / n;
        const jitter = i === 0 || i === n ? 0 : (rnd(a * 20 + i) - 0.5) * 9;
        pts.push({ x: cx + Math.cos(t) * (r + jitter), y: cy + Math.sin(t) * (r + jitter) });
      }
      const flicker = 0.55 + 0.45 * rnd(a + 40);
      g.lineStyle(5, 0x5fd8ff, 0.18 * flicker * boost).strokePoints(pts);
      g.lineStyle(1.8, 0xe8fbff, 0.8 * flicker * Math.min(1, boost)).strokePoints(pts);
    }
  }

  /**
   * Selection glow: an additive copy of the sprite on the selected tile (part,
   * house or inlet) that breathes bright, fade, bright.
   */
  highlight(tile: { x: number; y: number } | null, time: number): void {
    this.drawRanges(tile, time);
    let s: Phaser.GameObjects.Image | null | undefined = null;
    if (tile && this.c) {
      const part = this.allParts.find((p) => p.x === tile.x && p.y === tile.y);
      const bi = (this.day.fixtures ?? []).findIndex((f) => f.broken && f.x === tile.x && f.y === tile.y);
      if (part) s = this.parts.get(part.id);
      else if (bi >= 0) s = this.broken.get(bi)?.sprite;
      else if (this.c.house && this.c.house.x === tile.x && this.c.house.y === tile.y) s = this.house;
      else if (this.day.inlet.x === tile.x && this.day.inlet.y === tile.y) s = this.inlet;
    }
    if (!s) {
      this.glow?.setVisible(false);
      return;
    }
    this.glow ??= this.scene.add.image(0, 0, s.texture.key, s.frame.name).setBlendMode(Phaser.BlendModes.ADD);
    const pulse = 0.5 + 0.5 * Math.sin(time * 4.2);
    this.glow
      .setTexture(s.texture.key, s.frame.name)
      .setPosition(s.x, s.y)
      .setRotation(s.rotation)
      .setScale(s.scaleX * (1.02 + 0.03 * pulse), s.scaleY * (1.02 + 0.03 * pulse))
      .setDepth(s.depth + 0.5)
      .setTintFill(0xffffff)
      .setAlpha(0.08 + 0.22 * pulse)
      .setVisible(true);
  }

  destroy(): void {
    this.rangeG?.destroy();
    this.rangeFx?.destroy();
    for (const s of this.rocks.values()) s.destroy();
    for (const b of this.broken.values()) {
      b.sprite.destroy();
      b.badge.destroy();
    }
    this.glow?.destroy();
    this.zap.destroy();
    for (const m of [this.parts, this.wires, this.walls]) for (const s of m.values()) s.destroy();
    for (const st of this.stubs.values()) st.sprite.destroy();
    this.house?.destroy();
    this.inlet.destroy();
  }
}
