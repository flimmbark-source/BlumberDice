import { describe, expect, it } from 'vitest';
import { allocate, createGame, getBuild } from '../src/engine/game.ts';
import { EDGES, NODES, NODES_BY_ID } from '../src/engine/nodes.ts';
import { checkAllocation, regionsInvested, resolveBuild } from '../src/engine/tree.ts';
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

  it('places bridges between two different regions', () => {
    for (const n of NODES.filter((x) => x.nodeType === 'bridge')) {
      expect(n.bridges, n.id).toBeDefined();
      expect(n.bridges![0]).not.toBe(n.bridges![1]);
      // Its prerequisites should come from both sides.
      const preRegions = new Set(n.prerequisites.map((p) => NODES_BY_ID.get(p)!.region));
      expect(preRegions.size, `${n.id} prerequisites: ${[...preRegions]}`).toBeGreaterThan(1);
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
    const c = ctx();
    expect(checkAllocation('ad_transition', c).reason).toBe('undiscovered');
    const d = ctx({ discovered: new Set<DiscoveryFlag>(['frameworkB']) });
    expect(checkAllocation('ad_transition', d).ok).toBe(true);
  });

  it('rejects insufficient Score', () => {
    const c = ctx({ score: 10 });
    expect(checkAllocation('hr_edge', c).reason).toBe('insufficient-score');
  });

  it('rejects insufficient Meta on a mixed-cost node', () => {
    const c = ctx({
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
    const node = NODES_BY_ID.get('ad_transition')!;
    expect(allocate(s, 'ad_transition').ok).toBe(true);
    expect(s.score).toBe(1000 - node.costs.score!);
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
