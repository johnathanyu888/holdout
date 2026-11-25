// Sim entry point. Importing this registers every part and zombie in
// ./parts and ./zombies (one file each, picked up automatically).

import.meta.glob('./parts/*.ts', { eager: true });
import.meta.glob('./zombies/*.ts', { eager: true });

export { createSim, step, snapshot, hashState, powerPreview, blinkerFloods, partInput, spawnZombie, WALL_HP } from './core/sim';
export type { SimOptions } from './core/sim';
export { buildSchedule } from './core/spawn';
export { allPartDefs, allZombieDefs, hasPartDef, partDef, zombieDef } from './core/registry';
export { FIELD_INF } from './core/pathing';
export type { SimEvent } from './core/events';
export * from './core/types';
