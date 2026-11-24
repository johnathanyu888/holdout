// Texture keys and art scale for the baked assets (see scripts/bake-atlas.ts).

/** Sprites in the atlases are baked at 2x; draw them at this scale. */
export const ART_SCALE = 2;
export const SPRITE_SCALE = 1 / ART_SCALE;

export const TEX = {
  parts: 'parts',
  structures: 'structures',
} as const;

export const ASSET_FILES = {
  parts: { image: 'assets/parts.png', json: 'assets/parts.json' },
  structures: { image: 'assets/structures.png', json: 'assets/structures.json' },
} as const;

/** The base map is baked at 2x and cut into a 2x2 grid of 2048px chunks (see bake-atlas). */
export const MAP_SCALE = 2;
export const MAP_CHUNKS = 2; // per side
export const MAP_CHUNK_WORLD = 1024; // world px covered by one chunk

export function mapChunks(): { key: string; file: string; x: number; y: number }[] {
  const out = [];
  for (let cy = 0; cy < MAP_CHUNKS; cy++)
    for (let cx = 0; cx < MAP_CHUNKS; cx++)
      out.push({
        key: `map_${cx}_${cy}`,
        file: `assets/map_${cx}_${cy}.webp`,
        x: cx * MAP_CHUNK_WORLD,
        y: cy * MAP_CHUNK_WORLD,
      });
  return out;
}
