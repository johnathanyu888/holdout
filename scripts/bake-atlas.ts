// Bakes the SVG art into textures the game loads.
//   npm run bake            (skips when outputs are newer than every SVG)
//   npm run bake -- --force
//
// Outputs to src/client/public/assets/:
//   map_<x>_<y>.webp         the 2048 map area at 2x, in overlapping chunks (layout: client/core/assets.ts)
//   far_<x>_<y>.webp         the generated forest ring at 1x (scripts/forest.ts)
//   parts.png / parts.json   parts, wire pieces, walls, materials at 2x (Phaser JSON-hash atlas)
//   structures.png / .json   home, power inlet, entry edge at 2x
//
// Frames are keyed by file name without extension (e.g. "wall_wood_ew_a", "saw_blade").
// Sprites are baked at ART_SCALE (2x), so the game draws them at scale 1/2.

import { Resvg } from '@resvg/resvg-js';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { FAR_SCALE, MAP_SCALE, type MapChunk, farChunks, mapChunks } from '../src/client/core/assets';
import { FOREST_MAX, FOREST_MIN, MAP_PX } from '../src/shared/grid';
import { buildWideMap, cropSvg } from './forest';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ART = join(ROOT, 'art');
const OUT = join(ROOT, 'src/client/public/assets');
const ART_SCALE = 2;
const PAD = 2; // transparent gap between frames so filtering never bleeds
const MAX_W = 2048;

interface AtlasSpec {
  name: string;
  files: string[];
}

function svgsIn(dir: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.svg'))
    .sort()
    .map((f) => join(dir, f));
}

// Structures kept for the demo. Frozen Lake / Volcano terrain and salvage machines are cut.
const STRUCTURES = ['home', 'power_inlet', 'entry_edge'];

const atlases: AtlasSpec[] = [
  {
    name: 'parts',
    files: [
      ...svgsIn(join(ART, 'parts')),
      ...svgsIn(join(ART, 'parts/walls')),
      ...svgsIn(join(ART, 'materials')),
      ...svgsIn(join(ART, 'zombies')),
    ],
  },
  { name: 'structures', files: STRUCTURES.map((n) => join(ART, 'structures', `${n}.svg`)) },
];
const MAP_SVG = join(ART, 'maps/wilderness_map.svg');

function newestMtime(files: string[]): number {
  return Math.max(...files.map((f) => statSync(f).mtimeMs));
}

function outMtime(file: string): number {
  try {
    return statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

function rasterize(file: string, scale: number): { png: Buffer; w: number; h: number } {
  const svg = readFileSync(file, 'utf8');
  const r = new Resvg(svg, { fitTo: { mode: 'zoom', value: scale }, font: { loadSystemFonts: false } });
  const img = r.render();
  return { png: Buffer.from(img.asPng()), w: img.width, h: img.height };
}

interface Placed {
  name: string;
  png: Buffer;
  w: number;
  h: number;
  x: number;
  y: number;
}

/** Shelf packing: sort by height, fill rows left to right. */
function pack(items: Omit<Placed, 'x' | 'y'>[]): { placed: Placed[]; w: number; h: number } {
  const sorted = [...items].sort((a, b) => b.h - a.h || b.w - a.w || a.name.localeCompare(b.name));
  const placed: Placed[] = [];
  let x = PAD;
  let y = PAD;
  let rowH = 0;
  let usedW = 0;
  for (const it of sorted) {
    if (x + it.w + PAD > MAX_W) {
      x = PAD;
      y += rowH + PAD;
      rowH = 0;
    }
    placed.push({ ...it, x, y });
    x += it.w + PAD;
    rowH = Math.max(rowH, it.h);
    usedW = Math.max(usedW, x);
  }
  // WebGL handles non-power-of-two textures without mipmaps, so only round to 4px
  // instead of doubling GPU memory with a power-of-two height.
  const round4 = (n: number) => Math.ceil(n / 4) * 4;
  return { placed, w: round4(usedW), h: round4(y + rowH + PAD) };
}

async function bakeAtlas(spec: AtlasSpec, force: boolean): Promise<void> {
  const pngOut = join(OUT, `${spec.name}.png`);
  const jsonOut = join(OUT, `${spec.name}.json`);
  if (!force && Math.min(outMtime(pngOut), outMtime(jsonOut)) > newestMtime(spec.files)) {
    console.log(`  ${spec.name}: up to date`);
    return;
  }
  const items = spec.files.map((f) => ({ name: basename(f, '.svg'), ...rasterize(f, ART_SCALE) }));
  const names = new Set<string>();
  for (const it of items) {
    if (names.has(it.name)) throw new Error(`duplicate frame name: ${it.name}`);
    names.add(it.name);
  }
  const { placed, w, h } = pack(items);
  await sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(placed.map((p) => ({ input: p.png, left: p.x, top: p.y })))
    .png({ compressionLevel: 9 })
    .toFile(pngOut);
  const frames: Record<string, unknown> = {};
  for (const p of placed.sort((a, b) => a.name.localeCompare(b.name))) {
    frames[p.name] = {
      frame: { x: p.x, y: p.y, w: p.w, h: p.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: p.w, h: p.h },
      sourceSize: { w: p.w, h: p.h },
    };
  }
  const meta = { image: `${spec.name}.png`, size: { w, h }, scale: String(ART_SCALE), app: 'holdout bake-atlas' };
  writeFileSync(jsonOut, JSON.stringify({ frames, meta }, null, 1));
  console.log(`  ${spec.name}: ${placed.length} frames -> ${w}x${h}`);
}

// The map: the original SVG plus a generated forest ring (scripts/forest.ts).
//  - the 2048 map area at 2x (MAP_SCALE), so it stays sharp at max zoom
//  - the whole ring at FAR_SCALE (0.5x), drawn underneath; only seen zoomed out,
//    and the game shades it into dark woods
// Both come from the same wide SVG, so trees crossing the old canvas edge match.
// Chunk layouts live in the client's assets.ts so the game and this script agree.
async function bakeMap(force: boolean): Promise<void> {
  const near = mapChunks();
  const far = farChunks();
  const all = [...near, ...far];
  const outs = all.map((c) => join(OUT, basename(c.file)));
  const sig = JSON.stringify({
    v: 2,
    near: near.map((c) => [c.left, c.top, c.width, c.height]),
    far: far.map((c) => [c.left, c.top, c.width, c.height]),
    ring: [FOREST_MIN, FOREST_MAX],
  });
  const sigFile = join(OUT, 'map.layout.json');
  let same = false;
  try {
    same = readFileSync(sigFile, 'utf8') === sig;
  } catch {
    // no previous bake
  }
  const inputs = [MAP_SVG, join(ROOT, 'scripts/forest.ts')];
  if (!force && same && Math.min(...outs.map(outMtime)) > newestMtime(inputs)) {
    console.log('  map: up to date');
    return;
  }
  // Remove chunks from an older layout.
  for (const f of readdirSync(OUT))
    if (/^(map|far)(_\d+_\d+)?\.webp$/.test(f) && !outs.includes(join(OUT, f))) rmSync(join(OUT, f));

  const wide = buildWideMap(readFileSync(MAP_SVG, 'utf8'));
  const render = (svg: string, scale: number) => {
    const img = new Resvg(svg, { fitTo: { mode: 'zoom', value: scale }, font: { loadSystemFonts: false } }).render();
    return Buffer.from(img.asPng());
  };
  const cut = async (png: Buffer, chunks: MapChunk[], quality: number) => {
    let bytes = 0;
    for (const c of chunks) {
      const out = join(OUT, basename(c.file));
      await sharp(png)
        .extract({ left: c.left, top: c.top, width: c.width, height: c.height })
        .webp({ quality, effort: 6 })
        .toFile(out);
      bytes += statSync(out).size;
    }
    return bytes;
  };
  const nearBytes = await cut(render(cropSvg(wide, 0, 0, MAP_PX, MAP_PX), MAP_SCALE), near, 90);
  // The ring is mostly in the game's dark-woods shade, so lower quality is invisible.
  const farBytes = await cut(render(wide, FAR_SCALE), far, 80);
  writeFileSync(sigFile, sig);
  const kb = (n: number) => `${(n / 1024).toFixed(0)} KB`;
  console.log(
    `  map: ${near.length} chunks @${MAP_SCALE}x (${kb(nearBytes)}), ` +
      `forest ring: ${far.length} chunks @${FAR_SCALE}x (${kb(farBytes)})`,
  );
}

/** UI icons: the SVGs themselves, served as-is for crisp DOM images at any size. */
function copyIcons(): void {
  const dir = join(OUT, 'icons');
  mkdirSync(dir, { recursive: true });
  const files = [
    ...svgsIn(join(ART, 'parts')),
    ...svgsIn(join(ART, 'materials')),
    ...svgsIn(join(ART, 'zombies')),
    join(ART, 'structures/home.svg'),
    join(ART, 'structures/power_inlet.svg'),
    join(ART, 'parts/walls/wall_wood_ew_a.svg'),
    join(ART, 'parts/walls/wall_stone_ew_a.svg'),
  ];
  for (const f of files) copyFileSync(f, join(dir, basename(f)));
  console.log(`  icons: ${files.length} svgs`);
}

async function main(): Promise<void> {
  const force = process.argv.includes('--force');
  mkdirSync(OUT, { recursive: true });
  console.log('Baking art...');
  await bakeMap(force);
  for (const a of atlases) await bakeAtlas(a, force);
  copyIcons();
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
