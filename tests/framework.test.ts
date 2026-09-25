import { describe, expect, it } from 'vitest';
import {
  canSwitchFramework, createGame, currentDistribution, drain, getBuild,
  manualRoll, switchFramework,
} from '../src/engine/game.ts';
import { makeBuild, runManualRolls } from '../src/engine/sim.ts';
import { resolveBuild } from '../src/engine/tree.ts';
import { buildDistribution } from '../src/engine/dice.ts';
import type { Face } from '../src/engine/types.ts';

/** Resolves exactly one roll with a forced face, bypassing sampling. */
function resolveFace(s: ReturnType<typeof createGame>, face: Face): void {
  s.cooldownRemaining = 0;
  manualRoll(s);
  s.pending[0].face = face;
  s.pending[0].stage = 'finalize';
  drain(s);
}

describe('Framework A', () => {
  it('grants Score equal to the rolled value for every face', () => {
    for (const face of [1, 2, 3, 4, 5, 6] as Face[]) {
      const s = createGame(1);
      resolveFace(s, face);
      expect(s.score).toBe(face);
      expect(s.meta).toBe(0);
    }
  });

  it('accumulates Score across rolls', () => {
    const s = createGame(2);
    resolveFace(s, 3);
    resolveFace(s, 6);
    resolveFace(s, 1);
    expect(s.score).toBe(10);
  });
});

describe('Framework B', () => {
  it('grants exactly one Meta per resolved roll regardless of value', () => {
    for (const face of [1, 2, 3, 4, 5, 6] as Face[]) {
      const s = makeBuild({ framework: 'B', startingScore: 100 });
      resolveFace(s, face);
      expect(s.meta).toBe(1);
    }
  });

  it('removes Score equal to the rolled value', () => {
    for (const face of [1, 2, 3, 4, 5, 6] as Face[]) {
      const s = makeBuild({ framework: 'B', startingScore: 100 });
      resolveFace(s, face);
      expect(s.score).toBe(100 - face);
    }
  });

  it('floors Score at zero and keeps granting Meta below the floor', () => {
    const s = makeBuild({ framework: 'B', startingScore: 4 });
    resolveFace(s, 6);
    expect(s.score).toBe(0);
    expect(s.meta).toBe(1);

    resolveFace(s, 6);
    expect(s.score).toBe(0);
    expect(s.meta).toBe(2);
  });

  it('produces no special event when Score reaches zero', () => {
    const s = makeBuild({ framework: 'B', startingScore: 3 });
    const before = {
      framework: s.framework,
      allocated: [...s.allocated],
      discovered: [...s.discovered],
      logLength: s.log.length,
    };
    resolveFace(s, 3);
    expect(s.score).toBe(0);
    // No framework change, no allocation change, no discovery, no log entry.
    expect(s.framework).toBe(before.framework);
    expect(s.allocated).toEqual(before.allocated);
    expect(s.discovered).toEqual(before.discovered);
    expect(s.log.length).toBe(before.logLength);
    expect(s.decision).toBeNull();
  });

  it('lets the player return to Framework A and earn Score again', () => {
    const s = makeBuild({ framework: 'B', startingScore: 2 });
    resolveFace(s, 6);
    expect(s.score).toBe(0);
    switchFramework(s);
    expect(s.framework).toBe('A');
    resolveFace(s, 5);
    expect(s.score).toBe(5);
  });

  it('never grants Meta scaled by the rolled value, in any build', () => {
    // Every Meta source other than the flat per-roll grant must come from an
    // explicit event effect, so Meta per resolved roll stays at 1 for builds
    // with no Meta-granting pattern nodes.
    const s = makeBuild({
      seed: 77,
      framework: 'B',
      startingScore: 100000,
      nodes: ['hr_edge', 'hr_heavy6', 'hr_climb', 'vl_quick', 'vl_echo', 'ct_second'],
    });
    const r = runManualRolls(s, 300);
    expect(r.metaEarned).toBe(r.resolvedRolls);
  });
});

describe('Framework switching', () => {
  it('requires discovery', () => {
    const s = createGame(3);
    expect(canSwitchFramework(s)).toBe(false);
    switchFramework(s);
    expect(s.framework).toBe('A');
  });

  it('keeps exactly one framework active', () => {
    const s = makeBuild({ framework: 'B' });
    expect(s.framework).toBe('B');
    switchFramework(s);
    expect(s.framework).toBe('A');
    switchFramework(s);
    expect(s.framework).toBe('B');
  });

  it('leaves the build, probability distribution and currencies untouched', () => {
    const nodes = ['hr_edge', 'hr_heavy6', 'vl_quick', 'pt_repeat', 'ct_second'];
    const s = makeBuild({ seed: 9, nodes });
    s.discovered.push('frameworkB');
    runManualRolls(s, 40);

    const allocBefore = [...s.allocated];
    const distBefore = currentDistribution(s).probabilities.slice();
    const flagsBefore = [...getBuild(s).flags].sort();
    const scoreBefore = s.score;
    const metaBefore = s.meta;
    const historyBefore = [...s.pattern.history];

    switchFramework(s);

    expect(s.allocated).toEqual(allocBefore);
    expect([...getBuild(s).flags].sort()).toEqual(flagsBefore);
    expect(currentDistribution(s).probabilities).toEqual(distBefore);
    expect(s.score).toBe(scoreBefore);
    expect(s.meta).toBe(metaBefore);
    expect(s.pattern.history).toEqual(historyBefore);
  });

  it('keeps the distribution the build produces, while clearing temporary pushes', () => {
    // Precise statement of the rule: nothing the passive web contributes to the
    // die changes across a switch. Temporary weight pushes are transient state
    // and go with the rest of it, unless Carryover is allocated.
    const nodes = ['hr_edge', 'hr_heavy6', 'hr_momentum', 'jp_longodds', 'jp_nearmiss'];

    const s = makeBuild({ seed: 17, nodes });
    s.discovered.push('frameworkB');
    runManualRolls(s, 200);
    // Guarantee a live push regardless of what the last roll happened to be.
    s.transient.weightPush.push({ face: 6, value: 1.5, expiresAt: s.totalRolls + 2 });

    const baseBefore = resolveBuild(new Set(s.allocated)).stats;
    const effectiveBefore = currentDistribution(s).probabilities.slice();
    switchFramework(s);
    const baseAfter = resolveBuild(new Set(s.allocated)).stats;

    expect(baseAfter).toEqual(baseBefore);
    expect(s.transient.weightPush).toEqual([]);
    // With the push gone the effective distribution is the base one again.
    expect(currentDistribution(s).probabilities).not.toEqual(effectiveBefore);
    expect(currentDistribution(s).probabilities)
      .toEqual(buildDistribution(baseBefore).probabilities);

    // Carryover keeps the push, so even the effective distribution is stable.
    const carried = makeBuild({ seed: 17, nodes: [...nodes, 'ad_carryover'] });
    carried.discovered.push('frameworkB');
    runManualRolls(carried, 200);
    carried.transient.weightPush.push({ face: 6, value: 1.5, expiresAt: carried.totalRolls + 2 });
    const carriedBefore = currentDistribution(carried).probabilities.slice();
    switchFramework(carried);
    expect(currentDistribution(carried).probabilities).toEqual(carriedBefore);
  });

  it('clears volatile streak state on a switch, and Carryover keeps it', () => {
    const base = ['hr_climb', 'jp_longodds', 'jp_hotstreak'];

    const plain = makeBuild({ seed: 21, nodes: base });
    plain.discovered.push('frameworkB');
    runManualRolls(plain, 60);
    plain.transient.climb = 3;
    plain.transient.counters.pressure = 12;
    switchFramework(plain);
    expect(plain.transient.climb).toBe(0);
    expect(plain.transient.counters.pressure).toBe(0);

    const carried = makeBuild({ seed: 21, nodes: [...base, 'ad_carryover'] });
    carried.discovered.push('frameworkB');
    runManualRolls(carried, 60);
    carried.transient.climb = 3;
    carried.transient.counters.pressure = 12;
    switchFramework(carried);
    expect(carried.transient.climb).toBe(3);
    expect(carried.transient.counters.pressure).toBe(12);
  });

  it('keeps stored control state across a switch', () => {
    const s = makeBuild({ seed: 31, nodes: ['ct_hold', 'ct_seal', 'ct_prepared'] });
    s.discovered.push('frameworkB');
    s.held = [4];
    s.sealedFace = 1;
    runManualRolls(s, 5);
    const queueBefore = [...s.queue];
    switchFramework(s);
    expect(s.held).toEqual([4]);
    expect(s.sealedFace).toBe(1);
    expect(s.queue).toEqual(queueBefore);
  });
});
