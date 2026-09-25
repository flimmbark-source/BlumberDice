import { describe, expect, it } from 'vitest';
import {
  drain, getBuild, manualRoll, resolveDecision, setSeal, setStoreNext, setStake,
  setUseHeld, swapQueue, switchFramework, syncQueue, type GameState,
} from '../src/engine/game.ts';
import { makeBuild, runManualRolls } from '../src/engine/sim.ts';
import type { Face } from '../src/engine/types.ts';

/** Starts a manual roll and stops at the first prompt. */
function rollToPrompt(s: GameState): void {
  s.cooldownRemaining = 0;
  manualRoll(s);
  drain(s, false);
}

describe('Loaded Choice and Prepared Roll compose', () => {
  it('offers the queued result alongside a fresh sample', () => {
    const s = makeBuild({ seed: 11, nodes: ['ct_prepared', 'key_loaded'] });
    syncQueue(s);
    expect(s.queue.length).toBe(3);
    const head = s.queue[0];

    rollToPrompt(s);
    expect(s.decision?.kind).toBe('loadedChoice');
    const d = s.decision as { options: Face[]; fromQueue?: number };
    expect(d.options.length).toBe(2);
    expect(d.fromQueue).toBe(0);
    expect(d.options[0]).toBe(head);
  });

  it('consumes the queue only when the queued result is taken', () => {
    const taken = makeBuild({ seed: 11, nodes: ['ct_prepared', 'key_loaded'] });
    syncQueue(taken);
    const beforeTaken = [...taken.queue];
    rollToPrompt(taken);
    resolveDecision(taken, { kind: 'loadedChoice', index: 0 });
    drain(taken);
    expect(taken.lastFace).toBe(beforeTaken[0]);
    expect(taken.queue.slice(0, 2)).toEqual(beforeTaken.slice(1));

    const left = makeBuild({ seed: 11, nodes: ['ct_prepared', 'key_loaded'] });
    syncQueue(left);
    const beforeLeft = [...left.queue];
    rollToPrompt(left);
    const fresh = (left.decision as { options: Face[] }).options[1];
    resolveDecision(left, { kind: 'loadedChoice', index: 1 });
    drain(left);
    expect(left.lastFace).toBe(fresh);
    expect(left.queue).toEqual(beforeLeft);
  });

  it('keeps Loaded Choice working without Prepared Roll', () => {
    const s = makeBuild({ seed: 3, nodes: ['key_loaded'] });
    rollToPrompt(s);
    const d = s.decision as { options: Face[]; fromQueue?: number };
    expect(d.options.length).toBe(2);
    expect(d.fromQueue).toBeUndefined();
  });

  it('honours higher and lower policies', () => {
    const high = makeBuild({ seed: 808, nodes: ['key_loaded'], policies: { loadedChoice: 'higher' } });
    const low = makeBuild({ seed: 808, nodes: ['key_loaded'], policies: { loadedChoice: 'lower' } });
    const h = runManualRolls(high, 600);
    const l = runManualRolls(low, 600);
    expect(h.averageFace).toBeGreaterThan(4.3);
    expect(l.averageFace).toBeLessThan(2.7);
  });
});

describe('Hold', () => {
  const HOLD = ['ct_hold', 'ct_reserve'];

  it('stores without resolving: no Score, no Meta, no history', () => {
    const s = makeBuild({ seed: 5, nodes: HOLD });
    setStoreNext(s, true);
    rollToPrompt(s);
    drain(s);
    expect(s.held.length).toBe(1);
    expect(s.score).toBe(0);
    expect(s.meta).toBe(0);
    expect(s.totalRolls).toBe(0);
    expect(s.pattern.history).toEqual([]);
    expect(s.storeNext).toBe(false);
  });

  it('costs no Score in Framework B either', () => {
    const s = makeBuild({ seed: 5, nodes: HOLD, framework: 'B', startingScore: 100 });
    setStoreNext(s, true);
    rollToPrompt(s);
    drain(s);
    expect(s.score).toBe(100);
    expect(s.meta).toBe(0);
  });

  it('plays a held result in place of the next roll', () => {
    const s = makeBuild({ seed: 5, nodes: HOLD });
    s.held = [6];
    setUseHeld(s, 0);
    rollToPrompt(s);
    drain(s);
    expect(s.lastFace).toBe(6);
    expect(s.score).toBe(6);
    expect(s.held).toEqual([]);
    expect(s.useHeldNext).toBeNull();
  });

  it('does not prompt on an ordinary roll without Hedge', () => {
    const s = makeBuild({ seed: 5, nodes: HOLD });
    s.held = [2];
    rollToPrompt(s);
    expect(s.decision).toBeNull();
  });

  it('prompts reactively once Hedge is allocated', () => {
    const s = makeBuild({ seed: 5, nodes: [...HOLD, 'jp_longodds', 'jp_stake', 'br_hedge'] });
    s.held = [2];
    rollToPrompt(s);
    expect(s.decision?.kind).toBe('hold');
    const d = s.decision as { heldOptions: Face[]; reactive: boolean };
    expect(d.reactive).toBe(true);
    expect(d.heldOptions).toEqual([2]);
  });

  it('swaps a held result in and banks the rolled one', () => {
    const s = makeBuild({ seed: 5, nodes: [...HOLD, 'jp_longodds', 'jp_stake', 'br_hedge'] });
    s.held = [6];
    rollToPrompt(s);
    const rolled = (s.decision as { face: Face }).face;
    resolveDecision(s, { kind: 'hold', action: 'resolve', swapIndex: 0 });
    drain(s);
    expect(s.lastFace).toBe(6);
    expect(s.held).toEqual([rolled]);
  });

  it('respects hold capacity', () => {
    const s = makeBuild({ seed: 5, nodes: ['ct_hold'] });
    s.held = [3];
    setStoreNext(s, true);
    rollToPrompt(s);
    drain(s);
    // Capacity is 1 from ct_hold alone, so the roll resolves normally.
    expect(s.held).toEqual([3]);
    expect(s.totalRolls).toBe(1);
  });
});

describe('Flip', () => {
  it('replaces a face with its opposite and enters cooldown', () => {
    const s = makeBuild({ seed: 2, nodes: ['ct_flip', 'ct_reserve', 'ct_second'] });
    rollToPrompt(s);
    expect(s.decision?.kind).toBe('flip');
    const d = s.decision as { face: Face; flipped: Face };
    expect(d.face + d.flipped).toBe(7);
    resolveDecision(s, { kind: 'flip', flip: true });
    drain(s);
    expect(s.lastFace).toBe(d.flipped);
    expect(s.transient.flipCooldown).toBeGreaterThan(0);
  });

  it('is limited by its cooldown', () => {
    const s = makeBuild({
      seed: 2, nodes: ['ct_flip', 'ct_reserve', 'ct_second'], policies: { flip: 'higher' },
    });
    const r = runManualRolls(s, 300);
    // At most one flip in five rolls, so the mean moves but does not max out.
    expect(r.averageFace).toBeGreaterThan(3.6);
    expect(r.averageFace).toBeLessThan(4.6);
  });

  it('is cleared on a framework change by Counterplay', () => {
    const s = makeBuild({ seed: 2, nodes: ['ct_flip', 'ct_reserve', 'ad_transition', 'br_counterplay'] });
    s.discovered.push('frameworkB');
    s.transient.flipCooldown = 4;
    switchFramework(s);
    expect(s.transient.flipCooldown).toBe(0);
  });
});

describe('Seal', () => {
  it('removes a face from the pool and refreshes the queue', () => {
    const s = makeBuild({ seed: 6, nodes: ['ct_hold', 'ct_second', 'ct_seal', 'ct_flip', 'ct_prepared'] });
    syncQueue(s);
    setSeal(s, 1);
    expect(s.queue.length).toBe(3);
    expect(s.queue).not.toContain(1);
    const r = runManualRolls(s, 400);
    expect(r.state.stats.faceCounts[1]).toBe(0);
  });

  it('does nothing without the node', () => {
    const s = makeBuild({ seed: 6 });
    setSeal(s, 1);
    expect(s.sealedFace).toBeNull();
  });
});

describe('Prepared Roll queue', () => {
  it('only allows adjacent swaps without Arrange', () => {
    const s = makeBuild({ seed: 8, nodes: ['ct_prepared'] });
    syncQueue(s);
    const q = [...s.queue];
    swapQueue(s, 0, 2);
    expect(s.queue).toEqual(q);
    swapQueue(s, 0, 1);
    expect(s.queue).toEqual([q[1], q[0], q[2]]);
  });

  it('allows any swap with Arrange', () => {
    const s = makeBuild({ seed: 8, nodes: ['ct_prepared', 'br_arrange'] });
    syncQueue(s);
    const q = [...s.queue];
    swapQueue(s, 0, 2);
    expect(s.queue).toEqual([q[2], q[1], q[0]]);
  });

  it('resolves rolls from the front of the queue', () => {
    const s = makeBuild({ seed: 8, nodes: ['ct_prepared'] });
    syncQueue(s);
    const head = s.queue[0];
    rollToPrompt(s);
    drain(s);
    expect(s.lastFace).toBe(head);
    expect(s.queue.length).toBe(3);
  });
});

describe('Wagering', () => {
  const JP = ['jp_longodds', 'jp_stake'];

  it('deducts the wager up front and returns it on a jackpot', () => {
    const s = makeBuild({ seed: 1, nodes: JP });
    s.score = 500;
    setStake(s, 40);
    s.cooldownRemaining = 0;
    manualRoll(s);
    expect(s.score).toBe(460);
    s.pending[0].face = 6;
    s.pending[0].stage = 'finalize';
    drain(s);
    // 40 * 2.5 returned, plus the roll's own Score and the jackpot payout.
    expect(s.score).toBeGreaterThan(460 + 100);
  });

  it('loses the wager on a miss, and Hedge refunds half', () => {
    const plain = makeBuild({ seed: 1, nodes: JP });
    plain.score = 500;
    setStake(plain, 40);
    plain.cooldownRemaining = 0;
    manualRoll(plain);
    plain.pending[0].face = 2;
    plain.pending[0].stage = 'finalize';
    drain(plain);
    // The roll itself still pays: round(2 * 0.85) = 2. The wager is gone.
    expect(plain.score).toBe(462);

    const hedged = makeBuild({ seed: 1, nodes: [...JP, 'ct_hold', 'br_hedge'], policies: { hold: 'never' } });
    hedged.score = 500;
    setStake(hedged, 40);
    hedged.cooldownRemaining = 0;
    manualRoll(hedged);
    hedged.pending[0].face = 2;
    hedged.pending[0].stage = 'finalize';
    drain(hedged);
    // Same, plus a 50% refund of the 40 wagered.
    expect(hedged.score).toBe(482);
  });

  it('caps the wager at the node limit and at current Score', () => {
    const s = makeBuild({ seed: 1, nodes: JP });
    s.score = 12;
    setStake(s, 9999);
    expect(s.stakeAmount).toBe(40);
    s.cooldownRemaining = 0;
    manualRoll(s);
    expect(s.score).toBe(0);
  });

  it('does not wager in Framework B', () => {
    const s = makeBuild({ seed: 1, nodes: JP, framework: 'B', startingScore: 500 });
    setStake(s, 40);
    s.cooldownRemaining = 0;
    manualRoll(s);
    expect(s.score).toBe(500);
  });
});

describe('Let It Ride', () => {
  const RIDE = ['jp_longodds', 'jp_hotstreak', 'jp_stake', 'jp_pressure', 'jp_ride'];

  function forceRoll(s: GameState, face: Face): void {
    s.cooldownRemaining = 0;
    manualRoll(s);
    s.pending[0].face = face;
    s.pending[0].stage = 'finalize';
    drain(s, false);
  }

  it('offers the choice only above the payout threshold', () => {
    const s = makeBuild({ seed: 1, nodes: RIDE });
    forceRoll(s, 2);
    expect(s.decision).toBeNull();
  });

  it('banks the payout when asked to', () => {
    const s = makeBuild({ seed: 1, nodes: RIDE });
    forceRoll(s, 6);
    expect(s.decision?.kind).toBe('letItRide');
    const amount = (s.decision as { amount: number }).amount;
    resolveDecision(s, { kind: 'letItRide', ride: false });
    drain(s);
    expect(s.score).toBe(amount);
  });

  it('loses the ride on anything but a jackpot, and triples it on one', () => {
    const lost = makeBuild({ seed: 1, nodes: RIDE });
    forceRoll(lost, 6);
    resolveDecision(lost, { kind: 'letItRide', ride: true });
    drain(lost);
    expect(lost.score).toBe(0);
    expect(lost.riding).toBeGreaterThan(0);
    forceRoll(lost, 1);
    drain(lost);
    // The ride is gone; only the new roll's own payout remains.
    expect(lost.score).toBe(1);
    expect(lost.riding).toBe(0);

    const won = makeBuild({ seed: 1, nodes: RIDE });
    forceRoll(won, 6);
    const amount = (won.decision as { amount: number }).amount;
    resolveDecision(won, { kind: 'letItRide', ride: true });
    drain(won);
    forceRoll(won, 6);
    drain(won, true);
    expect(won.score).toBeGreaterThanOrEqual(amount * 3);
  });

  it('is inactive in Framework B', () => {
    const s = makeBuild({ seed: 1, nodes: RIDE, framework: 'B', startingScore: 500 });
    forceRoll(s, 6);
    expect(s.decision).toBeNull();
    expect(s.meta).toBe(1);
  });
});

describe('One in Six', () => {
  it('pays only on a 6', () => {
    for (const face of [1, 2, 3, 4, 5] as Face[]) {
      const s = makeBuild({ seed: 1, nodes: ['jp_oneinsix'] });
      s.cooldownRemaining = 0;
      manualRoll(s);
      s.pending[0].face = face;
      s.pending[0].stage = 'finalize';
      drain(s);
      expect(s.score, `face ${face}`).toBe(0);
    }
    const six = makeBuild({ seed: 1, nodes: ['jp_oneinsix'] });
    six.cooldownRemaining = 0;
    manualRoll(six);
    six.pending[0].face = 6;
    six.pending[0].stage = 'finalize';
    drain(six);
    expect(six.score).toBe(54);
  });

  it('still grants exactly one Meta per roll in Framework B', () => {
    const s = makeBuild({ seed: 1, nodes: ['jp_oneinsix'], framework: 'B', startingScore: 1000 });
    const r = runManualRolls(s, 200);
    expect(r.metaEarned).toBe(r.resolvedRolls);
  });
});

describe('Adaptive nodes', () => {
  it('Transition changes the first roll after a switch in both frameworks', () => {
    const s = makeBuild({ seed: 4, nodes: ['ad_transition'] });
    s.discovered.push('frameworkB');
    switchFramework(s);
    expect(s.framework).toBe('B');
    expect(s.transient.tempStats.length).toBe(2);
    s.score = 100;
    s.cooldownRemaining = 0;
    manualRoll(s);
    s.pending[0].face = 5;
    s.pending[0].stage = 'finalize';
    drain(s);
    expect(s.score).toBe(98); // 5 * 0.4 = 2 lost, not 5
  });

  it('Duality grants bonus rolls scaled by regions invested', () => {
    const s = makeBuild({
      seed: 4,
      nodes: ['ad_duality', 'hr_edge', 'hr_floor', 'vl_quick', 'vl_cycle', 'pt_repeat', 'pt_step'],
    });
    s.discovered.push('frameworkB');
    switchFramework(s);
    // high, volume, pattern each have 2+, adaptive has 1.
    expect(s.pending.length).toBe(3);
  });

  it('Reflection fires only when the face matches across the switch', () => {
    const s = makeBuild({ seed: 4, nodes: ['ad_reflection'] });
    s.discovered.push('frameworkB');
    s.lastFace = 4;
    switchFramework(s);
    expect(s.awaitingReflection).toBe(true);
    s.score = 1000;
    s.cooldownRemaining = 0;
    manualRoll(s);
    s.pending[0].face = 4;
    s.pending[0].stage = 'finalize';
    drain(s);
    expect(s.meta).toBeGreaterThan(1); // 1 from the roll + 4 from Reflection
    expect(s.awaitingReflection).toBe(false);
  });

  it('Pendulum pays out over the rolls after a switch', () => {
    const s = makeBuild({ seed: 4, nodes: ['ad_pendulum'] });
    s.discovered.push('frameworkB');
    runManualRolls(s, 30);
    expect(s.transient.counters.pendulum).toBeGreaterThan(0);
    const banked = s.transient.counters.pendulum;
    switchFramework(s);
    expect(s.pendulumPayout).toBe(banked);
    expect(s.pendulumRollsLeft).toBe(3);
    expect(s.transient.counters.pendulum).toBe(0);
  });
});

describe('build flags only switch on when allocated', () => {
  it('leaves every mechanic off for a bare build', () => {
    const s = makeBuild({ seed: 1 });
    expect(getBuild(s).flags.size).toBe(0);
    rollToPrompt(s);
    expect(s.decision).toBeNull();
    drain(s);
    expect(s.queue).toEqual([]);
    expect(s.held).toEqual([]);
  });
});
