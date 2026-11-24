// Picks wire and wall sprites from their neighbours.
// Masks use bits N = 1, E = 2, S = 4, W = 8.

export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

/** Rotates a mask a quarter turn clockwise (N -> E -> S -> W -> N). */
export function rotateMask(m: number): number {
  return ((m << 1) | (m >> 3)) & 15;
}

// Base pieces as drawn in art/parts/wire_*.svg (all from the west edge).
const WIRE_PIECES: [frame: string, mask: number][] = [
  ['wire_cross', N | E | S | W],
  ['wire_tee', W | E | S],
  ['wire_straight', W | E],
  ['wire_corner', W | S],
  ['wire_end', W],
];

/** Lookup: mask -> sprite + clockwise quarter turns. Built once. */
const WIRE_TABLE: { frame: string; turns: number }[] = (() => {
  const t: { frame: string; turns: number }[] = new Array(16);
  for (const [frame, base] of WIRE_PIECES) {
    let m = base;
    for (let turns = 0; turns < 4; turns++) {
      t[m] ??= { frame, turns };
      m = rotateMask(m);
    }
  }
  t[0] = { frame: 'wire_end', turns: 0 }; // lone tile: a stub
  return t;
})();

export function wireSprite(mask: number): { frame: string; turns: number } {
  return WIRE_TABLE[mask & 15] as { frame: string; turns: number };
}

/** "nesw" order side letters, or "post" when alone. */
export function wallSides(mask: number): string {
  const s = (mask & N ? 'n' : '') + (mask & E ? 'e' : '') + (mask & S ? 's' : '') + (mask & W ? 'w' : '');
  return s || 'post';
}

/** Wall sprite: piece from the neighbours, variant from the tile position. */
export function wallSprite(material: 'wood' | 'stone', mask: number, x: number, y: number): string {
  const variant = 'abc'[(y * 7 + x * 13) % 3];
  return `wall_${material}_${wallSides(mask)}_${variant}`;
}

/** Builds the 4-neighbour mask of (x, y) from a predicate. */
export function maskOf(x: number, y: number, has: (x: number, y: number) => boolean): number {
  return (has(x, y - 1) ? N : 0) | (has(x + 1, y) ? E : 0) | (has(x, y + 1) ? S : 0) | (has(x - 1, y) ? W : 0);
}
