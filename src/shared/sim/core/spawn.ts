// Spawn schedule: computed once from the day's spawn spec and seed. Zombies come
// in small groups from random edge tiles on all four sides. The schedule doesn't
// depend on the player's build, so every player faces the same raid.

import { GRID } from '../../grid';
import type { SpawnSpec } from '../../types/day';
import { type RngState, nextInt, pickWeighted, seedRng, shuffle } from './rng';
import type { SpawnEntry } from './types';

/** Edge tile `i` (0..23) along side 0 = north, 1 = east, 2 = south, 3 = west. */
function sideTile(side: number, i: number): [number, number] {
  const last = GRID - 1;
  switch (side) {
    case 0:
      return [i, 0];
    case 1:
      return [last, i];
    case 2:
      return [i, last];
    default:
      return [0, i];
  }
}

export function buildSchedule(spec: SpawnSpec, rng: RngState = seedRng(spec.seed)): SpawnEntry[] {
  const types: string[] = [];
  for (const g of spec.zombies) for (let i = 0; i < g.count; i++) types.push(g.type);
  shuffle(rng, types);

  const weights = spec.sideWeights ?? [1, 1, 1, 1];
  const out: SpawnEntry[] = [];
  let step = spec.firstStep;
  let next = 0;
  while (next < types.length) {
    const size = Math.min(types.length - next, nextInt(rng, spec.groupMin, spec.groupMax));
    const side = pickWeighted(rng, weights);
    // A group comes out of one stretch of one side, a few tiles apart.
    const centre = nextInt(rng, 1, GRID - 2);
    const used = new Set<number>();
    for (let i = 0; i < size; i++) {
      let along = centre;
      for (let tries = 0; tries < 8 && used.has(along); tries++)
        along = Math.max(0, Math.min(GRID - 1, centre + nextInt(rng, -3, 3)));
      used.add(along);
      const [x, y] = sideTile(side, along);
      out.push({ step: step + i * 3, x, y, type: types[next++] as string });
    }
    const jitter = Math.max(1, Math.floor(spec.groupGap / 5));
    step += spec.groupGap + nextInt(rng, -jitter, jitter);
  }
  return out.sort((a, b) => a.step - b.step);
}
