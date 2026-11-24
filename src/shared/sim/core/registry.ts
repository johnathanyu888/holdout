// Part and zombie registries. Each file in sim/parts/ and sim/zombies/ calls
// registerPart / registerZombie at import; sim/index.ts imports them all with
// import.meta.glob, so adding a part never edits a shared list.

import type { PartDef, ZombieDef } from './types';

const parts = new Map<string, PartDef>();
const zombies = new Map<string, ZombieDef>();

export function registerPart(def: PartDef): PartDef {
  if (parts.has(def.type)) throw new Error(`part registered twice: ${def.type}`);
  parts.set(def.type, def);
  return def;
}

export function registerZombie(def: ZombieDef): ZombieDef {
  if (zombies.has(def.type)) throw new Error(`zombie registered twice: ${def.type}`);
  zombies.set(def.type, def);
  return def;
}

export function partDef(type: string): PartDef {
  const d = parts.get(type);
  if (!d) throw new Error(`unknown part type: ${type}`);
  return d;
}

export function hasPartDef(type: string): boolean {
  return parts.has(type);
}

export function zombieDef(type: string): ZombieDef {
  const d = zombies.get(type);
  if (!d) throw new Error(`unknown zombie type: ${type}`);
  return d;
}

/** All registered parts, sorted by type for a stable order. */
export function allPartDefs(): PartDef[] {
  return [...parts.values()].sort((a, b) => a.type.localeCompare(b.type));
}

export function allZombieDefs(): ZombieDef[] {
  return [...zombies.values()].sort((a, b) => a.type.localeCompare(b.type));
}
