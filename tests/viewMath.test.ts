import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  clampView,
  fitZoom,
  fittedView,
  panBy,
  pinch,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from '@client/core/viewMath';

const phone = { w: 390, h: 844 };
const laptop = { w: 1440, h: 900 };

describe('fit zoom', () => {
  it('gives ~16px tiles on a phone and ~32px on a laptop', () => {
    expect(fitZoom(phone) * 64).toBeCloseTo(15, 0);
    expect(fitZoom(laptop) * 64).toBeCloseTo(34.6, 0);
  });
  it('fitted view is centred on the map', () => {
    expect(fittedView(phone)).toEqual({ cx: 1024, cy: 1024, zoom: fitZoom(phone) });
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
    const v = { cx: 1024, cy: 1024, zoom: 0.6 };
    const before = screenToWorld(v, laptop, 300, 200);
    const v2 = zoomAt(v, laptop, 300, 200, 1.2);
    const after = screenToWorld(v2, laptop, 300, 200);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
    expect(v2.zoom).toBe(1.2);
  });
  it('clamps to max and fit zoom', () => {
    const v = fittedView(laptop);
    expect(zoomAt(v, laptop, 720, 450, 10).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(v, laptop, 720, 450, 0.01).zoom).toBe(fitZoom(laptop));
  });
});

describe('clamping', () => {
  it('keeps the screen centre over the lawn', () => {
    const v = clampView({ cx: -500, cy: 5000, zoom: 1 }, laptop);
    expect(v.cx).toBe(256);
    expect(v.cy).toBe(1792);
  });
  it('panBy moves content with the finger', () => {
    const v = { cx: 1000, cy: 1000, zoom: 0.5 };
    const v2 = panBy(v, laptop, 100, -50);
    expect(v2.cx).toBe(800);
    expect(v2.cy).toBe(1100);
  });
});

describe('pinch', () => {
  it('doubling the finger distance doubles the zoom around the midpoint', () => {
    const v = { cx: 1024, cy: 1024, zoom: 0.5 };
    const mid = { x: 400, y: 300 };
    const anchor = screenToWorld(v, laptop, mid.x, mid.y);
    const v2 = pinch(v, laptop, mid, 100, mid, 200);
    expect(v2.zoom).toBeCloseTo(1);
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
