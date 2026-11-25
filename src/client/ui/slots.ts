// The hotbar's slots, in order. Number keys 1..9, 0 pick them (WorldScene).
// There's no Select slot: with no tool active the world selects whatever you tap,
// and placement tools select a placed part when you tap it.

import type { DayConfig } from '@shared/types/day';

export function hotbarTools(day: DayConfig, mode: 'demo' | 'sandbox' = 'demo'): string[] {
  return [
    // The sandbox gets an explicit Select slot (the demo selects with no tool active).
    ...(mode === 'sandbox' ? ['select'] : []),
    'erase',
    'house',
    ...Object.keys(day.kit).map((t) => `part:${t}`),
    'wire',
    ...(day.materials.wood > 0 ? ['wall:wood'] : []),
    ...(day.materials.stone > 0 ? ['wall:stone'] : []),
  ];
}

/** Hotbar key for slot i: 1..9 then 0. */
export function slotKey(i: number): string {
  return String((i + 1) % 10);
}
