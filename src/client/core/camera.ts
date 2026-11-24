// Owns the world camera. Keeps a View (in CSS pixels) and applies it to the
// Phaser camera, which works in device pixels (the canvas is DPR-scaled).

import type Phaser from 'phaser';
import type { Point } from '@shared/grid';
import {
  type Insets,
  type Screen,
  type View,
  clampView,
  fittedView,
  panBy,
  pinch,
  screenToWorld,
  zoomAt,
} from './viewMath';

export class CameraController {
  private view: View;
  private screen: Screen;
  /** True until the player moves the camera; a fitted camera re-fits on resize. */
  private fitted = true;
  private anim: { from: View; t0: number; ms: number } | null = null;
  private punchAmp = 0;
  private punchT0 = 0;
  private punchNow = 0;
  private lastNow = 0;

  constructor(
    private readonly cam: Phaser.Cameras.Scene2D.Camera,
    screen: Screen,
    private dpr: number,
  ) {
    this.screen = screen;
    this.view = fittedView(screen);
    this.apply();
  }

  get current(): Readonly<View> {
    return this.view;
  }

  get size(): Readonly<Screen> {
    return this.screen;
  }

  /** Screen size changed (window resize, rotation, DPR change). */
  resize(screen: Screen, dpr: number): void {
    const wasLandscape = this.screen.w > this.screen.h;
    const isLandscape = screen.w > screen.h;
    this.screen = { ...screen, insets: screen.insets ?? this.screen.insets };
    this.dpr = dpr;
    if (this.fitted || wasLandscape !== isLandscape) this.fit();
    else this.set(this.view);
  }

  /** Screen area covered by HUD panels (fitting keeps the lawn clear of it). */
  setInsets(insets: Insets): void {
    const cur = this.screen.insets;
    if (
      cur &&
      cur.top === insets.top &&
      cur.bottom === insets.bottom &&
      cur.left === insets.left &&
      cur.right === insets.right
    )
      return;
    this.screen = { ...this.screen, insets };
    // HUD panels coming and going (the hotbar sliding in after the briefing):
    // ease to the new fit instead of jumping, so the view never looks resized.
    if (this.fitted) {
      if (this.lastNow > 0 && !this.anim) this.anim = { from: { ...this.view }, t0: this.lastNow, ms: 520 };
      else if (this.lastNow <= 0) this.fit();
    }
  }

  fit(): void {
    this.anim = null;
    this.view = fittedView(this.screen);
    this.fitted = true;
    this.apply();
  }

  /** Eases out to the fitted view over `ms` (driven by tick()). Any camera input cancels it. */
  fitSmooth(now: number, ms = 550): void {
    this.anim = { from: { ...this.view }, t0: now, ms };
    this.fitted = true;
  }

  /**
   * A heartbeat thump: the view kicks in by `amount` (fraction of the zoom) and
   * settles back over ~200ms. Visual only: the logical view (and input) is untouched.
   */
  punch(now: number, amount: number): void {
    this.punchAmp = amount;
    this.punchT0 = now;
  }

  /** Advances a running fitSmooth() and any punch; call every frame. */
  tick(now: number): void {
    this.lastNow = now;
    if (this.punchAmp) {
      const t = (now - this.punchT0) / 1000;
      // fast attack (~40ms), springy decay
      const env = t < 0.04 ? t / 0.04 : Math.exp(-(t - 0.04) * 14) * Math.cos((t - 0.04) * 18);
      this.punchNow = this.punchAmp * env;
      if (t > 0.45) this.punchAmp = this.punchNow = 0;
      if (!this.anim) this.apply();
    }
    const a = this.anim;
    if (!a) return;
    const to = fittedView(this.screen); // re-read: the HUD may change size mid-animation
    const k = Math.min(1, (now - a.t0) / a.ms);
    const e = 1 - (1 - k) ** 3;
    this.view = {
      cx: a.from.cx + (to.cx - a.from.cx) * e,
      cy: a.from.cy + (to.cy - a.from.cy) * e,
      zoom: a.from.zoom + (to.zoom - a.from.zoom) * e,
    };
    if (k >= 1) this.anim = null;
    this.apply();
  }

  set(v: View): void {
    this.anim = null;
    this.view = clampView(v, this.screen);
    this.fitted = false;
    this.apply();
  }

  panBy(dx: number, dy: number): void {
    this.set(panBy(this.view, this.screen, dx, dy));
  }

  zoomAt(px: number, py: number, zoom: number): void {
    this.set(zoomAt(this.view, this.screen, px, py, zoom));
  }

  /** Zoom by a factor around the screen centre (keyboard / buttons). */
  zoomBy(factor: number): void {
    this.zoomAt(this.screen.w / 2, this.screen.h / 2, this.view.zoom * factor);
  }

  pinch(start: View, startMid: Point, startDist: number, mid: Point, dist: number): void {
    this.set(pinch(start, this.screen, startMid, startDist, mid, dist));
  }

  /** World point under a CSS-pixel screen point. */
  toWorld(px: number, py: number): Point {
    return screenToWorld(this.view, this.screen, px, py);
  }

  private apply(): void {
    this.cam.setZoom(this.view.zoom * this.dpr * (1 + this.punchNow));
    this.cam.centerOn(this.view.cx, this.view.cy);
  }
}
