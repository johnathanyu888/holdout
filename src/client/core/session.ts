// Global game session: the day, the build store, the phase and UI state.
// The Phaser world and the Preact UI both read and write it; the world scene
// registers the actions the UI calls (start raid, zoom...).

import { validate } from '@shared/build/rules';
import { covers } from '@shared/build/rocks';
import { demoDay, sandboxDay } from '@shared/demo/demoDay';
import type { InitResponse } from '@shared/types/api';
import type { Contraption, Rot } from '@shared/types/build';
import type { DayConfig } from '@shared/types/day';
import { type ApiClient, createApi, local } from './api';
import { Obs } from './observable';
import { PhaseClock } from './phaseClock';
import { MIN_LEFT_AFTER_BUY, type ShopItem, applyPurchases } from './shop';
import { BuildStore } from './store';

export type Mode = 'demo' | 'sandbox';
export type Phase = 'boot' | 'briefing' | 'build' | 'raid' | 'result';

/** Build tool ids: 'select', 'house', 'wire', 'erase', 'wall:wood', 'wall:stone', 'part:<type>'. */
export type ToolId = string;

export interface RaidResult {
  outcome: 'won' | 'lost';
  reason: 'cleared' | 'breach' | 'timeout';
  killed: number;
  spawned: number;
  seconds: number;
}

export interface RaidStatus {
  speed: 1 | 2 | 4;
  paused: boolean;
  seconds: number;
  alive: number;
  killed: number;
}

export interface Actions {
  startBuild(): void;
  startRaid(): void;
  /** Rotates the part about to be placed, or the selected placed part. */
  rotate(): void;
  backToBuild(): void;
  restart(): void;
  zoomBy(f: number): void;
  fit(): void;
  setSpeed(s: 1 | 2 | 4): void;
  togglePause(): void;
  sandboxSpawn(where: 'selected' | 'random'): void;
  /** Hotbar drag and drop: the pointer (page coords) is over this point; show the tool's preview there. */
  hoverAt(clientX: number, clientY: number): void;
  /** Hotbar drag and drop: dropped here; use the active tool on that tile (if it's on the lawn). */
  dropAt(clientX: number, clientY: number): void;
}

const noop = () => {};

function createSession() {
  const params = new URLSearchParams(location.search);
  const mode: Mode = params.has('sandbox') ? 'sandbox' : 'demo';
  const baseDay: DayConfig = mode === 'sandbox' ? sandboxDay : demoDay;
  // The player's own copy: Time Shop purchases add to its kit.
  const day: DayConfig = structuredClone(baseDay);
  // A reload starts the night completely fresh (no build, purchases, repairs or
  // spent time). Only the sandbox remembers its build across reloads.
  const restore = mode === 'sandbox';
  const boughtKey = `bought:${day.id}`;
  const bought0 = (restore && local.load<Record<string, number>>(boughtKey)) || {};
  applyPurchases(baseDay, day, bought0);
  const saveKey = `contraption:${day.id}`;
  const saved = restore ? local.load<Contraption>(saveKey) : null;
  const store = new BuildStore(day, saved && validate(day, saved).length === 0 ? saved : undefined);
  store.contraption.subscribe((c) => local.save(saveKey, c));

  const clock = new PhaseClock(day.buildSeconds);

  // Repaired map machines (fixture indices), saved like purchases.
  const repairedKey = `repaired:${day.id}`;
  const applyRepairs = (list: number[]) =>
    (day.fixtures ?? []).forEach((f, i) => (f.broken = (baseDay.fixtures?.[i]?.broken ?? false) && !list.includes(i)));
  const repaired0 = (restore && local.load<number[]>(repairedKey)) || [];
  applyRepairs(repaired0);
  const repaired = new Obs<number[]>(repaired0);
  repaired.subscribe((list) => {
    applyRepairs(list);
    local.save(repairedKey, list);
  });

  // Cleared rocks (tile keys "x,y"): gone from the player's copy of the day.
  const clearedKey = `cleared:${day.id}`;
  const applyCleared = (list: string[]) =>
    (day.obstacles = (baseDay.obstacles ?? []).filter((o) => !list.includes(`${o.x},${o.y}`)));
  const cleared0 = (restore && local.load<string[]>(clearedKey)) || [];
  applyCleared(cleared0);
  const cleared = new Obs<string[]>(cleared0);
  cleared.subscribe((list) => {
    applyCleared(list);
    local.save(clearedKey, list);
  });

  const bought = new Obs<Record<string, number>>(bought0);
  bought.subscribe((b) => {
    applyPurchases(baseDay, day, b);
    local.save(boughtKey, b);
  });

  return {
    api: createApi() as ApiClient,
    init: null as InitResponse | null,
    mode,
    baseDay,
    day,
    store,
    /** Time Shop purchases (counts per shop item id). */
    bought,
    /** Map machines the player has repaired (indices into day.fixtures). */
    repaired,
    /** Rocks the player has cleared ("x,y"). */
    cleared,
    shopOpen: new Obs(false),
    phase: new Obs<Phase>('boot'),
    clock,
    tool: new Obs<ToolId>('select'),
    rot: new Obs<Rot>(0),
    handMode: new Obs(false),
    /** Tile the select tool picked (sandbox spawns use it too). */
    selected: new Obs<{ x: number; y: number } | null>(null),
    /** Screen position of the selected tile's top centre (CSS px) and its size, for the floating part card. */
    selAnchor: new Obs<{ x: number; y: number; size: number } | null>(null),
    toast: new Obs<{ text: string; id: number } | null>(null),
    raid: new Obs<RaidStatus | null>(null),
    /** Raid clock in seconds, updated every frame (tenths), for a smoothly running timer. */
    raidTime: new Obs(0),
    /** 0..1: how close the nearest zombie is to the house during a raid (drives the danger effect). */
    danger: new Obs(0),
    /** Counts heartbeat thumps (the world scene times them; the night overlay pulses on each). */
    beat: new Obs(0),
    result: new Obs<RaidResult | null>(null),
    actions: {
      startBuild: noop,
      startRaid: noop,
      rotate: noop,
      backToBuild: noop,
      restart: noop,
      zoomBy: noop,
      fit: noop,
      setSpeed: noop,
      togglePause: noop,
      sandboxSpawn: noop,
      hoverAt: noop,
      dropAt: noop,
    } as Actions,
    /** Sandbox: draw the routes zombies would take to the house. */
    showPaths: new Obs(false),
  };
}

export const session = createSession();
export type Session = typeof session;

/** Repairs a broken map machine for its repair time off the Build clock (free in the sandbox). */
export function repairFixture(index: number): string | null {
  const f = session.day.fixtures?.[index];
  if (!f || !f.broken) return null;
  if (session.phase.value !== 'build') return 'You can only repair while building';
  if (session.mode === 'demo') {
    if (session.clock.left.value - f.repairSeconds < MIN_LEFT_AFTER_BUY) return 'Not enough time left';
    session.clock.spend(f.repairSeconds);
  }
  session.repaired.set([...session.repaired.value, index]);
  toast(`Repaired · −${Math.floor(f.repairSeconds / 60)}:${String(f.repairSeconds % 60).padStart(2, '0')}`);
  return null;
}

/** Clears the rock covering (x, y) for its clear time off the Build clock (free in the sandbox). */
export function clearRock(x: number, y: number): string | null {
  const r = (session.day.obstacles ?? []).find((o) => covers(o, x, y));
  if (!r) return null;
  if (session.phase.value !== 'build') return 'You can only clear rocks while building';
  if (session.mode === 'demo') {
    if (session.clock.left.value - r.clearSeconds < MIN_LEFT_AFTER_BUY) return 'Not enough time left';
    session.clock.spend(r.clearSeconds);
  }
  session.selected.set(null);
  session.cleared.set([...session.cleared.value, `${r.x},${r.y}`]);
  toast(`Rock cleared · −${Math.floor(r.clearSeconds / 60)}:${String(r.clearSeconds % 60).padStart(2, '0')}`);
  return null;
}

/** Buys one of a shop item with Build seconds. Returns why not, or null. */
export function buy(item: ShopItem): string | null {
  if (session.mode !== 'demo' || session.phase.value !== 'build') return 'The shop is open while you build';
  const left = session.clock.left.value;
  if (left - item.price < MIN_LEFT_AFTER_BUY) return 'Not enough time left';
  session.clock.spend(item.price);
  session.bought.set({ ...session.bought.value, [item.id]: (session.bought.value[item.id] ?? 0) + 1 });
  toast(`${item.label} bought · −${item.price}s`);
  return null;
}

let toastId = 0;
/** Shows a short message (e.g. why a placement was refused). */
export function toast(text: string): void {
  session.toast.set({ text, id: ++toastId });
}
