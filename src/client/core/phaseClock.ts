// A countdown that pauses while the tab is hidden (so a phone in a pocket
// doesn't burn the Build clock). Time comes from performance.now.

import { Obs } from './observable';

export class PhaseClock {
  /** Seconds left, updated by tick(). */
  readonly left: Obs<number>;
  private lastNow: number | null = null;
  private running = false;
  private readonly onVisibility = () => {
    if (document.hidden) this.lastNow = null;
  };

  constructor(seconds: number) {
    this.left = new Obs(seconds);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  start(): void {
    this.running = true;
    this.lastNow = null;
  }

  stop(): void {
    this.running = false;
  }

  reset(seconds: number): void {
    this.left.set(seconds);
    this.lastNow = null;
  }

  /** Spend seconds (repairing a machine, clearing a rock). */
  spend(seconds: number): void {
    this.left.set(Math.max(0, this.left.value - seconds));
  }

  /** Call every frame. Returns true the frame it reaches 0. */
  tick(now = performance.now()): boolean {
    if (!this.running || document.hidden) {
      this.lastNow = null;
      return false;
    }
    if (this.lastNow !== null) {
      const before = this.left.value;
      const next = Math.max(0, before - (now - this.lastNow) / 1000);
      this.left.set(next);
      if (before > 0 && next === 0) {
        this.running = false;
        this.lastNow = now;
        return true;
      }
    }
    this.lastNow = now;
    return false;
  }

  destroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
  }
}
