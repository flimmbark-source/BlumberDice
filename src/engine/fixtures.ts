/**
 * Reference builds, shared by the balance script and the build tests.
 *
 * They lived in both places and drifted: several described allocations the
 * prerequisite graph does not actually permit, so the numbers were for builds
 * no player could assemble. `tests/builds.test.ts` now asserts every one of
 * them is reachable from `start`.
 */
export const FIXTURES = {
  baseline: [],
  highRoller: ['hr_edge', 'hr_floor', 'hr_heavy6', 'hr_momentum', 'hr_climb', 'hr_upper', 'hr_nogoback'],
  volume: ['vl_quick', 'vl_lowgear', 'vl_cycle', 'vl_follow', 'vl_echo', 'vl_splinter', 'vl_secondwind', 'vl_handful'],
  jackpot: ['jp_longodds', 'jp_hotstreak', 'jp_stake', 'jp_nearmiss', 'jp_pressure', 'jp_ride', 'jp_oneinsix'],
  control: ['ct_second', 'ct_reserve', 'ct_hold', 'ct_flip', 'ct_seal', 'ct_prepared'],
  pattern: ['pt_repeat', 'pt_step', 'pt_collector', 'pt_alt', 'pt_doubles', 'pt_run', 'pt_palindrome', 'pt_fullset', 'pt_memory'],
  // Hybrids
  sixEngine: ['hr_edge', 'hr_heavy6', 'hr_climb', 'hr_momentum', 'vl_quick', 'vl_cycle', 'vl_echo', 'br_overflow', 'hr_floor'],
  comboEngine: ['pt_repeat', 'pt_step', 'pt_run', 'pt_doubles', 'pt_palindrome', 'pt_fullset', 'vl_quick', 'vl_cycle', 'br_chain', 'pt_collector', 'pt_alt'],
  slotMachine: ['vl_quick', 'vl_cycle', 'vl_echo', 'vl_splinter', 'jp_longodds', 'jp_hotstreak', 'jp_pressure', 'br_tickets', 'vl_lowgear', 'vl_follow', 'jp_stake'],
  cardCounter: ['jp_longodds', 'jp_hotstreak', 'jp_stake', 'jp_nearmiss', 'ct_hold', 'ct_flip', 'br_hedge', 'ct_second', 'ct_reserve'],
  sequenceSolver: ['ct_second', 'ct_hold', 'ct_flip', 'ct_seal', 'ct_prepared', 'pt_repeat', 'pt_run', 'pt_doubles', 'br_arrange', 'pt_step', 'ct_reserve'],
  climber: ['hr_edge', 'hr_climb', 'hr_momentum', 'pt_step', 'pt_run', 'pt_doubles', 'br_peak', 'hr_floor', 'hr_heavy6', 'pt_repeat'],
  grinder: ['vl_quick', 'vl_cycle', 'vl_follow', 'vl_secondwind', 'ct_second', 'ct_hold', 'vl_lowgear'],
} satisfies Record<string, string[]>;
