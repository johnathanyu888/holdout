// Pure camera math: no Phaser. The camera is described by the world point at the
// centre of the screen and a zoom (screen px per world px).

import { LAWN_END, LAWN_ORIGIN, LAWN_PX, MAP_PX, type Point } from '@shared/grid';

export interface View {
  cx: number;
  cy: number;
  zoom: number;
}

export interface Screen {
  w: number;
  h: number;
}

/** The lawn plus a 64px margin each side, used for the fitted (overview) zoom. */
export const FIT_SPAN = LAWN_PX + 128; // 1664
export const MAX_ZOOM = 1.5; // 96 screen px per tile

/** Zoom at which the whole lawn (plus margin) fits the screen. */
export function fitZoom(s: Screen): number {
  return Math.min(s.w, s.h) / FIT_SPAN;
}

export function minZoom(s: Screen): number {
  return Math.min(fitZoom(s), MAX_ZOOM);
}

export function clampZoom(z: number, s: Screen): number {
  return Math.max(minZoom(s), Math.min(MAX_ZOOM, z));
}

/** A view showing the whole lawn, centred on it. */
export function fittedView(s: Screen): View {
  const mid = MAP_PX / 2;
  return { cx: mid, cy: mid, zoom: minZoom(s) };
}

/**
 * Keep the screen centre over the lawn, so the lawn can never leave the screen.
 * Also clamps zoom.
 */
export function clampView(v: View, s: Screen): View {
  const zoom = clampZoom(v.zoom, s);
  const cx = Math.max(LAWN_ORIGIN, Math.min(LAWN_END, v.cx));
  const cy = Math.max(LAWN_ORIGIN, Math.min(LAWN_END, v.cy));
  return { cx, cy, zoom };
}

export function screenToWorld(v: View, s: Screen, px: number, py: number): Point {
  return { x: v.cx + (px - s.w / 2) / v.zoom, y: v.cy + (py - s.h / 2) / v.zoom };
}

export function worldToScreen(v: View, s: Screen, wx: number, wy: number): Point {
  return { x: (wx - v.cx) * v.zoom + s.w / 2, y: (wy - v.cy) * v.zoom + s.h / 2 };
}

/** Zoom to `zoom` while keeping the world point under screen point (px, py) fixed. */
export function zoomAt(v: View, s: Screen, px: number, py: number, zoom: number): View {
  const anchor = screenToWorld(v, s, px, py);
  const z = clampZoom(zoom, s);
  return clampView(
    { cx: anchor.x - (px - s.w / 2) / z, cy: anchor.y - (py - s.h / 2) / z, zoom: z },
    s,
  );
}

/** Pan by a screen-space delta (dragging content with the finger). */
export function panBy(v: View, s: Screen, dxScreen: number, dyScreen: number): View {
  return clampView({ cx: v.cx - dxScreen / v.zoom, cy: v.cy - dyScreen / v.zoom, zoom: v.zoom }, s);
}

/**
 * Two-finger gesture: the world point that was under the start midpoint stays
 * under the current midpoint, and zoom scales by the finger-distance ratio.
 */
export function pinch(
  start: View,
  s: Screen,
  startMid: Point,
  startDist: number,
  mid: Point,
  dist: number,
): View {
  const anchor = screenToWorld(start, s, startMid.x, startMid.y);
  const z = clampZoom(start.zoom * (dist / Math.max(1, startDist)), s);
  return clampView({ cx: anchor.x - (mid.x - s.w / 2) / z, cy: anchor.y - (mid.y - s.h / 2) / z, zoom: z }, s);
}
