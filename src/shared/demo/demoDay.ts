// The demo's one fixed day. Hand-authored data only; everything derived from it
// (spawn schedule, flow fields, power) is computed by the sim.
//
// Placeholder values to tune: inlet tile, kit, zombie count, par.

import type { DayConfig } from '../types/day';

export const demoDay: DayConfig = {
  id: 'demo-1',
  mutationName: 'Shamblers',
  mutationBlurb: 'Slow. Hungry. They come from every side.',
  inlet: { x: 10, y: 5 },
  houseBand: 2,
  kit: {
    pressure_plate: 4,
    tripwire: 3,
    delay: 2,
    saw_blade: 3,
    spike_floor: 3,
    piston: 2,
    latch: 1,
  },
  materials: { wire: 36, wood: 24, stone: 0 },
  buildSeconds: 240,
  raidMaxSeconds: 45,
  spawns: {
    seed: 'holdout:demo-1',
    zombies: [{ type: 'shambler', count: 16 }],
    firstStep: 10,
    groupGap: 25,
    groupMin: 2,
    groupMax: 3,
  },
  par: 1000,
  // A broken Tesla coil near the inlet: 2:00 of build time to bring it back.
  fixtures: [{ type: 'tesla_coil', x: 6, y: 8, rot: 0, broken: true, repairSeconds: 120 }],
  // Rocks bend the paths in; clearing one costs 0:30 of build time.
  obstacles: [
    { type: 'rock', x: 3, y: 5, clearSeconds: 30 },
    { type: 'rock', x: 12, y: 10, clearSeconds: 30 },
    { type: 'rock', x: 8, y: 13, clearSeconds: 30 },
    { type: 'rock', x: 13, y: 2, clearSeconds: 30 },
  ],
};

/** Sandbox: same map and inlet, effectively unlimited kit and materials, no clock pressure. */
export const sandboxDay: DayConfig = {
  ...demoDay,
  id: 'sandbox',
  mutationName: 'Sandbox',
  mutationBlurb: 'Unlimited parts. Spawn zombies by hand.',
  kit: Object.fromEntries(Object.keys(demoDay.kit).map((k) => [k, 999])),
  materials: { wire: 999, wood: 999, stone: 999 },
  buildSeconds: 99_999,
  raidMaxSeconds: 120,
  spawns: { ...demoDay.spawns, zombies: [] },
};
