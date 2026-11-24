import { readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { E, N, S, W, maskOf, rotateMask, wallSides, wallSprite, wireSprite } from '@client/render/autotile';

describe('wires', () => {
  it('rotates masks clockwise', () => {
    expect(rotateMask(N)).toBe(E);
    expect(rotateMask(W)).toBe(N);
    expect(rotateMask(W | S)).toBe(N | W);
  });
  it('maps every mask to a piece whose rotated base equals the mask', () => {
    const bases: Record<string, number> = {
      wire_cross: 15,
      wire_tee: W | E | S,
      wire_straight: W | E,
      wire_corner: W | S,
      wire_end: W,
    };
    for (let m = 1; m < 16; m++) {
      const { frame, turns } = wireSprite(m);
      let b = bases[frame]!;
      for (let i = 0; i < turns; i++) b = rotateMask(b);
      expect(b, `mask ${m}`).toBe(m);
    }
  });
  it('picks the obvious pieces', () => {
    expect(wireSprite(W | E)).toEqual({ frame: 'wire_straight', turns: 0 });
    expect(wireSprite(N | S)).toEqual({ frame: 'wire_straight', turns: 1 });
    expect(wireSprite(N)).toEqual({ frame: 'wire_end', turns: 1 });
    expect(wireSprite(0).frame).toBe('wire_end');
  });
});

describe('walls', () => {
  it('names sides in n-e-s-w order', () => {
    expect(wallSides(0)).toBe('post');
    expect(wallSides(E | W)).toBe('ew');
    expect(wallSides(N | E | S | W)).toBe('nesw');
    expect(wallSides(W | N)).toBe('nw');
  });
  it('every mask and variant has an art file', () => {
    const files = new Set(readdirSync('art/parts/walls').map((f) => f.replace('.svg', '')));
    for (const mat of ['wood', 'stone'] as const)
      for (let m = 0; m < 16; m++)
        for (let x = 0; x < 3; x++) expect(files.has(wallSprite(mat, m, x, 0)), wallSprite(mat, m, x, 0)).toBe(true);
  });
  it('maskOf reads the four neighbours', () => {
    const set = new Set(['5,4', '6,5']);
    expect(maskOf(5, 5, (x, y) => set.has(`${x},${y}`))).toBe(N | E);
  });
});
