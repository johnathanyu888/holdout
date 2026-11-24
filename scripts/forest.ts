// Widens the wilderness map's forest so the camera can zoom out on any screen
// shape without showing past the trees.
//
// The map's forest is three tiers of trees; each tier is four parallel <g>
// layers (shadow, outline, base, highlight) with one line per tree, so tree i of
// a tier is line i of each of its four layers. New trees are copies of existing
// ones from the same tier (all four layers, moved together), placed on a
// jittered grid in a ring around the original MAP_PX canvas. The original map is
// kept as-is and unclipped, so its edge trees continue into the new ring.

import { FOREST_MAX, FOREST_MIN, MAP_PX } from '../src/shared/grid';
import { nextFloat, nextInt, seedRng } from '../src/shared/sim/core/rng';

interface Tier {
  /** Line index (in the file) of each layer's opening <g>. */
  open: number[];
  /** Line index of each layer's closing </g>. */
  close: number[];
  /** trees[layer][i] = the line for tree i in that layer. */
  trees: string[][];
  /** Anchor (centre) of tree i, from its outline line. */
  anchors: { x: number; y: number }[];
}

/** Grid spacing per tier (world px): roughly the original forest's density. */
const SPACING = [104, 168, 300];
const SHADOW_OPEN = /^\s*<g fill="#16301A" opacity="[.\d]+">\s*$/;
const TRANSLATE = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/;

function findTiers(lines: string[]): Tier[] {
  const tiers: Tier[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!SHADOW_OPEN.test(lines[i] as string)) continue;
    const tier: Tier = { open: [], close: [], trees: [], anchors: [] };
    let j = i;
    for (let layer = 0; layer < 4; layer++) {
      while (j < lines.length && !/^\s*<g[\s>]/.test(lines[j] as string)) j++;
      tier.open.push(j);
      const trees: string[] = [];
      j++;
      while (j < lines.length && !/^\s*<\/g>\s*$/.test(lines[j] as string)) {
        if ((lines[j] as string).trim()) trees.push(lines[j] as string);
        j++;
      }
      tier.close.push(j);
      tier.trees.push(trees);
      j++;
    }
    const n = tier.trees[0]?.length ?? 0;
    if (tier.trees.some((t) => t.length !== n)) throw new Error(`forest tier at line ${i + 1}: layers differ in size`);
    tier.anchors = (tier.trees[1] as string[]).map((line, k) => {
      const m = TRANSLATE.exec(line);
      if (!m) throw new Error(`forest tier at line ${i + 1}: tree ${k} has no translate()`);
      return { x: Number(m[1]), y: Number(m[2]) };
    });
    tiers.push(tier);
    i = j - 1;
  }
  if (tiers.length === 0) throw new Error('no forest tiers found in the map');
  return tiers;
}

/** Returns the wide map SVG (viewBox FOREST_MIN..FOREST_MAX, same world coords as the original). */
export function buildWideMap(svg: string): string {
  const lines = svg.split(/\r?\n/);
  const tiers = findTiers(lines);
  const rng = seedRng('holdout:forest-ring');
  const extra = new Map<number, string[]>(); // line index of a layer's </g> -> lines to insert before it

  tiers.forEach((tier, t) => {
    const step = SPACING[Math.min(t, SPACING.length - 1)] as number;
    const added: string[][] = [[], [], [], []];
    for (let gy = FOREST_MIN - step / 2; gy < FOREST_MAX + step / 2; gy += step)
      for (let gx = FOREST_MIN - step / 2; gx < FOREST_MAX + step / 2; gx += step) {
        const x = gx + nextFloat(rng) * step * 0.85;
        const y = gy + nextFloat(rng) * step * 0.85;
        const pick = nextInt(rng, 0, tier.anchors.length - 1);
        // Only the ring: the original canvas keeps its own hand-placed trees.
        if (x > 0 && x < MAP_PX && y > 0 && y < MAP_PX) continue;
        const a = tier.anchors[pick] as { x: number; y: number };
        const dx = (x - a.x).toFixed(1);
        const dy = (y - a.y).toFixed(1);
        for (let layer = 0; layer < 4; layer++)
          added[layer]?.push(`    <g transform="translate(${dx} ${dy})">${(tier.trees[layer]?.[pick] ?? '').trim()}</g>`);
      }
    tier.close.forEach((closeLine, layer) => extra.set(closeLine, added[layer] ?? []));
  });

  const out: string[] = [];
  lines.forEach((line, i) => {
    const add = extra.get(i);
    if (add) out.push(...add);
    out.push(line);
  });
  const span = FOREST_MAX - FOREST_MIN;
  let wide = out.join('\n');
  // New canvas size, and ground under the whole ring (the original only fills 0..2048).
  wide = wide.replace(
    new RegExp(`<svg([^>]*?)viewBox="0 0 ${MAP_PX} ${MAP_PX}"([^>]*?)width="${MAP_PX}" height="${MAP_PX}"([^>]*)>`),
    `<svg$1viewBox="${FOREST_MIN} ${FOREST_MIN} ${span} ${span}"$2width="${span}" height="${span}"$3>`,
  );
  if (!wide.includes(`viewBox="${FOREST_MIN} `)) throw new Error('could not resize the map canvas');
  wide = wide.replace(
    `<rect width="${MAP_PX}" height="${MAP_PX}" fill="#6DB042"/>`,
    `<rect x="${FOREST_MIN}" y="${FOREST_MIN}" width="${span}" height="${span}" fill="#6DB042"/>`,
  );
  return wide;
}

/**
 * Splits a map SVG into the ground (everything but the forest's tree tiers) and the
 * canopy (only the tree tiers: their shadows, outlines, bases and lit tops, on a
 * transparent background). The game draws the canopy above the zombies so they
 * walk out from under the trees.
 */
export function splitCanopy(svg: string): { ground: string; canopy: string } {
  const lines = svg.split(/\r?\n/);
  const tiers = findTiers(lines);
  const inTier = new Uint8Array(lines.length);
  for (const t of tiers) {
    const from = Math.min(...t.open);
    const to = Math.max(...t.close);
    for (let i = from; i <= to; i++) inTier[i] = 1;
  }
  const defsEnd = lines.findIndex((l) => l.trim() === '</defs>');
  if (defsEnd < 0) throw new Error('map has no </defs>');
  const ground: string[] = [];
  const canopy: string[] = [];
  lines.forEach((l, i) => {
    if (i <= defsEnd) {
      ground.push(l);
      canopy.push(l);
    } else if (inTier[i]) canopy.push(l);
    else ground.push(l);
  });
  canopy.push('</svg>');
  return { ground: ground.join('\n'), canopy: canopy.join('\n') };
}

/** The same SVG cropped to a world rectangle (content outside it is clipped). */
export function cropSvg(svg: string, x: number, y: number, w: number, h: number): string {
  return svg.replace(/<svg([^>]*?)viewBox="[^"]*"([^>]*?)width="\d+" height="\d+"([^>]*)>/, `<svg$1viewBox="${x} ${y} ${w} ${h}"$2width="${w}" height="${h}"$3>`);
}
