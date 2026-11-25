// The briefing draft: each day gives everyone the same small base kit and the
// same rounds of two offers (left or right, like a draft mode). Each pick adds
// its offer to the kit. Same offers for everyone keeps the day fair to compare.

import type { Materials } from '../types/day';

/** What one card gives: parts and/or materials. */
export interface DraftOffer {
  parts?: Record<string, number>;
  materials?: Partial<Materials>;
}

export interface Draft {
  /** What you start with before any pick (so no draft leaves you with nothing to wire up). */
  base: { kit: Record<string, number>; materials: Materials };
  /** Rounds of [left, right]. */
  rounds: [DraftOffer, DraftOffer][];
}

/** 0 = took the left card, 1 = the right one. */
export type Pick = 0 | 1;

/**
 * The kit after these picks (the first picks.length rounds). Part types keep a
 * stable order: base first, then in the order the rounds first offer them.
 */
export function draftedKit(draft: Draft, picks: readonly Pick[]): { kit: Record<string, number>; materials: Materials } {
  const order: string[] = [...Object.keys(draft.base.kit)];
  for (const r of draft.rounds) for (const o of r) for (const t of Object.keys(o.parts ?? {})) if (!order.includes(t)) order.push(t);
  const counts: Record<string, number> = { ...draft.base.kit };
  const materials: Materials = { ...draft.base.materials };
  picks.forEach((p, i) => {
    const offer = draft.rounds[i]?.[p];
    if (!offer) return;
    for (const [t, n] of Object.entries(offer.parts ?? {})) counts[t] = (counts[t] ?? 0) + n;
    for (const [m, n] of Object.entries(offer.materials ?? {})) materials[m as keyof Materials] += n ?? 0;
  });
  const kit: Record<string, number> = {};
  for (const t of order) if ((counts[t] ?? 0) > 0) kit[t] = counts[t] as number;
  return { kit, materials };
}

/** Every kit has at least one battery, whatever the day's draft or fixed kit says. */
export function withBattery(kit: Record<string, number>): Record<string, number> {
  return (kit.battery ?? 0) >= 1 ? kit : { battery: 1, ...kit };
}
