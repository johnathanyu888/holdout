import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  clampView,
  coverZoom,
  fitZoom,
  fittedView,
  minZoom,
  panBy,
  pinch,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from '@client/core/viewMath';

const phone = { w: 390, h: 844 };
const laptop = { w: 1440, h: 900 };

const MIN = -768;
const MAX = 2304;

/** True if the whole screen shows scenery (no void past the forest's edge). */
function coversScreen(v: { cx: number; cy: number; zoom: number }, s: { w: number; h: number }): boolean {
  const tl = screenToWorld(v, s, 0, 0);
  const br = screenToWorld(v, s, s.w, s.h);
  const eps = 1e-6;
  return tl.x >= MIN - eps && tl.y >= MIN - eps && br.x <= MAX + eps && br.y <= MAX + eps;
}

/** True if the whole 16x16 lawn is on screen. */
function lawnVisible(v: { cx: number; cy: number; zoom: number }, s: { w: number; h: number }): boolean {
  const tl = worldToScreen(v, s, 256, 256);
  const br = worldToScreen(v, s, 1280, 1280);
  return tl.x >= -0.5 && tl.y >= -0.5 && br.x <= s.w + 0.5 && br.y <= s.h + 0.5;
}

const shapes = [phone, laptop, { w: 800, h: 800 }, { w: 375, h: 667 }, { w: 1920, h: 1080 }, { w: 2560, h: 1080 }];

describe('zoom limits', () => {
  it('never zooms or pans past the edge of the forest, on any screen shape', () => {
    for (const s of shapes) {
      expect(coversScreen(fittedView(s), s), `fitted ${s.w}x${s.h}`).toBe(true);
      for (const [cx, cy] of [[-5000, -5000], [5000, 5000], [1024, -5000], [-5000, 1024]] as const)
        expect(coversScreen(clampView({ cx, cy, zoom: 0.01 }, s), s), `${s.w}x${s.h} @ ${cx},${cy}`).toBe(true);
    }
  });
  it('phones and 16:9 screens can still zoom out to the whole lawn', () => {
    for (const s of [phone, laptop, { w: 375, h: 667 }, { w: 1920, h: 1080 }]) {
      // Tall phones may be held back a hair by the forest edge, but the lawn still fits.
      expect(minZoom(s), `${s.w}x${s.h}`).toBeLessThan(fitZoom(s) * 1.02);
      expect(lawnVisible(fittedView(s), s), `${s.w}x${s.h}`).toBe(true);
    }
    expect(fitZoom(phone) * 64).toBeCloseTo(22, 0);
  });
  it('very wide screens are held back by the forest edge', () => {
    const ultrawide = { w: 3840, h: 1080 };
    expect(coverZoom(ultrawide)).toBeGreaterThan(fitZoom(ultrawide));
    expect(minZoom(ultrawide)).toBeCloseTo(3840 / 3072);
  });
  it('zoomAt clamps to max and min zoom', () => {
    const v = fittedView(laptop);
    expect(zoomAt(v, laptop, 720, 450, 10).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(v, laptop, 720, 450, 0.01).zoom).toBe(minZoom(laptop));
  });
});

describe('zoomed-out view with HUD insets', () => {
  it('centres the lawn in the free area when the map edge allows it', () => {
    // Wide screen: the map fills the width exactly, leaving vertical room to shift.
    const s = { w: 1000, h: 600, insets: { top: 70, right: 0, bottom: 150, left: 0 } };
    const v = fittedView(s);
    const p = worldToScreen(v, s, 768, 768);
    expect(p.x).toBeCloseTo(500);
    expect(p.y).toBeCloseTo(70 + (600 - 70 - 150) / 2);
    expect(coversScreen(v, s)).toBe(true);
  });
  it('ignores insets that would leave almost no room', () => {
    const s = { w: 300, h: 300, insets: { top: 200, right: 0, bottom: 50, left: 0 } };
    expect(fitZoom(s)).toBeCloseTo(300 / 1152);
  });
});

describe('screen <-> world', () => {
  it('round-trips', () => {
    const v = { cx: 900, cy: 1100, zoom: 0.8 };
    const w = screenToWorld(v, laptop, 123, 456);
    const p = worldToScreen(v, laptop, w.x, w.y);
    expect(p.x).toBeCloseTo(123);
    expect(p.y).toBeCloseTo(456);
  });
  it('screen centre is the view centre', () => {
    const v = { cx: 700, cy: 800, zoom: 1 };
    expect(screenToWorld(v, laptop, 720, 450)).toEqual({ x: 700, y: 800 });
  });
});

describe('zoomAt', () => {
  it('keeps the point under the cursor fixed', () => {
    const v = { cx: 1024, cy: 1024, zoom: 0.8 };
    const before = screenToWorld(v, laptop, 700, 440);
    const v2 = zoomAt(v, laptop, 700, 440, 1.2);
    const after = screenToWorld(v2, laptop, 700, 440);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(v2.zoom).toBe(1.2);
  });
});

describe('clamping', () => {
  it('zoomed in: keeps the screen centre over the lawn', () => {
    const small = { w: 400, h: 300 };
    const v = clampView({ cx: -500, cy: 5000, zoom: 1.5 }, small);
    expect(v.cx).toBe(256);
    expect(v.cy).toBe(1280);
  });
  it('zoomed out: whichever is tighter, the forest edge or the lawn rule, wins', () => {
    const wide = { w: 2560, h: 1080 };
    const z = minZoom(wide); // half view ~1536 x 648 world px
    const v = clampView({ cx: -5000, cy: -5000, zoom: z }, wide);
    expect(v.cx).toBeCloseTo(-768 + 1280 / z); // forest edge (768) is tighter than the lawn (256)
    expect(v.cy).toBe(256); // lawn rule (256) is tighter than the forest edge (-120)
  });
  it('a too-far-out zoom is raised to the minimum and stays inside the forest', () => {
    const v = clampView({ cx: 0, cy: 2048, zoom: 0.1 }, phone);
    expect(v.zoom).toBeCloseTo(minZoom(phone));
    expect(coversScreen(v, phone)).toBe(true);
  });
  it('panBy moves content with the finger', () => {
    const v = { cx: 1000, cy: 1000, zoom: 0.8 };
    const v2 = panBy(v, laptop, 80, -40);
    expect(v2.cx).toBe(900);
    expect(v2.cy).toBe(1050);
  });
});

describe('pinch', () => {
  it('scaling the finger distance scales the zoom around the midpoint', () => {
    const v = { cx: 1024, cy: 1024, zoom: 0.75 };
    const mid = { x: 760, y: 470 };
    const anchor = screenToWorld(v, laptop, mid.x, mid.y);
    const v2 = pinch(v, laptop, mid, 100, mid, 180);
    expect(v2.zoom).toBeCloseTo(1.35);
    const after = screenToWorld(v2, laptop, mid.x, mid.y);
    expect(after.x).toBeCloseTo(anchor.x);
    expect(after.y).toBeCloseTo(anchor.y);
  });
  it('moving the midpoint pans', () => {
    const v = { cx: 1024, cy: 1024, zoom: 1 };
    const v2 = pinch(v, laptop, { x: 400, y: 300 }, 100, { x: 450, y: 300 }, 100);
    expect(v2.cx).toBeCloseTo(974);
    expect(v2.cy).toBeCloseTo(1024);
  });
});
