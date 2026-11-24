// Events the sim emits each step. The renderer turns them into effects; the
// result/replay screens read them too. Add a variant by appending one line.

export type SimEvent =
  | { type: 'spawn'; id: number; zombieType: string; x: number; y: number }
  | { type: 'hit'; id: number; partId: number; amount: number; x: number; y: number }
  | { type: 'death'; id: number; partId: number; x: number; y: number }
  | { type: 'partFired'; partId: number }
  | { type: 'breach'; id: number }
  | { type: 'end'; outcome: 'won' | 'lost'; reason: 'cleared' | 'breach' | 'timeout' };
