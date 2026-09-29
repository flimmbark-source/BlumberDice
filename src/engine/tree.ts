import { NODES, NODES_BY_ID } from './nodes.ts';
import {
  ARCHETYPE_REGIONS,
  BASE_STATS,
  type DiscoveryFlag,
  type FlagKey,
  type FrameworkId,
  type PassiveNode,
  type Region,
  type StatBlock,
  type StatModifier,
  type Trigger,
} from './types.ts';

/** The tooltip line for a node under the framework currently in play. */
export function describeNode(node: PassiveNode, framework: FrameworkId): string {
  return typeof node.description === 'string' ? node.description : node.description[framework];
}

export interface ResolvedTrigger {
  trigger: Trigger;
  sourceName: string;
}

export interface ResolvedBuild {
  /** Stats with every unconditional modifier applied. */
  stats: StatBlock;
  /** Modifiers whose `when` must be checked per resolved roll. */
  conditional: StatModifier[];
  flags: Set<FlagKey>;
  /** Trigger plus the upgrade that supplied it, for mechanical feedback. */
  triggers: ResolvedTrigger[];
  regionCounts: Record<Region, number>;
}

function applyModifiers(stats: StatBlock, mods: StatModifier[]): void {
  // Additive first, then multiplicative — predictable and order-independent
  // within each phase.
  for (const m of mods) if (m.op === 'add') stats[m.stat] += m.value;
  for (const m of mods) if (m.op === 'mult') stats[m.stat] *= m.value;
}

export function resolveBuild(allocated: ReadonlySet<string>): ResolvedBuild {
  const stats: StatBlock = { ...BASE_STATS };
  const unconditional: StatModifier[] = [];
  const conditional: StatModifier[] = [];
  const flags = new Set<FlagKey>();
  const triggers: ResolvedTrigger[] = [];
  const regionCounts = {
    core: 0, high: 0, volume: 0, jackpot: 0, control: 0, pattern: 0, adaptive: 0,
  } as Record<Region, number>;

  for (const node of NODES) {
    if (!allocated.has(node.id)) continue;
    regionCounts[node.region] += 1;
    // A bridge counts toward both of the regions it joins.
    if (node.bridges) for (const r of node.bridges) if (r !== node.region) regionCounts[r] += 1;
    for (const m of node.modifiers ?? []) (m.when?.length ? conditional : unconditional).push(m);
    for (const f of node.flags ?? []) flags.add(f);
    for (const t of node.triggers ?? []) triggers.push({ trigger: t, sourceName: node.name });
  }

  applyModifiers(stats, unconditional);
  return { stats, conditional, flags, triggers, regionCounts };
}

/** Distinct archetype regions holding at least `min` allocated nodes. */
export function regionsInvested(build: ResolvedBuild, min = 2): number {
  return ARCHETYPE_REGIONS.filter((r) => build.regionCounts[r] >= min).length;
}

export type AllocationError =
  | 'unknown-node'
  | 'already-allocated'
  | 'undiscovered'
  | 'missing-prerequisite'
  | 'insufficient-score'
  | 'insufficient-meta';

export interface AllocationCheck {
  ok: boolean;
  reason?: AllocationError;
}

export function isVisible(node: PassiveNode, discovered: ReadonlySet<DiscoveryFlag>): boolean {
  return (node.discoveryRequirements ?? []).every((d) => discovered.has(d));
}

export function checkAllocation(
  nodeId: string,
  ctx: {
    allocated: ReadonlySet<string>;
    discovered: ReadonlySet<DiscoveryFlag>;
    score: number;
    meta: number;
  },
): AllocationCheck {
  const node = NODES_BY_ID.get(nodeId);
  if (!node) return { ok: false, reason: 'unknown-node' };
  if (ctx.allocated.has(nodeId)) return { ok: false, reason: 'already-allocated' };
  if (!isVisible(node, ctx.discovered)) return { ok: false, reason: 'undiscovered' };
  if (node.prerequisites.length > 0 && !node.prerequisites.some((p) => ctx.allocated.has(p))) {
    return { ok: false, reason: 'missing-prerequisite' };
  }
  if ((node.costs.score ?? 0) > ctx.score) return { ok: false, reason: 'insufficient-score' };
  if ((node.costs.meta ?? 0) > ctx.meta) return { ok: false, reason: 'insufficient-meta' };
  return { ok: true };
}

/** True when the node's prerequisites are satisfied, ignoring affordability. */
export function isReachable(nodeId: string, allocated: ReadonlySet<string>): boolean {
  const node = NODES_BY_ID.get(nodeId);
  if (!node) return false;
  if (node.prerequisites.length === 0) return true;
  return node.prerequisites.some((p) => allocated.has(p));
}

/**
 * The only values of a currency the build tree can tell apart.
 *
 * Every node's shading turns on one question -- can this be bought -- and
 * that question is a set of `>=` tests against a fixed, small list of costs.
 * Between one cost and the next, every value of Score produces exactly the
 * same tree, so the tree does not need to be told about any of them.
 *
 * That matters because Score moves continuously: Entropy pulls on it every
 * frame, and the raw number was being handed to the tree as a prop. It defeated
 * the tree's memo outright -- a rebuild of every node's status and a fresh
 * render of the whole web on each frame the number ticked, for a picture that
 * had not changed since the last time the player crossed a price.
 *
 * `affordanceOf` rounds a currency down to the largest cost at or below it,
 * which every test answers identically and none can distinguish. Zero is one
 * of those costs -- a node that is priced at nothing is affordable at nothing
 * and not affordable at less than nothing -- so it is in the list, and a
 * currency below every price rounds to -1, which nothing is priced at.
 */
function costSteps(of: (node: PassiveNode) => number | undefined): number[] {
  const seen = new Set<number>([0]);
  for (const node of NODES) seen.add(of(node) ?? 0);
  return [...seen].sort((a, b) => a - b);
}

const SCORE_STEPS = costSteps((n) => n.costs.score);
const META_STEPS = costSteps((n) => n.costs.meta);

function stepAtOrBelow(steps: number[], value: number): number {
  let lo = -1;
  for (const step of steps) {
    if (step > value) break;
    lo = step;
  }
  return lo;
}

export function affordanceOf(score: number, meta: number): { score: number; meta: number } {
  return {
    score: stepAtOrBelow(SCORE_STEPS, score),
    meta: stepAtOrBelow(META_STEPS, meta),
  };
}
