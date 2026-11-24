// Build tools. Each turns router gestures (tap / drag on tiles) into store edits
// through the shared build rules, and describes its ghost preview.
//
//   select       the default (no hotbar slot): tap a tile to select it (rotate with R)
//                Placing tools also select a placed part when you tap it (auto-select).
//   house        tap to place or move the house
//   part:<type>  tap to place a part at the current rotation
//   wire         tap one tile, or drag an L-shaped path (one undo step)
//   wall:<mat>   tap, or drag a straight-ish line of walls (one undo step)
//   erase        tap or drag over things to remove them (refunds)

import { extendPath, lPath } from '@shared/build/path';
import {
  WALL_COST,
  checkHouse,
  checkPart,
  checkWall,
  eraseAt,
  occupantAt,
  placeHouse,
  placePart,
  placeWall,
  placeWires,
} from '@shared/build/rules';
import { GRID, type Tile, key, worldToTile } from '@shared/grid';
import { hasPartDef, partDef } from '@shared/sim';
import type { Contraption, Rot, WallMaterial } from '@shared/types/build';
import type { DayConfig } from '@shared/types/day';
import { TEX } from '../core/assets';
import type { PointerInfo, ToolHandler } from '../core/input';
import type { BuildStore } from '../core/store';
import { maskOf, wallSprite, wireSprite } from '../render/autotile';
import type { Ghost, GhostTile } from '../render/ghost';
import { partView } from '../views/registry';

export interface BuildTool extends ToolHandler {
  readonly id: string;
  /** Preview for the tile under the pointer (and any drag in progress). */
  ghost(hover: Tile | null): Ghost | null;
}

export interface ToolEnv {
  day: DayConfig;
  store: BuildStore;
  rot(): Rot;
  select(t: Tile | null): void;
  toast(text: string): void;
  /** Put the active tool away (back to tap-to-select). */
  putAway(): void;
}

export function createTool(id: string, env: ToolEnv): BuildTool {
  if (id === 'house') return houseTool(env);
  if (id === 'wire') return wireTool(env);
  if (id === 'erase') return eraseTool(env);
  if (id.startsWith('wall:')) return wallTool(env, id.slice(5) as WallMaterial);
  if (id.startsWith('part:')) return partTool(env, id.slice(5));
  return selectTool(env);
}

function report(env: ToolEnv, reason: string | null): void {
  if (reason) env.toast(reason);
}

/**
 * Auto-select: a placing tool tapped on a placed part opens its card instead of
 * refusing to place there. Returns true if it did.
 */
function autoSelect(env: ToolEnv, t: Tile): boolean {
  const k = occupantAt(env.day, env.store.current, t.x, t.y).kind;
  if (k !== 'part') return false;
  env.select(t);
  return true;
}

function selectTool(env: ToolEnv): BuildTool {
  return {
    id: 'select',
    capturesDrag: false,
    onTap: (p) => env.select(p.tile),
    ghost: () => null,
  };
}

function houseTool(env: ToolEnv): BuildTool {
  return {
    id: 'house',
    capturesDrag: false,
    onTap: (p) => {
      if (!p.tile || autoSelect(env, p.tile)) return;
      report(env, env.store.apply((c) => placeHouse(env.day, c, p.tile!.x, p.tile!.y)));
    },
    ghost: (t) =>
      t && {
        tiles: [
          { ...t, tex: TEX.structures, frame: 'home', angle: 0, valid: !checkHouse(env.day, env.store.current, t.x, t.y) },
        ],
      },
  };
}

function partTool(env: ToolEnv, type: string): BuildTool {
  const frame = partView(type).frame ?? type;
  const angle = () => (hasPartDef(type) && partDef(type).rotatable ? env.rot() * 90 : 0);
  return {
    id: `part:${type}`,
    capturesDrag: false,
    onTap: (p) => {
      if (!p.tile || autoSelect(env, p.tile)) return;
      // Used the last one: the next tap just puts the tool away.
      if ((env.store.inventory.parts[type] ?? 0) <= 0) return env.putAway();
      const cfg = hasPartDef(type) ? partDef(type).defaultConfig : undefined;
      report(env, env.store.apply((c) => placePart(env.day, c, type, p.tile!.x, p.tile!.y, env.rot(), cfg)));
    },
    ghost: (t) =>
      t && {
        tiles: [
          { ...t, tex: TEX.parts, frame, angle: angle(), valid: !checkPart(env.day, env.store.current, type, t.x, t.y) },
        ],
      },
  };
}

/** Shared drag-path plumbing for wire / wall / erase. */
function pathTool(
  env: ToolEnv,
  id: string,
  opts: {
    /** How the drag extends: wires follow the finger, walls snap to one L from the start. */
    follow: boolean;
    commit(path: Tile[]): string | null;
    preview(path: Tile[], c: Contraption): GhostTile[];
    /** Nothing left to lay: a tap puts the tool away instead. */
    outOfStock?(): boolean;
  },
): BuildTool {
  let path: Tile[] | null = null;
  let start: Tile | null = null;
  const clamp = (t: Tile): Tile => ({ x: Math.max(0, Math.min(GRID - 1, t.x)), y: Math.max(0, Math.min(GRID - 1, t.y)) });
  const tileOf = (p: PointerInfo): Tile | null => p.tile;
  return {
    id,
    capturesDrag: true,
    onTap: (p) => {
      if (!p.tile) return;
      if (id !== 'erase' && autoSelect(env, p.tile)) return;
      if (opts.outOfStock?.()) return env.putAway();
      report(env, opts.commit([p.tile]));
    },
    onDragStart: (p) => {
      const t = tileOf(p);
      start = t;
      path = t ? [t] : null;
    },
    onDragMove: (p) => {
      // Off the lawn mid-drag: keep following along the nearest edge tile.
      const raw = p.tile ?? (start ? clamp(worldToTile(p.world.x, p.world.y)) : null);
      if (!raw) return;
      if (!start) {
        start = raw;
        path = [raw];
        return;
      }
      path = opts.follow ? extendPath(path ?? [start], raw) : lPath(start, raw);
    },
    onDragEnd: () => {
      if (path?.length) report(env, opts.commit(path));
      path = null;
      start = null;
    },
    onCancel: () => {
      path = null;
      start = null;
    },
    ghost: (hover) => {
      const c = env.store.current;
      if (path) return { tiles: opts.preview(path, c) };
      return hover ? { tiles: opts.preview([hover], c) } : null;
    },
  };
}

function wireTool(env: ToolEnv): BuildTool {
  return pathTool(env, 'wire', {
    follow: true,
    outOfStock: () => env.store.inventory.materials.wire <= 0,
    commit: (path) => env.store.apply((c) => placeWires(env.day, c, path)),
    preview: (path, c) => {
      // Simulate the placement so the preview shows the real joined shapes and where Wire runs out.
      const r = placeWires(env.day, c, path);
      const after = r.ok ? r.c : c;
      const wires = new Set(after.wires.map((w) => key(w.x, w.y)));
      const links = new Set([
        key(env.day.inlet.x, env.day.inlet.y),
        ...after.parts.map((p) => key(p.x, p.y)),
      ]);
      const linked = (x: number, y: number) => wires.has(key(x, y)) || links.has(key(x, y));
      return path.map((t) => {
        const valid = wires.has(key(t.x, t.y));
        const { frame, turns } = wireSprite(maskOf(t.x, t.y, linked));
        return { ...t, tex: TEX.parts, frame: valid ? frame : null, angle: turns * 90, valid };
      });
    },
  });
}

function wallTool(env: ToolEnv, material: WallMaterial): BuildTool {
  const placeAll = (c: Contraption, path: Tile[]): { c: Contraption; ok: Set<number>; reason: string | null } => {
    let cur = c;
    const ok = new Set<number>();
    let reason: string | null = null;
    for (const t of path) {
      const r = placeWall(env.day, cur, material, t.x, t.y);
      if (r.ok) {
        cur = r.c;
        ok.add(key(t.x, t.y));
      } else reason ??= r.reason;
    }
    return { c: cur, ok, reason };
  };
  return pathTool(env, `wall:${material}`, {
    follow: false,
    outOfStock: () => env.store.inventory.materials[material] < WALL_COST,
    commit: (path) => {
      const { c, ok, reason } = placeAll(env.store.current, path);
      if (ok.size) env.store.commit(c);
      return ok.size ? null : reason;
    },
    preview: (path, c) => {
      const { c: after, ok } = placeAll(c, path);
      const walls = new Set(after.walls.map((w) => key(w.x, w.y)));
      const has = (x: number, y: number) => walls.has(key(x, y));
      return path.map((t) => {
        const valid = ok.has(key(t.x, t.y)) || (path.length === 1 && !checkWall(env.day, c, material, t.x, t.y));
        return {
          ...t,
          tex: TEX.parts,
          frame: valid ? wallSprite(material, maskOf(t.x, t.y, has), t.x, t.y) : null,
          angle: 0,
          valid,
        };
      });
    },
  });
}

function eraseTool(env: ToolEnv): BuildTool {
  const eraseAll = (c: Contraption, path: Tile[]) => {
    let cur = c;
    let n = 0;
    let reason: string | null = null;
    for (const t of path) {
      const r = eraseAt(env.day, cur, t.x, t.y);
      if (r.ok) {
        cur = r.c;
        n++;
      } else reason ??= r.reason;
    }
    return { c: cur, n, reason };
  };
  return pathTool(env, 'erase', {
    follow: true,
    commit: (path) => {
      const { c, n, reason } = eraseAll(env.store.current, path);
      if (n) env.store.commit(c);
      // A single tap says why ("Nothing here", "You can't remove the power inlet"...).
      return n || path.length > 1 ? null : reason;
    },
    preview: (path, c) =>
      path.map((t) => {
        const o = occupantAt(env.day, c, t.x, t.y).kind;
        return { ...t, tex: TEX.parts, frame: null, angle: 0, valid: o !== 'empty' && o !== 'inlet' };
      }),
  });
}
