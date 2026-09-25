import { FACES, FACE_STAT, type Face, type StatBlock } from './types.ts';
import { pickWeighted, type RngState } from './rng.ts';

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

export function expectedValue(dist: Distribution): number {
  return dist.probabilities.reduce((acc, p, i) => acc + p * (i + 1), 0);
}

export const OPPOSITE_FACE: Record<Face, Face> = { 1: 6, 2: 5, 3: 4, 4: 3, 5: 2, 6: 1 };
