// Seeded RNG. The generator's entire state is a single uint32 held in
// GameState, so the whole simulation is reproducible from (seed, calls).

export interface RngState {
  seed: number;
  calls: number;
}

export function createRng(seed: number): RngState {
  return { seed: seed >>> 0, calls: 0 };
}

/** mulberry32 — small, fast, good enough for a dice prototype. */
function mulberry32(a: number): number {
  a = (a + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Advances the state in place and returns a float in [0, 1). */
export function next(state: RngState): number {
  state.seed = (state.seed + 0x6d2b79f5) >>> 0;
  state.calls += 1;
  return mulberry32(state.seed - 0x6d2b79f5);
}

export function chance(state: RngState, p: number): boolean {
  if (p <= 0) return false;
  if (p >= 1) return true;
  return next(state) < p;
}

export function pickWeighted(state: RngState, weights: number[]): number {
  let total = 0;
  for (const w of weights) total += w > 0 ? w : 0;
  if (total <= 0) {
    // Degenerate distribution: fall back to uniform rather than producing
    // an invalid state.
    return Math.floor(next(state) * weights.length) % weights.length;
  }
  let r = next(state) * total;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i] > 0 ? weights[i] : 0;
    if (r < w) return i;
    r -= w;
  }
  return weights.length - 1;
}
