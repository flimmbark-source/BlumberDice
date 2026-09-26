import { describe, expect, it } from 'vitest';
import {
  allocate, allocatedCost, canRefund, createGame, currentDistribution, getBuild,
  manualRoll, refundAll,
} from '../src/engine/game.ts';
import { runManualRolls } from '../src/engine/sim.ts';
import { EDGES, NODES, NODES_BY_ID } from '../src/engine/nodes.ts';
import { checkAllocation, describeNode, regionsInvested, resolveBuild } from '../src/engine/tree.ts';
import { ARCHETYPE_REGIONS, type DiscoveryFlag } from '../src/engine/types.ts';

describe('graph integrity', () => {
  it('has unique ids', () => {
    const ids = NODES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('references only existing prerequisites', () => {
    for (const n of NODES) {
      for (const p of n.prerequisites) {
        expect(NODES_BY_ID.has(p), `${n.id} -> ${p}`).toBe(true);
      }
    }
  });

  it('is one connected web rooted at start', () => {
    const reached = new Set<string>(['start']);
    let changed = true;
    while (changed) {
      changed = false;
      for (const n of NODES) {
        if (reached.has(n.id)) continue;
        if (n.prerequisites.some((p) => reached.has(p))) {
          reached.add(n.id);
          changed = true;
        }
      }
    }
    const unreachable = NODES.filter((n) => !reached.has(n.id)).map((n) => n.id);
    expect(unreachable).toEqual([]);
  });

  it('has no cycles in the prerequisite graph', () => {
    const state = new Map<string, number>();
    const visit = (id: string): void => {
      const st = state.get(id) ?? 0;
      if (st === 2) return;
      if (st === 1) throw new Error(`cycle at ${id}`);
      state.set(id, 1);
      for (const p of NODES_BY_ID.get(id)!.prerequisites) visit(p);
      state.set(id, 2);
    };
    expect(() => NODES.forEach((n) => visit(n.id))).not.toThrow();
  });

  it('gives every node a distinct position', () => {
    const seen = new Set<string>();
    for (const n of NODES) {
      const key = `${n.id}`;
      const pos = `${n.position.x},${n.position.y}`;
      expect(seen.has(pos), `${key} overlaps another node at ${pos}`).toBe(false);
      seen.add(pos);
    }
  });

  it('only charges Meta for nodes gated behind the Framework B discovery', () => {
    // A visible Meta cost before discovery would spoil the disclosure.
    for (const n of NODES) {
      if ((n.costs.meta ?? 0) > 0) {
        expect(n.discoveryRequirements ?? [], n.id).toContain('frameworkB');
      }
    }
  });

  it('exposes every archetype before the Framework B discovery except Adaptive', () => {
    const preB = NODES.filter((n) => (n.discoveryRequirements ?? []).length === 0);
    const regions = new Set(preB.map((n) => n.region));
    for (const r of ['high', 'volume', 'jackpot', 'control', 'pattern'] as const) {
      expect(regions.has(r), `missing ${r}`).toBe(true);
    }
    expect(preB.some((n) => n.region === 'adaptive')).toBe(false);
  });

  it('builds undirected edges without duplicates', () => {
    const keys = EDGES.map(([a, b]) => [a, b].sort().join('|'));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('does not reduce to a single linear path', () => {
    // Several nodes must be allocatable from `start` alone, and several deep
    // nodes must be reachable by more than one route.
    const fromStart = NODES.filter((n) => n.prerequisites.includes('start') && n.id !== 'start');
    expect(fromStart.length).toBeGreaterThanOrEqual(5);
    const multiRoute = NODES.filter((n) => n.prerequisites.length > 1);
    expect(multiRoute.length).toBeGreaterThanOrEqual(8);
  });

  it('declares two regions for every bridge', () => {
    for (const n of NODES.filter((x) => x.nodeType === 'bridge')) {
      expect(n.bridges, n.id).toBeDefined();
      expect(n.bridges![0]).not.toBe(n.bridges![1]);
    }
  });

  it('gives a dual-entry bridge one prerequisite from each side', () => {
    // Some bridges are single-entry on purpose: they sit inside one region and
    // do another region's job, so reaching them means investing in both. Where
    // a bridge does have two entrances, they must genuinely straddle it.
    for (const n of NODES.filter((x) => x.nodeType === 'bridge' && x.prerequisites.length > 1)) {
      const preRegions = new Set(n.prerequisites.map((p) => NODES_BY_ID.get(p)!.region));
      expect(preRegions.size, `${n.id} prerequisites: ${[...preRegions]}`).toBeGreaterThan(1);
    }
  });

  it('keeps every bridge reachable from at least one of its regions', () => {
    for (const n of NODES.filter((x) => x.nodeType === 'bridge')) {
      const preRegions = new Set(n.prerequisites.map((p) => NODES_BY_ID.get(p)!.region));
      const touches = n.bridges!.some((r) => preRegions.has(r)) || preRegions.has(n.region);
      expect(touches, `${n.id} hangs off ${[...preRegions]}`).toBe(true);
    }
  });
});

describe('allocation rules', () => {
  const ctx = (over: Partial<{
    allocated: Set<string>; discovered: Set<DiscoveryFlag>; score: number; meta: number;
  }> = {}) => ({
    allocated: new Set(['start']),
    discovered: new Set<DiscoveryFlag>(),
    score: 1e9,
    meta: 1e9,
    ...over,
  });

  it('rejects an unknown node', () => {
    expect(checkAllocation('nope', ctx()).reason).toBe('unknown-node');
  });

  it('rejects a node that is already allocated', () => {
    expect(checkAllocation('start', ctx()).reason).toBe('already-allocated');
  });

  it('rejects a node with no allocated prerequisite', () => {
    expect(checkAllocation('hr_floor', ctx()).reason).toBe('missing-prerequisite');
    expect(checkAllocation('hr_edge', ctx()).ok).toBe(true);
  });

  it('accepts a node when any one prerequisite is allocated', () => {
    const c = ctx({ allocated: new Set(['start', 'hr_edge', 'hr_floor']) });
    // hr_momentum needs hr_floor OR hr_heavy6.
    expect(checkAllocation('hr_momentum', c).ok).toBe(true);
  });

  it('rejects an undiscovered node even when affordable and reachable', () => {
    const reached = new Set(['start', 'ct_second']);
    expect(checkAllocation('ad_transition', ctx({ allocated: reached })).reason).toBe('undiscovered');
    const d = ctx({ allocated: reached, discovered: new Set<DiscoveryFlag>(['frameworkB']) });
    expect(checkAllocation('ad_transition', d).ok).toBe(true);
  });

  it('rejects insufficient Score', () => {
    const c = ctx({ score: 10 });
    expect(checkAllocation('hr_edge', c).reason).toBe('insufficient-score');
  });

  it('rejects insufficient Meta on a mixed-cost node', () => {
    const c = ctx({
      allocated: new Set(['start', 'ct_second']),
      discovered: new Set<DiscoveryFlag>(['frameworkB']),
      score: 1e9,
      meta: 0,
    });
    expect(checkAllocation('ad_transition', c).reason).toBe('insufficient-meta');
  });

  it('deducts both currencies on a mixed-cost allocation', () => {
    const s = createGame(1);
    s.discovered.push('frameworkB');
    s.score = 1000;
    s.meta = 100;
    expect(allocate(s, 'ct_second').ok).toBe(true);
    const spent = NODES_BY_ID.get('ct_second')!.costs.score!;
    const node = NODES_BY_ID.get('ad_transition')!;
    expect(allocate(s, 'ad_transition').ok).toBe(true);
    expect(s.score).toBe(1000 - spent - node.costs.score!);
    expect(s.meta).toBe(100 - node.costs.meta!);
    expect(s.allocated).toContain('ad_transition');
  });

  it('does not spend anything on a rejected allocation', () => {
    const s = createGame(1);
    s.score = 1e6;
    const before = s.score;
    const res = allocate(s, 'hr_floor');
    expect(res.ok).toBe(false);
    expect(res.reason).toBe('missing-prerequisite');
    expect(s.score).toBe(before);
    expect(s.allocated).not.toContain('hr_floor');
  });

  it('every node is affordable and reachable via some legal route', () => {
    const s = createGame(1);
    s.discovered.push('frameworkB');
    s.score = 1e9;
    s.meta = 1e9;
    let progress = true;
    while (progress) {
      progress = false;
      for (const n of NODES) {
        if (s.allocated.includes(n.id)) continue;
        if (allocate(s, n.id).ok) progress = true;
      }
    }
    const missed = NODES.filter((n) => !s.allocated.includes(n.id)).map((n) => n.id);
    expect(missed).toEqual([]);
  });
});

describe('build resolution', () => {
  it('applies additive then multiplicative modifiers', () => {
    // Long Odds multiplies Framework A score by 0.85; Handful by 0.55.
    const b = resolveBuild(new Set(['jp_longodds', 'vl_handful']));
    expect(b.stats.scoreMult).toBeCloseTo(0.85 * 0.55, 10);
    expect(b.stats.handfulDice).toBe(3);
  });

  it('separates conditional modifiers from unconditional ones', () => {
    const b = resolveBuild(new Set(['hr_upper']));
    expect(b.stats.scoreFlat).toBe(0);
    expect(b.conditional.length).toBe(1);
  });

  it('counts a bridge toward both regions it joins', () => {
    const b = resolveBuild(new Set(['br_overflow']));
    expect(b.regionCounts.high).toBe(1);
    expect(b.regionCounts.volume).toBe(1);
  });

  it('measures Duality from real node investment, not a ratio', () => {
    const narrow = resolveBuild(new Set(['hr_edge', 'hr_floor', 'hr_heavy6', 'hr_climb']));
    expect(regionsInvested(narrow, 2)).toBe(1);

    const wide = resolveBuild(new Set([
      'hr_edge', 'hr_floor', 'vl_quick', 'vl_cycle', 'pt_repeat', 'pt_step',
    ]));
    expect(regionsInvested(wide, 2)).toBe(3);
  });

  it('collects flags and triggers from allocated nodes only', () => {
    const s = createGame(1);
    expect(getBuild(s).flags.size).toBe(0);
    s.allocated.push('ct_flip');
    expect(getBuild(s).flags.has('flip')).toBe(true);
    expect(getBuild(s).flags.has('hold')).toBe(false);
  });

  it('keeps every archetype region represented in the catalogue', () => {
    for (const r of ARCHETYPE_REGIONS) {
      expect(NODES.some((n) => n.region === r), `no nodes in ${r}`).toBe(true);
    }
  });
});

describe('node descriptions', () => {
  it('never name a framework in player-facing text', () => {
    // The player may not know a second framework exists, and once they do the
    // panel shows only the line for the one in play.
    const offenders: string[] = [];
    for (const n of NODES) {
      for (const fw of ['A', 'B'] as const) {
        const text = describeNode(n, fw);
        if (/framework [AB]\b/i.test(text)) offenders.push(`${n.id} (${fw}): ${text}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('gives both frameworks a line, and neither is empty', () => {
    for (const n of NODES) {
      for (const fw of ['A', 'B'] as const) {
        const text = describeNode(n, fw);
        expect(typeof text, n.id).toBe('string');
        expect(text.trim().length, `${n.id} (${fw})`).toBeGreaterThan(0);
      }
    }
  });

  it('splits the description wherever a node behaves differently', () => {
    // Anything that pays Score, wagers, or reads a Score payout is not the
    // same node under both frameworks, so it must not share one line.
    const mustSplit = [
      'hr_upper', 'vl_handful', 'jp_longodds', 'jp_stake', 'jp_hotstreak',
      'jp_pressure', 'jp_ride', 'jp_oneinsix', 'pt_repeat', 'pt_step',
      'pt_collector', 'pt_alt', 'pt_doubles', 'pt_run', 'pt_palindrome',
      'pt_fullset', 'br_peak', 'br_hedge', 'br_tickets', 'ad_transition',
      'ad_counterweight', 'ad_crossing', 'ad_pendulum', 'ad_reflection',
    ];
    for (const id of mustSplit) {
      const n = NODES_BY_ID.get(id)!;
      expect(typeof n.description, `${id} should differ by framework`).not.toBe('string');
      expect(describeNode(n, 'A')).not.toBe(describeNode(n, 'B'));
    }
  });

  it('leaves framework-neutral nodes as a single line', () => {
    for (const id of ['hr_edge', 'vl_quick', 'ct_flip', 'key_loaded', 'pt_memory']) {
      expect(typeof NODES_BY_ID.get(id)!.description, id).toBe('string');
    }
  });
});

describe('refunding the web', () => {
  it('returns every point spent and clears the build', () => {
    const s = createGame(1);
    s.discovered.push('frameworkB');
    s.score = 5000;
    s.meta = 900;
    for (const id of ['ct_second', 'ct_reserve', 'ct_hold', 'ad_transition']) {
      expect(allocate(s, id).ok, id).toBe(true);
    }
    expect(s.score).toBeLessThan(5000);
    expect(s.meta).toBeLessThan(900);

    const refunded = refundAll(s);
    expect(refunded).not.toBeNull();
    expect(s.score).toBe(5000);
    expect(s.meta).toBe(900);
    expect(s.allocated).toEqual(['start']);
  });

  it('agrees with the cost it reports before refunding', () => {
    const s = createGame(1);
    s.score = 5000;
    allocate(s, 'hr_edge');
    allocate(s, 'hr_floor');
    const quoted = allocatedCost(s);
    expect(refundAll(s)).toEqual(quoted);
  });

  it('reports what it gave back', () => {
    const s = createGame(1);
    s.score = 5000;
    allocate(s, 'hr_edge');
    allocate(s, 'hr_floor');
    const expected = (NODES_BY_ID.get('hr_edge')!.costs.score ?? 0)
      + (NODES_BY_ID.get('hr_floor')!.costs.score ?? 0);
    expect(refundAll(s)).toEqual({ score: expected, meta: 0 });
  });

  it('clears control state that only existed because of a node', () => {
    const s = createGame(1);
    s.score = 9000;
    for (const id of ['ct_second', 'ct_reserve', 'ct_hold', 'ct_flip', 'ct_seal', 'ct_prepared']) {
      allocate(s, id);
    }
    s.held = [4, 2];
    s.sealedFace = 1;
    s.storeNext = true;
    expect(s.allowed.length).toBeGreaterThan(0);

    refundAll(s);
    expect(s.held).toEqual([]);
    expect(s.allowed).toEqual([]);
    expect(s.sealedFace).toBeNull();
    expect(s.storeNext).toBe(false);
    expect(getBuild(s).flags.size).toBe(0);
  });

  it('refuses when there is nothing to refund', () => {
    const s = createGame(1);
    expect(canRefund(s)).toBe(false);
    expect(refundAll(s)).toBeNull();
  });

  it('refuses mid-cascade, when a roll is still resolving', () => {
    const s = createGame(1);
    s.score = 5000;
    allocate(s, 'vl_quick');
    s.cooldownRemaining = 0;
    manualRoll(s);
    expect(s.pending.length).toBeGreaterThan(0);
    expect(canRefund(s)).toBe(false);
    expect(refundAll(s)).toBeNull();
  });

  it('leaves the die itself alone, so the game stays playable', () => {
    const s = createGame(7);
    s.score = 5000;
    allocate(s, 'hr_edge');
    allocate(s, 'hr_heavy6');
    refundAll(s);
    const after = runManualRolls(s, 200);
    expect(after.resolvedRolls).toBe(200);
    // Back to a fair die.
    for (const p of currentDistribution(s).probabilities) expect(p).toBeCloseTo(1 / 6, 10);
  });

  it('lets the player rebuild immediately afterwards', () => {
    const s = createGame(1);
    s.score = 5000;
    allocate(s, 'hr_edge');
    refundAll(s);
    expect(allocate(s, 'vl_quick').ok).toBe(true);
    expect(s.allocated).toEqual(['start', 'vl_quick']);
  });
});
