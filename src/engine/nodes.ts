import {
  any, clause, die, dice, meta, meter, note, off, op, pips, roll, score, slot, to, val,
  weight,
} from './notation.ts';
import type { PassiveNode } from './types.ts';

// The passive web. One interconnected graph: every node hangs off `start`
// through some chain, and the archetype regions are joined by bridge nodes
// and by a shared inner ring.
//
// Layout: `start` at the origin, five archetype spokes leaving at radius ~290,
// an inner connective ring at radius 235, and bridge slots in the outer gaps
// between adjacent spokes.
//
// Costs are tunable balance values, not design commitments.

export const NODES: PassiveNode[] = [
  {
    id: 'start',
    name: 'The Die',
    nodeType: 'notable',
    region: 'core',
    description: 'Six faces, equal weight.',
    notation: [[...dice(1, 2, 3, 4, 5, 6), note('equal')]],
    costs: {},
    prerequisites: [],
    position: { x: 0, y: 0 },
    tags: ['root'],
  },

  // -------------------------------------------------------------------------
  // HIGH ROLLER — spoke at (0, -1)
  // -------------------------------------------------------------------------
  {
    id: 'hr_edge',
    name: 'Weighted Edge',
    nodeType: 'small',
    region: 'high',
    description: 'Faces 5 and 6 each gain +0.35 weight.',
    notation: [[die(5), die(6), weight('+0.35'), note('wt')]],
    costs: { score: 45 },
    prerequisites: ['start'],
    position: { x: 115, y: -170 },
    tags: ['probability'],
    modifiers: [
      { stat: 'w5', op: 'add', value: 0.35 },
      { stat: 'w6', op: 'add', value: 0.35 },
    ],
  },
  {
    id: 'hr_floor',
    name: 'Raised Floor',
    nodeType: 'small',
    region: 'high',
    description: 'A rolled 1 becomes a 2 30% of the time.',
    notation: [[die(1, 'dim'), to('30%'), die(2)]],
    costs: { score: 120 },
    prerequisites: ['hr_edge'],
    position: { x: 94, y: -348 },
    tags: ['probability', 'replacement'],
    modifiers: [{ stat: 'raisedFloorChance', op: 'add', value: 0.3 }],
  },
  {
    id: 'hr_heavy6',
    name: 'Heavy Six',
    nodeType: 'small',
    region: 'high',
    description: 'Face 6 gains +0.9 weight. Face 3 loses 0.5 weight.',
    notation: [[die(6), weight('+0.9'), op('·'), die(3, 'dim'), val('−0.5', 'warn')]],
    costs: { score: 130 },
    prerequisites: ['hr_edge'],
    position: { x: 256, y: -253 },
    tags: ['probability'],
    modifiers: [
      { stat: 'w6', op: 'add', value: 0.9 },
      { stat: 'w3', op: 'add', value: -0.5 },
    ],
  },
  {
    id: 'hr_momentum',
    name: 'Momentum',
    nodeType: 'small',
    region: 'high',
    description: 'After rolling 4 or higher, faces 5 and 6 each gain +0.5 weight on the next roll.',
    notation: [[die(4), die(5), die(6), to(), die(5), die(6), weight('+0.5'), note('1 roll')]],
    costs: { score: 240 },
    prerequisites: ['hr_floor', 'hr_heavy6'],
    position: { x: 254, y: -436 },
    tags: ['probability', 'streak'],
    triggers: [
      {
        on: 'onResolve',
        when: [{ kind: 'faceAtLeast', value: 4 }],
        effects: [
          { kind: 'weightFor', face: 5, add: 0.5, rolls: 1 },
          { kind: 'weightFor', face: 6, add: 0.5, rolls: 1 },
        ],
      },
    ],
  },
  {
    id: 'hr_climb',
    name: 'Climb',
    nodeType: 'notable',
    region: 'high',
    description:
      'Each roll strictly higher than the previous one adds a Climb stack. Any roll not higher clears them all.',
    notation: [[die(2), op('<'), die(4), op('<'), die(5), to(), val('+1', 'accent'), note('Climb')],
      clause('streak', pips(5, 0), to(), die(4), die(5), die(6), weight('+0.3'))],
    costs: { score: 420 },
    prerequisites: ['hr_heavy6'],
    position: { x: 326, y: -385 },
    tags: ['probability', 'streak'],
    flags: ['climb'],
  },
  {
    id: 'hr_upper',
    name: 'Upper Half',
    nodeType: 'notable',
    region: 'high',
    description: {
      A: 'Rolls of 4–6 grant +3 Score.',
      B: 'Pays only while rolls add Score.',
    },
    notation: {
      A: [[die(4), die(5), die(6), to(), score('+3')]],
      B: [[off()]],
    },
    costs: { score: 380 },
    prerequisites: ['hr_momentum'],
    position: { x: 323, y: -553 },
    tags: ['payout'],
    modifiers: [
      {
        stat: 'scoreFlat',
        op: 'add',
        value: 3,
        when: [{ kind: 'faceAtLeast', value: 4 }, { kind: 'framework', is: 'A' }],
      },
    ],
  },
  {
    id: 'hr_nogoback',
    name: 'No Going Back',
    nodeType: 'notable',
    region: 'high',
    description: 'The roll after a 6 is never a 1; it rerolls among the other five faces.',
    notation: [[die(6), op('then'), die(1, 'out'), to(), note('any other face')]],
    costs: { score: 460 },
    prerequisites: ['hr_climb'],
    position: { x: 414, y: -488 },
    tags: ['probability', 'replacement'],
    flags: ['noGoingBack'],
  },

  // -------------------------------------------------------------------------
  // VOLUME — spoke at (0.951, -0.309)
  // -------------------------------------------------------------------------
  {
    id: 'vl_quick',
    name: 'Quick Hands',
    nodeType: 'small',
    region: 'volume',
    description: 'Every roll has a 15% chance to grant a bonus roll.',
    notation: [[val('15%'), to(), roll()]],
    costs: { score: 45 },
    prerequisites: ['start'],
    position: { x: 48, y: 199 },
    tags: ['bonus-roll'],
    modifiers: [{ stat: 'bonusRollChance', op: 'add', value: 0.15 }],
  },
  {
    id: 'vl_lowgear',
    name: 'Low Gear',
    nodeType: 'small',
    region: 'volume',
    description: 'Rolling a 1 or 2 has a 22% chance to grant a bonus roll.',
    notation: [[die(1), die(2), to('22%'), roll()]],
    costs: { score: 315 },
    prerequisites: ['vl_quick'],
    position: { x: 15, y: 360 },
    tags: ['bonus-roll'],
    triggers: [
      {
        on: 'onResolve',
        when: [{ kind: 'face', in: [1, 2] }, { kind: 'chance', p: 0.22 }],
        effects: [{ kind: 'bonusRoll', count: 1 }],
      },
    ],
  },
  {
    id: 'vl_cycle',
    name: 'Rapid Cycle',
    nodeType: 'small',
    region: 'volume',
    description: 'Cuts the roll cooldown by 22%.',
    notation: [[note('cooldown'), val('−22%', 'accent')]],
    costs: { score: 525 },
    prerequisites: ['vl_quick'],
    position: { x: 192, y: 304 },
    tags: ['pacing'],
    modifiers: [{ stat: 'cooldownMult', op: 'mult', value: 0.78 }],
  },
  {
    id: 'vl_follow',
    name: 'Follow Through',
    nodeType: 'small',
    region: 'volume',
    description: 'Bonus rolls have an 15% chance to grant a further bonus roll.',
    notation: [[roll('bonus'), to('15%'), roll()]],
    costs: { score: 250 },
    prerequisites: ['vl_lowgear'],
    position: { x: 21, y: 505 },
    tags: ['bonus-roll'],
    modifiers: [{ stat: 'bonusFromBonusChance', op: 'add', value: 0.15 }],
  },
  {
    id: 'vl_echo',
    name: 'Echo',
    nodeType: 'notable',
    region: 'volume',
    description: 'Rolling a 6 grants a bonus roll.',
    notation: [[die(6), to(), roll()]],
    costs: { score: 1000 },
    prerequisites: ['vl_cycle'],
    position: { x: 416, y: 397 },
    tags: ['bonus-roll'],
    triggers: [
      { on: 'onResolve', when: [{ kind: 'face', in: [6] }], effects: [{ kind: 'bonusRoll', count: 1 }] },
    ],
  },
  {
    id: 'vl_splinter',
    name: 'Splinter',
    nodeType: 'notable',
    region: 'volume',
    description: 'Every roll has a 10% chance to become 2 rolls, each scoring separately.',
    notation: [[val('10%'), to(), roll('+2')]],
    costs: { score: 520 },
    prerequisites: ['vl_follow'],
    position: { x: 27, y: 639 },
    tags: ['bonus-roll', 'split'],
    modifiers: [{ stat: 'splinterChance', op: 'add', value: 0.1 }],
  },
  {
    id: 'vl_secondwind',
    name: 'Second Wind',
    nodeType: 'notable',
    region: 'volume',
    description: 'After 8 rolls in a row without a bonus roll, the next roll grants one.',
    notation: [[pips(8, 0, 'dry rolls'), to(), roll()]],
    costs: { score: 530 },
    prerequisites: ['vl_cycle'],
    position: { x: 270, y: 427 },
    tags: ['bonus-roll', 'consistency'],
    modifiers: [{ stat: 'secondWindThreshold', op: 'add', value: 8 }],
  },
  {
    id: 'vl_handful',
    name: 'Handful',
    nodeType: 'keystone',
    region: 'volume',
    description: {
      A: 'Each click throws 3 dice instead of 1. Every roll is worth less in exchange.',
      B: 'Each click throws 3 dice instead of 1.',
    },
    notation: {
      A: [[note('per click'), to(), any(), any(), any()],
         clause('swap', score('Score'), op('×'), val('0.55', 'warn'))],
      B: [[note('per click'), to(), any(), any(), any()]],
    },
    costs: { score: 1700 },
    prerequisites: ['vl_splinter', 'vl_secondwind'],
    position: { x: 191, y: 611 },
    tags: ['keystone', 'bonus-roll'],
    modifiers: [
      { stat: 'handfulDice', op: 'add', value: 2 },
      { stat: 'scoreMult', op: 'mult', value: 0.55 },
    ],
  },

  // -------------------------------------------------------------------------
  // JACKPOT — spoke at (0.588, 0.809)
  // -------------------------------------------------------------------------
  {
    id: 'jp_longodds',
    name: 'Long Odds',
    nodeType: 'small',
    region: 'jackpot',
    description:
      {
        A: 'Opens the jackpot: a 6 pays an extra +14 Score. Everything else pays ×0.85.',
        B: 'The jackpot pays only while rolls add Score.',
      },
    notation: {
      A: [[die(6), to(), score('+14')],
         clause('swap', note('all other'), score('Score'), op('×'), val('0.85', 'warn'))],
      B: [[off('no jackpot')]],
    },
    costs: { score: 50 },
    prerequisites: ['start'],
    position: { x: -180, y: 99 },
    tags: ['jackpot', 'payout'],
    flags: ['jackpot'],
    modifiers: [
      { stat: 'jackpotFlat', op: 'add', value: 14 },
      { stat: 'scoreMult', op: 'mult', value: 0.85 },
    ],
  },
  {
    id: 'jp_hotstreak',
    name: 'Pressure',
    nodeType: 'small',
    region: 'jackpot',
    description: {
      A: 'Every roll that misses the jackpot adds +1 Pressure, up to 25.',
      B: 'Pressure builds only while rolls add Score.',
    },
    notation: {
      A: [[note('miss'), to(), val('+1', 'accent'), meter(0, 'Pressure · 25')],
         clause('streak', die(6), to(), score('+Pressure'), note('· clears'))],
      B: [[off()]],
    },
    costs: { score: 135 },
    prerequisites: ['jp_longodds'],
    position: { x: -243, y: 266 },
    tags: ['jackpot', 'streak'],
    modifiers: [
      { stat: 'pressurePerMiss', op: 'add', value: 1 },
      { stat: 'pressureCap', op: 'add', value: 25 },
    ],
  },
  {
    id: 'jp_stake',
    name: 'Stake',
    nodeType: 'small',
    region: 'jackpot',
    description:
      {
        A: 'Before a roll you may wager up to 40 Score. A jackpot returns it ×2.5; anything else loses it.',
        B: 'Wagers are only taken while rolls add Score.',
      },
    notation: {
      A: [[note('wager'), score('≤40'), to(), die(6), op('×'), score('2.5')],
         clause('deny', note('else'), op('×'), val('0', 'warn'))],
      B: [[off('no wagers')]],
    },
    costs: { score: 140 },
    prerequisites: ['jp_longodds'],
    position: { x: -335, y: 131 },
    tags: ['jackpot', 'wager', 'decision'],
    flags: ['stake'],
    modifiers: [
      { stat: 'stakeMax', op: 'add', value: 40 },
      { stat: 'stakeReturnMult', op: 'add', value: 2.5 },
    ],
  },
  {
    id: 'jp_nearmiss',
    name: 'Near Miss',
    nodeType: 'notable',
    region: 'jackpot',
    description: 'Rolling a 5 gives face 6 +1.4 weight on the next roll.',
    notation: [[die(5), to(), die(6), weight('+1.4'), note('1 roll')]],
    costs: { score: 390 },
    prerequisites: ['jp_hotstreak'],
    position: { x: -276, y: 423 },
    tags: ['jackpot', 'probability'],
    triggers: [
      {
        on: 'onResolve',
        when: [{ kind: 'face', in: [5] }],
        effects: [{ kind: 'weightFor', face: 6, add: 1.4, rolls: 1 }],
      },
    ],
  },
  {
    id: 'jp_pressure',
    name: 'Boiling Point',
    nodeType: 'notable',
    region: 'jackpot',
    description: {
      A: 'Each miss adds +3 Pressure instead of +1, and the cap rises by 65.',
      B: 'Pressure builds only while rolls add Score.',
    },
    notation: {
      A: [[note('miss'), to(), val('+3', 'accent'), note('Pressure · cap +65')]],
      B: [[off()]],
    },
    costs: { score: 520 },
    prerequisites: ['jp_hotstreak', 'jp_stake'],
    position: { x: -416, y: 286 },
    tags: ['jackpot', 'streak'],
    modifiers: [
      { stat: 'pressurePerMiss', op: 'add', value: 2 },
      { stat: 'pressureCap', op: 'add', value: 65 },
    ],
  },
  {
    id: 'jp_ride',
    name: 'Let It Ride',
    nodeType: 'notable',
    region: 'jackpot',
    description:
      {
        A: 'After a roll pays 15 Score or more, bank it or ride it. Riding stakes it on the next roll: ×3 on a jackpot, nothing otherwise.',
        B: 'Riding is only offered while rolls add Score.',
      },
    notation: {
      A: [[score('≥15'), to(), note('bank'), op('/'), note('ride')],
         clause('swap', note('ride'), to(), die(6), op('×'), score('3'), op('·'), note('else'), val('0', 'warn'))],
      B: [[off()]],
    },
    costs: { score: 610 },
    prerequisites: ['jp_pressure'],
    position: { x: -527, y: 363 },
    tags: ['jackpot', 'wager', 'decision'],
    flags: ['letItRide'],
  },
  {
    id: 'jp_oneinsix',
    name: 'One in Six',
    nodeType: 'keystone',
    region: 'jackpot',
    description:
      {
        A: 'Only a 6 pays Score, and its multiplier applies before anything else.',
        B: 'Pays only while rolls add Score.',
      },
    notation: {
      A: [[die(1, 'out'), die(2, 'out'), die(3, 'out'), die(4, 'out'), die(5, 'out'), to(), score('0')],
         clause('score', die(6), to(), score('×9'), op('·'), note('jackpot'), op('×'), val('1.5', 'accent'))],
      B: [[off()]],
    },
    costs: { score: 1900 },
    prerequisites: ['jp_ride', 'jp_nearmiss'],
    position: { x: -447, y: 458 },
    tags: ['keystone', 'jackpot', 'payout'],
    flags: ['oneInSix'],
    modifiers: [{ stat: 'jackpotMult', op: 'mult', value: 1.5 }],
  },

  // -------------------------------------------------------------------------
  // PATTERN — spoke at (-0.588, 0.809)
  // -------------------------------------------------------------------------
  {
    id: 'pt_repeat',
    name: 'Repeat',
    nodeType: 'small',
    region: 'pattern',
    description: {
      A: 'Two identical rolls in a row grant +3 Score.',
      B: 'Pays only while rolls add Score.',
    },
    notation: {
      A: [[die(3), die(3), to(), score('+3')]],
      B: [[off()]],
    },
    costs: { score: 45 },
    prerequisites: ['start'],
    position: { x: 203, y: 30 },
    tags: ['pattern'],
    triggers: [
      {
        on: 'onPattern',
        when: [{ kind: 'pattern', in: ['pair'] }],
        effects: [{ kind: 'reward', score: 3, meta: 0 }],
      },
    ],
  },
  {
    id: 'pt_step',
    name: 'Step',
    nodeType: 'small',
    region: 'pattern',
    description: {
      A: 'A roll exactly one above or below the previous one grants +2 Score.',
      B: 'Pays only while rolls add Score.',
    },
    notation: {
      A: [[die(3), die(4), to(), score('+2')]],
      B: [[off()]],
    },
    costs: { score: 115 },
    prerequisites: ['pt_repeat'],
    position: { x: 349, y: -90 },
    tags: ['pattern'],
    triggers: [
      {
        on: 'onPattern',
        when: [{ kind: 'pattern', in: ['step'] }],
        effects: [{ kind: 'reward', score: 2, meta: 0 }],
      },
    ],
  },
  {
    id: 'pt_collector',
    name: 'Collector',
    nodeType: 'small',
    region: 'pattern',
    description: {
      A: 'The first time each face appears in the current set window it grants +2 Score.',
      B: 'The first time each face appears in the current set window it grants +1 Meta.',
    },
    notation: {
      A: [[note('new face'), to(), score('+2')]],
      B: [[note('new face'), to(), meta('+1')]],
    },
    costs: { score: 130 },
    prerequisites: ['pt_repeat'],
    position: { x: 319, y: 167 },
    tags: ['pattern', 'set'],
    triggers: [
      {
        on: 'onPattern',
        when: [{ kind: 'pattern', in: ['newFace'] }],
        effects: [{ kind: 'reward', score: 2, meta: 1 }],
      },
    ],
  },
  {
    id: 'pt_alt',
    name: 'Alternating Current',
    nodeType: 'small',
    region: 'pattern',
    description: {
      A: 'Four rolls alternating between 1–3 and 4–6 grant +5 Score.',
      B: 'Four rolls alternating between 1–3 and 4–6 grant +1 Meta.',
    },
    notation: {
      A: [[die(5), die(2), die(4), die(1), to(), score('+5')]],
      B: [[die(5), die(2), die(4), die(1), to(), meta('+1')]],
    },
    costs: { score: 245 },
    prerequisites: ['pt_collector'],
    position: { x: 448, y: 234 },
    tags: ['pattern'],
    triggers: [
      {
        on: 'onPattern',
        when: [{ kind: 'pattern', in: ['alternating'] }],
        effects: [{ kind: 'reward', score: 5, meta: 1 }],
      },
    ],
  },
  {
    id: 'pt_doubles',
    name: 'Doubles',
    nodeType: 'notable',
    region: 'pattern',
    description:
      {
        A: 'Adds a further +6 Score to every pair.',
        B: 'Adds a further +1 Meta to every pair.',
      },
    notation: {
      A: [[die(3), die(3), to(), score('+6')],
         clause('score', die(3), die(3), die(3), to(), score('+20'))],
      B: [[die(3), die(3), to(), meta('+1')],
         clause('score', die(3), die(3), die(3), to(), meta('+2'))],
    },
    costs: { score: 370 },
    prerequisites: ['pt_repeat'],
    position: { x: 359, y: 29 },
    tags: ['pattern'],
    triggers: [
      {
        on: 'onPattern',
        when: [{ kind: 'pattern', in: ['pair'] }],
        effects: [{ kind: 'reward', score: 6, meta: 1 }],
      },
      {
        on: 'onPattern',
        when: [{ kind: 'pattern', in: ['triple'] }],
        effects: [{ kind: 'reward', score: 20, meta: 2 }],
      },
    ],
  },
  {
    id: 'pt_run',
    name: 'Run',
    nodeType: 'notable',
    region: 'pattern',
    description:
      {
        A: 'Three consecutive ascending or descending rolls grant +8 Score and a bonus roll.',
        B: 'Three consecutive ascending or descending rolls grant +1 Meta and a bonus roll.',
      },
    notation: {
      A: [[die(2), die(3), die(4), to(), score('+8'), roll()]],
      B: [[die(2), die(3), die(4), to(), meta('+1'), roll()]],
    },
    costs: { score: 430 },
    prerequisites: ['pt_step'],
    position: { x: 489, y: -126 },
    tags: ['pattern', 'bonus-roll'],
    triggers: [
      {
        on: 'onPattern',
        when: [{ kind: 'pattern', in: ['run', 'longRun'] }],
        effects: [
          { kind: 'reward', score: 8, meta: 1 },
          { kind: 'bonusRoll', count: 1 },
        ],
      },
    ],
  },
  {
    id: 'pt_palindrome',
    name: 'Palindrome',
    nodeType: 'notable',
    region: 'pattern',
    description:
      {
        A: 'A roll matching the one from two rolls back, with a different value between, grants +7 Score.',
        B: 'A roll matching the one from two rolls back, with a different value between, grants +1 Meta.',
      },
    notation: {
      A: [[die(4), op('≠'), die(4), to(), score('+7')]],
      B: [[die(4), op('≠'), die(4), to(), meta('+1')]],
    },
    costs: { score: 470 },
    prerequisites: ['pt_doubles'],
    position: { x: 503, y: 41 },
    tags: ['pattern'],
    triggers: [
      {
        on: 'onPattern',
        when: [{ kind: 'pattern', in: ['palindrome', 'longPalindrome'] }],
        effects: [{ kind: 'reward', score: 7, meta: 1 }],
      },
    ],
  },
  {
    id: 'pt_fullset',
    name: 'Full Set',
    nodeType: 'notable',
    region: 'pattern',
    description:
      {
        A: 'Rolling all six faces since the last Full Set grants +30 Score, then starts a new set.',
        B: 'Rolling all six faces since the last Full Set grants +4 Meta, then starts a new set.',
      },
    notation: {
      A: [[...dice(1, 2, 3, 4, 5, 6), to(), score('+30')]],
      B: [[...dice(1, 2, 3, 4, 5, 6), to(), meta('+4')]],
    },
    costs: { score: 560 },
    prerequisites: ['pt_alt'],
    position: { x: 567, y: 296 },
    tags: ['pattern', 'set'],
    triggers: [
      {
        on: 'onPattern',
        when: [{ kind: 'pattern', in: ['fullSet'] }],
        effects: [{ kind: 'reward', score: 30, meta: 4 }],
      },
    ],
  },
  {
    id: 'pt_memory',
    name: 'Memory',
    nodeType: 'keystone',
    region: 'pattern',
    description:
      'Roll history widens from 4 to 10, so runs of 4, palindromes of 5 and alternations of 6 all count.',
    notation: [[note('history'), val('4'), to(), val('10', 'accent')],
      clause('score', note('pattern reward'), op('×'), val('1.4', 'accent'))],
    costs: { score: 1500 },
    prerequisites: ['pt_palindrome', 'pt_run'],
    position: { x: 638, y: -55 },
    tags: ['keystone', 'pattern'],
    flags: ['memory'],
    modifiers: [
      { stat: 'historyWindow', op: 'add', value: 6 },
      { stat: 'patternRewardMult', op: 'mult', value: 1.4 },
    ],
  },

  // -------------------------------------------------------------------------
  // CONTROL — spoke at (-0.951, -0.309)
  // -------------------------------------------------------------------------
  {
    id: 'ct_second',
    name: 'Second Look',
    nodeType: 'small',
    region: 'control',
    description: 'A rolled 1 rerolls once, 45% of the time.',
    notation: [[die(1, 'dim'), to('45%'), op('⟲'), any()]],
    costs: { score: 45 },
    prerequisites: ['start'],
    position: { x: -134, y: -155 },
    tags: ['reroll'],
    modifiers: [{ stat: 'rerollOneChance', op: 'add', value: 0.45 }],
  },
  {
    id: 'ct_reserve',
    name: 'Reserve',
    nodeType: 'small',
    region: 'control',
    description: 'Hold one more result.',
    notation: [[note('Hold'), val('+1'), slot()]],
    costs: { score: 150 },
    prerequisites: ['ct_second'],
    position: { x: -178, y: -313 },
    tags: ['storage'],
    modifiers: [{ stat: 'holdCapacity', op: 'add', value: 1 }],
  },
  {
    id: 'ct_hold',
    name: 'Hold',
    nodeType: 'notable',
    region: 'control',
    description:
      'Stores 1 result and swaps it in before a later roll. While held it pays nothing — no Score, no Meta.',
    notation: [[die(4), to(), slot(true), pips(1, 0, 'held')],
      clause('deny', note('no Score, no Meta while held'))],
    costs: { score: 360 },
    prerequisites: ['ct_second'],
    position: { x: -46, y: -357 },
    tags: ['storage', 'decision'],
    flags: ['hold'],
    modifiers: [{ stat: 'holdCapacity', op: 'add', value: 1 }],
  },
  {
    id: 'ct_flip',
    name: 'Flip',
    nodeType: 'notable',
    region: 'control',
    description:
      'Once every 5 rolls you may flip the rolled face to its opposite: 1↔6, 2↔5, 3↔4.',
    notation: [[die(2), to(), die(5), note('every 5')]],
    costs: { score: 420 },
    prerequisites: ['ct_reserve'],
    position: { x: -287, y: -416 },
    tags: ['replacement', 'decision'],
    flags: ['flip'],
    modifiers: [{ stat: 'flipPeriod', op: 'add', value: 5 }],
  },
  {
    id: 'ct_seal',
    name: 'Seal',
    nodeType: 'notable',
    region: 'control',
    description: 'Remove one face from the die for good. Its weight spreads across the five that remain.',
    notation: [[any(), op('✕'), to(), note('weight spread over the rest')]],
    costs: { score: 480 },
    prerequisites: ['ct_hold'],
    position: { x: -65, y: -501 },
    tags: ['probability', 'decision'],
    flags: ['seal'],
  },
  {
    id: 'ct_prepared',
    name: 'Prepared Roll',
    nodeType: 'keystone',
    region: 'control',
    description:
      'Results can only be one of the 3 numbers shown. Changes every roll.',
    notation: [[note('only'), die(3), die(1), die(6)],
      clause('swap', note('new 3 every roll'))],
    costs: { score: 1600 },
    prerequisites: ['ct_flip', 'ct_seal'],
    position: { x: -229, y: -597 },
    tags: ['keystone', 'probability'],
    flags: ['preparedRoll'],
    modifiers: [{ stat: 'allowedFaces', op: 'add', value: 3 }],
  },

  // -------------------------------------------------------------------------
  // OUTER BRIDGES
  // -------------------------------------------------------------------------
  {
    id: 'key_loaded',
    name: 'Loaded Choice',
    nodeType: 'keystone',
    region: 'control',
    bridges: ['high', 'control'],
    description: 'Every roll offers two results. You pick one; the other is discarded.',
    notation: [[die(2), op('/'), die(5), to(), note('you pick one')]],
    costs: { score: 1450 },
    prerequisites: ['hr_floor', 'ct_hold'],
    position: { x: 34, y: -504 },
    tags: ['keystone', 'bridge', 'decision'],
    flags: ['loadedChoice'],
  },
  {
    id: 'br_overflow',
    name: 'Overflow',
    nodeType: 'bridge',
    region: 'high',
    bridges: ['high', 'volume'],
    description: 'Rolling a 5 or 6 has a 28% chance to grant a bonus roll.',
    notation: [[die(5), die(6), to('28%'), roll()]],
    costs: { score: 520 },
    prerequisites: ['hr_heavy6'],
    position: { x: 415, y: -287 },
    tags: ['bridge', 'bonus-roll'],
    triggers: [
      {
        on: 'onResolve',
        when: [{ kind: 'face', in: [5, 6] }, { kind: 'chance', p: 0.28 }],
        effects: [{ kind: 'bonusRoll', count: 1 }],
      },
    ],
  },
  {
    id: 'br_tickets',
    name: 'More Tickets',
    nodeType: 'bridge',
    region: 'jackpot',
    bridges: ['volume', 'jackpot'],
    description:
      {
        A: 'Each roll that misses the jackpot gives face 6 +0.08 weight, stacking up to 20 times. A jackpot clears the stacks.',
        B: 'Existing stacks still apply, but no new ones build.',
      },
    notation: {
      A: [[note('miss'), to(), die(6), weight('+0.08'), note('· max 20')]],
      B: [[off('stacks frozen')]],
    },
    costs: { score: 560 },
    prerequisites: ['vl_quick', 'jp_hotstreak'],
    position: { x: -72, y: 280 },
    tags: ['bridge', 'jackpot', 'probability'],
    flags: ['moreTickets'],
  },
  {
    id: 'br_arrange',
    name: 'Arrange',
    nodeType: 'bridge',
    region: 'pattern',
    bridges: ['control', 'pattern'],
    description:
      'Narrows the window of possible results from 3 numbers to 2.',
    notation: [[note('window'), val('3'), to(), val('2', 'accent')]],
    costs: { score: 580 },
    prerequisites: ['ct_reserve'],
    position: { x: -171, y: -475 },
    tags: ['bridge', 'pattern', 'probability'],
    flags: ['arrange'],
    modifiers: [{ stat: 'allowedFaces', op: 'add', value: -1 }],
  },

  // -------------------------------------------------------------------------
  // INNER RING — connective territory. Available once Meta is known.
  // -------------------------------------------------------------------------
  {
    id: 'ad_transition',
    name: 'Transition',
    nodeType: 'small',
    region: 'adaptive',
    description:
      {
        A: 'The first roll after changing framework grants ×2.5 Score.',
        B: 'The first roll after changing framework costs only 40% of its value.',
      },
    notation: {
      A: [[op('⇄'), to(), note('next roll'), score('×2.5')]],
      B: [[op('⇄'), to(), note('next roll costs'), val('×0.4', 'accent')]],
    },
    costs: { score: 200, meta: 40 },
    prerequisites: ['ct_second'],
    position: { x: -321, y: -164 },
    tags: ['adaptive', 'switch'],
    discoveryRequirements: ['frameworkB'],
    triggers: [
      {
        on: 'onSwitch',
        effects: [
          { kind: 'tempStat', stat: 'scoreMult', op: 'mult', value: 2.5, rolls: 1 },
          { kind: 'tempStat', stat: 'lossMult', op: 'mult', value: 0.4, rolls: 1 },
        ],
      },
    ],
  },
  {
    id: 'ad_carryover',
    name: 'Carryover',
    nodeType: 'small',
    region: 'adaptive',
    description:
      'Climb stacks, Momentum, Pressure, ticket stacks, weight pushes and the Flip cooldown are kept when you change framework instead of being cleared.',
    notation: [[op('⇄'), to(), note('Climb · Pressure · stacks kept')]],
    costs: { score: 150, meta: 95 },
    prerequisites: ['ad_transition'],
    position: { x: -513, y: -164 },
    tags: ['adaptive', 'switch'],
    discoveryRequirements: ['frameworkB'],
    flags: ['carryover'],
  },
  {
    id: 'ad_counterweight',
    name: 'Counterweight',
    nodeType: 'small',
    region: 'adaptive',
    description: {
      A: 'Below 60 Score, bonus roll chance +25%. Above 400 Score, Score gained ×1.2.',
      B: 'Below 60 Score, bonus roll chance +25%.',
    },
    notation: {
      A: [[score('<60'), to(), roll('+25%')],
         clause('score', score('>400'), to(), score('Score'), op('×'), val('1.2', 'accent'))],
      B: [[score('<60'), to(), roll('+25%')]],
    },
    costs: { score: 420, meta: 35 },
    prerequisites: ['jp_longodds'],
    position: { x: -360, y: 17 },
    tags: ['adaptive', 'state'],
    discoveryRequirements: ['frameworkB'],
    modifiers: [
      { stat: 'bonusRollChance', op: 'add', value: 0.25, when: [{ kind: 'scoreBelow', value: 60 }] },
      { stat: 'scoreMult', op: 'mult', value: 1.2, when: [{ kind: 'scoreAbove', value: 400 }] },
    ],
  },
  {
    id: 'ad_crossing',
    name: 'Crossing Point',
    nodeType: 'notable',
    region: 'adaptive',
    description:
      {
        A: 'Below 40 Score, every roll grants +6 Score. Above 350 Score, every roll has a 20% chance to grant a bonus roll.',
        B: 'Above 350 Score, every roll has a 20% chance to grant a bonus roll.',
      },
    notation: {
      A: [[score('<40'), to(), score('+6'), note('per roll')],
         clause('roll', score('>350'), to(), val('20%'), to(), roll())],
      B: [[score('>350'), to(), val('20%'), to(), roll()]],
    },
    costs: { score: 520, meta: 130 },
    prerequisites: ['ad_transition', 'ad_counterweight'],
    position: { x: -494, y: -107 },
    tags: ['adaptive', 'state'],
    discoveryRequirements: ['frameworkB'],
    modifiers: [
      { stat: 'scoreFlat', op: 'add', value: 6, when: [{ kind: 'scoreBelow', value: 40 }] },
      { stat: 'bonusRollChance', op: 'add', value: 0.2, when: [{ kind: 'scoreAbove', value: 350 }] },
    ],
  },
  {
    id: 'ad_pendulum',
    name: 'Pendulum',
    nodeType: 'notable',
    region: 'adaptive',
    description:
      {
        A: 'Each roll adds 1 Pendulum, up to 25. Changing framework spends it: the next 3 rolls each grant Pendulum / 5 Score.',
        B: 'Each roll adds 1 Pendulum, up to 25. Changing framework spends it: the next 3 rolls each grant Pendulum / 10 Meta.',
      },
    notation: {
      A: [[note('per roll'), val('+1', 'accent'), note('Pendulum · max 25')],
         clause('streak', op('⇄'), to(), note('next 3'), score('+Pendulum/5'))],
      B: [[note('per roll'), val('+1', 'accent'), note('Pendulum · max 25')],
         clause('streak', op('⇄'), to(), note('next 3'), meta('+Pendulum/10'))],
    },
    costs: { score: 560, meta: 150 },
    prerequisites: ['ad_carryover'],
    position: { x: -610, y: -195 },
    tags: ['adaptive', 'switch'],
    discoveryRequirements: ['frameworkB'],
    flags: ['pendulum'],
  },
  {
    id: 'ad_reflection',
    name: 'Reflection',
    nodeType: 'notable',
    region: 'adaptive',
    description:
      {
        A: 'If the first roll after changing framework matches the last one before it, grant 2 bonus rolls and +60 Score.',
        B: 'If the first roll after changing framework matches the last one before it, grant 2 bonus rolls and +4 Meta.',
      },
    notation: {
      A: [[die(3), op('⇄'), die(3), to(), score('+60'), roll('+2')]],
      B: [[die(3), op('⇄'), die(3), to(), meta('+4'), roll('+2')]],
    },
    costs: { score: 820, meta: 90 },
    prerequisites: ['ad_counterweight'],
    position: { x: -504, y: 24 },
    tags: ['adaptive', 'switch', 'pattern'],
    discoveryRequirements: ['frameworkB'],
    flags: ['reflection'],
  },
  {
    id: 'ad_duality',
    name: 'Duality',
    nodeType: 'keystone',
    region: 'adaptive',
    description:
      'Changing framework grants one bonus roll per region where you hold 2 or more nodes, clears the Flip cooldown, and doubles Reflection and Pendulum.',
    notation: [[note('regions with 2+'), op('='), val('R', 'accent')],
      clause('roll', op('⇄'), to(), roll('+R'), op('·'), note('Reflection · Pendulum'), val('×2', 'accent'))],
    costs: { score: 1500, meta: 650 },
    prerequisites: ['ad_pendulum', 'ad_reflection'],
    position: { x: -634, y: -84 },
    tags: ['keystone', 'adaptive', 'switch'],
    discoveryRequirements: ['frameworkB'],
    flags: ['duality'],
  },
  {
    id: 'br_chain',
    name: 'Chain Reaction',
    nodeType: 'bridge',
    region: 'pattern',
    bridges: ['pattern', 'volume'],
    description:
      'Completing a triple, run, palindrome, alternating sequence or full set grants a bonus roll. Those rolls continue the history.',
    notation: [[note('pattern'), to(), roll()]],
    costs: { score: 620, meta: 80 },
    prerequisites: ['pt_fullset', 'vl_cycle'],
    position: { x: 320, y: 295 },
    tags: ['bridge', 'pattern', 'bonus-roll'],
    discoveryRequirements: ['frameworkB'],
    triggers: [
      {
        on: 'onPattern',
        when: [{ kind: 'pattern', in: ['triple', 'run', 'longRun', 'palindrome', 'longPalindrome', 'alternating', 'fullSet'] }],
        effects: [{ kind: 'bonusRoll', count: 1 }],
      },
    ],
  },
  {
    id: 'br_hedge',
    name: 'Hedge',
    nodeType: 'bridge',
    region: 'jackpot',
    bridges: ['jackpot', 'control'],
    description:
      {
        A: 'A lost wager refunds 50%. You may swap a held result in after seeing the face, not before.',
        B: 'You may swap a held result in after seeing the face, not before.',
      },
    notation: {
      A: [[note('lost wager'), to(), score('50%'), note('back')],
         clause('swap', slot(true), to(), note('swap after seeing the roll'))],
      B: [[slot(true), to(), note('swap after seeing the roll')]],
    },
    costs: { score: 660, meta: 95 },
    prerequisites: ['jp_stake'],
    position: { x: -470, y: 184 },
    tags: ['bridge', 'jackpot', 'storage'],
    discoveryRequirements: ['frameworkB'],
    flags: ['hedge'],
    modifiers: [{ stat: 'stakeRefundOnMiss', op: 'add', value: 0.5 }],
  },
  {
    id: 'br_peak',
    name: 'Peak Sequence',
    nodeType: 'bridge',
    region: 'high',
    bridges: ['pattern', 'high'],
    description:
      {
        A: 'A pattern ending on a 5 or 6 grants +6 Score and gives face 6 +0.8 weight on the next roll.',
        B: 'A pattern ending on a 5 or 6 grants +1 Meta and gives face 6 +0.8 weight on the next roll.',
      },
    notation: {
      A: [[note('pattern ends'), die(5), die(6), to(), score('+6'), die(6), weight('+0.8')]],
      B: [[note('pattern ends'), die(5), die(6), to(), meta('+1'), die(6), weight('+0.8')]],
    },
    costs: { score: 600, meta: 75 },
    prerequisites: ['pt_step', 'hr_edge'],
    position: { x: 294, y: -207 },
    tags: ['bridge', 'pattern', 'probability'],
    discoveryRequirements: ['frameworkB'],
    triggers: [
      {
        on: 'onPattern',
        when: [
          { kind: 'patternEndsAtLeast', value: 5 },
          { kind: 'pattern', in: ['pair', 'triple', 'step', 'run', 'longRun', 'palindrome', 'longPalindrome', 'alternating', 'fullSet'] },
        ],
        effects: [
          { kind: 'reward', score: 6, meta: 1 },
          { kind: 'weightFor', face: 6, add: 0.8, rolls: 1 },
        ],
      },
    ],
  },
  {
    id: 'br_counterplay',
    name: 'Counterplay',
    nodeType: 'bridge',
    region: 'control',
    bridges: ['adaptive', 'control'],
    description: 'The Flip cooldown is cleared whenever you change framework.',
    notation: [[op('⇄'), to(), note('Flip cooldown cleared')]],
    costs: { score: 450, meta: 105 },
    prerequisites: ['ct_flip', 'ad_transition'],
    position: { x: -380, y: -333 },
    tags: ['bridge', 'adaptive', 'replacement'],
    discoveryRequirements: ['frameworkB'],
    flags: ['counterplay'],
  },
  {
    id: 'br_afterimage',
    name: 'Afterimage',
    nodeType: 'bridge',
    region: 'volume',
    bridges: ['adaptive', 'volume'],
    description:
      'For 3 rolls after changing framework, every bonus roll comes up as the last face before the change.',
    notation: [[op('⇄'), note('≤3 rolls'), to(), roll('bonus'), op('='), note('last face before')]],
    costs: { score: 640, meta: 110 },
    prerequisites: ['vl_quick'],
    position: { x: -78, y: 351 },
    tags: ['bridge', 'adaptive', 'bonus-roll'],
    discoveryRequirements: ['frameworkB'],
    flags: ['afterimage'],
  },
];

export const NODES_BY_ID: ReadonlyMap<string, PassiveNode> = new Map(NODES.map((n) => [n.id, n]));

/** Undirected adjacency built from the prerequisite lists. */
export const EDGES: ReadonlyArray<[string, string]> = (() => {
  const seen = new Set<string>();
  const out: [string, string][] = [];
  for (const node of NODES) {
    for (const pre of node.prerequisites) {
      const key = [node.id, pre].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([pre, node.id]);
    }
  }
  return out;
})();
