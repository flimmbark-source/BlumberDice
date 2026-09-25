import { NODES, NODES_BY_ID } from './nodes.ts';
import {
  ARCHETYPE_REGIONS,
  BASE_STATS,
  type DiscoveryFlag,
  type FlagKey,
  type PassiveNode,
  type Region,
  type StatBlock,
  type StatModifier,
  type Trigger,
} from './types.ts';

export interface ResolvedBuild {
  /** Stats with every unconditional modifier applied. */
  stats: StatBlock;
  /** Modifiers whose `when` must be checked per resolved roll. */
  conditional: StatModifier[];
  flags: Set<FlagKey>;
  triggers: Trigger[];
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
  const triggers: Trigger[] = [];
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
    for (const t of node.triggers ?? []) triggers.push(t);
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
