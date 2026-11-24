// The day's map machines (DayConfig.fixtures). A working one becomes a part in
// the sim and the power preview, under a reserved id so it never collides with
// the player's parts.

import type { PlacedPart } from '../types/build';
import type { DayConfig } from '../types/day';

/** Part ids at and above this are map machines (index = id - FIXTURE_ID_BASE). */
export const FIXTURE_ID_BASE = 100_000;

/** Index of the machine on tile (x, y), or -1. */
export function fixtureAt(day: DayConfig, x: number, y: number): number {
  return (day.fixtures ?? []).findIndex((f) => f.x === x && f.y === y);
}

/** Working (repaired) machines as parts. */
export function workingFixtures(day: DayConfig): PlacedPart[] {
  return (day.fixtures ?? []).flatMap((f, i) =>
    f.broken ? [] : [{ id: FIXTURE_ID_BASE + i, type: f.type, x: f.x, y: f.y, rot: f.rot }],
  );
}
