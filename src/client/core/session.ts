// Global game session: the day, the build store, the phase and UI state.
// The Phaser world and the Preact UI both read and write it; the world scene
// registers the actions the UI calls (start raid, zoom...).

import { validate } from '@shared/build/rules';
import { demoDay, sandboxDay } from '@shared/demo/demoDay';
import type { InitResponse } from '@shared/types/api';
import type { Contraption, Rot } from '@shared/types/build';
import type { DayConfig } from '@shared/types/day';
import { type ApiClient, createApi, local } from './api';
import { Obs } from './observable';
import { PhaseClock } from './phaseClock';
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
}

const noop = () => {};

function createSession() {
  const params = new URLSearchParams(location.search);
  const mode: Mode = params.has('sandbox') ? 'sandbox' : 'demo';
  const day: DayConfig = mode === 'sandbox' ? sandboxDay : demoDay;
  const saveKey = `contraption:${day.id}`;
  const saved = local.load<Contraption>(saveKey);
  const store = new BuildStore(day, saved && validate(day, saved).length === 0 ? saved : undefined);
  store.contraption.subscribe((c) => local.save(saveKey, c));

  return {
    api: createApi() as ApiClient,
    init: null as InitResponse | null,
    mode,
    day,
    store,
    phase: new Obs<Phase>('boot'),
    clock: new PhaseClock(day.buildSeconds),
    tool: new Obs<ToolId>('select'),
    rot: new Obs<Rot>(0),
    handMode: new Obs(false),
    /** Tile the select tool picked (sandbox spawns use it too). */
    selected: new Obs<{ x: number; y: number } | null>(null),
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
    } as Actions,
  };
}

export const session = createSession();
export type Session = typeof session;

let toastId = 0;
/** Shows a short message (e.g. why a placement was refused). */
export function toast(text: string): void {
  session.toast.set({ text, id: ++toastId });
}
