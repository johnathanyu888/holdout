// The build store: the current Contraption plus undo/redo. All edits go through
// the shared build rules (src/shared/build/rules.ts); the store only keeps history
// and tells subscribers (renderer, UI, autosave) when the contraption changes.

import { type Result, remaining } from '@shared/build/rules';
import { type Contraption, emptyContraption } from '@shared/types/build';
import type { DayConfig } from '@shared/types/day';
import { Obs } from './observable';

const MAX_HISTORY = 100;

export class BuildStore {
  /** The current contraption (immutable: every edit makes a new object). */
  readonly contraption: Obs<Contraption>;
  private undoStack: Contraption[] = [];
  private redoStack: Contraption[] = [];
  /** Bumped on every history change, so the UI can refresh undo/redo buttons. */
  readonly historyVersion = new Obs(0);

  constructor(
    readonly day: DayConfig,
    initial: Contraption = emptyContraption(),
  ) {
    this.contraption = new Obs(initial);
  }

  get current(): Contraption {
    return this.contraption.value;
  }

  get inventory() {
    return remaining(this.day, this.current);
  }

  /**
   * Applies an edit. On success it becomes one undo step; on failure the
   * reason is returned and nothing changes.
   */
  apply(edit: (c: Contraption) => Result): string | null {
    const r = edit(this.current);
    if (!r.ok) return r.reason;
    this.commit(r.c);
    return null;
  }

  /** Replaces the contraption as one undo step (no rule check: caller validated it). */
  commit(next: Contraption): void {
    if (next === this.current) return;
    this.undoStack.push(this.current);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
    this.contraption.set(next);
    this.historyVersion.set(this.historyVersion.value + 1);
  }

  /** Loads a contraption with fresh history (restore a save, sandbox paste). */
  load(c: Contraption): void {
    this.undoStack = [];
    this.redoStack = [];
    this.contraption.set(c);
    this.historyVersion.set(this.historyVersion.value + 1);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.current);
    this.contraption.set(prev);
    this.historyVersion.set(this.historyVersion.value + 1);
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.current);
    this.contraption.set(next);
    this.historyVersion.set(this.historyVersion.value + 1);
  }
}
