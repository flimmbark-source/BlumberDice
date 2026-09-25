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
    costs: { score: 45 },
    prerequisites: ['start'],
    position: { x: 129, y: -159 },
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
    description: 'A rolled 1 has a 30% chance to become a 2 before resolving.',
    costs: { score: 120 },
    prerequisites: ['hr_edge'],
    position: { x: 97, y: -347 },
    tags: ['probability', 'replacement'],
    modifiers: [{ stat: 'raisedFloorChance', op: 'add', value: 0.3 }],
  },
  {
    id: 'hr_heavy6',
    name: 'Heavy Six',
    nodeType: 'small',
    region: 'high',
    description: 'Face 6 gains +0.9 weight. Face 3 loses 0.5 weight.',
    costs: { score: 130 },
    prerequisites: ['hr_edge'],
    position: { x: 263, y: -246 },
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
    description: 'After resolving 4 or higher, faces 5 and 6 each gain +0.5 weight on the next roll.',
    costs: { score: 240 },
    prerequisites: ['hr_floor', 'hr_heavy6'],
    position: { x: 262, y: -431 },
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
      'Each roll strictly higher than the previous one adds a Climb stack (max 5). Every stack gives faces 4-6 +0.3 weight. Any roll not higher than the previous clears all stacks.',
    costs: { score: 420 },
    prerequisites: ['hr_heavy6'],
    position: { x: 319, y: -392 },
    tags: ['probability', 'streak'],
    flags: ['climb'],
  },
  {
    id: 'hr_upper',
    name: 'Upper Half',
    nodeType: 'notable',
    region: 'high',
    description: {
      A: 'Rolls of 4-6 grant +3 Score.',
      B: 'No effect.',
    },
    costs: { score: 380 },
    prerequisites: ['hr_momentum'],
    position: { x: 332, y: -547 },
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
    description: 'The roll after a 6 cannot resolve as a 1; it is resampled from the other five faces.',
    costs: { score: 460 },
    prerequisites: ['hr_climb'],
    position: { x: 404, y: -496 },
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
    description: 'Every resolved roll has a 12% chance to grant a bonus roll.',
    costs: { score: 45 },
    prerequisites: ['start'],
    position: { x: 55, y: 197 },
    tags: ['bonus-roll'],
    modifiers: [{ stat: 'bonusRollChance', op: 'add', value: 0.12 }],
  },
  {
    id: 'vl_lowgear',
    name: 'Low Gear',
    nodeType: 'small',
    region: 'volume',
    description: 'Resolving a 1 or 2 has a 22% chance to grant a bonus roll.',
    costs: { score: 115 },
    prerequisites: ['vl_quick'],
    position: { x: 205, y: 337 },
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
    description: 'Manual roll cooldown is reduced by 22%.',
    costs: { score: 125 },
    prerequisites: ['vl_quick'],
    position: { x: 97, y: 347 },
    tags: ['pacing'],
    modifiers: [{ stat: 'cooldownMult', op: 'mult', value: 0.78 }],
  },
  {
    id: 'vl_follow',
    name: 'Follow Through',
    nodeType: 'small',
    region: 'volume',
    description: 'Bonus rolls have an 18% chance to grant a further bonus roll.',
    costs: { score: 250 },
    prerequisites: ['vl_lowgear', 'vl_cycle'],
    position: { x: 201, y: 463 },
    tags: ['bonus-roll'],
    modifiers: [{ stat: 'bonusFromBonusChance', op: 'add', value: 0.18 }],
  },
  {
    id: 'vl_echo',
    name: 'Echo',
    nodeType: 'notable',
    region: 'volume',
    description: 'Resolving a 6 grants a bonus roll.',
    costs: { score: 400 },
    prerequisites: ['vl_cycle'],
    position: { x: 136, y: 486 },
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
    description: 'Every resolved roll has a 10% chance to split into 2 further independently resolved rolls.',
    costs: { score: 520 },
    prerequisites: ['vl_follow'],
    position: { x: 255, y: 587 },
    tags: ['bonus-roll', 'split'],
    modifiers: [{ stat: 'splinterChance', op: 'add', value: 0.1 }],
  },
  {
    id: 'vl_secondwind',
    name: 'Second Wind',
    nodeType: 'notable',
    region: 'volume',
    description: 'After 8 consecutive rolls without a bonus roll, the next resolved roll grants one.',
    costs: { score: 430 },
    prerequisites: ['vl_echo'],
    position: { x: 173, y: 616 },
    tags: ['bonus-roll', 'consistency'],
    modifiers: [{ stat: 'secondWindThreshold', op: 'add', value: 8 }],
  },
  {
    id: 'vl_handful',
    name: 'Handful',
    nodeType: 'keystone',
    region: 'volume',
    description: {
      A: 'Each manual roll produces 3 dice instead of 1. Score from every roll is multiplied by 0.55.',
      B: 'Each manual roll produces 3 dice instead of 1.',
    },
    costs: { score: 1700 },
    prerequisites: ['vl_splinter', 'vl_secondwind'],
    position: { x: 255, y: 718 },
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
        A: 'Enables the jackpot: a resolved 6 pays an extra +14 Score. All other Score is multiplied by 0.85.',
        B: 'No effect. The jackpot pays nothing here.',
      },
    costs: { score: 50 },
    prerequisites: ['start'],
    position: { x: -167, y: 118 },
    tags: ['jackpot', 'payout'],
    flags: ['jackpot'],
    modifiers: [
      { stat: 'jackpotFlat', op: 'add', value: 14 },
      { stat: 'scoreMult', op: 'mult', value: 0.85 },
    ],
  },
  {
    id: 'jp_hotstreak',
    name: 'Hot Streak',
    nodeType: 'small',
    region: 'jackpot',
    description: {
      A: 'Every roll that misses the jackpot adds +1 Pressure (max 25). A jackpot pays its Pressure as bonus Score, then clears it.',
      B: 'No effect. Pressure does not build here.',
    },
    costs: { score: 135 },
    prerequisites: ['jp_longodds'],
    position: { x: -227, y: 279 },
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
        A: 'Before a manual roll you may wager up to 40 Score. A jackpot returns the wager multiplied by 2.5; any other result loses it.',
        B: 'No effect. Wagers are not taken here.',
      },
    costs: { score: 140 },
    prerequisites: ['jp_longodds'],
    position: { x: -320, y: 166 },
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
    description: 'Resolving a 5 gives face 6 +1.4 weight on the next roll.',
    costs: { score: 390 },
    prerequisites: ['jp_hotstreak'],
    position: { x: -262, y: 431 },
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
    name: 'Pressure',
    nodeType: 'notable',
    region: 'jackpot',
    description: {
      A: 'Jackpot misses add +3 Pressure instead of +1, and the Pressure cap rises by 65.',
      B: 'No effect.',
    },
    costs: { score: 520 },
    prerequisites: ['jp_hotstreak', 'jp_stake'],
    position: { x: -392, y: 319 },
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
        A: 'After a roll pays 15 Score or more, choose to bank it or ride it. Riding stakes the payout on the next roll: a jackpot returns it at 3x, anything else loses it.',
        B: 'No effect.',
      },
    costs: { score: 610 },
    prerequisites: ['jp_pressure'],
    position: { x: -497, y: 404 },
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
        A: 'Only a 6 grants Score. A 6 grants 9x its value before other modifiers, and jackpot payouts are multiplied by 1.5.',
        B: 'No effect.',
      },
    costs: { score: 1900 },
    prerequisites: ['jp_ride', 'jp_nearmiss'],
    position: { x: -421, y: 483 },
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
      A: 'Two identical results in a row grant +3 Score.',
      B: 'No effect.',
    },
    costs: { score: 45 },
    prerequisites: ['start'],
    position: { x: 201, y: 42 },
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
      A: 'A result exactly one higher or one lower than the previous one grants +2 Score.',
      B: 'No effect.',
    },
    costs: { score: 115 },
    prerequisites: ['pt_repeat'],
    position: { x: 359, y: 25 },
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
    costs: { score: 130 },
    prerequisites: ['pt_repeat'],
    position: { x: 320, y: 166 },
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
      A: 'Four results alternating between 1-3 and 4-6 grant +5 Score.',
      B: 'Four results alternating between 1-3 and 4-6 grant +1 Meta.',
    },
    costs: { score: 245 },
    prerequisites: ['pt_step', 'pt_collector'],
    position: { x: 419, y: 118 },
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
        A: 'Two identical results in a row grant +6 Score. Three in a row grant +20 Score.',
        B: 'Two identical results in a row grant +1 Meta. Three in a row grant +2 Meta.',
      },
    costs: { score: 370 },
    prerequisites: ['pt_step'],
    position: { x: 494, y: 103 },
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
        A: 'Three consecutive ascending or descending results grant +8 Score and a bonus roll.',
        B: 'Three consecutive ascending or descending results grant +1 Meta and a bonus roll.',
      },
    costs: { score: 430 },
    prerequisites: ['pt_collector'],
    position: { x: 448, y: 232 },
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
        A: 'A result matching the one from two rolls ago, with a different value between them, grants +7 Score.',
        B: 'A result matching the one from two rolls ago, with a different value between them, grants +1 Meta.',
      },
    costs: { score: 470 },
    prerequisites: ['pt_doubles'],
    position: { x: 627, y: 130 },
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
    costs: { score: 560 },
    prerequisites: ['pt_run', 'pt_alt'],
    position: { x: 595, y: 235 },
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
      'Roll history widens from 4 to 10. Four-long runs and five-long palindromes are detected, alternating sequences are checked over 6 rolls, and all pattern rewards are multiplied by 1.4.',
    costs: { score: 1500 },
    prerequisites: ['pt_palindrome', 'pt_fullset'],
    position: { x: 730, y: 218 },
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
    description: 'A rolled 1 has a 45% chance to be rerolled once.',
    costs: { score: 45 },
    prerequisites: ['start'],
    position: { x: -150, y: -140 },
    tags: ['reroll'],
    modifiers: [{ stat: 'rerollOneChance', op: 'add', value: 0.45 }],
  },
  {
    id: 'ct_reserve',
    name: 'Reserve',
    nodeType: 'small',
    region: 'control',
    description: 'Hold capacity increased by 1.',
    costs: { score: 150 },
    prerequisites: ['ct_second'],
    position: { x: -187, y: -308 },
    tags: ['storage'],
    modifiers: [{ stat: 'holdCapacity', op: 'add', value: 1 }],
  },
  {
    id: 'ct_hold',
    name: 'Hold',
    nodeType: 'notable',
    region: 'control',
    description:
      'Capacity to store 1 result. A held result does not resolve: it grants no Score, costs no Score and generates no Meta. You may swap a held result in place of a later roll before it resolves.',
    costs: { score: 360 },
    prerequisites: ['ct_second'],
    position: { x: -49, y: -357 },
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
      'Once every 5 rolls you may replace the rolled face with its opposite: 1 becomes 6, 2 becomes 5, 3 becomes 4, and the reverse.',
    costs: { score: 420 },
    prerequisites: ['ct_reserve'],
    position: { x: -319, y: -392 },
    tags: ['replacement', 'decision'],
    flags: ['flip'],
    modifiers: [{ stat: 'flipPeriod', op: 'add', value: 5 }],
  },
  {
    id: 'ct_seal',
    name: 'Seal',
    nodeType: 'notable',
    region: 'control',
    description: 'Remove one face of your choice from the sampling pool. Its weight is redistributed across the remaining faces.',
    costs: { score: 480 },
    prerequisites: ['ct_hold'],
    position: { x: -69, y: -500 },
    tags: ['probability', 'decision'],
    flags: ['seal'],
  },
  {
    id: 'ct_prepared',
    name: 'Prepared Roll',
    nodeType: 'keystone',
    region: 'control',
    description:
      'A queue of the next 3 results is generated and shown. Rolls consume the queue from the front, and you may swap adjacent queued results.',
    costs: { score: 1600 },
    prerequisites: ['ct_flip', 'ct_seal'],
    position: { x: -255, y: -587 },
    tags: ['keystone', 'queue', 'decision'],
    flags: ['preparedRoll'],
    modifiers: [{ stat: 'queueLength', op: 'add', value: 3 }],
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
    description: 'Every roll generates two candidate results. You choose which one resolves; the other is discarded.',
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
    description: 'Resolving a 5 or 6 has a 28% chance to grant a bonus roll.',
    costs: { score: 520 },
    prerequisites: ['hr_heavy6'],
    position: { x: 413, y: -291 },
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
    costs: { score: 560 },
    prerequisites: ['vl_quick', 'jp_hotstreak'],
    position: { x: -73, y: 353 },
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
      'Held results and queued results enter the roll history when they resolve. Prepared Roll may swap any two queued results instead of only adjacent ones.',
    costs: { score: 580 },
    prerequisites: ['ct_reserve'],
    position: { x: -201, y: -463 },
    tags: ['bridge', 'pattern', 'storage'],
    flags: ['arrange'],
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
        A: 'The first roll after changing framework grants 2.5x Score.',
        B: 'The first roll after changing framework costs only 40% of its value.',
      },
    costs: { score: 200, meta: 40 },
    prerequisites: ['ct_second'],
    position: { x: -339, y: -121 },
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
    costs: { score: 150, meta: 95 },
    prerequisites: ['ad_transition'],
    position: { x: -476, y: -169 },
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
      A: 'While Score is below 60, bonus roll chance is increased by 25%. While Score is above 400, Score gained is multiplied by 1.2.',
      B: 'While Score is below 60, bonus roll chance is increased by 25%.',
    },
    costs: { score: 420, meta: 35 },
    prerequisites: ['jp_longodds'],
    position: { x: -352, y: 73 },
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
        A: 'While Score is below 40, rolls grant +6 Score. While Score is above 350, every resolved roll has a 20% chance to grant a bonus roll.',
        B: 'While Score is above 350, every resolved roll has a 20% chance to grant a bonus roll.',
      },
    costs: { score: 520, meta: 130 },
    prerequisites: ['ad_transition', 'ad_counterweight'],
    position: { x: -504, y: -35 },
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
    costs: { score: 560, meta: 150 },
    prerequisites: ['ad_carryover'],
    position: { x: -603, y: -214 },
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
        A: 'If the first result after changing framework equals the last result before it, grant 2 bonus rolls and +60 Score.',
        B: 'If the first result after changing framework equals the last result before it, grant 2 bonus rolls and +4 Meta.',
      },
    costs: { score: 820, meta: 90 },
    prerequisites: ['ad_counterweight'],
    position: { x: -494, y: 103 },
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
      'Count the archetype regions where you have allocated 2 or more nodes. Changing framework grants that many bonus rolls, clears the Flip cooldown, and doubles Reflection and Pendulum payouts.',
    costs: { score: 1500, meta: 650 },
    prerequisites: ['ad_pendulum', 'ad_reflection'],
    position: { x: -639, y: -43 },
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
    costs: { score: 620, meta: 80 },
    prerequisites: ['pt_run', 'vl_quick'],
    position: { x: 227, y: 280 },
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
        A: 'A lost wager refunds 50% of its Score. You may swap a held result in after seeing the rolled face rather than before.',
        B: 'You may swap a held result in after seeing the rolled face rather than before.',
      },
    costs: { score: 660, meta: 95 },
    prerequisites: ['jp_stake'],
    position: { x: -448, y: 232 },
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
    costs: { score: 600, meta: 75 },
    prerequisites: ['pt_step', 'hr_edge'],
    position: { x: 330, y: -143 },
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
    costs: { score: 450, meta: 105 },
    prerequisites: ['ct_flip', 'ad_transition'],
    position: { x: -413, y: -292 },
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
      'Bonus rolls created within 3 rolls of changing framework resolve as the last face rolled before the change.',
    costs: { score: 640, meta: 110 },
    prerequisites: ['vl_quick'],
    position: { x: 0, y: 360 },
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
