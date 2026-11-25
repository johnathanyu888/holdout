// Flow field: integer Dijkstra distance from every tile to the house.
// Costs 10 straight / 14 diagonal, 8 neighbours, no corner cutting (a diagonal
// step needs both orthogonal neighbours open). Walls block; everything else
// (parts, wires, the inlet) is walkable. Recomputed only when walls change.

import { GRID, TILE_COUNT } from '../../grid';

export const FIELD_INF = 0x3fffffff;

/** dx, dy, cost: orthogonals first, then diagonals (fixed order = deterministic ties). */
export const DIRS: readonly [number, number, number][] = [
  [0, -1, 10],
  [1, 0, 10],
  [0, 1, 10],
  [-1, 0, 10],
  [1, -1, 14],
  [1, 1, 14],
  [-1, 1, 14],
  [-1, -1, 14],
];

function open(blocked: Int16Array, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < GRID && y < GRID && (blocked[y * GRID + x] ?? 0) <= 0;
}

/** Can a zombie step from (x, y) by (dx, dy)? */
export function canStep(blocked: Int16Array, x: number, y: number, dx: number, dy: number): boolean {
  if (!open(blocked, x + dx, y + dy)) return false;
  if (dx !== 0 && dy !== 0) return open(blocked, x + dx, y) && open(blocked, x, y + dy);
  return true;
}

/**
 * Distance field to `goal`. `blocked` is the wall HP grid (> 0 = blocked).
 * O(n^2) selection Dijkstra: 576 tiles, recomputed only on wall changes.
 */
export function computeField(blocked: Int16Array, goalX: number, goalY: number, out: Int32Array): void {
  out.fill(FIELD_INF);
  const done = new Uint8Array(TILE_COUNT);
  out[goalY * GRID + goalX] = 0;
  for (;;) {
    let best = -1;
    let bestD = FIELD_INF;
    for (let k = 0; k < TILE_COUNT; k++) {
      const d = out[k] as number;
      if (!done[k] && d < bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best < 0) return;
    done[best] = 1;
    const x = best % GRID;
    const y = (best - x) / GRID;
    for (const [dx, dy, cost] of DIRS) {
      // Reverse search: a zombie steps from n to best, so check the step n -> best.
      const nx = x + dx;
      const ny = y + dy;
      if (!open(blocked, nx, ny) || !canStep(blocked, nx, ny, -dx, -dy)) continue;
      const n = ny * GRID + nx;
      const nd = bestD + cost;
      if (nd < (out[n] as number)) out[n] = nd;
    }
  }
}

/**
 * The "bash through" field, for zombies with no open route to the house: walls
 * count as passable but cost extra to cross (`extra(k)`: the cost of breaking
 * through tile k, or < 0 if it can never be crossed, like a rock). Orthogonal
 * steps only. Every trapped zombie follows the same field, so they converge on
 * the same cheapest wall and pile up against it together.
 */
export function computeBashField(extra: (k: number) => number, goalX: number, goalY: number, out: Int32Array): void {
  out.fill(FIELD_INF);
  const done = new Uint8Array(TILE_COUNT);
  out[goalY * GRID + goalX] = 0;
  for (;;) {
    let best = -1;
    let bestD = FIELD_INF;
    for (let k = 0; k < TILE_COUNT; k++) {
      const d = out[k] as number;
      if (!done[k] && d < bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best < 0) return;
    done[best] = 1;
    const e = extra(best);
    if (e < 0) continue; // can't be crossed: nothing reaches the goal through it
    const x = best % GRID;
    const y = (best - x) / GRID;
    for (const [dx, dy] of DIRS.slice(0, 4)) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= GRID || ny >= GRID) continue;
      const n = ny * GRID + nx;
      const nd = bestD + 10 + e;
      if (nd < (out[n] as number)) out[n] = nd;
    }
  }
}

/**
 * The neighbour a zombie in (x, y) should head for: the reachable neighbour
 * with the smallest distance (ties: DIRS order). null if none is closer.
 */
export function nextTile(field: Int32Array, blocked: Int16Array, x: number, y: number): [number, number] | null {
  const here = field[y * GRID + x] ?? FIELD_INF;
  let best: [number, number] | null = null;
  let bestD = here;
  for (const [dx, dy] of DIRS) {
    if (!canStep(blocked, x, y, dx, dy)) continue;
    const d = field[(y + dy) * GRID + (x + dx)] ?? FIELD_INF;
    if (d < bestD) {
      bestD = d;
      best = [x + dx, y + dy];
    }
  }
  return best;
}
