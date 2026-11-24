// Minimal observable value, shared by the Phaser side and the Preact UI.

import { useEffect, useState } from 'preact/hooks';

export class Obs<T> {
  private subs = new Set<(v: T) => void>();

  constructor(private v: T) {}

  get value(): T {
    return this.v;
  }

  set(v: T): void {
    if (Object.is(v, this.v)) return;
    this.v = v;
    for (const fn of [...this.subs]) fn(v);
  }

  /** Calls fn on every change (not immediately). Returns an unsubscribe. */
  subscribe(fn: (v: T) => void): () => void {
    this.subs.add(fn);
    return () => this.subs.delete(fn);
  }
}

/** Preact hook: re-render when the observable changes. */
export function useObs<T>(o: Obs<T>): T {
  const [, force] = useState(0);
  useEffect(() => o.subscribe(() => force((n) => n + 1)), [o]);
  return o.value;
}
