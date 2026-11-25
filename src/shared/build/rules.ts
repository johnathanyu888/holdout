// Build rules: what can go where, what it costs, and the edit operations.
// Pure functions over plain JSON, shared by the client (build mode) and the
// server (validating a submitted contraption). Every op returns a new
// Contraption (inputs are never mutated) or a reason it was refused.
//
// One thing per tile: house | part | wire | wall | the map's power inlet | a map machine | a rock.

import { type Tile, edgeDistance, inLawn } from '../grid';
import type { Contraption, PlacedPart, Rot, WallMaterial } from '../types/build';
import type { DayConfig, Materials } from '../types/day';
import { fixtureAt } from './fixtures';
import { obstacleWord, rockAt } from './rocks';

export const WIRE_COST = 1;
export const WALL_COST = 3;

export type Occupant =
  | { kind: 'empty' }
  | { kind: 'inlet' }
  | { kind: 'fixture'; index: number }
  | { kind: 'rock'; index: number }
  | { kind: 'house' }
  | { kind: 'part'; part: PlacedPart }
  | { kind: 'wire' }
  | { kind: 'wall'; material: WallMaterial };

export type Result = { ok: true; c: Contraption } | { ok: false; reason: string };

export interface Inventory {
  parts: Record<string, number>;
  materials: Materials;
}

const same = (a: Tile, x: number, y: number) => a.x === x && a.y === y;

export function occupantAt(day: DayConfig, c: Contraption, x: number, y: number): Occupant {
  if (same(day.inlet, x, y)) return { kind: 'inlet' };
  const fx = fixtureAt(day, x, y);
  if (fx >= 0) return { kind: 'fixture', index: fx };
  const rock = rockAt(day, x, y);
  if (rock >= 0) return { kind: 'rock', index: rock };
  if (c.house && same(c.house, x, y)) return { kind: 'house' };
  const part = c.parts.find((p) => same(p, x, y));
  if (part) return { kind: 'part', part };
  if (c.wires.some((w) => same(w, x, y))) return { kind: 'wire' };
  const wall = c.walls.find((w) => same(w, x, y));
  if (wall) return { kind: 'wall', material: wall.material };
  return { kind: 'empty' };
}

/** What's left to place: the day's kit and materials minus what the contraption uses. */
export function remaining(day: DayConfig, c: Contraption): Inventory {
  const parts: Record<string, number> = { ...day.kit };
  for (const p of c.parts) parts[p.type] = (parts[p.type] ?? 0) - 1;
  const materials: Materials = { ...day.materials };
  materials.wire -= c.wires.length * WIRE_COST;
  for (const w of c.walls) materials[w.material] -= WALL_COST;
  return { parts, materials };
}

function needEmpty(day: DayConfig, c: Contraption, x: number, y: number): string | null {
  if (!inLawn(x, y)) return 'Off the lawn';
  const o = occupantAt(day, c, x, y);
  if (o.kind === 'empty') return null;
  if (o.kind === 'inlet') return 'The power inlet is here';
  if (o.kind === 'fixture') return 'A machine is here';
  if (o.kind === 'rock') return `A ${obstacleWord(day, x, y)} is in the way`;
  return 'Tile occupied';
}

export function checkHouse(day: DayConfig, c: Contraption, x: number, y: number): string | null {
  if (!inLawn(x, y)) return 'Off the lawn';
  if (edgeDistance(x, y) < day.houseBand) return 'Too close to the edge';
  const o = occupantAt(day, c, x, y);
  if (o.kind === 'house') return null; // re-placing on itself is a no-op
  return o.kind === 'empty' ? null : o.kind === 'inlet' ? 'The power inlet is here' : 'Tile occupied';
}

export function placeHouse(day: DayConfig, c: Contraption, x: number, y: number): Result {
  const why = checkHouse(day, c, x, y);
  if (why) return { ok: false, reason: why };
  return { ok: true, c: { ...c, house: { x, y } } };
}

export function checkPart(day: DayConfig, c: Contraption, type: string, x: number, y: number): string | null {
  const why = needEmpty(day, c, x, y);
  if (why) return why;
  if ((remaining(day, c).parts[type] ?? 0) <= 0) return 'None left in the kit';
  return null;
}

export function placePart(
  day: DayConfig,
  c: Contraption,
  type: string,
  x: number,
  y: number,
  rot: Rot = 0,
  config?: Record<string, number>,
): Result {
  const why = checkPart(day, c, type, x, y);
  if (why) return { ok: false, reason: why };
  const part: PlacedPart = { id: c.nextId, type, x, y, rot, ...(config ? { config: { ...config } } : {}) };
  return { ok: true, c: { ...c, parts: [...c.parts, part], nextId: c.nextId + 1 } };
}

/** Can placed part `id` move to (x, y)? Its own tile counts as free. */
export function checkMovePart(day: DayConfig, c: Contraption, id: number, x: number, y: number): string | null {
  const part = c.parts.find((p) => p.id === id);
  if (!part) return 'No such part';
  if (part.x === x && part.y === y) return null;
  return needEmpty(day, c, x, y);
}

/** Moves a placed part (keeping its id, turn and settings) to another tile. */
export function movePart(day: DayConfig, c: Contraption, id: number, x: number, y: number): Result {
  const why = checkMovePart(day, c, id, x, y);
  if (why) return { ok: false, reason: why };
  return { ok: true, c: { ...c, parts: c.parts.map((p) => (p.id === id ? { ...p, x, y } : p)) } };
}

export function checkWire(day: DayConfig, c: Contraption, x: number, y: number): string | null {
  if (!inLawn(x, y)) return 'Off the lawn';
  const o = occupantAt(day, c, x, y);
  if (o.kind === 'wire') return null; // already wired: free
  if (o.kind !== 'empty') return o.kind === 'inlet' ? 'The power inlet is here' : 'Tile occupied';
  if (remaining(day, c).materials.wire < WIRE_COST) return 'Out of Wire';
  return null;
}

/**
 * Lays wire along a path. Tiles that already hold wire are free; occupied tiles
 * are skipped; laying stops when Wire runs out. Fails only if nothing new was laid
 * and the path wasn't all existing wire.
 */
export function placeWires(day: DayConfig, c: Contraption, path: readonly Tile[]): Result {
  let wires = c.wires;
  let wire = remaining(day, c).materials.wire;
  let laid = 0;
  let firstReason: string | null = null;
  let allExisting = path.length > 0;
  for (const t of path) {
    const o = occupantAt(day, { ...c, wires }, t.x, t.y);
    if (o.kind === 'wire') continue;
    allExisting = false;
    if (!inLawn(t.x, t.y) || o.kind !== 'empty') {
      firstReason ??= !inLawn(t.x, t.y) ? 'Off the lawn' : o.kind === 'inlet' ? 'The power inlet is here' : 'Tile occupied';
      continue;
    }
    if (wire < WIRE_COST) {
      firstReason ??= 'Out of Wire';
      break;
    }
    wires = [...wires, { x: t.x, y: t.y }];
    wire -= WIRE_COST;
    laid++;
  }
  if (laid === 0 && !allExisting) return { ok: false, reason: firstReason ?? 'Nothing to lay' };
  return { ok: true, c: laid ? { ...c, wires } : c };
}

export function checkWall(day: DayConfig, c: Contraption, material: WallMaterial, x: number, y: number): string | null {
  const why = needEmpty(day, c, x, y);
  if (why) return why;
  if (remaining(day, c).materials[material] < WALL_COST) return material === 'wood' ? 'Out of Wood' : 'Out of Stone';
  return null;
}

export function placeWall(day: DayConfig, c: Contraption, material: WallMaterial, x: number, y: number): Result {
  const why = checkWall(day, c, material, x, y);
  if (why) return { ok: false, reason: why };
  return { ok: true, c: { ...c, walls: [...c.walls, { x, y, material }] } };
}

/** Removes whatever the player placed on the tile (refunding it). The inlet can't be removed. */
export function eraseAt(day: DayConfig, c: Contraption, x: number, y: number): Result {
  const o = occupantAt(day, c, x, y);
  switch (o.kind) {
    case 'empty':
      return { ok: false, reason: 'Nothing here' };
    case 'inlet':
      return { ok: false, reason: "You can't remove the power inlet" };
    case 'fixture':
      return { ok: false, reason: "You can't remove a machine on the map" };
    case 'rock':
      return { ok: false, reason: obstacleWord(day, x, y) === 'tree' ? 'Tap the tree to cut it down' : 'Tap the rock to clear it' };
    case 'house':
      return { ok: true, c: { ...c, house: null } };
    case 'part':
      return { ok: true, c: { ...c, parts: c.parts.filter((p) => p.id !== o.part.id) } };
    case 'wire':
      return { ok: true, c: { ...c, wires: c.wires.filter((w) => !same(w, x, y)) } };
    case 'wall':
      return { ok: true, c: { ...c, walls: c.walls.filter((w) => !same(w, x, y)) } };
  }
}

export function rotatePart(c: Contraption, id: number, rot: Rot): Result {
  if (!c.parts.some((p) => p.id === id)) return { ok: false, reason: 'No such part' };
  return { ok: true, c: { ...c, parts: c.parts.map((p) => (p.id === id ? { ...p, rot } : p)) } };
}

export function configurePart(c: Contraption, id: number, config: Record<string, number>): Result {
  if (!c.parts.some((p) => p.id === id)) return { ok: false, reason: 'No such part' };
  return { ok: true, c: { ...c, parts: c.parts.map((p) => (p.id === id ? { ...p, config: { ...config } } : p)) } };
}

/**
 * Full validation of a contraption against a day (server-side check of a
 * submission, and a sanity check after loading a save). Returns the problems found.
 */
export function validate(day: DayConfig, c: Contraption): string[] {
  const problems: string[] = [];
  const seen = new Set<number>();
  const claim = (x: number, y: number, what: string) => {
    if (!inLawn(x, y)) return problems.push(`${what} off the lawn at ${x},${y}`);
    if (same(day.inlet, x, y)) return problems.push(`${what} on the inlet`);
    if (fixtureAt(day, x, y) >= 0) return problems.push(`${what} on a map machine`);
    if (rockAt(day, x, y) >= 0) return problems.push(`${what} on a rock`);
    const k = y * 1000 + x;
    if (seen.has(k)) problems.push(`two things on ${x},${y}`);
    seen.add(k);
  };
  if (c.house) {
    claim(c.house.x, c.house.y, 'house');
    if (edgeDistance(c.house.x, c.house.y) < day.houseBand) problems.push('house too close to the edge');
  }
  const ids = new Set<number>();
  for (const p of c.parts) {
    claim(p.x, p.y, p.type);
    if (ids.has(p.id)) problems.push(`duplicate part id ${p.id}`);
    ids.add(p.id);
    if (p.id >= c.nextId) problems.push(`part id ${p.id} >= nextId`);
  }
  for (const w of c.wires) claim(w.x, w.y, 'wire');
  for (const w of c.walls) claim(w.x, w.y, `${w.material} wall`);
  const inv = remaining(day, c);
  for (const [type, n] of Object.entries(inv.parts)) if (n < 0) problems.push(`too many ${type}`);
  for (const [m, n] of Object.entries(inv.materials)) if (n < 0) problems.push(`not enough ${m}`);
  return problems;
}
