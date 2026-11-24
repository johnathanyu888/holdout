// Texture keys and art scale for the baked assets (see scripts/bake-atlas.ts).

import { FOREST_MAX, FOREST_MIN, MAP_PX } from '@shared/grid';

/** Sprites in the atlases are baked at 2x of their SVG size. */
export const ART_SCALE = 2;
/** Part and structure SVGs draw one tile on a 96-unit canvas (art is 1.5x the 64px tile). */
export const ART_TILE_UNITS = 96;
/** Draw scale that makes a one-tile sprite exactly one tile (64 world px): 64 / (96 * 2) = 1/3. */
export const SPRITE_SCALE = 64 / (ART_TILE_UNITS * ART_SCALE);
/**
 * Parts, the house and the inlet draw a bit larger than their tile so they read at
 * phone zoom (their art leaves a margin inside the 96 canvas; this fills it).
 */
export const PART_SCALE = SPRITE_SCALE * 1.2;
/**
 * Wires and walls run edge to edge and join their neighbours. Texture filtering
 * softens a frame's outermost texel, which shows as a hairline gap between tiles,
 * so they draw ~2 texels larger and overlap their neighbours slightly.
 */
export const JOIN_SCALE = SPRITE_SCALE * (1 + 4 / (ART_TILE_UNITS * ART_SCALE));
/** Zombies draw larger than their hit circle so they read on a phone. */
export const ZOMBIE_SCALE = SPRITE_SCALE * 1.6;

/** Draw scale for an atlas frame placed on a tile. */
export function scaleFor(frame: string): number {
  return frame.startsWith('wire_') || frame.startsWith('wall_') ? JOIN_SCALE : PART_SCALE;
}

export const TEX = {
  parts: 'parts',
  structures: 'structures',
} as const;

export const ASSET_FILES = {
  parts: { image: 'assets/parts.png', json: 'assets/parts.json' },
  structures: { image: 'assets/structures.png', json: 'assets/structures.json' },
} as const;

/**
 * The base map is baked at 2x (4096 texels) and cut into a 3x3 grid of chunks.
 * Why 3x3: chunks stay under 2048 texels (safe on every mobile GPU) and are not
 * powers of two, so WebGL clamps at their edges instead of wrapping (Phaser
 * uses REPEAT for power-of-two textures, which bleeds the far edge into seams).
 * Neighbouring chunks overlap by MAP_OVERLAP texels to hide any remaining seam.
 * Shared by scripts/bake-atlas.ts and the client so both agree on the layout.
 */
export const MAP_SCALE = 2;
export const MAP_TEXELS = MAP_PX * MAP_SCALE;
export const MAP_CHUNKS = 3; // per side
export const MAP_OVERLAP = 2; // texels

export interface MapChunk {
  key: string;
  file: string;
  /** Texel rect in the 4096 bake. */
  left: number;
  top: number;
  width: number;
  height: number;
  /** World position of the chunk's top-left corner. */
  x: number;
  y: number;
}

/** Cuts a square of `texels` into n x n overlapping chunk rects. */
function grid(texels: number, n: number): { left: number; width: number }[] {
  const edge = (i: number) => Math.round((i * texels) / n);
  return Array.from({ length: n }, (_, i) => {
    const a = Math.max(0, edge(i) - MAP_OVERLAP);
    const b = Math.min(texels, edge(i + 1) + MAP_OVERLAP);
    return { left: a, width: b - a };
  });
}

/**
 * The MAP_PX map area (lawn + near forest), sharp at 2x. "map" chunks are the
 * ground (lawn, verge, bushes, rocks: no trees); "canopy" chunks are the trees
 * alone on transparency, drawn above the zombies so they come out from under them.
 */
export function mapChunks(prefix: 'map' | 'canopy' = 'map'): MapChunk[] {
  const g = grid(MAP_TEXELS, MAP_CHUNKS);
  const out: MapChunk[] = [];
  for (let cy = 0; cy < MAP_CHUNKS; cy++)
    for (let cx = 0; cx < MAP_CHUNKS; cx++) {
      const { left, width } = g[cx] as { left: number; width: number };
      const { left: top, width: height } = g[cy] as { left: number; width: number };
      out.push({
        key: `${prefix}_${cx}_${cy}`,
        file: `assets/${prefix}_${cx}_${cy}.webp`,
        left,
        top,
        width,
        height,
        x: left / MAP_SCALE,
        y: top / MAP_SCALE,
      });
    }
  return out;
}

export function canopyChunks(): MapChunk[] {
  return mapChunks('canopy');
}

/**
 * The generated outer forest ring (FOREST_MIN..FOREST_MAX), drawn under the map
 * chunks at half resolution: it's only on screen when zoomed out, and the game
 * shades it into dark woods (see WorldScene's vignette). Chunks the 2x map fully
 * covers are skipped. Texel rects are in the full ring bake.
 */
export const FAR_SCALE = 0.5;
export const FAR_CHUNKS = 3;

export function farChunks(): MapChunk[] {
  const texels = (FOREST_MAX - FOREST_MIN) * FAR_SCALE;
  const g = grid(texels, FAR_CHUNKS);
  const out: MapChunk[] = [];
  for (let cy = 0; cy < FAR_CHUNKS; cy++)
    for (let cx = 0; cx < FAR_CHUNKS; cx++) {
      const { left, width } = g[cx] as { left: number; width: number };
      const { left: top, width: height } = g[cy] as { left: number; width: number };
      const x = FOREST_MIN + left / FAR_SCALE;
      const y = FOREST_MIN + top / FAR_SCALE;
      const inside = x >= 0 && y >= 0 && x + width / FAR_SCALE <= MAP_PX && y + height / FAR_SCALE <= MAP_PX;
      if (inside) continue;
      out.push({ key: `far_${cx}_${cy}`, file: `assets/far_${cx}_${cy}.webp`, left, top, width, height, x, y });
    }
  return out;
}
