import { FACES, FACE_STAT, type Face, type StatBlock } from './types.ts';
import { next, pickWeighted, type RngState } from './rng.ts';

export interface Distribution {
  weights: number[]; // index 0 => face 1
  probabilities: number[];
}

/**
 * Builds the sampling distribution from resolved stats plus any transient
 * per-roll weight pushes and sealed faces.
 *
 * Invariants enforced here:
 *   - no negative weight ever reaches the sampler
 *   - a fully-zeroed distribution falls back to uniform
 *   - probabilities always sum to 1
 */
export function buildDistribution(
  stats: StatBlock,
  opts: { sealedFace?: Face | null; weightPush?: Partial<Record<Face, number>> } = {},
): Distribution {
  const weights = FACES.map((f) => {
    let w = stats[FACE_STAT[f]];
    const push = opts.weightPush?.[f];
    if (push) w += push;
    if (opts.sealedFace === f) w = 0;
    return w > 0 ? w : 0;
  });

  let total = weights.reduce((a, b) => a + b, 0);
  let effective = weights;
  if (total <= 0) {
    effective = FACES.map(() => 1);
    total = FACES.length;
  }

  return {
    weights: effective,
    probabilities: effective.map((w) => w / total),
  };
}

export function sampleFace(rng: RngState, dist: Distribution): Face {
  return (pickWeighted(rng, dist.weights) + 1) as Face;
}

/** Samples avoiding a specific face. Falls through if it is the only face. */
export function sampleFaceExcluding(rng: RngState, dist: Distribution, exclude: Face): Face {
  const weights = dist.weights.slice();
  weights[exclude - 1] = 0;
  if (weights.every((w) => w <= 0)) return sampleFace(rng, dist);
  return (pickWeighted(rng, weights) + 1) as Face;
}

/**
 * Samples inside a restricted set of faces, keeping their relative weights.
 *
 * Prepared Roll narrows what the die may land on without flattening it: a
 * build that has pushed weight onto 5 and 6 still sees that weighting inside
 * the window it is given.
 */
export function sampleFaceAmong(rng: RngState, dist: Distribution, allowed: readonly Face[]): Face {
  if (allowed.length === 0) return sampleFace(rng, dist);
  const weights = dist.weights.map((w, i) => (allowed.includes((i + 1) as Face) ? w : 0));
  if (weights.every((w) => w <= 0)) return allowed[Math.floor(next(rng) * allowed.length)];
  return (pickWeighted(rng, weights) + 1) as Face;
}

/**
 * Draws `n` distinct faces for Prepared Roll's window.
 *
 * Uniform among the faces the die can still produce, deliberately. Drawing
 * the window by weight and then rolling inside it by weight applies the same
 * bias twice: a High Roller build measured 4.07 average face without the
 * keystone and 4.91 with it, an effect its wording promises nowhere and
 * large enough to make the keystone mandatory for that archetype. Uniform
 * here keeps the keystone what it says it is -- a constraint you can see --
 * while weight still decides which of the three actually lands. A sealed
 * face has no weight and so never appears.
 */
export function drawFaces(rng: RngState, dist: Distribution, n: number): Face[] {
  const pool = FACES.filter((f) => dist.weights[f - 1] > 0);
  const out: Face[] = [];
  const take = Math.min(n, pool.length);
  while (out.length < take) {
    const f = pool[Math.floor(next(rng) * pool.length)];
    if (!out.includes(f)) out.push(f);
  }
  return out.sort((a, b) => a - b);
}

export function expectedValue(dist: Distribution): number {
  return dist.probabilities.reduce((acc, p, i) => acc + p * (i + 1), 0);
}

export const OPPOSITE_FACE: Record<Face, Face> = { 1: 6, 2: 5, 3: 4, 4: 3, 5: 2, 6: 1 };
