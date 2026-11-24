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
  it('lawn spans 256..1280', () => {
    expect(LAWN_ORIGIN).toBe(256);
    expect(LAWN_END).toBe(1280);
    expect(GRID * TILE).toBe(1024);
  });
});

describe('inLawn', () => {
  it('accepts corners', () => {
    expect(inLawn(0, 0)).toBe(true);
    expect(inLawn(15, 15)).toBe(true);
    expect(inLawn(0, 15)).toBe(true);
  });
  it('rejects off-lawn and non-integers', () => {
    expect(inLawn(-1, 0)).toBe(false);
    expect(inLawn(16, 0)).toBe(false);
    expect(inLawn(0, 16)).toBe(false);
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
    expect(key(15, 0)).toBe(15);
    expect(key(0, 1)).toBe(16);
    expect(key(15, 15)).toBe(255);
  });
});

describe('tileToWorld / worldToTile', () => {
  it('maps tile centres', () => {
    expect(tileToWorld(0, 0)).toEqual({ x: 288, y: 288 });
    expect(tileToWorld(15, 15)).toEqual({ x: 1248, y: 1248 });
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
    expect(worldToTile(1279.999, 1279.999)).toEqual({ x: 15, y: 15 });
  });
  it('gives off-lawn coords outside the lawn', () => {
    expect(worldToTile(255, 300)).toEqual({ x: -1, y: 0 });
    expect(worldToTile(1280, 300)).toEqual({ x: 16, y: 0 });
    expect(worldToTile(0, 0)).toEqual({ x: -4, y: -4 });
  });
  it('pickTile returns null off the lawn', () => {
    expect(pickTile(100, 100)).toBeNull();
    expect(pickTile(1280, 1000)).toBeNull();
    expect(pickTile(1000, 1000)).toEqual({ x: 11, y: 11 });
  });
});

describe('edges', () => {
  it('has 60 unique edge tiles, all on the ring', () => {
    const ring = edgeTiles();
    expect(ring).toHaveLength(60);
    expect(new Set(ring.map((t) => key(t.x, t.y))).size).toBe(60);
    for (const t of ring) expect(isEdgeTile(t.x, t.y)).toBe(true);
  });
  it('edgeDistance is 0 on the ring and 7 in the middle', () => {
    expect(edgeDistance(0, 5)).toBe(0);
    expect(edgeDistance(15, 15)).toBe(0);
    expect(edgeDistance(2, 10)).toBe(2);
    expect(edgeDistance(7, 8)).toBe(7);
  });
  it('isEdgeTile is false inside and off the lawn', () => {
    expect(isEdgeTile(5, 5)).toBe(false);
    expect(isEdgeTile(-1, 0)).toBe(false);
  });
});
