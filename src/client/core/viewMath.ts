// Pure camera math: no Phaser. The camera is described by the world point at the
// centre of the screen and a zoom (screen px per world px).

import { FOREST_MAX, FOREST_MIN, LAWN_END, LAWN_ORIGIN, LAWN_PX, type Point } from '@shared/grid';

/** World size of the drawn scenery (map + generated forest ring). */
const SCENE_PX = FOREST_MAX - FOREST_MIN;
const LAWN_MID = LAWN_ORIGIN + LAWN_PX / 2;

export interface View {
  cx: number;
  cy: number;
  zoom: number;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Screen {
  w: number;
  h: number;
  /** Screen area covered by HUD panels; fitting keeps the lawn clear of it. */
  insets?: Insets;
}

/** The lawn plus a 64px margin each side, used for the fitted (overview) zoom. */
export const FIT_SPAN = LAWN_PX + 128; // 1664
export const MAX_ZOOM = 1.5; // 96 screen px per tile

/** The part of the screen not covered by HUD panels. */
function freeArea(s: Screen): { x: number; y: number; w: number; h: number } {
  const i = s.insets ?? { top: 0, right: 0, bottom: 0, left: 0 };
  const w = Math.max(1, s.w - i.left - i.right);
  const h = Math.max(1, s.h - i.top - i.bottom);
  // Insets too big for the screen (tiny window): ignore them.
  if (w < s.w * 0.4 || h < s.h * 0.4) return { x: 0, y: 0, w: s.w, h: s.h };
  return { x: i.left, y: i.top, w, h };
}

/** Zoom at which the whole lawn (plus margin) fits the free part of the screen. */
export function fitZoom(s: Screen): number {
  const a = freeArea(s);
  return Math.min(a.w, a.h) / FIT_SPAN;
}

/** Smallest zoom at which the scenery (out to the forest's edge) still covers the whole screen. */
export function coverZoom(s: Screen): number {
  return Math.max(s.w, s.h) / SCENE_PX;
}

/**
 * How far out you can zoom: far enough to see the whole lawn (fitZoom), but never
 * past the edge of the forest (coverZoom). The forest ring is wide enough that on
 * phones and 16:9 screens fitZoom wins; only very wide screens are held back.
 */
export function minZoom(s: Screen): number {
  return Math.min(Math.max(fitZoom(s), coverZoom(s)), MAX_ZOOM);
}

export function clampZoom(z: number, s: Screen): number {
  return Math.max(minZoom(s), Math.min(MAX_ZOOM, z));
}

/** Zoomed all the way out, the lawn's centre in the middle of the free part of the screen. */
export function fittedView(s: Screen): View {
  const mid = LAWN_MID;
  const zoom = minZoom(s);
  const a = freeArea(s);
  // Shift the view so the lawn's centre lands on the free area's centre.
  return clampView(
    {
      cx: mid + (s.w / 2 - (a.x + a.w / 2)) / zoom,
      cy: mid + (s.h / 2 - (a.y + a.h / 2)) / zoom,
      zoom,
    },
    s,
  );
}

/**
 * Clamp one axis of the view centre: keep the screen centre over the lawn (so the
 * lawn never leaves the screen) and never show past the forest's edge. If the
 * scenery is smaller than the screen on this axis, keep it fully on screen.
 */
function clampAxis(c: number, half: number): number {
  const lo = Math.max(LAWN_ORIGIN, FOREST_MIN + half);
  const hi = Math.min(LAWN_END, FOREST_MAX - half);
  if (lo <= hi) return Math.max(lo, Math.min(hi, c));
  return Math.max(FOREST_MAX - half, Math.min(FOREST_MIN + half, c));
}

/** Clamps zoom, then the centre (see clampAxis). */
export function clampView(v: View, s: Screen): View {
  const zoom = clampZoom(v.zoom, s);
  return { cx: clampAxis(v.cx, s.w / 2 / zoom), cy: clampAxis(v.cy, s.h / 2 / zoom), zoom };
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
