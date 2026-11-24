import { describe, expect, it } from 'vitest';
import {
  GRID,
  LAWN_END,
  LAWN_ORIGIN,
  TILE,
  edgeDistance,
  edgeTiles,
  fromKey,
  inLawn,
  isEdgeTile,
  key,
  pickTile,
  tileOrigin,
  tileToWorld,
  worldToTile,
} from '@shared/grid';

describe('grid constants', () => {
  it('lawn spans 256..1792', () => {
    expect(LAWN_ORIGIN).toBe(256);
    expect(LAWN_END).toBe(1792);
    expect(GRID * TILE).toBe(1536);
  });
});

describe('inLawn', () => {
  it('accepts corners', () => {
    expect(inLawn(0, 0)).toBe(true);
    expect(inLawn(23, 23)).toBe(true);
    expect(inLawn(0, 23)).toBe(true);
  });
  it('rejects off-lawn and non-integers', () => {
    expect(inLawn(-1, 0)).toBe(false);
    expect(inLawn(24, 0)).toBe(false);
    expect(inLawn(0, 24)).toBe(false);
    expect(inLawn(1.5, 2)).toBe(false);
  });
});

describe('key / fromKey', () => {
  it('round-trips every tile', () => {
    for (let y = 0; y < GRID; y++)
      for (let x = 0; x < GRID; x++) expect(fromKey(key(x, y))).toEqual({ x, y });
  });
  it('is row-major', () => {
    expect(key(0, 0)).toBe(0);
    expect(key(23, 0)).toBe(23);
    expect(key(0, 1)).toBe(24);
    expect(key(23, 23)).toBe(575);
  });
});

describe('tileToWorld / worldToTile', () => {
  it('maps tile centres', () => {
    expect(tileToWorld(0, 0)).toEqual({ x: 288, y: 288 });
    expect(tileToWorld(23, 23)).toEqual({ x: 1760, y: 1760 });
    expect(tileOrigin(1, 2)).toEqual({ x: 320, y: 384 });
  });
  it('round-trips centres', () => {
    for (let y = 0; y < GRID; y++)
      for (let x = 0; x < GRID; x++) {
        const w = tileToWorld(x, y);
        expect(worldToTile(w.x, w.y)).toEqual({ x, y });
      }
  });
  it('handles tile borders: the top-left edge belongs to the tile', () => {
    expect(worldToTile(256, 256)).toEqual({ x: 0, y: 0 });
    expect(worldToTile(319.999, 319.999)).toEqual({ x: 0, y: 0 });
    expect(worldToTile(320, 320)).toEqual({ x: 1, y: 1 });
    expect(worldToTile(1791.999, 1791.999)).toEqual({ x: 23, y: 23 });
  });
  it('gives off-lawn coords outside the lawn', () => {
    expect(worldToTile(255, 300)).toEqual({ x: -1, y: 0 });
    expect(worldToTile(1792, 300)).toEqual({ x: 24, y: 0 });
    expect(worldToTile(0, 0)).toEqual({ x: -4, y: -4 });
  });
  it('pickTile returns null off the lawn', () => {
    expect(pickTile(100, 100)).toBeNull();
    expect(pickTile(1792, 1000)).toBeNull();
    expect(pickTile(1000, 1000)).toEqual({ x: 11, y: 11 });
  });
});

describe('edges', () => {
  it('has 92 unique edge tiles, all on the ring', () => {
    const ring = edgeTiles();
    expect(ring).toHaveLength(92);
    expect(new Set(ring.map((t) => key(t.x, t.y))).size).toBe(92);
    for (const t of ring) expect(isEdgeTile(t.x, t.y)).toBe(true);
  });
  it('edgeDistance is 0 on the ring and 11 in the middle', () => {
    expect(edgeDistance(0, 5)).toBe(0);
    expect(edgeDistance(23, 23)).toBe(0);
    expect(edgeDistance(2, 10)).toBe(2);
    expect(edgeDistance(11, 12)).toBe(11);
  });
  it('isEdgeTile is false inside and off the lawn', () => {
    expect(isEdgeTile(5, 5)).toBe(false);
    expect(isEdgeTile(-1, 0)).toBe(false);
  });
});
