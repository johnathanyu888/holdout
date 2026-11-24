// Owns the world camera. Keeps a View (in CSS pixels) and applies it to the
// Phaser camera, which works in device pixels (the canvas is DPR-scaled).

import type Phaser from 'phaser';
import type { Point } from '@shared/grid';
import {
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
    this.screen = screen;
    this.dpr = dpr;
    if (this.fitted || wasLandscape !== isLandscape) this.fit();
    else this.set(this.view);
  }

  fit(): void {
    this.view = fittedView(this.screen);
    this.fitted = true;
    this.apply();
  }

  set(v: View): void {
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
    this.cam.setZoom(this.view.zoom * this.dpr);
    this.cam.centerOn(this.view.cx, this.view.cy);
  }
}
