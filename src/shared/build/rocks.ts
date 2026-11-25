// The day's obstacles (DayConfig.obstacles): rocks and trees. Each covers a w x h
// block of tiles (1x1 up to 2x2). It blocks zombies, parts and wire until the
// player clears it, which costs build time (bigger rocks cost more).

import { key } from '../grid';
import type { DayConfig, Obstacle } from '../types/day';

/** Wall HP the sim gives a rock tile: effectively unbreakable. */
export const ROCK_HP = 30_000;

const w = (o: Obstacle) => o.w ?? 1;
const h = (o: Obstacle) => o.h ?? 1;

/** Does rock `o` cover tile (x, y)? */
export function covers(o: Obstacle, x: number, y: number): boolean {
  return x >= o.x && y >= o.y && x < o.x + w(o) && y < o.y + h(o);
}

/** Index of the rock covering tile (x, y), or -1. */
export function rockAt(day: DayConfig, x: number, y: number): number {
  return (day.obstacles ?? []).findIndex((o) => covers(o, x, y));
}

/** "rock" or "tree" for messages: what's on tile (x, y). */
export function obstacleWord(day: DayConfig, x: number, y: number): string {
  const o = (day.obstacles ?? []).find((q) => covers(q, x, y));
  return o?.type === 'tree' ? 'tree' : 'rock';
}

/** Every tile a rock covers. */
export function rockCells(o: Obstacle): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (let dy = 0; dy < h(o); dy++) for (let dx = 0; dx < w(o); dx++) out.push({ x: o.x + dx, y: o.y + dy });
  return out;
}

/** Tile keys of every tile covered by a rock still on the map. */
export function rockTiles(day: DayConfig): number[] {
  return (day.obstacles ?? []).flatMap((o) => rockCells(o).map((t) => key(t.x, t.y)));
}
