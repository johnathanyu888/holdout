// The day's rocks (DayConfig.obstacles). A rock blocks zombies, parts and wire
// until the player clears it, which costs build time (like repairing a machine).

import { key } from '../grid';
import type { DayConfig } from '../types/day';

/** Wall HP the sim gives a rock tile: effectively unbreakable. */
export const ROCK_HP = 30_000;

/** Index of the rock on tile (x, y), or -1. */
export function rockAt(day: DayConfig, x: number, y: number): number {
  return (day.obstacles ?? []).findIndex((o) => o.x === x && o.y === y);
}

/** Tile keys of every rock still on the map. */
export function rockTiles(day: DayConfig): number[] {
  return (day.obstacles ?? []).map((o) => key(o.x, o.y));
}
