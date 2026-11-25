// Teaching overlays drawn over the board in build mode, so players can read what
// parts do from the board itself:
//
//  - Part guides: for the selected part, or the part about to be placed, what it
//    does and where: a piston's push arrow and target tile, the tile a trap hurts,
//    a sensor's trigger tile, and a chip's pins (IN / OUT, SET / RESET / OUT).
//  - Power trace: for a selected part (or wire), the wire route back to whatever
//    powers it, with the signal strength on every tile (it drops 1 per tile).
//  - Strength numbers on every powered wire while the Wire tool is out.
//  - Hint badges: an amber "!" on a trap that won't work (no power / too weak).
//  - The inlet's 3 slots: three lights above the inlet, lit per part it powers;
//    each powered part wears a numbered plug badge; a part the inlet can reach
//    but has no slot for wears a red unplugged badge.
//  - Sandbox only: the routes zombies would take from the edges to the house.

import Phaser from 'phaser';
import { GRID, TILE, key, tileOrigin, tileToWorld, type Tile } from '@shared/grid';
import { covers } from '@shared/build/rocks';
import { FIELD_INF, INLET_MAX_LOAD, hasPartDef, partDef, powerMul, type PowerIn } from '@shared/sim';
import { computeField, nextTile } from '@shared/sim/core/pathing';
import { ROCK_HP, rockTiles } from '@shared/build/rocks';
import type { Contraption, PlacedPart } from '@shared/types/build';
import type { DayConfig } from '@shared/types/day';
import { DEPTH } from './layers';

const SIDE_DX = [1, 0, -1, 0];
const SIDE_DY = [0, 1, 0, -1];
const CYAN = 0x5fd8ff;
const AMBER = 0xffb43c;
const RED = 0xff5a4f;
const HIT = 0xff6a55;

/** Labels for chip pins, by part type and side (rot 0). */
const PIN_LABELS: Record<string, Record<number, string>> = {
  delay: { 2: 'IN', 0: 'OUT' },
  latch: { 2: 'SET', 1: 'RESET', 0: 'OUT' },
};

/** The tiles a selection covers: a rock's whole block, else the one tile. */
export function footprint(day: DayConfig, t: Tile): { x: number; y: number; w: number; h: number } {
  const r = (day.obstacles ?? []).find((o) => covers(o, t.x, t.y));
  return r ? { x: r.x, y: r.y, w: r.w ?? 1, h: r.h ?? 1 } : { x: t.x, y: t.y, w: 1, h: 1 };
}

export interface PreviewInfo {
  powerC: Uint8Array;
  powerT: Uint8Array;
  inputs: Map<number, PowerIn>;
  loaded: number[];
}

export interface GuideInput {
  time: number;
  /** One screen pixel in world units. */
  px: number;
  building: boolean;
  sel: Tile | null;
  c: Contraption;
  parts: PlacedPart[];
  preview: PreviewInfo | null;
  /** The active tool id, and the tile under the pointer (for placement guides). */
  tool: string;
  hover: Tile | null;
  rot: number;
  showPaths: boolean;
}

export class GuideLayer {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly under: Phaser.GameObjects.Graphics;
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private used = 0;
  private paths: { key: string; lines: { x: number; y: number }[][] } | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly day: DayConfig,
  ) {
    this.under = scene.add.graphics().setDepth(DEPTH.wires + 6_000);
    this.g = scene.add.graphics().setDepth(DEPTH.ghost + 10);
  }

  draw(o: GuideInput): void {
    this.g.clear();
    this.under.clear();
    this.used = 0;
    if (o.showPaths) this.drawPaths(o);
    if (o.building && o.preview) {
      this.drawInletSlots(o);
      if (o.tool === 'wire') this.drawAllStrengths(o);
      const sel = o.sel;
      const selPart = sel ? o.parts.find((p) => p.x === sel.x && p.y === sel.y) : undefined;
      if (selPart) {
        this.drawPartGuide(selPart.type, selPart.x, selPart.y, selPart.rot, o.time);
        this.drawTrace(o, selPart);
      } else if (sel && o.c.wires.some((w) => w.x === sel.x && w.y === sel.y)) {
        this.drawTraceFrom(o, key(sel.x, sel.y));
      }
      // Placing a part: show what it will do at the tile under the pointer.
      if (o.tool.startsWith('part:') && o.hover) {
        const type = o.tool.slice(5);
        const rot = hasPartDef(type) && partDef(type).rotatable ? o.rot : 0;
        this.drawPartGuide(type, o.hover.x, o.hover.y, rot, o.time);
      }
    }
    for (let i = this.used; i < this.labels.length; i++) this.labels[i]?.setVisible(false);
  }

  // ---- part guides -------------------------------------------------------------

  private drawPartGuide(type: string, x: number, y: number, rot: number, time: number): void {
    if (!hasPartDef(type)) return;
    const def = partDef(type);
    const pulse = 0.5 + 0.5 * Math.sin(time * 5);
    const g = this.g;
    const tileBox = (tx: number, ty: number, col: number, a: number) => {
      if (tx < 0 || ty < 0 || tx >= GRID || ty >= GRID) return;
      const t = tileOrigin(tx, ty);
      g.fillStyle(col, a * 0.35).fillRect(t.x + 3, t.y + 3, TILE - 6, TILE - 6);
      g.lineStyle(3, col, a).strokeRect(t.x + 3, t.y + 3, TILE - 6, TILE - 6);
    };
    if (type === 'piston') {
      const d = rot % 4;
      const fx = x + (SIDE_DX[d] as number);
      const fy = y + (SIDE_DY[d] as number);
      tileBox(fx, fy, HIT, 0.55 + 0.35 * pulse);
      this.label(fx, fy, 'PUSH', HIT, 0.32);
      const a = tileToWorld(x, y);
      const b = tileToWorld(fx + (SIDE_DX[d] as number), fy + (SIDE_DY[d] as number));
      this.arrow(a.x + ((b.x - a.x) / 4), a.y + ((b.y - a.y) / 4), b.x - ((b.x - a.x) / 6), b.y - ((b.y - a.y) / 6), HIT, 0.9);
      return;
    }
    if (def.kind === 'action' && !def.range) {
      tileBox(x, y, HIT, 0.5 + 0.35 * pulse);
      this.label(x, y, 'HITS', HIT, -0.36);
    } else if (def.kind === 'trigger') {
      tileBox(x, y, CYAN, 0.5 + 0.35 * pulse);
      this.label(x, y, 'TRIGGER', CYAN, -0.36);
    }
    if (def.pins) {
      const names = PIN_LABELS[type] ?? {};
      for (const s of def.pins.in) this.pin(x, y, (s + rot) % 4, true, names[s] ?? 'IN');
      for (const s of def.pins.out) this.pin(x, y, (s + rot) % 4, false, names[s] ?? 'OUT');
    }
  }

  /** An arrow on one side of a part: into it (an input pin) or out of it (an output pin), with its name. */
  private pin(x: number, y: number, side: number, input: boolean, name: string): void {
    const c = tileToWorld(x, y);
    const dx = SIDE_DX[side] as number;
    const dy = SIDE_DY[side] as number;
    const near = { x: c.x + dx * TILE * 0.42, y: c.y + dy * TILE * 0.42 };
    const far = { x: c.x + dx * TILE * 0.9, y: c.y + dy * TILE * 0.9 };
    const col = input ? CYAN : AMBER;
    if (input) this.arrow(far.x, far.y, near.x, near.y, col, 0.95);
    else this.arrow(near.x, near.y, far.x, far.y, col, 0.95);
    this.labelAt(c.x + dx * TILE * 0.95, c.y + dy * TILE * 0.95 + (dy === 0 ? -16 : dy * 12), name, col);
  }

  private arrow(x1: number, y1: number, x2: number, y2: number, col: number, a: number): void {
    const g = this.g;
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    g.lineStyle(7, 0x000000, 0.35).lineBetween(x1, y1, x2 - ux * 8, y2 - uy * 8);
    g.lineStyle(4, col, a).lineBetween(x1, y1, x2 - ux * 8, y2 - uy * 8);
    const h = 13;
    g.fillStyle(col, a).fillTriangle(
      x2,
      y2,
      x2 - ux * h - uy * h * 0.7,
      y2 - uy * h + ux * h * 0.7,
      x2 - ux * h + uy * h * 0.7,
      y2 - uy * h - ux * h * 0.7,
    );
  }

  // ---- power trace and strength numbers ---------------------------------------------

  private drawTrace(o: GuideInput, part: PlacedPart): void {
    const pv = o.preview;
    if (!pv) return;
    const def = hasPartDef(part.type) ? partDef(part.type) : null;
    const sides = def?.pins ? def.pins.in.map((s) => (s + part.rot) % 4) : [0, 1, 2, 3];
    let best = -1;
    let bestS = 0;
    for (const d of sides) {
      const nx = part.x + (SIDE_DX[d] as number);
      const ny = part.y + (SIDE_DY[d] as number);
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
      const s = Math.max(pv.powerC[key(nx, ny)] ?? 0, pv.powerT[key(nx, ny)] ?? 0);
      if (s > bestS) {
        bestS = s;
        best = key(nx, ny);
      }
    }
    if (best >= 0) this.drawTraceFrom(o, best, part);
  }

  /** Walks from a wire tile up the strength gradient to its source, drawing the route and numbers. */
  private drawTraceFrom(o: GuideInput, start: number, end?: PlacedPart): void {
    const pv = o.preview;
    if (!pv) return;
    const s = (k: number) => Math.max(pv.powerC[k] ?? 0, pv.powerT[k] ?? 0);
    if (s(start) <= 0) return;
    const wires = new Set(o.c.wires.map((w) => key(w.x, w.y)));
    const route: number[] = [start];
    let k = start;
    for (let i = 0; i < 40; i++) {
      const x = k % GRID;
      const y = (k - x) / GRID;
      let next = -1;
      for (let d = 0; d < 4; d++) {
        const nx = x + (SIDE_DX[d] as number);
        const ny = y + (SIDE_DY[d] as number);
        if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
        const n = key(nx, ny);
        if (wires.has(n) && s(n) === s(k) + 1) next = n;
      }
      if (next < 0) break;
      route.push(next);
      k = next;
    }
    // Glow along the route, from the source end to the part.
    const pts = route.map((q) => tileToWorld(q % GRID, Math.floor(q / GRID)));
    if (end) pts.unshift(tileToWorld(end.x, end.y));
    const flow = (o.time * 2) % 1;
    this.under.lineStyle(14, 0xfff2b0, 0.18).strokePoints(pts);
    this.under.lineStyle(4, 0xfff2b0, 0.55).strokePoints(pts);
    // A bead running from the source to the part shows which way the power flows.
    const n = pts.length - 1;
    if (n >= 1) {
      const f = (1 - flow) * n;
      const i = Math.min(n - 1, Math.floor(f));
      const a = pts[i] as { x: number; y: number };
      const b = pts[i + 1] as { x: number; y: number };
      const t = f - i;
      this.under.fillStyle(0xffffff, 0.9).fillCircle(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 6);
    }
    for (const q of route) this.strengthLabel(q % GRID, Math.floor(q / GRID), s(q));
  }

  private drawAllStrengths(o: GuideInput): void {
    const pv = o.preview;
    if (!pv) return;
    for (const w of o.c.wires) {
      const v = Math.max(pv.powerC[key(w.x, w.y)] ?? 0, pv.powerT[key(w.x, w.y)] ?? 0);
      if (v > 0) this.strengthLabel(w.x, w.y, v);
    }
  }

  /** The number on a wire tile, coloured from dim (weak) to bright (full power). */
  private strengthLabel(x: number, y: number, v: number): void {
    const m = Math.min(1, powerMul(v));
    const col = m >= 0.85 ? 0xfff2b0 : m >= 0.5 ? 0xffc46b : 0xff8a5c;
    const c = tileToWorld(x, y);
    this.labelAt(c.x, c.y, String(v), col, 17);
  }

  // ---- inlet slots and hint badges ------------------------------------------------

  private drawInletSlots(o: GuideInput): void {
    const pv = o.preview;
    if (!pv) return;
    const g = this.g;
    const loaded = pv.loaded;
    const ic = tileToWorld(this.day.inlet.x, this.day.inlet.y);
    // Three lights over the inlet: lit = a slot in use.
    const w = 13;
    const gap = 5;
    const left = ic.x - (INLET_MAX_LOAD * w + (INLET_MAX_LOAD - 1) * gap) / 2;
    const top = ic.y - TILE * 0.78;
    g.fillStyle(0x0d1116, 0.85).fillRoundedRect(left - 5, top - 5, INLET_MAX_LOAD * (w + gap) - gap + 10, w + 10, 6);
    for (let i = 0; i < INLET_MAX_LOAD; i++) {
      const lit = i < loaded.length;
      g.fillStyle(lit ? CYAN : 0x3a4250, 1).fillRoundedRect(left + i * (w + gap), top, w, w, 3);
      if (lit) g.fillStyle(0xffffff, 0.5).fillRoundedRect(left + i * (w + gap) + 2, top + 2, w - 4, 4, 2);
    }
    const loadedSet = new Set(loaded);
    for (const p of o.parts) {
      if (!hasPartDef(p.type)) continue;
      const def = partDef(p.type);
      if (def.kind !== 'action') continue;
      const got = pv.inputs.get(p.id) ?? { c: 0, t: 0 };
      const s = Math.max(got.c, got.t);
      const c = tileToWorld(p.x, p.y);
      const bx = c.x + TILE * 0.36;
      const by = c.y - TILE * 0.36;
      const slot = loaded.indexOf(p.id);
      if (slot >= 0) {
        // Plugged into the inlet: a numbered cyan badge (which of its 3 slots).
        g.fillStyle(0x0d1116, 0.9).fillCircle(bx, by, 11);
        g.fillStyle(CYAN, 1).fillCircle(bx, by, 8.5);
        this.labelAt(bx, by, String(slot + 1), 0x0d1116, 13, false);
      } else if (s >= def.needs && !loadedSet.has(p.id)) {
        // Reachable, but the inlet has no slot left: a red unplugged badge.
        g.fillStyle(0x0d1116, 0.9).fillCircle(bx, by, 11);
        g.fillStyle(RED, 1).fillCircle(bx, by, 8.5);
        g.lineStyle(2.6, 0xffffff, 1).lineBetween(bx - 4, by - 4, bx + 4, by + 4).lineBetween(bx + 4, by - 4, bx - 4, by + 4);
      } else if (s < def.needs) {
        // Won't work: an amber "!" (the card says why).
        const bob = Math.sin(o.time * 4 + p.id) * 1.5;
        g.fillStyle(0x0d1116, 0.9).fillCircle(bx, by + bob, 11);
        g.fillStyle(AMBER, 1).fillCircle(bx, by + bob, 8.5);
        g.fillStyle(0x2a1d05, 1).fillRoundedRect(bx - 1.6, by + bob - 5.5, 3.2, 7, 1.2).fillCircle(bx, by + bob + 4.2, 1.7);
      }
    }
  }

  // ---- sandbox: zombie routes ----------------------------------------------------------

  private drawPaths(o: GuideInput): void {
    if (!o.c.house) return;
    const sig = `${o.c.house.x},${o.c.house.y}|${o.c.walls.map((w) => `${w.x},${w.y}`).join(';')}|${rockTiles(this.day).join(',')}`;
    if (!this.paths || this.paths.key !== sig) this.paths = { key: sig, lines: this.routes(o.c) };
    const dash = (o.time * 40) % 24;
    for (const line of this.paths.lines) {
      for (let i = 0; i < line.length - 1; i++) {
        const a = line[i] as { x: number; y: number };
        const b = line[i + 1] as { x: number; y: number };
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        for (let d = -dash; d < len; d += 24) {
          const t0 = Math.max(0, d) / len;
          const t1 = Math.min(len, d + 12) / len;
          if (t1 <= t0) continue;
          this.under
            .lineStyle(3, 0xff6a55, 0.55)
            .lineBetween(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0, a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
        }
      }
    }
  }

  private routes(c: Contraption): { x: number; y: number }[][] {
    const house = c.house;
    if (!house) return [];
    const blocked = new Int16Array(GRID * GRID);
    for (const w of c.walls) blocked[key(w.x, w.y)] = 1;
    for (const k of rockTiles(this.day)) blocked[k] = ROCK_HP;
    const field = new Int32Array(GRID * GRID);
    computeField(blocked, house.x, house.y, field);
    const starts: Tile[] = [];
    for (let i = 1; i < GRID - 1; i += 3) starts.push({ x: i, y: 0 }, { x: i, y: GRID - 1 }, { x: 0, y: i }, { x: GRID - 1, y: i });
    const lines: { x: number; y: number }[][] = [];
    for (const s of starts) {
      if ((field[key(s.x, s.y)] ?? FIELD_INF) >= FIELD_INF || blocked[key(s.x, s.y)]) continue;
      const pts = [tileToWorld(s.x, s.y)];
      let x = s.x;
      let y = s.y;
      for (let i = 0; i < 60 && !(x === house.x && y === house.y); i++) {
        const n = nextTile(field, blocked, x, y);
        if (!n) break;
        [x, y] = n;
        pts.push(tileToWorld(x, y));
      }
      lines.push(pts);
    }
    return lines;
  }

  // ---- text ------------------------------------------------------------------------

  /** A small caption on a tile, offset up (-) or down (+) by a fraction of a tile. */
  private label(x: number, y: number, text: string, col: number, dy: number): void {
    const c = tileToWorld(x, y);
    this.labelAt(c.x, c.y + dy * TILE, text, col);
  }

  private labelAt(x: number, y: number, text: string, col: number, size = 12, outline = true): void {
    let t = this.labels[this.used];
    if (!t) {
      t = this.scene.add
        .text(0, 0, '', { fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif', fontStyle: '900', color: '#ffffff' })
        .setOrigin(0.5)
        .setResolution(3)
        .setDepth(DEPTH.ghost + 11);
      this.labels.push(t);
    }
    this.used++;
    t.setText(text)
      .setFontSize(size)
      .setColor(`#${col.toString(16).padStart(6, '0')}`)
      .setStroke('#0d1116', outline ? 4 : 0)
      .setPosition(x, y)
      .setVisible(true);
  }

  destroy(): void {
    this.g.destroy();
    this.under.destroy();
    for (const t of this.labels) t.destroy();
  }
}
