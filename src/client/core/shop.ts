// The Time Shop: spend seconds off the Build clock for extra parts and materials.
// Purchases add to the day's kit (session.day is the player's own copy), are
// saved with the build, and are not part of undo history (so undo can't refund
// a purchase and redo can't repeat one for free).

import type { DayConfig } from '@shared/types/day';

export interface ShopItem {
  id: string;
  label: string;
  /** Icon file name (assets/icons/<icon>.svg). */
  icon: string;
  /** Seconds off the Build clock. */
  price: number;
  give: { part: string; n: number } | { material: 'wire' | 'wood' | 'stone'; n: number };
  blurb: string;
}

export const SHOP: ShopItem[] = [
  { id: 'saw_blade', label: 'Saw blade', icon: 'saw_blade', price: 35, give: { part: 'saw_blade', n: 1 }, blurb: '60 damage a second' },
  { id: 'spike_floor', label: 'Spike floor', icon: 'spike_floor', price: 25, give: { part: 'spike_floor', n: 1 }, blurb: 'Punches on every tick' },
  { id: 'pressure_plate', label: 'Pressure plate', icon: 'pressure_plate', price: 18, give: { part: 'pressure_plate', n: 1 }, blurb: 'Power while stepped on' },
  { id: 'tripwire', label: 'Tripwire', icon: 'tripwire', price: 15, give: { part: 'tripwire', n: 1 }, blurb: 'A tick when crossed' },
  { id: 'delay', label: 'Delay', icon: 'delay', price: 15, give: { part: 'delay', n: 1 }, blurb: 'Waits, then passes on' },
  { id: 'wire', label: 'Wire ×10', icon: 'wire', price: 20, give: { material: 'wire', n: 10 }, blurb: 'Ten more wire tiles' },
  { id: 'wood', label: 'Wood ×3', icon: 'wood', price: 15, give: { material: 'wood', n: 3 }, blurb: 'One more wood wall' },
];

/** Buying can't take the Build clock below this many seconds. */
export const MIN_LEFT_AFTER_BUY = 5;

/** Can anything on sale still be bought with this much time left? */
export function canAffordAny(items: ShopItem[], left: number): boolean {
  return items.some((i) => left - i.price >= MIN_LEFT_AFTER_BUY);
}

/** The day's kit with `bought` (counts per shop item id) added to the base day. */
export function applyPurchases(base: DayConfig, into: DayConfig, bought: Record<string, number>): void {
  into.kit = { ...base.kit };
  into.materials = { ...base.materials };
  for (const item of SHOP) {
    const times = bought[item.id] ?? 0;
    if (!times) continue;
    const g = item.give;
    if ('part' in g) into.kit[g.part] = (into.kit[g.part] ?? 0) + g.n * times;
    else into.materials[g.material] += g.n * times;
  }
}

/** Items on sale for a day: parts that are in its kit, plus materials it uses. */
export function shopFor(day: DayConfig): ShopItem[] {
  return SHOP.filter((i) => ('part' in i.give ? i.give.part in day.kit : i.give.material === 'wire' || day.materials[i.give.material] > 0));
}
