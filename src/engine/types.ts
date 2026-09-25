// Core vocabulary for the dice engine.
//
// Nodes are DATA. They compose from the closed vocabularies below:
//   - StatKey       numeric knobs the engine reads while resolving a roll
//   - FlagKey       boolean capabilities that switch on an engine code path
//   - Condition     predicates evaluated against a resolve-time context
//   - RuntimeEffect things that happen when a trigger fires
//
// Adding a node that reuses existing kinds requires editing nodes.ts only.

export type Face = 1 | 2 | 3 | 4 | 5 | 6;
export const FACES: readonly Face[] = [1, 2, 3, 4, 5, 6];

export type FrameworkId = 'A' | 'B';

export type Region =
  | 'core'
  | 'high'
  | 'volume'
  | 'jackpot'
  | 'control'
  | 'pattern'
  | 'adaptive';

/** Regions that count as "archetype investment" (Duality reads this). */
export const ARCHETYPE_REGIONS: readonly Region[] = [
  'high',
  'volume',
  'jackpot',
  'control',
  'pattern',
  'adaptive',
];

export type NodeType = 'small' | 'notable' | 'keystone' | 'bridge';

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export type StatKey =
  // probability
  | 'w1' | 'w2' | 'w3' | 'w4' | 'w5' | 'w6'
  // Framework A payout
  | 'scoreFlat'
  | 'scoreMult'
  // Framework B cost
  | 'lossMult'
  // volume
  | 'bonusRollChance'
  | 'bonusFromBonusChance'
  | 'splinterChance'
  | 'cooldownMult'
  | 'handfulDice'
  | 'secondWindThreshold'
  // control
  | 'holdCapacity'
  | 'flipPeriod'
  | 'rerollOneChance'
  | 'raisedFloorChance'
  | 'queueLength'
  // pattern
  | 'patternRewardMult'
  | 'historyWindow'
  // jackpot
  | 'jackpotFlat'
  | 'jackpotMult'
  | 'pressurePerMiss'
  | 'pressureCap'
  | 'stakeMax'
  | 'stakeReturnMult'
  | 'stakeRefundOnMiss';

export type StatBlock = Record<StatKey, number>;

export const BASE_STATS: StatBlock = {
  w1: 1, w2: 1, w3: 1, w4: 1, w5: 1, w6: 1,
  scoreFlat: 0,
  scoreMult: 1,
  lossMult: 1,
  bonusRollChance: 0,
  bonusFromBonusChance: 0,
  splinterChance: 0,
  cooldownMult: 1,
  handfulDice: 1,
  secondWindThreshold: 0,
  holdCapacity: 0,
  flipPeriod: 0,
  rerollOneChance: 0,
  raisedFloorChance: 0,
  queueLength: 0,
  patternRewardMult: 1,
  historyWindow: 4,
  jackpotFlat: 0,
  jackpotMult: 1,
  pressurePerMiss: 0,
  pressureCap: 0,
  stakeMax: 0,
  stakeReturnMult: 0,
  stakeRefundOnMiss: 0,
};

export const FACE_STAT: Record<Face, StatKey> = {
  1: 'w1', 2: 'w2', 3: 'w3', 4: 'w4', 5: 'w5', 6: 'w6',
};

/** Stats where the "no allocation" baseline is a product, not a sum. */
export const MULTIPLICATIVE_BASE: ReadonlySet<StatKey> = new Set<StatKey>([
  'scoreMult', 'lossMult', 'cooldownMult', 'patternRewardMult', 'jackpotMult',
]);

// ---------------------------------------------------------------------------
// Flags — capabilities that gate an engine code path
// ---------------------------------------------------------------------------

export type FlagKey =
  | 'loadedChoice'
  | 'oneInSix'
  | 'hold'
  | 'flip'
  | 'seal'
  | 'preparedRoll'
  | 'memory'
  | 'noGoingBack'
  | 'climb'
  | 'momentum'
  | 'jackpot'
  | 'letItRide'
  | 'stake'
  | 'hedge'
  | 'arrange'
  | 'carryover'
  | 'duality'
  | 'pendulum'
  | 'counterplay'
  | 'reflection'
  | 'moreTickets'
  | 'afterimage';

// ---------------------------------------------------------------------------
// Conditions
// ---------------------------------------------------------------------------

export type Condition =
  | { kind: 'face'; in: Face[] }
  | { kind: 'faceAtLeast'; value: number }
  | { kind: 'framework'; is: FrameworkId }
  | { kind: 'chance'; p: number }
  | { kind: 'isBonus'; is: boolean }
  | { kind: 'scoreBelow'; value: number }
  | { kind: 'scoreAbove'; value: number }
  | { kind: 'counterAtLeast'; id: string; value: number }
  | { kind: 'pattern'; in: string[] }
  | { kind: 'patternEndsAtLeast'; value: number }
  | { kind: 'rollsSinceSwitchBelow'; value: number }
  | { kind: 'rollsSinceBonusAtLeast'; value: number }
  | { kind: 'jackpotHit'; is: boolean };

// ---------------------------------------------------------------------------
// Runtime effects
// ---------------------------------------------------------------------------

export type RuntimeEffect =
  /** Queue additional rolls. */
  | { kind: 'bonusRoll'; count: number }
  /** Framework-shaped payout: Score while A is active, Meta while B is active. */
  | { kind: 'reward'; score: number; meta: number }
  /** Unconditional currency grants (never scaled by roll value). */
  | { kind: 'score'; amount: number }
  | { kind: 'meta'; amount: number }
  /** Push a face's weight for the next N resolved rolls. */
  | { kind: 'weightFor'; face: Face; add: number; rolls: number }
  /** Temporary stat modifier expiring after N resolved rolls. */
  | { kind: 'tempStat'; stat: StatKey; op: 'add' | 'mult'; value: number; rolls: number }
  | { kind: 'counter'; id: string; add: number; cap?: number }
  | { kind: 'resetCounter'; id: string };

export type TriggerEvent =
  | 'onResolve'
  | 'onPattern'
  | 'onSwitch'
  | 'onJackpot'
  | 'onJackpotMiss'
  | 'onManualRoll';

export interface Trigger {
  on: TriggerEvent;
  when?: Condition[];
  effects: RuntimeEffect[];
}

export interface StatModifier {
  stat: StatKey;
  op: 'add' | 'mult';
  value: number;
  /** Evaluated per resolved roll. Omit for an always-on modifier. */
  when?: Condition[];
}

// ---------------------------------------------------------------------------
// Node data model
// ---------------------------------------------------------------------------

/**
 * A node's tooltip. Nodes whose behaviour differs between the two frameworks
 * carry one line each, and only the line for the active framework is shown —
 * so the text never has to name a framework the player may not know about.
 */
export type NodeDescription = string | Record<FrameworkId, string>;

export interface PassiveNode {
  id: string;
  name: string;
  nodeType: NodeType;
  region: Region;
  /** Secondary region for bridges — used for layout and Duality accounting. */
  bridges?: [Region, Region];
  description: NodeDescription;
  costs: { score?: number; meta?: number };
  prerequisites: string[];
  position: { x: number; y: number };
  tags: string[];
  modifiers?: StatModifier[];
  flags?: FlagKey[];
  triggers?: Trigger[];
  /** Hidden from the tree until every listed flag is discovered. */
  discoveryRequirements?: DiscoveryFlag[];
}

export type DiscoveryFlag = 'frameworkB';
