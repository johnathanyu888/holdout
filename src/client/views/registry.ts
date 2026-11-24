// Part views: how each part type is drawn. One file per part in ./parts/
// (registered automatically); types without a view use the defaults
// (atlas frame named after the type, generic powered/active look).

import type Phaser from 'phaser';
import type { SimPart } from '@shared/sim';

export interface PartViewContext {
  /** Seconds since the scene started (for animation). */
  time: number;
  /** Is the part getting at least the strength it needs? */
  powered: boolean;
  /** Raid only: the sim part (null in build mode). */
  sim: SimPart | null;
  /** Is the part outputting right now (raid: sim.active; build: e.g. a blinker's "on" beat)? */
  on?: boolean;
}

export interface PartView {
  type: string;
  /** Atlas frame (default: the type id). */
  frame?: string;
  /** Per-frame look. Default: dim when unpowered (actions), spin/pulse when active. */
  update?(sprite: Phaser.GameObjects.Image, ctx: PartViewContext): void;
}

const views = new Map<string, PartView>();

export function registerPartView(v: PartView): void {
  views.set(v.type, v);
}

export function partView(type: string): PartView {
  return views.get(type) ?? { type };
}

// The view files are loaded by ./index.ts (a glob here would be hoisted above `views`).
