// Keeps the canvas sized to its container at device resolution (DPR capped at 2)
// so sprites and outlines stay crisp on phones. Scenes get the CSS size + DPR via
// the 'viewport' registry key and the VIEWPORT_EVENT game event.

import type Phaser from 'phaser';

export const VIEWPORT_EVENT = 'holdout:viewport';
export const MAX_DPR = 2;

export interface ViewportSize {
  /** CSS pixels. */
  w: number;
  h: number;
  dpr: number;
}

export function measure(container: HTMLElement): ViewportSize {
  const dpr = Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
  return {
    w: Math.max(1, Math.round(container.clientWidth)),
    h: Math.max(1, Math.round(container.clientHeight)),
    dpr,
  };
}

/** Sizes the game now and on every container resize / DPR change. */
export function trackViewport(game: Phaser.Game, container: HTMLElement): void {
  let last = '';
  const apply = () => {
    const s = measure(container);
    const sig = `${s.w}x${s.h}@${s.dpr}`;
    if (sig === last) return;
    last = sig;
    game.scale.resize(s.w * s.dpr, s.h * s.dpr);
    game.scale.setZoom(1 / s.dpr);
    game.registry.set('viewport', s);
    game.events.emit(VIEWPORT_EVENT, s);
  };
  new ResizeObserver(apply).observe(container);
  window.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('resize', apply);
  apply();
}
