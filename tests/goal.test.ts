import { describe, expect, it } from 'vitest';
import { allocate, createGame, refundAll } from '../src/engine/game.ts';
import { canPin, currentGoal, openTargets, successorOf } from '../src/engine/goal.ts';
import { deserialize, serialize } from '../src/engine/save.ts';
import { NODES, NODES_BY_ID } from '../src/engine/nodes.ts';
import type { DiscoveryFlag } from '../src/engine/types.ts';

const fresh = () => createGame(1234);
const ctx = (allocated: string[], score = 0, meta = 0) => ({
  allocated: new Set(allocated),
  discovered: new Set<DiscoveryFlag>(),
  score,
  meta,
});

describe('the HUD states a milestone without naming a node', () => {
  it('opens on the cheapest threshold, not on an upgrade', () => {
    const g = currentGoal(fresh());
    expect(g.kind).toBe('milestone');
    if (g.kind !== 'milestone') return;
    // Four nodes hang off start at 45; naming one of them would be a
    // recommendation, which this system deliberately does not make.
    const reachable = NODES.filter((n) => n.prerequisites.includes('start'));
    expect(g.cost).toBe(Math.min(...reachable.map((n) => n.costs.score ?? 0)));
    expect(g.unlocks).toBeGreaterThan(1);
  });

  it('counts how many nodes clear that threshold together', () => {
    const g = currentGoal(fresh());
    if (g.kind !== 'milestone') throw new Error('expected a milestone');
    const atCost = NODES.filter(
      (n) => n.prerequisites.includes('start') && (n.costs.score ?? 0) === g.cost,
    );
    expect(g.unlocks).toBe(atCost.length);
  });

  it('switches to ready once anything can be bought', () => {
    const s = fresh();
    s.score = 500;
    const g = currentGoal(s);
    expect(g.kind).toBe('ready');
    if (g.kind === 'ready') expect(g.available).toBeGreaterThan(0);
  });
});

describe('a pinned goal is the player’s, and only the player’s', () => {
  it('reports the shortfall per currency rather than one blended bar', () => {
    const s = fresh();
    s.allocated = ['start', 'ct_second', 'ad_transition', 'ad_counterweight'];
    s.discovered = ['frameworkB'] as DiscoveryFlag[];
    s.score = 100;
    s.meta = 10;
    s.pinned = 'ad_crossing';
    const g = currentGoal(s);
    expect(g.kind).toBe('target');
    if (g.kind !== 'target') return;
    const node = NODES_BY_ID.get('ad_crossing')!;
    expect(g.score).toEqual({ have: 100, need: node.costs.score });
    expect(g.meta).toEqual({ have: 10, need: node.costs.meta });
    expect(g.affordable).toBe(false);
  });

  it('draws no Meta bar for a node that costs no Meta', () => {
    const s = fresh();
    s.allocated = ['start', 'hr_edge'];
    s.pinned = 'hr_floor';
    const g = currentGoal(s);
    if (g.kind !== 'target') throw new Error('expected a target');
    expect(g.meta).toBeNull();
  });

  it('keeps the goal while it is merely unaffordable', () => {
    const s = fresh();
    s.allocated = ['start', 'hr_edge'];
    s.score = 5;
    s.pinned = 'hr_floor';
    const g = currentGoal(s);
    expect(g.kind).toBe('target');
    if (g.kind === 'target') expect(g.affordable).toBe(false);
  });

  it('clears the goal when the node is bought, and picks no replacement', () => {
    const s = fresh();
    s.score = 1000;
    allocate(s, 'hr_edge');
    s.pinned = 'hr_floor';
    allocate(s, 'hr_floor');
    expect(s.pinned).toBeNull();
    // Nothing is auto-selected in its place.
    expect(currentGoal(s).kind).not.toBe('target');
  });

  it('clears the goal on a refund, since it is probably out of reach', () => {
    const s = fresh();
    s.score = 1000;
    allocate(s, 'hr_edge');
    s.pinned = 'hr_floor';
    refundAll(s);
    expect(s.pinned).toBeNull();
  });

  it('only allows pinning a node that is one purchase away', () => {
    const s = fresh();
    expect(canPin(s, 'hr_edge')).toBe(true);
    // Two steps out: nothing to save toward yet.
    expect(canPin(s, 'hr_floor')).toBe(false);
    expect(canPin(s, 'start')).toBe(false);
  });
});

describe('the horizon is shown only where the tree is unambiguous', () => {
  it('omits it when a purchase opens more than one door', () => {
    // Every region entry forks, which is the point of a spine head.
    for (const id of ['hr_edge', 'vl_quick', 'pt_repeat', 'ct_second', 'jp_longodds']) {
      expect(successorOf(id, ctx(['start'])), id).toBeNull();
    }
  });

  it('names it when a purchase opens exactly one', () => {
    const found = NODES.filter((n) => successorOf(n.id, ctx(['start', ...n.prerequisites])));
    // Live, but quiet: it fires on a minority of nodes by design.
    expect(found.length).toBeGreaterThan(0);
    expect(found.length).toBeLessThan(NODES.length / 2);
  });

  it('never points at something already reachable another way', () => {
    for (const n of NODES) {
      const c = ctx(['start', ...n.prerequisites]);
      const after = successorOf(n.id, c);
      if (!after) continue;
      expect(after.prerequisites.some((p) => c.allocated.has(p)), after.id).toBe(false);
    }
  });
});

describe('the goal survives a reload', () => {
  it('round-trips a pinned node', () => {
    const s = fresh();
    s.allocated = ['start', 'hr_edge'];
    s.pinned = 'hr_floor';
    expect(deserialize(serialize(s))!.pinned).toBe('hr_floor');
  });

  it('drops a pin that no longer means anything', () => {
    const s = fresh();
    s.pinned = 'no_such_node';
    expect(deserialize(serialize(s))!.pinned).toBeNull();

    const bought = fresh();
    bought.allocated = ['start', 'hr_edge'];
    bought.pinned = 'hr_edge';
    expect(deserialize(serialize(bought))!.pinned).toBeNull();
  });

  it('starts a new game with no goal', () => {
    expect(fresh().pinned).toBeNull();
  });
});

describe('Open in Web walks what is actionable', () => {
  it('offers nothing while nothing can be done', () => {
    expect(openTargets(fresh())).toEqual([]);
  });

  it('lists everything affordable', () => {
    const s = fresh();
    s.score = 500;
    const list = openTargets(s);
    expect(list.length).toBeGreaterThan(1);
    for (const id of list) {
      const n = NODES_BY_ID.get(id)!;
      expect(n.costs.score ?? 0, id).toBeLessThanOrEqual(s.score);
      expect(s.allocated).not.toContain(id);
    }
  });

  it('puts the pinned goal first, even when it cannot be bought', () => {
    const s = fresh();
    s.score = 500;
    s.allocated = ['start', 'hr_edge'];
    s.pinned = 'hr_floor';
    expect(openTargets(s)[0]).toBe('hr_floor');
  });

  it('never lists the same node twice', () => {
    const s = fresh();
    s.score = 5000;
    s.allocated = ['start', 'hr_edge'];
    s.pinned = 'hr_floor';
    const list = openTargets(s);
    expect(new Set(list).size).toBe(list.length);
  });

  it('cycles and wraps, which is what repeated presses do', () => {
    const s = fresh();
    s.score = 500;
    const list = openTargets(s);
    const step = (from: string | null): string =>
      list[((from ? list.indexOf(from) : -1) + 1) % list.length];
    let at: string | null = null;
    const seen: string[] = [];
    for (let i = 0; i < list.length; i++) { at = step(at); seen.push(at); }
    expect(seen).toEqual(list);
    // One more press returns to the start.
    expect(step(at)).toBe(list[0]);
  });

  it('drops a node from the walk once it is bought', () => {
    const s = fresh();
    s.score = 500;
    const before = openTargets(s);
    allocate(s, before[0]);
    expect(openTargets(s)).not.toContain(before[0]);
  });
});
