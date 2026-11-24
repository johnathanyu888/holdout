// Runs the sim at a fixed 10 steps/s under a variable frame rate:
//
//   acc += min(dt, 100) * speed          // clamp: no spiral of death after a hidden tab
//   while (acc >= 100) { step(sim); acc -= 100 }
//   render with alpha = acc / 100        // interpolate between the last two steps
//
// Keeps a snapshot every second so the replay can scrub.

import { createSim, type SimEvent, type SimOptions, type SimState, snapshot, step } from '@shared/sim';
import type { Contraption } from '@shared/types/build';
import type { DayConfig } from '@shared/types/day';

export const STEP_MS = 100;
const MAX_FRAME_MS = 100;
const SNAPSHOT_EVERY = 10;

export class RaidRunner {
  readonly sim: SimState;
  speed: 1 | 2 | 4 = 1;
  paused = false;
  private acc = 0;
  readonly snapshots: SimState[] = [];

  constructor(day: DayConfig, c: Contraption, opts?: SimOptions) {
    this.sim = createSim(day, c, opts);
    this.snapshots.push(snapshot(this.sim));
  }

  get done(): boolean {
    return this.sim.outcome !== 'running';
  }

  /** Fraction of the way between the previous step and the current one. */
  get alpha(): number {
    return this.done ? 1 : this.acc / STEP_MS;
  }

  /** Advance by a frame's worth of time; returns the events of every step taken. */
  update(dtMs: number): SimEvent[] {
    if (this.paused || this.done) return [];
    this.acc += Math.min(dtMs, MAX_FRAME_MS) * this.speed;
    const events: SimEvent[] = [];
    while (this.acc >= STEP_MS && !this.done) {
      events.push(...step(this.sim));
      this.acc -= STEP_MS;
      if (this.sim.tick % SNAPSHOT_EVERY === 0) this.snapshots.push(snapshot(this.sim));
    }
    return events;
  }
}
