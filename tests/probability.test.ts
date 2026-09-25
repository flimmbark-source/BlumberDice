import { describe, expect, it } from 'vitest';
import { buildDistribution, expectedValue, sampleFace } from '../src/engine/dice.ts';
import { createRng, pickWeighted } from '../src/engine/rng.ts';
import { currentDistribution, createGame, faceProbabilities } from '../src/engine/game.ts';
import { makeBuild, runManualRolls } from '../src/engine/sim.ts';
import { BASE_STATS, FACES, type Face, type StatBlock } from '../src/engine/types.ts';

const stats = (over: Partial<StatBlock> = {}): StatBlock => ({ ...BASE_STATS, ...over });

describe('distribution construction', () => {
  it('normalises to 1', () => {
    const d = buildDistribution(stats({ w6: 3.5, w1: 0.2 }));
    const sum = d.probabilities.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 12);
  });

  it('is uniform with no modifiers', () => {
    const d = buildDistribution(stats());
    for (const p of d.probabilities) expect(p).toBeCloseTo(1 / 6, 12);
    expect(expectedValue(d)).toBeCloseTo(3.5, 12);
  });

  it('clamps negative weights to zero rather than producing a negative probability', () => {
    const d = buildDistribution(stats({ w3: -5 }));
    expect(d.probabilities[2]).toBe(0);
    expect(d.probabilities.every((p) => p >= 0)).toBe(true);
    expect(d.probabilities.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it('falls back to uniform when every weight is removed', () => {
    const d = buildDistribution(stats({ w1: 0, w2: 0, w3: 0, w4: 0, w5: 0, w6: 0 }));
    for (const p of d.probabilities) expect(p).toBeCloseTo(1 / 6, 12);
  });

  it('redistributes a sealed face across the rest', () => {
    const d = buildDistribution(stats(), { sealedFace: 1 });
    expect(d.probabilities[0]).toBe(0);
    for (let i = 1; i < 6; i++) expect(d.probabilities[i]).toBeCloseTo(1 / 5, 12);
  });

  it('never samples a zero-weight face', () => {
    const rng = createRng(4242);
    const d = buildDistribution(stats(), { sealedFace: 6 });
    for (let i = 0; i < 5000; i++) expect(sampleFace(rng, d)).not.toBe(6);
  });

  it('pickWeighted stays in range for a degenerate distribution', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const idx = pickWeighted(rng, [0, 0, 0, 0, 0, 0]);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(6);
    }
  });
});

describe('seeded sampling', () => {
  it('is reproducible for the same seed', () => {
    const a = runManualRolls(makeBuild({ seed: 555 }), 200);
    const b = runManualRolls(makeBuild({ seed: 555 }), 200);
    expect(a.state.stats.faceCounts).toEqual(b.state.stats.faceCounts);
    expect(a.state.score).toBe(b.state.score);
  });

  it('differs for different seeds', () => {
    const a = runManualRolls(makeBuild({ seed: 1 }), 400);
    const b = runManualRolls(makeBuild({ seed: 2 }), 400);
    expect(a.state.stats.faceCounts).not.toEqual(b.state.stats.faceCounts);
  });

  it('produces a fair long-run distribution with no modifiers', () => {
    const r = runManualRolls(makeBuild({ seed: 31337 }), 60000);
    const n = r.resolvedRolls;
    for (const f of FACES) {
      const observed = r.state.stats.faceCounts[f] / n;
      expect(observed).toBeGreaterThan(1 / 6 - 0.012);
      expect(observed).toBeLessThan(1 / 6 + 0.012);
    }
    expect(r.averageFace).toBeGreaterThan(3.43);
    expect(r.averageFace).toBeLessThan(3.57);
  });

  it('shifts the long-run mean upward for a High Roller build', () => {
    const plain = runManualRolls(makeBuild({ seed: 8080 }), 20000);
    const high = runManualRolls(
      makeBuild({ seed: 8080, nodes: ['hr_edge', 'hr_heavy6', 'hr_floor'] }), 20000,
    );
    expect(high.averageFace).toBeGreaterThan(plain.averageFace + 0.4);
  });
});

describe('reported probabilities match the sampler', () => {
  it('agrees with observed frequencies for a weighted build', () => {
    const s = makeBuild({ seed: 606, nodes: ['hr_edge', 'hr_heavy6'] });
    const reported = faceProbabilities(s);
    const r = runManualRolls(s, 40000);
    for (const f of FACES) {
      const observed = r.state.stats.faceCounts[f] / r.resolvedRolls;
      expect(Math.abs(observed - reported[f])).toBeLessThan(0.012);
    }
  });

  it('is identical under both frameworks for the same build', () => {
    const nodes = ['hr_edge', 'hr_heavy6', 'vl_quick'];
    const a = makeBuild({ seed: 11, nodes });
    const b = makeBuild({ seed: 11, nodes, framework: 'B', startingScore: 1000 });
    expect(currentDistribution(b).probabilities).toEqual(currentDistribution(a).probabilities);
  });
});

describe('probability modifiers cannot create invalid states', () => {
  it('survives a build that strips weight from several faces', () => {
    const s = createGame(99);
    // Heavy Six twice over plus a seal: face 3 goes deeply negative.
    s.allocated.push('hr_heavy6');
    s.sealedFace = 6;
    const d = currentDistribution(s);
    expect(d.probabilities.every((p) => p >= 0 && p <= 1)).toBe(true);
    expect(d.probabilities.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    const rng = createRng(1);
    for (let i = 0; i < 2000; i++) {
      const f = sampleFace(rng, d) as Face;
      expect(FACES).toContain(f);
      expect(f).not.toBe(6);
    }
  });
});
