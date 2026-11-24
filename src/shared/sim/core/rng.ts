// Deterministic PRNG: sfc32 seeded from a string via cyrb128. The state is a
// plain object so the whole sim state can be structuredClone'd for snapshots.
// Integer-only maths (Math.imul, shifts): identical on every JS engine.

export interface RngState {
  a: number;
  b: number;
  c: number;
  d: number;
}

export function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

export function seedRng(seed: string): RngState {
  const [a, b, c, d] = cyrb128(seed);
  const s: RngState = { a, b, c, d };
  for (let i = 0; i < 15; i++) nextU32(s); // warm up
  return s;
}

/** Next uint32 (sfc32). */
export function nextU32(s: RngState): number {
  s.a >>>= 0;
  s.b >>>= 0;
  s.c >>>= 0;
  s.d >>>= 0;
  let t = (s.a + s.b) | 0;
  s.a = s.b ^ (s.b >>> 9);
  s.b = (s.c + (s.c << 3)) | 0;
  s.c = (s.c << 21) | (s.c >>> 11);
  s.d = (s.d + 1) | 0;
  t = (t + s.d) | 0;
  s.c = (s.c + t) | 0;
  return t >>> 0;
}

/** Float in [0, 1). */
export function nextFloat(s: RngState): number {
  return nextU32(s) / 4294967296;
}

/** Integer in [min, max], inclusive. */
export function nextInt(s: RngState, min: number, max: number): number {
  return min + Math.floor(nextFloat(s) * (max - min + 1));
}

/** Index picked with the given non-negative weights. */
export function pickWeighted(s: RngState, weights: readonly number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = nextFloat(s) * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i] ?? 0;
    if (r < 0) return i;
  }
  return weights.length - 1;
}

/** Fisher-Yates shuffle in place. */
export function shuffle<T>(s: RngState, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = nextInt(s, 0, i);
    [arr[i], arr[j]] = [arr[j] as T, arr[i] as T];
  }
  return arr;
}
