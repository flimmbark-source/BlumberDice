import { NODES_BY_ID } from './nodes.ts';
import {
  createGame, drain, getBuild, manualRoll, switchFramework,
  type DecisionPolicy, type GameState,
  syncAllowed,
} from './game.ts';
import type { Face } from './types.ts';

/**
 * Allocates nodes ignoring cost and prerequisites. Build fixtures only —
 * the cost and prerequisite rules are exercised by their own tests.
 */
export function forceAllocate(s: GameState, ids: string[]): void {
  for (const id of ids) {
    if (!NODES_BY_ID.has(id)) throw new Error(`unknown node in fixture: ${id}`);
    if (!s.allocated.includes(id)) s.allocated.push(id);
  }
}

export interface SimResult {
  state: GameState;
  manualRolls: number;
  resolvedRolls: number;
  scoreEarned: number;
  scoreLost: number;
  metaEarned: number;
  rollsPerManual: number;
  averageFace: number;
  scorePerManual: number;
  metaPerManual: number;
}

function summarise(s: GameState, before: GameState['stats'], manuals: number): SimResult {
  const resolved = (s.stats.rollsA + s.stats.rollsB) - (before.rollsA + before.rollsB);
  let faceTotal = 0;
  let faceCount = 0;
  for (const f of [1, 2, 3, 4, 5, 6] as Face[]) {
    const n = s.stats.faceCounts[f] - before.faceCounts[f];
    faceTotal += n * f;
    faceCount += n;
  }
  return {
    state: s,
    manualRolls: manuals,
    resolvedRolls: resolved,
    scoreEarned: s.stats.scoreEarned - before.scoreEarned,
    scoreLost: s.stats.scoreLost - before.scoreLost,
    metaEarned: s.stats.metaEarned - before.metaEarned,
    rollsPerManual: manuals > 0 ? resolved / manuals : 0,
    averageFace: faceCount > 0 ? faceTotal / faceCount : 0,
    scorePerManual: manuals > 0 ? (s.stats.scoreEarned - before.scoreEarned) / manuals : 0,
    metaPerManual: manuals > 0 ? (s.stats.metaEarned - before.metaEarned) / manuals : 0,
  };
}

export interface SimOptions {
  seed?: number;
  nodes?: string[];
  framework?: 'A' | 'B';
  policies?: Partial<DecisionPolicy>;
  /** Score handed to the build so Framework B has something to consume. */
  startingScore?: number;
  state?: GameState;
}

export function makeBuild(opts: SimOptions = {}): GameState {
  const s = opts.state ?? createGame(opts.seed ?? 12345);
  if (opts.nodes) forceAllocate(s, opts.nodes);
  // forceAllocate writes the build in directly, so derived state that
  // allocate() would have synced has to be brought up to date here.
  syncAllowed(s);
  if (opts.policies) Object.assign(s.policies, opts.policies);
  if (opts.startingScore !== undefined) s.score = opts.startingScore;
  if (opts.framework && opts.framework !== s.framework) {
    // Bypass the discovery gate: fixtures test mechanics, not disclosure.
    if (!s.discovered.includes('frameworkB')) s.discovered.push('frameworkB');
    switchFramework(s);
  }
  return s;
}

/** Runs `manuals` manual rolls, draining every cascade in between. */
export function runManualRolls(s: GameState, manuals: number): SimResult {
  const before = structuredClone(s.stats);
  for (let i = 0; i < manuals; i++) {
    s.cooldownRemaining = 0;
    manualRoll(s);
    drain(s);
  }
  return summarise(s, before, manuals);
}

export function simulate(manuals: number, opts: SimOptions = {}): SimResult {
  const s = makeBuild(opts);
  return runManualRolls(s, manuals);
}

/** Sanity helper: does this build actually switch on the flags it should? */
export function buildFlags(s: GameState): string[] {
  return [...getBuild(s).flags].sort();
}
