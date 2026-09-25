import { describe, expect, it } from 'vitest';
import { makeBuild, runManualRolls, type SimResult } from '../src/engine/sim.ts';
import { getBuild } from '../src/engine/game.ts';

export const FIXTURES = {
  baseline: [],
  highRoller: ['hr_edge', 'hr_floor', 'hr_heavy6', 'hr_momentum', 'hr_climb', 'hr_upper', 'hr_nogoback'],
  volume: ['vl_quick', 'vl_lowgear', 'vl_cycle', 'vl_follow', 'vl_echo', 'vl_splinter', 'vl_secondwind', 'vl_handful'],
  jackpot: ['jp_longodds', 'jp_hotstreak', 'jp_stake', 'jp_nearmiss', 'jp_pressure', 'jp_ride', 'jp_oneinsix'],
  control: ['ct_second', 'ct_reserve', 'ct_hold', 'ct_flip', 'ct_seal', 'ct_prepared'],
  pattern: ['pt_repeat', 'pt_step', 'pt_collector', 'pt_alt', 'pt_doubles', 'pt_run', 'pt_palindrome', 'pt_fullset', 'pt_memory'],
  // Hybrids
  sixEngine: ['hr_edge', 'hr_heavy6', 'hr_climb', 'hr_momentum', 'vl_quick', 'vl_cycle', 'vl_echo', 'br_overflow'],
  comboEngine: ['pt_repeat', 'pt_step', 'pt_run', 'pt_doubles', 'pt_palindrome', 'pt_fullset', 'vl_quick', 'vl_cycle', 'br_chain'],
  slotMachine: ['vl_quick', 'vl_cycle', 'vl_echo', 'vl_splinter', 'jp_longodds', 'jp_hotstreak', 'jp_pressure', 'br_tickets'],
  cardCounter: ['jp_longodds', 'jp_hotstreak', 'jp_stake', 'jp_nearmiss', 'ct_hold', 'ct_flip', 'br_hedge'],
  sequenceSolver: ['ct_second', 'ct_hold', 'ct_flip', 'ct_seal', 'ct_prepared', 'pt_repeat', 'pt_run', 'pt_doubles', 'br_arrange'],
  climber: ['hr_edge', 'hr_climb', 'hr_momentum', 'pt_step', 'pt_run', 'pt_doubles', 'br_peak'],
  grinder: ['vl_quick', 'vl_cycle', 'vl_follow', 'vl_secondwind', 'ct_second', 'ct_hold'],
} satisfies Record<string, string[]>;

const A = (nodes: string[], seed = 4242, manuals = 4000, policies = {}): SimResult =>
  runManualRolls(makeBuild({ seed, nodes, policies }), manuals);

/** Coefficient of variation of Score earned per 40-roll chunk. */
const scoreCV = (nodes: string[], seed = 90210, policies = {}): number => {
  const s = makeBuild({ seed, nodes, policies });
  const chunks: number[] = [];
  for (let i = 0; i < 80; i++) chunks.push(runManualRolls(s, 40).scoreEarned);
  const mean = chunks.reduce((a, b) => a + b, 0) / chunks.length;
  const varr = chunks.reduce((a, b) => a + (b - mean) ** 2, 0) / chunks.length;
  return Math.sqrt(varr) / mean;
};

const B = (nodes: string[], seed = 4242, manuals = 4000, policies = {}): SimResult =>
  runManualRolls(
    makeBuild({ seed, nodes, policies, framework: 'B', startingScore: 1_000_000 }),
    manuals,
  );

describe('archetypes are mechanically distinct under Framework A', () => {
  it('High Roller raises the average face without adding rolls', () => {
    const base = A(FIXTURES.baseline);
    const hr = A(FIXTURES.highRoller);
    expect(hr.averageFace).toBeGreaterThan(base.averageFace + 0.6);
    expect(hr.rollsPerManual).toBeCloseTo(1, 1);
  });

  it('Volume adds rolls without raising the average face', () => {
    const base = A(FIXTURES.baseline);
    const vol = A(FIXTURES.volume);
    expect(vol.rollsPerManual).toBeGreaterThan(3.5);
    expect(Math.abs(vol.averageFace - base.averageFace)).toBeLessThan(0.2);
  });

  it('Jackpot concentrates payout into rare results', () => {
    // Score-per-chunk variance is the signature of the archetype.
    expect(scoreCV(FIXTURES.jackpot)).toBeGreaterThan(scoreCV(FIXTURES.highRoller) * 2);
  });

  it('Pattern earns a large share of its Score from sequence rewards', () => {
    const pat = A(FIXTURES.pattern);
    const base = A(FIXTURES.baseline);
    // Pattern adds no probability or frequency modifiers at all.
    expect(pat.rollsPerManual).toBeCloseTo(base.rollsPerManual, 1);
    expect(Math.abs(pat.averageFace - base.averageFace)).toBeLessThan(0.1);
    // Yet it earns substantially more than the raw face value.
    expect(pat.scorePerManual).toBeGreaterThan(base.scorePerManual * 2.5);
    const counts = pat.state.stats.patternCounts;
    for (const name of ['pair', 'step', 'run', 'palindrome', 'fullSet'] as const) {
      expect(counts[name] ?? 0, `no ${name} detected`).toBeGreaterThan(0);
    }
  });

  it('Control shapes results rather than adding rolls or raw weight', () => {
    const up = A(FIXTURES.control, 777, 3000, { flip: 'higher', hold: 'never' });
    const never = A(FIXTURES.control, 777, 3000, { flip: 'never', hold: 'never' });
    expect(up.averageFace).toBeGreaterThan(never.averageFace + 0.15);
    expect(up.rollsPerManual).toBeCloseTo(never.rollsPerManual, 1);
  });

  it('gives every archetype a different shape', () => {
    // Throughput alone cannot separate these builds, and should not be
    // expected to: Jackpot and Pattern can average the same Score per roll
    // while feeling nothing alike. Volatility is the fourth axis.
    const profiles = (['highRoller', 'volume', 'jackpot', 'pattern', 'control'] as const).map((k) => {
      const r = A(FIXTURES[k], 4242, 4000, { flip: 'higher', hold: 'never', letItRide: 'bank' });
      return {
        k,
        rolls: r.rollsPerManual,
        face: r.averageFace,
        score: r.scorePerManual,
        cv: scoreCV(FIXTURES[k], 90210, { flip: 'higher', hold: 'never', letItRide: 'bank' }),
      };
    });
    for (let i = 0; i < profiles.length; i++) {
      for (let j = i + 1; j < profiles.length; j++) {
        const a = profiles[i];
        const b = profiles[j];
        const differs =
          Math.abs(a.rolls - b.rolls) > 0.3
          || Math.abs(a.face - b.face) > 0.3
          || Math.abs(a.score - b.score) / Math.max(a.score, b.score) > 0.25
          || Math.abs(a.cv - b.cv) / Math.max(a.cv, b.cv) > 0.35;
        expect(differs, `${a.k} and ${b.k} look alike: ${JSON.stringify([a, b])}`).toBe(true);
      }
    }
  });
});

describe('hybrids behave as more than the sum of their parts', () => {
  it('Six Engine turns high results into extra rolls', () => {
    const hr = A(['hr_edge', 'hr_heavy6', 'hr_climb', 'hr_momentum']);
    const six = A(FIXTURES.sixEngine);
    expect(six.averageFace).toBeGreaterThan(hr.averageFace - 0.15);
    expect(six.rollsPerManual).toBeGreaterThan(1.4);
    expect(six.scorePerManual).toBeGreaterThan(hr.scorePerManual * 1.3);
  });

  it('Combo Engine turns patterns into rolls that feed further patterns', () => {
    const pat = A(['pt_repeat', 'pt_step', 'pt_run', 'pt_doubles', 'pt_palindrome', 'pt_fullset']);
    const combo = A(FIXTURES.comboEngine);
    expect(combo.rollsPerManual).toBeGreaterThan(pat.rollsPerManual * 1.3);
    const patHits = Object.values(pat.state.stats.patternCounts).reduce((a, b) => a + b, 0);
    const comboHits = Object.values(combo.state.stats.patternCounts).reduce((a, b) => a + b, 0);
    expect(comboHits).toBeGreaterThan(patHits * 1.3);
  });

  it('Slot Machine buys many attempts at a rare payout', () => {
    const slot = A(FIXTURES.slotMachine);
    expect(slot.rollsPerManual).toBeGreaterThan(1.3);
    expect(slot.state.stats.jackpots).toBeGreaterThan(0);
  });

  it('Card Counter reduces jackpot volatility relative to raw Jackpot', () => {
    const raw = scoreCV(FIXTURES.jackpot, 5150, { letItRide: 'bank' });
    const counted = scoreCV(FIXTURES.cardCounter, 5150, { flip: 'higher', hold: 'never', letItRide: 'bank' });
    expect(counted).toBeLessThan(raw);
  });

  it('Sequence Solver turns control tools into pattern completions', () => {
    const ctrl = A(FIXTURES.control, 313, 3000, { flip: 'higher', hold: 'never' });
    const solver = A(FIXTURES.sequenceSolver, 313, 3000, { flip: 'higher', hold: 'never' });
    const ctrlHits = Object.values(ctrl.state.stats.patternCounts).reduce((a, b) => a + b, 0);
    const solverHits = Object.values(solver.state.stats.patternCounts).reduce((a, b) => a + b, 0);
    expect(solverHits).toBeGreaterThan(ctrlHits);
    expect(getBuild(solver.state).flags.has('arrange')).toBe(true);
  });

  it('Climber rewards sequences that end high', () => {
    const climber = A(FIXTURES.climber);
    const counts = climber.state.stats.patternCounts;
    expect((counts.step ?? 0) + (counts.run ?? 0)).toBeGreaterThan(0);
    expect(climber.averageFace).toBeGreaterThan(3.6);
  });
});

describe('Framework B recontextualises the same build', () => {
  it('gives every build the same Meta rate per resolved roll', () => {
    for (const key of ['highRoller', 'volume', 'jackpot', 'control'] as const) {
      const r = B(FIXTURES[key], 606, 1500);
      expect(r.metaEarned, key).toBe(r.resolvedRolls);
    }
  });

  it('makes Volume, not roll size, the driver of Meta throughput', () => {
    const hr = B(FIXTURES.highRoller, 606, 1500);
    const vol = B(FIXTURES.volume, 606, 1500);
    expect(vol.metaPerManual).toBeGreaterThan(hr.metaPerManual * 2.5);
  });

  it('turns the High Roller strength into a Score cost', () => {
    const hr = B(FIXTURES.highRoller, 606, 1500);
    const base = B(FIXTURES.baseline, 606, 1500);
    // Same Meta per roll, but noticeably more Score consumed per roll.
    expect(hr.scoreLost / hr.resolvedRolls).toBeGreaterThan(base.scoreLost / base.resolvedRolls + 0.6);
  });

  it('lets the same Loaded Choice keystone serve opposite goals', () => {
    const nodes = ['key_loaded', 'hr_edge', 'ct_hold'];

    const aHigh = A(nodes, 2024, 2000, { loadedChoice: 'higher', hold: 'never' });
    const aLow = A(nodes, 2024, 2000, { loadedChoice: 'lower', hold: 'never' });
    expect(aHigh.scorePerManual).toBeGreaterThan(aLow.scorePerManual * 1.5);

    const bHigh = B(nodes, 2024, 2000, { loadedChoice: 'higher', hold: 'never' });
    const bLow = B(nodes, 2024, 2000, { loadedChoice: 'lower', hold: 'never' });
    // Identical Meta, very different Score consumption.
    expect(bLow.metaEarned).toBe(bHigh.metaEarned);
    expect(bLow.scoreLost).toBeLessThan(bHigh.scoreLost * 0.6);
  });

  it('lets Flip reduce Score loss in B using the tool that raised it in A', () => {
    const nodes = ['ct_flip', 'ct_reserve', 'ct_second'];
    const bDown = B(nodes, 8, 2000, { flip: 'lower', hold: 'never' });
    const bUp = B(nodes, 8, 2000, { flip: 'higher', hold: 'never' });
    expect(bDown.scoreLost).toBeLessThan(bUp.scoreLost);
    expect(bDown.metaEarned).toBe(bDown.resolvedRolls);
  });

  it('keeps Pattern play meaningful in B', () => {
    const pat = B(FIXTURES.pattern, 606, 1500);
    // Pattern rewards pay Meta in B, so Meta exceeds one per resolved roll.
    expect(pat.metaEarned).toBeGreaterThan(pat.resolvedRolls);
    const counts = pat.state.stats.patternCounts;
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });

  it('does not simply invert the die: a low-roll build gains no Meta advantage', () => {
    // Pushing the distribution down preserves Score but does nothing for Meta.
    const lowNodes = ['ct_flip', 'ct_second'];
    const low = B(lowNodes, 99, 1500, { flip: 'lower', hold: 'never' });
    const base = B(FIXTURES.baseline, 99, 1500);
    expect(low.metaPerManual).toBeCloseTo(base.metaPerManual, 1);
    expect(low.scoreLost).toBeLessThan(base.scoreLost);
  });

  it('keeps Framework A useful after B is available', () => {
    const s = makeBuild({ seed: 4, nodes: FIXTURES.highRoller });
    s.discovered.push('frameworkB');
    const first = runManualRolls(s, 500);
    expect(first.scoreEarned).toBeGreaterThan(0);
    // Spend down in B, then return.
    s.framework = 'B';
    runManualRolls(s, 200);
    s.framework = 'A';
    const again = runManualRolls(s, 500);
    expect(again.scoreEarned).toBeGreaterThan(first.scoreEarned * 0.8);
  });
});

describe('cascade safety', () => {
  it('terminates for an aggressively self-feeding build', () => {
    const nodes = [
      'vl_quick', 'vl_lowgear', 'vl_cycle', 'vl_follow', 'vl_echo', 'vl_splinter',
      'vl_secondwind', 'vl_handful', 'br_overflow', 'br_chain', 'pt_run',
      'hr_edge', 'hr_heavy6',
    ];
    const r = A(nodes, 1234, 400);
    expect(r.resolvedRolls).toBeGreaterThan(400);
    expect(Number.isFinite(r.resolvedRolls)).toBe(true);
    expect(r.state.pending.length).toBe(0);
  });
});
