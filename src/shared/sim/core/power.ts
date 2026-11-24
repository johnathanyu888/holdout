// Power flood. Each source sends its signal into the wires next to it:
// a wire tile touching a source of strength S gets S - 1, and each further
// wire tile one less; at 0 the signal stops. Every tile keeps the highest
// strength that reaches it. Constant and tick power flood separately.
// A part receives the strongest wire next to it (parts don't conduct).

import { GRID, TILE_COUNT } from '../../grid';
import type { Layer, PowerIn } from './types';

export interface Source {
  /** Tile key (y * 24 + x). */
  k: number;
  layer: Layer;
  strength: number;
}

const MAX_STRENGTH = 15;

/** The up-to-4 orthogonal neighbour keys of tile k, in n, e, s, w order. */
export function neighbours4(k: number): number[] {
  const x = k % GRID;
  const y = (k - x) / GRID;
  const out: number[] = [];
  if (y > 0) out.push(k - GRID);
  if (x < GRID - 1) out.push(k + 1);
  if (y < GRID - 1) out.push(k + GRID);
  if (x > 0) out.push(k - 1);
  return out;
}

/** Floods one layer into `out` (cleared first). Bucket queue from the strongest down. */
export function floodLayer(wire: Uint8Array, sources: readonly Source[], out: Uint8Array): void {
  out.fill(0);
  const buckets: number[][] = Array.from({ length: MAX_STRENGTH + 1 }, () => []);
  const relax = (n: number, v: number) => {
    if (v > 0 && wire[n] && v > (out[n] ?? 0)) {
      out[n] = v;
      buckets[v]?.push(n);
    }
  };
  for (const s of sources) for (const n of neighbours4(s.k)) relax(n, Math.min(MAX_STRENGTH, s.strength) - 1);
  for (let v = MAX_STRENGTH; v > 0; v--) {
    const b = buckets[v] ?? [];
    for (let i = 0; i < b.length; i++) {
      const k = b[i] as number;
      if (out[k] !== v) continue; // superseded by a stronger route
      for (const n of neighbours4(k)) relax(n, v - 1);
    }
  }
}

export function flood(
  wire: Uint8Array,
  sources: readonly Source[],
  outC: Uint8Array,
  outT: Uint8Array,
): void {
  floodLayer(
    wire,
    sources.filter((s) => s.layer === 'c'),
    outC,
  );
  floodLayer(
    wire,
    sources.filter((s) => s.layer === 't'),
    outT,
  );
}

/** Strongest wire next to tile k, per layer. */
export function inputAt(k: number, powerC: Uint8Array, powerT: Uint8Array): PowerIn {
  let c = 0;
  let t = 0;
  for (const n of neighbours4(k)) {
    c = Math.max(c, powerC[n] ?? 0);
    t = Math.max(t, powerT[n] ?? 0);
  }
  return { c, t };
}

export function newPowerGrid(): Uint8Array {
  return new Uint8Array(TILE_COUNT);
}
