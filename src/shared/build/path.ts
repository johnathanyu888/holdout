// Wire paths: orthogonal, L-shaped between two tiles (the axis with the larger
// delta goes first), so dragging diagonally still lays a connected wire.

import type { Tile } from '../grid';

/** Tiles from a to b inclusive, along an L: the longer axis first. */
export function lPath(a: Tile, b: Tile): Tile[] {
  const out: Tile[] = [{ x: a.x, y: a.y }];
  const dx = Math.sign(b.x - a.x);
  const dy = Math.sign(b.y - a.y);
  let x = a.x;
  let y = a.y;
  const horizontalFirst = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  if (horizontalFirst) {
    while (x !== b.x) out.push({ x: (x += dx), y });
    while (y !== b.y) out.push({ x, y: (y += dy) });
  } else {
    while (y !== b.y) out.push({ x, y: (y += dy) });
    while (x !== b.x) out.push({ x: (x += dx), y });
  }
  return out;
}

/** Appends the L-path from the path's last tile to `to` (skipping the repeated start). */
export function extendPath(path: readonly Tile[], to: Tile): Tile[] {
  const last = path[path.length - 1];
  if (!last) return [{ x: to.x, y: to.y }];
  if (last.x === to.x && last.y === to.y) return [...path];
  return [...path, ...lPath(last, to).slice(1)];
}
