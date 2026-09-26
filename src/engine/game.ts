import {
  buildDistribution, drawFaces, OPPOSITE_FACE, sampleFace, sampleFaceAmong, sampleFaceExcluding,
  type Distribution,
} from './dice.ts';
import { NODES_BY_ID } from './nodes.ts';
import { createPatternState, pushRoll, type PatternHit, type PatternName, type PatternState } from './patterns.ts';
import { chance, createRng, next, type RngState } from './rng.ts';
import { checkAllocation, regionsInvested, resolveBuild, type AllocationError, type ResolvedBuild } from './tree.ts';
import {
  FACES,
  type Condition,
  type DiscoveryFlag,
  type Face,
  type FrameworkId,
  type RuntimeEffect,
  type StatBlock,
  type StatKey,
  type StatModifier,
  type TriggerEvent,
} from './types.ts';

// ---------------------------------------------------------------------------
// Tunables. Balance values, not design commitments.
// ---------------------------------------------------------------------------

export const CONFIG = {
  baseCooldownMs: 700,
  resolveStaggerMs: 70,
  fastStaggerMs: 22,
  fastStaggerThreshold: 12,
  maxPendingRolls: 400,
  maxBonusDepth: 40,
  /**
   * A single action resolves at most this many rolls. Without it a build whose
   * expected bonus rolls per roll exceeds 1 cascades forever. Legible, capped,
   * and shown in the stats panel rather than hidden.
   */
  maxRollsPerAction: 250,
  /** How long a die left behind by a bonus roll keeps rolling with you. */
  bonusDieMs: 5000,
  /**
   * Ceiling on those dice. Each one rolls, each roll can grant another bonus
   * roll, so without a cap the loop feeds itself; this also keeps a click
   * inside what the tray can show.
   */
  maxBonusDice: 6,
  letItRideMinPayout: 15,
  letItRideMult: 3,
  ticketWeightPerStack: 0.08,
  ticketMaxStacks: 20,
  climbMaxStacks: 5,
  climbWeightPerStack: 0.3,
  afterimageWindow: 3,
  pendulumMaxStacks: 25,
  pendulumRolls: 3,
  /**
   * PROPOSED placeholder gate for the Framework B discovery. The spec leaves
   * the discovery sequence unresolved; this is deliberately mechanical and
   * swappable. See docs/DESIGN_STATE.md.
   */
  discoveryRollThreshold: 100,
  discoveryHintThreshold: 250,
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export type DecisionPolicy = {
  loadedChoice: 'ask' | 'higher' | 'lower';
  hold: 'ask' | 'never';
  flip: 'ask' | 'never' | 'higher' | 'lower';
  letItRide: 'ask' | 'bank' | 'ride';
};

export type RollStage = 'generate' | 'loadedChoice' | 'hold' | 'flip' | 'finalize' | 'ride';

export interface RollProc {
  kind: 'jackpot' | 'pattern' | 'bonus';
  /** Short mechanical name shown at the die that caused it. */
  label: string;
  /** Compact result text, e.g. "+14 Score" or "+1 Bonus Roll". */
  detail?: string;
}

export interface RollIntent {
  id: number;
  isBonus: boolean;
  depth: number;
  stage: RollStage;
  /** Presentation events caused by this roll, emitted with its RollRecord. */
  procs: RollProc[];
  candidates?: Face[];
  face?: Face;
  staked: number;
  payout: number;
  scoreBefore: number;
  metaBefore: number;
}

export type Decision =
  | { kind: 'loadedChoice'; intentId: number; options: Face[] }
  | { kind: 'hold'; intentId: number; face: Face; canStore: boolean; heldOptions: Face[]; reactive: boolean }
  | { kind: 'flip'; intentId: number; face: Face; flipped: Face }
  | { kind: 'letItRide'; intentId: number; amount: number };

export interface TimedEffect {
  stat?: StatKey;
  face?: Face;
  op?: 'add' | 'mult';
  value: number;
  expiresAt: number;
}

export interface Transient {
  climb: number;
  counters: Record<string, number>;
  weightPush: TimedEffect[];
  tempStats: TimedEffect[];
  rollsSinceBonus: number;
  flipCooldown: number;
}

/**
 * One resolved roll, for the presentation layer. The dice animation is a
 * visualisation of results the engine has already decided; it never influences
 * them.
 */
export interface RollRecord {
  id: number;
  face: Face;
  /** What this roll alone did to each currency. */
  score: number;
  meta: number;
  framework: FrameworkId;
  /** Mechanical events that should resolve visually from this die. */
  procs?: RollProc[];
}

export interface LogEntry {
  id: number;
  text: string;
  kind: 'score' | 'meta' | 'loss' | 'pattern' | 'jackpot' | 'bonus' | 'system';
}

export interface RunStats {
  rollsA: number;
  rollsB: number;
  manualRolls: number;
  bonusRolls: number;
  scoreEarned: number;
  scoreLost: number;
  metaEarned: number;
  jackpots: number;
  faceCounts: Record<Face, number>;
  patternCounts: Partial<Record<PatternName, number>>;
  switches: number;
}

export interface GameState {
  version: number;
  rng: RngState;

  score: number;
  meta: number;
  framework: FrameworkId;

  allocated: string[];
  discovered: DiscoveryFlag[];
  /**
   * The node the player is saving toward, if they picked one. A goal, not a
   * recommendation: nothing sets this but an explicit choice in the web.
   */
  pinned: string | null;
  sawStats: boolean;

  totalRolls: number;
  lastFace: Face | null;
  pattern: PatternState;
  transient: Transient;

  // Persistent control state — survives a framework change.
  held: Face[];
  /**
   * Prepared Roll's window: the only faces the next roll may land on. Redrawn
   * after every roll. Empty when the keystone is not allocated.
   */
  allowed: Face[];
  sealedFace: Face | null;
  useHeldNext: number | null;
  /** When set, the next resolved roll is stored instead of resolving. */
  storeNext: boolean;

  // Pacing
  cooldownRemaining: number;
  /**
   * Time left on each die a bonus roll left behind, newest last. They roll
   * alongside yours until they lapse, and rolling does not extend them.
   */
  bonusDice: number[];
  resolveTimer: number;
  pending: RollIntent[];
  decision: Decision | null;
  nextIntentId: number;
  /** Rolls still allowed to be queued for the current action. */
  actionBudget: number;

  // Jackpot wagering
  stakeAmount: number;
  riding: number;

  // Adaptive
  rollsSinceSwitch: number;
  faceBeforeSwitch: Face | null;
  awaitingReflection: boolean;
  pendulumRollsLeft: number;
  pendulumPayout: number;

  policies: DecisionPolicy;
  log: LogEntry[];
  nextLogId: number;
  /** Recent resolved rolls, newest last. Capped; purely for feedback. */
  rollLog: RollRecord[];
  stats: RunStats;
}

export function createGame(seed = 0x5eed1e): GameState {
  return {
    version: 1,
    rng: createRng(seed),
    score: 0,
    meta: 0,
    framework: 'A',
    allocated: ['start'],
    discovered: [],
    pinned: null,
    sawStats: false,
    totalRolls: 0,
    lastFace: null,
    pattern: createPatternState(),
    transient: emptyTransient(),
    held: [],
    allowed: [],
    sealedFace: null,
    useHeldNext: null,
    storeNext: false,
    cooldownRemaining: 0,
    bonusDice: [],
    resolveTimer: 0,
    pending: [],
    decision: null,
    nextIntentId: 1,
    actionBudget: 0,
    stakeAmount: 0,
    riding: 0,
    rollsSinceSwitch: 0,
    faceBeforeSwitch: null,
    awaitingReflection: false,
    pendulumRollsLeft: 0,
    pendulumPayout: 0,
    policies: { loadedChoice: 'ask', hold: 'ask', flip: 'ask', letItRide: 'ask' },
    log: [],
    nextLogId: 1,
    rollLog: [],
    stats: {
      rollsA: 0, rollsB: 0, manualRolls: 0, bonusRolls: 0,
      scoreEarned: 0, scoreLost: 0, metaEarned: 0, jackpots: 0,
      faceCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 },
      patternCounts: {},
      switches: 0,
    },
  };
}

function emptyTransient(): Transient {
  return {
    climb: 0,
    counters: { pressure: 0, tickets: 0, pendulum: 0 },
    weightPush: [],
    tempStats: [],
    rollsSinceBonus: 0,
    flipCooldown: 0,
  };
}

// ---------------------------------------------------------------------------
// Derived view
// ---------------------------------------------------------------------------

export function getBuild(s: GameState): ResolvedBuild {
  return resolveBuild(new Set(s.allocated));
}

interface RollCtx {
  face: Face;
  framework: FrameworkId;
  isBonus: boolean;
  score: number;
  jackpotHit: boolean;
  pattern?: PatternName;
  patternEnd?: Face;
  rollsSinceSwitch: number;
  rollsSinceBonus: number;
  counters: Record<string, number>;
}

function evalCondition(s: GameState, c: Condition, ctx: RollCtx): boolean {
  switch (c.kind) {
    case 'face': return c.in.includes(ctx.face);
    case 'faceAtLeast': return ctx.face >= c.value;
    case 'framework': return ctx.framework === c.is;
    case 'chance': return chance(s.rng, c.p);
    case 'isBonus': return ctx.isBonus === c.is;
    case 'scoreBelow': return ctx.score < c.value;
    case 'scoreAbove': return ctx.score > c.value;
    case 'counterAtLeast': return (ctx.counters[c.id] ?? 0) >= c.value;
    case 'pattern': return ctx.pattern !== undefined && c.in.includes(ctx.pattern);
    case 'patternEndsAtLeast': return ctx.patternEnd !== undefined && ctx.patternEnd >= c.value;
    case 'rollsSinceSwitchBelow': return ctx.rollsSinceSwitch < c.value;
    case 'rollsSinceBonusAtLeast': return ctx.rollsSinceBonus >= c.value;
    case 'jackpotHit': return ctx.jackpotHit === c.is;
  }
}

function evalAll(s: GameState, conds: Condition[] | undefined, ctx: RollCtx): boolean {
  if (!conds || conds.length === 0) return true;
  // Evaluated in order; `chance` conditions consume RNG only if reached.
  for (const c of conds) if (!evalCondition(s, c, ctx)) return false;
  return true;
}

/** Stats with conditional modifiers and active temporary effects folded in. */
function effectiveStats(s: GameState, build: ResolvedBuild, ctx: RollCtx): StatBlock {
  const stats: StatBlock = { ...build.stats };
  const active: StatModifier[] = [];
  for (const m of build.conditional) {
    if (evalAll(s, m.when, ctx)) active.push(m);
  }
  for (const m of active) if (m.op === 'add') stats[m.stat] += m.value;
  for (const t of s.transient.tempStats) {
    if (t.stat && t.op === 'add') stats[t.stat] += t.value;
  }
  for (const m of active) if (m.op === 'mult') stats[m.stat] *= m.value;
  for (const t of s.transient.tempStats) {
    if (t.stat && t.op === 'mult') stats[t.stat] *= t.value;
  }
  return stats;
}

/** Stats for display and sampling, evaluated without a specific roll in hand. */
export function displayStats(s: GameState, build = getBuild(s)): StatBlock {
  const ctx: RollCtx = {
    face: 1, framework: s.framework, isBonus: false, score: s.score, jackpotHit: false,
    rollsSinceSwitch: s.rollsSinceSwitch, rollsSinceBonus: s.transient.rollsSinceBonus,
    counters: s.transient.counters,
  };
  const stats: StatBlock = { ...build.stats };
  // Face-dependent conditionals are skipped here; probability and pacing stats
  // never depend on the face, so the distribution shown is exact.
  const active = build.conditional.filter((m) =>
    !m.when?.some((c) => c.kind === 'face' || c.kind === 'faceAtLeast' || c.kind === 'chance')
    && evalAll(s, m.when, ctx),
  );
  for (const m of active) if (m.op === 'add') stats[m.stat] += m.value;
  for (const t of s.transient.tempStats) if (t.stat && t.op === 'add') stats[t.stat] += t.value;
  for (const m of active) if (m.op === 'mult') stats[m.stat] *= m.value;
  for (const t of s.transient.tempStats) if (t.stat && t.op === 'mult') stats[t.stat] *= t.value;
  return stats;
}

/** The distribution the next roll will be sampled from. */
export function currentDistribution(s: GameState, build = getBuild(s)): Distribution {
  const stats = displayStats(s, build);
  return buildDistribution(stats, {
    sealedFace: s.sealedFace,
    weightPush: collectWeightPush(s, build),
  });
}

function collectWeightPush(s: GameState, build: ResolvedBuild): Partial<Record<Face, number>> {
  const push: Partial<Record<Face, number>> = {};
  for (const e of s.transient.weightPush) {
    if (e.face) push[e.face] = (push[e.face] ?? 0) + e.value;
  }
  if (build.flags.has('climb') && s.transient.climb > 0) {
    const add = s.transient.climb * CONFIG.climbWeightPerStack;
    for (const f of [4, 5, 6] as Face[]) push[f] = (push[f] ?? 0) + add;
  }
  if (build.flags.has('moreTickets')) {
    const stacks = Math.min(s.transient.counters.tickets ?? 0, CONFIG.ticketMaxStacks);
    if (stacks > 0) push[6] = (push[6] ?? 0) + stacks * CONFIG.ticketWeightPerStack;
  }
  return push;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function log(s: GameState, kind: LogEntry['kind'], text: string): void {
  s.log.push({ id: s.nextLogId++, kind, text });
  if (s.log.length > 60) s.log.splice(0, s.log.length - 60);
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------

function queueBonusRolls(s: GameState, count: number, depth: number): number {
  let queued = 0;
  for (let i = 0; i < count; i++) {
    if (s.actionBudget <= 0) break;
    if (s.pending.length >= CONFIG.maxPendingRolls) break;
    if (depth >= CONFIG.maxBonusDepth) break;
    s.actionBudget -= 1;
    s.pending.push({
      id: s.nextIntentId++,
      isBonus: true,
      depth: depth + 1,
      stage: 'generate',
      procs: [],
      staked: 0,
      payout: 0,
      scoreBefore: 0,
      metaBefore: 0,
    });
    queued += 1;
    s.stats.bonusRolls += 1;
    // The roll resolves now, and also leaves a die behind for a while.
    if (s.bonusDice.length < CONFIG.maxBonusDice) s.bonusDice.push(CONFIG.bonusDieMs);
  }
  if (queued > 0) s.transient.rollsSinceBonus = 0;
  return queued;
}

function grantScore(s: GameState, amount: number): void {
  if (amount <= 0) return;
  s.score += amount;
  s.stats.scoreEarned += amount;
}

function grantMeta(s: GameState, amount: number): void {
  if (amount <= 0) return;
  s.meta += amount;
  s.stats.metaEarned += amount;
}

function applyEffects(
  s: GameState,
  effects: RuntimeEffect[],
  _ctx: RollCtx,
  opts: { depth: number; rewardMult: number },
): string[] {
  const details: string[] = [];
  for (const e of effects) {
    switch (e.kind) {
      case 'bonusRoll': {
        const queued = queueBonusRolls(s, e.count, opts.depth);
        if (queued > 0) details.push(`+${queued} Bonus Roll${queued === 1 ? '' : 's'}`);
        break;
      }
      case 'reward': {
        // Framework-shaped payout. Never scaled by the rolled value.
        if (s.framework === 'A') {
          const amt = Math.round(e.score * opts.rewardMult);
          if (amt > 0) {
            grantScore(s, amt);
            log(s, 'pattern', `+${amt} Score`);
            details.push(`+${amt} Score`);
          }
        } else {
          const amt = Math.round(e.meta * opts.rewardMult);
          if (amt > 0) {
            grantMeta(s, amt);
            log(s, 'pattern', `+${amt} Meta`);
            details.push(`+${amt} Meta`);
          }
        }
        break;
      }
      case 'score':
        grantScore(s, e.amount);
        if (e.amount > 0) details.push(`+${e.amount} Score`);
        break;
      case 'meta':
        grantMeta(s, e.amount);
        if (e.amount > 0) details.push(`+${e.amount} Meta`);
        break;
      case 'weightFor':
        s.transient.weightPush.push({ face: e.face, value: e.add, expiresAt: s.totalRolls + 1 + e.rolls });
        break;
      case 'tempStat':
        s.transient.tempStats.push({
          stat: e.stat, op: e.op, value: e.value, expiresAt: s.totalRolls + 1 + e.rolls,
        });
        break;
      case 'counter': {
        const cur = s.transient.counters[e.id] ?? 0;
        const nextVal = cur + e.add;
        s.transient.counters[e.id] = e.cap !== undefined ? Math.min(nextVal, e.cap) : nextVal;
        break;
      }
      case 'resetCounter':
        s.transient.counters[e.id] = 0;
        break;
    }
  }
  return details;
}

function fireTriggers(
  s: GameState,
  build: ResolvedBuild,
  event: TriggerEvent,
  ctx: RollCtx,
  opts: { depth: number; rewardMult: number },
): string[] {
  const details: string[] = [];
  for (const t of build.triggers) {
    if (t.on !== event) continue;
    if (!evalAll(s, t.when, ctx)) continue;
    details.push(...applyEffects(s, t.effects, ctx, opts));
  }
  return details;
}

const PATTERN_LABEL: Record<PatternName, string> = {
  pair: 'DOUBLES',
  triple: 'TRIPLE',
  step: 'STEP',
  run: 'RUN',
  longRun: 'LONG RUN',
  palindrome: 'PALINDROME',
  longPalindrome: 'LONG PALINDROME',
  alternating: 'ALTERNATING',
  fullSet: 'FULL SET',
  newFace: 'NEW FACE',
};

// ---------------------------------------------------------------------------
// Roll pipeline
// ---------------------------------------------------------------------------

function purgeExpired(s: GameState): void {
  s.transient.weightPush = s.transient.weightPush.filter((e) => e.expiresAt > s.totalRolls);
  s.transient.tempStats = s.transient.tempStats.filter((e) => e.expiresAt > s.totalRolls);
}

/**
 * Redraws the window of faces the die may land on.
 *
 * The faces are drawn weighted and distinct, so a build that has pushed
 * weight onto 5 and 6 sees them in the window more often — the keystone
 * narrows the die without overriding what the rest of the build did to it.
 */
function drawAllowed(s: GameState, build: ResolvedBuild): void {
  const want = Math.max(1, Math.floor(displayStats(s, build).allowedFaces));
  s.allowed = drawFaces(s.rng, currentDistribution(s, build), want);
}

/**
 * Pre-resolution replacement effects that act on a single determined face.
 *
 * Anything here that rolls again rolls inside Prepared Roll's window, and
 * Raised Floor only lifts a 1 to a 2 when a 2 is in it. Otherwise "results
 * can only be one of the three shown" would be false whenever one of these
 * fired. Flip, Hold and Afterimage are excepted on purpose: those are
 * substitutions the player built to override the die, not rolls.
 */
function refineFace(s: GameState, build: ResolvedBuild, face: Face): Face {
  const stats = displayStats(s, build);
  const window = build.flags.has('preparedRoll') ? s.allowed : null;
  const resample = (): Face => (window && window.length > 0
    ? sampleFaceAmong(s.rng, currentDistribution(s, build), window)
    : sampleFace(s.rng, currentDistribution(s, build)));
  let f = face;

  if (f === 1 && stats.rerollOneChance > 0 && chance(s.rng, stats.rerollOneChance)) {
    f = resample();
  }
  if (
    f === 1 && stats.raisedFloorChance > 0
    && (!window || window.includes(2))
    && chance(s.rng, stats.raisedFloorChance)
  ) {
    f = 2;
  }
  if (build.flags.has('noGoingBack') && s.lastFace === 6 && f === 1) {
    f = window && window.some((x) => x !== 1)
      ? sampleFaceAmong(s.rng, currentDistribution(s, build), window.filter((x) => x !== 1))
      : sampleFaceExcluding(s.rng, currentDistribution(s, build), 1);
  }
  return f;
}

type ProcessResult = 'done' | 'suspended';

function processIntent(s: GameState, intent: RollIntent): ProcessResult {
  const build = getBuild(s);

  for (;;) {
    switch (intent.stage) {
      case 'generate': {
        purgeExpired(s);
        let face: Face | null = null;

        // A held result declared before the roll replaces the sample entirely.
        if (s.useHeldNext !== null && s.held[s.useHeldNext] !== undefined && !intent.isBonus) {
          face = s.held[s.useHeldNext];
          s.held.splice(s.useHeldNext, 1);
          s.useHeldNext = null;
          log(s, 'system', `Held ${face} played`);
        } else if (
          build.flags.has('afterimage')
          && intent.isBonus
          && s.rollsSinceSwitch < CONFIG.afterimageWindow
          && s.faceBeforeSwitch !== null
        ) {
          face = s.faceBeforeSwitch;
        }

        const prepared = build.flags.has('preparedRoll');
        if (prepared && s.allowed.length === 0) drawAllowed(s, build);
        const window = prepared ? s.allowed : null;
        const draw = (): Face => (window && window.length > 0
          ? sampleFaceAmong(s.rng, currentDistribution(s, build), window)
          : sampleFace(s.rng, currentDistribution(s, build)));

        if (face === null && build.flags.has('loadedChoice')) {
          // Both keystones stay live, and compose more simply than before:
          // the window constrains what may be rolled, so both candidates are
          // drawn from inside it and the player still picks between them.
          const candidates: Face[] = [draw(), draw()];
          intent.candidates = candidates;
          intent.stage = 'loadedChoice';
          break;
        }

        intent.face = refineFace(s, build, face ?? draw());
        intent.stage = 'hold';
        break;
      }

      case 'loadedChoice': {
        const opts = intent.candidates!;
        const policy = s.policies.loadedChoice;
        if (policy === 'ask') {
          s.decision = {
            kind: 'loadedChoice', intentId: intent.id, options: opts,
          };
          return 'suspended';
        }
        let pick = 0;
        for (let i = 1; i < opts.length; i++) {
          const better = policy === 'higher' ? opts[i] > opts[pick] : opts[i] < opts[pick];
          if (better) pick = i;
        }
        takeCandidate(s, build, intent, pick);
        break;
      }

      case 'hold': {
        if (!build.flags.has('hold')) { intent.stage = 'flip'; break; }
        const capacity = Math.floor(displayStats(s, build).holdCapacity);

        // Storing is declared before the roll, so it needs no prompt.
        if (s.storeNext && s.held.length < capacity) {
          s.storeNext = false;
          s.held.push(intent.face!);
          log(s, 'system', `Held ${intent.face}`);
          s.pending.splice(s.pending.indexOf(intent), 1);
          return 'done';
        }

        // Hedge is what makes the swap reactive: it happens after the face is
        // known. Without it a held result can only be played before the roll.
        if (build.flags.has('hedge') && s.held.length > 0 && s.policies.hold === 'ask') {
          s.decision = {
            kind: 'hold',
            intentId: intent.id,
            face: intent.face!,
            canStore: s.held.length < capacity,
            heldOptions: s.held.slice(),
            reactive: true,
          };
          return 'suspended';
        }
        intent.stage = 'flip';
        break;
      }

      case 'flip': {
        if (!build.flags.has('flip') || s.transient.flipCooldown > 0) { intent.stage = 'finalize'; break; }
        const face = intent.face!;
        const flipped = OPPOSITE_FACE[face];
        const policy = s.policies.flip;
        if (policy === 'never') { intent.stage = 'finalize'; break; }
        if (policy === 'ask') {
          s.decision = { kind: 'flip', intentId: intent.id, face, flipped };
          return 'suspended';
        }
        const wants = policy === 'higher' ? flipped > face : flipped < face;
        if (wants) {
          intent.face = flipped;
          s.transient.flipCooldown = Math.floor(displayStats(s, build).flipPeriod);
        }
        intent.stage = 'finalize';
        break;
      }

      case 'finalize': {
        const suspended = finalizeRoll(s, build, intent);
        if (suspended) return 'suspended';
        return 'done';
      }

      case 'ride':
        // Waiting on the player; resolveDecision moves it along.
        return 'suspended';
    }
  }
}

/** Locks in one of the Loaded Choice candidates, consuming the queue if taken. */
function takeCandidate(
  s: GameState, build: ResolvedBuild, intent: RollIntent, index: number,
): void {
  const opts = intent.candidates ?? [];
  const i = index >= 0 && index < opts.length ? index : 0;
  intent.face = refineFace(s, build, opts[i]);
  intent.stage = 'hold';
}

function finalizeRoll(s: GameState, build: ResolvedBuild, intent: RollIntent): boolean {
  const face = intent.face!;
  intent.scoreBefore = s.score;
  intent.metaBefore = s.meta;
  const framework = s.framework;
  const inA = framework === 'A';

  // Resolve a payout left riding from the previous roll.
  if (s.riding > 0) {
    const jackpotNow = inA && build.flags.has('jackpot') && face === 6;
    if (jackpotNow) {
      const won = Math.round(s.riding * CONFIG.letItRideMult);
      grantScore(s, won);
      log(s, 'jackpot', `Ride paid +${won} Score`);
      intent.procs.push({ kind: 'jackpot', label: 'RIDE HIT', detail: `+${won} Score` });
    } else {
      log(s, 'loss', `Ride lost ${Math.round(s.riding)} Score`);
    }
    s.riding = 0;
  }

  const jackpotEnabled = build.flags.has('jackpot');
  const jackpotHit = inA && jackpotEnabled && face === 6;

  const ctx: RollCtx = {
    face,
    framework,
    isBonus: intent.isBonus,
    score: s.score,
    jackpotHit,
    rollsSinceSwitch: s.rollsSinceSwitch,
    rollsSinceBonus: s.transient.rollsSinceBonus,
    counters: s.transient.counters,
  };
  const stats = effectiveStats(s, build, ctx);
  const rewardMult = stats.patternRewardMult;
  const depth = intent.depth;

  // --- Climb --------------------------------------------------------------
  if (build.flags.has('climb')) {
    if (s.lastFace !== null && face > s.lastFace) {
      s.transient.climb = Math.min(s.transient.climb + 1, CONFIG.climbMaxStacks);
    } else {
      s.transient.climb = 0;
    }
  }

  // --- Reflection ---------------------------------------------------------
  if (s.awaitingReflection) {
    s.awaitingReflection = false;
    if (build.flags.has('reflection') && s.faceBeforeSwitch === face) {
      const mult = build.flags.has('duality') ? 2 : 1;
      queueBonusRolls(s, 2 * mult, depth);
      if (inA) { grantScore(s, 60 * mult); log(s, 'score', `Reflection +${60 * mult} Score`); }
      else { grantMeta(s, 4 * mult); log(s, 'meta', `Reflection +${4 * mult} Meta`); }
    }
  }

  // --- Pendulum -----------------------------------------------------------
  if (s.pendulumRollsLeft > 0) {
    s.pendulumRollsLeft -= 1;
    const mult = build.flags.has('duality') ? 2 : 1;
    if (inA) {
      const amt = Math.round((s.pendulumPayout / 5) * mult);
      if (amt > 0) { grantScore(s, amt); log(s, 'score', `Pendulum +${amt} Score`); }
    } else {
      const amt = Math.round((s.pendulumPayout / 10) * mult);
      if (amt > 0) { grantMeta(s, amt); log(s, 'meta', `Pendulum +${amt} Meta`); }
    }
  }
  if (build.flags.has('pendulum')) {
    s.transient.counters.pendulum = Math.min(
      (s.transient.counters.pendulum ?? 0) + 1, CONFIG.pendulumMaxStacks,
    );
  }

  // --- Patterns -----------------------------------------------------------
  const hits: PatternHit[] = pushRoll(s.pattern, face, {
    window: Math.floor(stats.historyWindow),
    memory: build.flags.has('memory'),
  });

  // "Changes every roll": a fresh window the moment this one is spent, so
  // what the player is looking at is always the next roll's window.
  if (build.flags.has('preparedRoll')) drawAllowed(s, build);
  for (const hit of hits) {
    s.stats.patternCounts[hit.name] = (s.stats.patternCounts[hit.name] ?? 0) + 1;
  }

  // --- Economy ------------------------------------------------------------
  if (inA) {
    s.stats.rollsA += 1;
    let gain = 0;
    if (build.flags.has('oneInSix')) {
      if (face === 6) gain = (face * 9 + stats.scoreFlat) * stats.scoreMult;
    } else {
      gain = (face + stats.scoreFlat) * stats.scoreMult;
    }
    gain = Math.max(0, gain);

    if (jackpotHit) {
      const pressure = s.transient.counters.pressure ?? 0;
      const payout = (stats.jackpotFlat + pressure) * stats.jackpotMult;
      gain += payout;
      s.transient.counters.pressure = 0;
      s.transient.counters.tickets = 0;
      s.stats.jackpots += 1;
      log(s, 'jackpot', `Jackpot +${Math.round(payout)} Score`);
      intent.procs.push({
        kind: 'jackpot',
        label: 'JACKPOT',
        detail: `+${Math.round(payout)} Score`,
      });
    } else if (jackpotEnabled) {
      s.transient.counters.pressure = Math.min(
        (s.transient.counters.pressure ?? 0) + stats.pressurePerMiss,
        stats.pressureCap,
      );
      if (build.flags.has('moreTickets')) {
        s.transient.counters.tickets = Math.min(
          (s.transient.counters.tickets ?? 0) + 1, CONFIG.ticketMaxStacks,
        );
      }
    }

    // Wager settlement (Framework A only).
    if (intent.staked > 0) {
      if (jackpotHit) {
        const ret = Math.round(intent.staked * stats.stakeReturnMult);
        grantScore(s, ret);
        log(s, 'jackpot', `Wager returned +${ret} Score`);
      } else if (stats.stakeRefundOnMiss > 0) {
        const ref = Math.round(intent.staked * stats.stakeRefundOnMiss);
        grantScore(s, ref);
        log(s, 'system', `Wager refunded +${ref} Score`);
      } else {
        log(s, 'loss', `Wager lost ${intent.staked} Score`);
      }
    }

    intent.payout = Math.round(gain);
    const rides = build.flags.has('letItRide') && intent.payout >= CONFIG.letItRideMinPayout;
    if (rides && s.policies.letItRide === 'ask') {
      s.decision = { kind: 'letItRide', intentId: intent.id, amount: intent.payout };
      intent.stage = 'ride';
      return true;
    }
    if (rides && s.policies.letItRide === 'ride') {
      s.riding = intent.payout;
      log(s, 'jackpot', `Riding ${intent.payout} Score`);
    } else {
      grantScore(s, intent.payout);
    }
  } else {
    s.stats.rollsB += 1;
    // Framework B: exactly one Meta per resolved roll, independent of value.
    grantMeta(s, 1);
    const loss = face * stats.lossMult;
    const actual = Math.min(s.score, loss);
    s.score = Math.max(0, s.score - loss);
    s.stats.scoreLost += actual;
  }

  completeRoll(s, build, intent, ctx, hits, rewardMult, stats);
  return false;
}

/** Everything after the economy step: triggers, volume rolls, bookkeeping. */
function completeRoll(
  s: GameState,
  build: ResolvedBuild,
  intent: RollIntent,
  ctx: RollCtx,
  hits: PatternHit[],
  rewardMult: number,
  stats: StatBlock,
): void {
  const depth = intent.depth;
  const opts = { depth, rewardMult };

  fireTriggers(s, build, 'onResolve', ctx, opts);
  if (ctx.jackpotHit) fireTriggers(s, build, 'onJackpot', ctx, opts);
  else if (build.flags.has('jackpot') && s.framework === 'A') {
    fireTriggers(s, build, 'onJackpotMiss', ctx, opts);
  }
  for (const hit of hits) {
    const hitCtx: RollCtx = { ...ctx, pattern: hit.name, patternEnd: hit.faces[hit.faces.length - 1] };
    const details = fireTriggers(s, build, 'onPattern', hitCtx, opts);
    if (details.length > 0) {
      intent.procs.push({
        kind: 'pattern',
        label: PATTERN_LABEL[hit.name],
        detail: `${hit.faces.join('–')} · ${details.join(' · ')}`,
      });
    }
  }

  // --- Volume -------------------------------------------------------------
  let bonusChance = stats.bonusRollChance;
  if (intent.isBonus) bonusChance += stats.bonusFromBonusChance;
  if (bonusChance > 0 && chance(s.rng, bonusChance)) {
    const queued = queueBonusRolls(s, 1, depth);
    if (queued > 0) intent.procs.push({ kind: 'bonus', label: 'BONUS ROLL', detail: '+1' });
  }

  if (stats.splinterChance > 0 && chance(s.rng, stats.splinterChance)) {
    const queued = queueBonusRolls(s, 2, depth);
    if (queued > 0) intent.procs.push({
      kind: 'bonus',
      label: 'BONUS ROLLS',
      detail: `+${queued}`,
    });
  }

  s.transient.rollsSinceBonus += 1;
  const threshold = Math.floor(stats.secondWindThreshold);
  if (threshold > 0 && s.transient.rollsSinceBonus >= threshold) {
    const queued = queueBonusRolls(s, 1, depth);
    if (queued > 0) intent.procs.push({ kind: 'bonus', label: 'SECOND WIND', detail: '+1 Bonus Roll' });
  }

  // --- Bookkeeping --------------------------------------------------------
  if (s.transient.flipCooldown > 0) s.transient.flipCooldown -= 1;
  s.lastFace = intent.face!;
  s.rollLog.push({
    id: intent.id,
    face: intent.face!,
    score: Math.round((s.score - intent.scoreBefore) * 100) / 100,
    meta: Math.round((s.meta - intent.metaBefore) * 100) / 100,
    framework: s.framework,
    procs: intent.procs.length > 0 ? intent.procs.slice() : undefined,
  });
  if (s.rollLog.length > 48) s.rollLog.splice(0, s.rollLog.length - 48);
  s.totalRolls += 1;
  s.rollsSinceSwitch += 1;
  s.stats.faceCounts[intent.face!] += 1;
  purgeExpired(s);
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/**
 * How many dice a click throws: the build's handful plus whatever dice
 * bonus rolls have left lying around. One place, so every reader agrees.
 */
export function effectiveDice(s: GameState, build = getBuild(s)): number {
  const base = Math.max(1, Math.floor(displayStats(s, build).handfulDice));
  return base + s.bonusDice.length;
}

export function canRoll(s: GameState): boolean {
  return s.decision === null && s.pending.length === 0 && s.cooldownRemaining <= 0;
}

export function manualRoll(s: GameState): void {
  if (!canRoll(s)) return;
  const build = getBuild(s);
  const stats = displayStats(s, build);

  let staked = 0;
  if (build.flags.has('stake') && s.stakeAmount > 0 && s.framework === 'A') {
    staked = Math.min(s.stakeAmount, Math.floor(stats.stakeMax), Math.floor(s.score));
    if (staked > 0) s.score -= staked;
  }

  const dice = effectiveDice(s, build);
  s.actionBudget = Math.max(0, CONFIG.maxRollsPerAction - dice);
  for (let i = 0; i < dice; i++) {
    s.pending.push({
      id: s.nextIntentId++,
      isBonus: false,
      depth: 0,
      stage: 'generate',
      procs: [],
      staked: i === 0 ? staked : 0,
      payout: 0,
      scoreBefore: 0,
      metaBefore: 0,
    });
  }
  s.stats.manualRolls += 1;
  s.cooldownRemaining = CONFIG.baseCooldownMs * stats.cooldownMult;
  s.resolveTimer = 0;

  const ctx: RollCtx = {
    face: 1, framework: s.framework, isBonus: false, score: s.score, jackpotHit: false,
    rollsSinceSwitch: s.rollsSinceSwitch, rollsSinceBonus: s.transient.rollsSinceBonus,
    counters: s.transient.counters,
  };
  fireTriggers(s, build, 'onManualRoll', ctx, { depth: 0, rewardMult: stats.patternRewardMult });
}

/** Advances real time. `dt` is milliseconds. */
export function tick(s: GameState, dt: number): void {
  if (s.cooldownRemaining > 0) s.cooldownRemaining = Math.max(0, s.cooldownRemaining - dt);
  if (s.bonusDice.length > 0) {
    // Each one runs down on its own clock; rolling does not top them up.
    for (let i = 0; i < s.bonusDice.length; i++) s.bonusDice[i] -= dt;
    s.bonusDice = s.bonusDice.filter((ms) => ms > 0);
  }
  if (s.decision !== null) return;

  s.resolveTimer -= dt;
  let guard = 0;
  while (s.pending.length > 0 && s.resolveTimer <= 0 && s.decision === null && guard++ < 500) {
    const intent = s.pending[0];
    const result = processIntent(s, intent);
    if (result === 'suspended') return;
    s.pending.shift();
    const stagger = s.pending.length > CONFIG.fastStaggerThreshold
      ? CONFIG.fastStaggerMs
      : CONFIG.resolveStaggerMs;
    s.resolveTimer += stagger;
  }
  if (s.pending.length === 0) s.resolveTimer = 0;
}

/** Resolves every queued roll immediately. Used by tests and simulations. */
export function drain(s: GameState, autoResolve = true): void {
  let guard = 0;
  while (s.pending.length > 0 && guard++ < 50000) {
    if (s.decision) {
      if (!autoResolve) return;
      autoDecide(s);
      continue;
    }
    const intent = s.pending[0];
    const result = processIntent(s, intent);
    if (result === 'suspended') continue;
    s.pending.shift();
  }
  if (s.decision && autoResolve) autoDecide(s);
}

/** Default behaviour for an unattended decision: keep it simple and neutral. */
function autoDecide(s: GameState): void {
  const d = s.decision;
  if (!d) return;
  switch (d.kind) {
    case 'loadedChoice': {
      let pick = 0;
      for (let i = 1; i < d.options.length; i++) if (d.options[i] > d.options[pick]) pick = i;
      resolveDecision(s, { kind: 'loadedChoice', index: pick });
      break;
    }
    case 'hold':
      resolveDecision(s, { kind: 'hold', action: 'resolve' });
      break;
    case 'flip':
      resolveDecision(s, { kind: 'flip', flip: false });
      break;
    case 'letItRide':
      resolveDecision(s, { kind: 'letItRide', ride: false });
      break;
  }
}

export type DecisionChoice =
  | { kind: 'loadedChoice'; index: number }
  | { kind: 'hold'; action: 'resolve' | 'store'; swapIndex?: number }
  | { kind: 'flip'; flip: boolean }
  | { kind: 'letItRide'; ride: boolean };

export function resolveDecision(s: GameState, choice: DecisionChoice): void {
  const d = s.decision;
  if (!d) return;
  const intent = s.pending.find((i) => i.id === d.intentId);
  if (!intent) { s.decision = null; return; }
  const build = getBuild(s);
  s.decision = null;

  switch (d.kind) {
    case 'loadedChoice': {
      if (choice.kind !== 'loadedChoice') return;
      takeCandidate(s, build, intent, choice.index);
      break;
    }
    case 'hold': {
      if (choice.kind !== 'hold') return;
      if (choice.action === 'store' && d.canStore) {
        s.held.push(d.face);
        log(s, 'system', `Held ${d.face}`);
        // A stored result never resolves: no Score, no cost, no Meta.
        s.pending.splice(s.pending.indexOf(intent), 1);
        return;
      }
      if (choice.swapIndex !== undefined && s.held[choice.swapIndex] !== undefined) {
        const swapped = s.held[choice.swapIndex];
        s.held.splice(choice.swapIndex, 1);
        if (s.held.length < Math.floor(displayStats(s, build).holdCapacity)) s.held.push(d.face);
        intent.face = swapped;
        log(s, 'system', `Swapped in ${swapped}`);
      }
      intent.stage = 'flip';
      break;
    }
    case 'flip': {
      if (choice.kind !== 'flip') return;
      if (choice.flip) {
        intent.face = d.flipped;
        s.transient.flipCooldown = Math.floor(displayStats(s, build).flipPeriod);
      }
      intent.stage = 'finalize';
      break;
    }
    case 'letItRide': {
      if (choice.kind !== 'letItRide') return;
      if (choice.ride) {
        s.riding = d.amount;
        log(s, 'jackpot', `Riding ${d.amount} Score`);
      } else {
        grantScore(s, d.amount);
      }
      // The economy step already ran; finish the roll's remaining bookkeeping.
      const ctx: RollCtx = {
        face: intent.face!, framework: s.framework, isBonus: intent.isBonus, score: s.score,
        jackpotHit: s.framework === 'A' && build.flags.has('jackpot') && intent.face === 6,
        rollsSinceSwitch: s.rollsSinceSwitch, rollsSinceBonus: s.transient.rollsSinceBonus,
        counters: s.transient.counters,
      };
      const stats = effectiveStats(s, build, ctx);
      completeRoll(s, build, intent, ctx, [], stats.patternRewardMult, stats);
      s.pending.splice(s.pending.indexOf(intent), 1);
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Framework switching
// ---------------------------------------------------------------------------

export function canSwitchFramework(s: GameState): boolean {
  return s.discovered.includes('frameworkB') && s.decision === null && s.pending.length === 0;
}

export function switchFramework(s: GameState): void {
  if (!canSwitchFramework(s)) return;
  const build = getBuild(s);

  s.faceBeforeSwitch = s.lastFace;
  const pendulumStacks = s.transient.counters.pendulum ?? 0;

  if (!build.flags.has('carryover')) {
    s.transient = emptyTransient();
  } else {
    s.transient.counters.pendulum = 0;
  }

  s.framework = s.framework === 'A' ? 'B' : 'A';
  s.rollsSinceSwitch = 0;
  s.riding = 0;
  s.stats.switches += 1;

  if (build.flags.has('reflection')) s.awaitingReflection = true;
  if (build.flags.has('pendulum') && pendulumStacks > 0) {
    s.pendulumRollsLeft = CONFIG.pendulumRolls;
    s.pendulumPayout = pendulumStacks;
  }
  if (build.flags.has('duality')) {
    s.actionBudget = Math.max(s.actionBudget, CONFIG.maxRollsPerAction);
    queueBonusRolls(s, regionsInvested(build, 2), 0);
    s.transient.flipCooldown = 0;
  }
  if (build.flags.has('counterplay')) s.transient.flipCooldown = 0;

  const ctx: RollCtx = {
    face: 1, framework: s.framework, isBonus: false, score: s.score, jackpotHit: false,
    rollsSinceSwitch: 0, rollsSinceBonus: s.transient.rollsSinceBonus,
    counters: s.transient.counters,
  };
  fireTriggers(s, build, 'onSwitch', ctx, { depth: 0, rewardMult: 1 });
}

// ---------------------------------------------------------------------------
// Allocation / discovery / misc actions
// ---------------------------------------------------------------------------

export function allocate(s: GameState, nodeId: string): { ok: boolean; reason?: AllocationError } {
  const check = checkAllocation(nodeId, {
    allocated: new Set(s.allocated),
    discovered: new Set(s.discovered),
    score: s.score,
    meta: s.meta,
  });
  if (!check.ok) return check;
  const node = NODES_BY_ID.get(nodeId)!;
  s.score -= node.costs.score ?? 0;
  s.meta -= node.costs.meta ?? 0;
  s.allocated.push(nodeId);
  // Buying what you were saving for retires the goal; the player picks the
  // next one. Nothing advances it automatically.
  if (s.pinned === nodeId) s.pinned = null;
  log(s, 'system', `Allocated ${node.name}`);
  // Keep persistent control state legal after a capacity change.
  const cap = Math.floor(displayStats(s).holdCapacity);
  if (s.held.length > cap) s.held.length = cap;
  syncAllowed(s);
  return { ok: true };
}

/** Total Score and Meta currently sunk into the passive web. */
export function allocatedCost(s: GameState): { score: number; meta: number } {
  let score = 0;
  let meta = 0;
  for (const id of s.allocated) {
    const node = NODES_BY_ID.get(id);
    if (!node) continue;
    score += node.costs.score ?? 0;
    meta += node.costs.meta ?? 0;
  }
  return { score, meta };
}

export function canRefund(s: GameState): boolean {
  return s.allocated.some((id) => id !== 'start') && s.decision === null && s.pending.length === 0;
}

/**
 * Returns every point spent on the web and clears the build. A full respec
 * rather than a per-node refund, because refunding one node would orphan
 * whatever hangs off it.
 */
export function refundAll(s: GameState): { score: number; meta: number } | null {
  if (!canRefund(s)) return null;
  const refunded = allocatedCost(s);
  s.score += refunded.score;
  s.meta += refunded.meta;
  s.allocated = ['start'];
  // Whatever was pinned is almost certainly out of reach now.
  s.pinned = null;

  // Control state that only existed because of a node that is now gone.
  s.held = [];
  s.useHeldNext = null;
  s.storeNext = false;
  s.sealedFace = null;
  s.allowed = [];
  s.bonusDice = [];
  s.stakeAmount = 0;
  s.riding = 0;
  s.transient = emptyTransient();
  syncAllowed(s);
  log(s, 'system', `Refunded ${Math.round(refunded.score)} Score`
    + (refunded.meta > 0 ? ` and ${Math.round(refunded.meta)} Meta` : ''));
  return refunded;
}

/** True once the placeholder discovery gate is open. */
export function discoveryGateOpen(s: GameState): boolean {
  if (s.discovered.includes('frameworkB')) return false;
  return s.sawStats && s.totalRolls >= CONFIG.discoveryRollThreshold;
}

export function discoverFrameworkB(s: GameState): void {
  if (s.discovered.includes('frameworkB')) return;
  s.discovered.push('frameworkB');
  log(s, 'system', 'Meta is now tracked.');
}

export function setSeal(s: GameState, face: Face | null): void {
  const build = getBuild(s);
  if (!build.flags.has('seal')) return;
  s.sealedFace = face;
  // The window was drawn from the old distribution.
  s.allowed = [];
  syncAllowed(s);
}

/** Brings the visible queue in line with the current build. */
export function syncAllowed(s: GameState, build = getBuild(s)): void {
  if (!build.flags.has('preparedRoll')) {
    s.allowed = [];
    return;
  }
  drawAllowed(s, build);
}

export function setStoreNext(s: GameState, on: boolean): void {
  const build = getBuild(s);
  if (!build.flags.has('hold')) { s.storeNext = false; return; }
  s.storeNext = on;
}

export function setStake(s: GameState, amount: number): void {
  const stats = displayStats(s);
  s.stakeAmount = Math.max(0, Math.min(Math.floor(amount), Math.floor(stats.stakeMax)));
}

export function setUseHeld(s: GameState, index: number | null): void {
  s.useHeldNext = index !== null && s.held[index] !== undefined ? index : null;
}

export function setPolicy<K extends keyof DecisionPolicy>(
  s: GameState, key: K, value: DecisionPolicy[K],
): void {
  s.policies[key] = value;
}

export function markStatsSeen(s: GameState): void {
  s.sawStats = true;
}

/** Long-run face frequencies for the stats panel. */
export function faceProbabilities(s: GameState): Record<Face, number> {
  const dist = currentDistribution(s);
  const out = {} as Record<Face, number>;
  for (const f of FACES) out[f] = dist.probabilities[f - 1];
  return out;
}

export function rollRandom(s: GameState): number {
  return next(s.rng);
}
