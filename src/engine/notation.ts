import type { Face, FrameworkId } from './types.ts';

/**
 * The tree's visual notation.
 *
 * Every node in the web says the same kind of thing: some condition produces
 * some effect, sometimes with a probability or a duration attached. Writing
 * that as one closed grammar rather than 54 sentences means a player can learn
 * the shapes once and then read any node at a glance, and can recognise an
 * archetype across the tree before reading a word — rows of faces are High
 * Roller, roll chips are Volume, sequences are Pattern, substitutions are
 * Control, wagers are Jackpot, switch marks are Adaptive.
 *
 * Keep tokens small and symbolic. The prose underneath is the precision layer,
 * not the explanation.
 */

export type Tone = 'accent' | 'score' | 'meta' | 'warn' | 'muted';

export type Token =
  /** A specific die face. `dim` is a source or unmet side, `out` is removed. */
  | { k: 'die'; face: Face; tone?: 'lit' | 'dim' | 'out' }
  /** A blank die: any value. Never a variable — a letter has to be decoded. */
  | { k: 'any'; text?: string; tone?: 'lit' | 'dim' }
  /** A storage cell: Hold capacity, a stored result. */
  | { k: 'slot'; filled?: boolean; text?: string }
  /** Connective: an arrow, a comparison, an ellipsis. `over` labels the arrow. */
  | { k: 'op'; text: string; over?: string }
  /** A number or short keyword. */
  | { k: 'val'; text: string; tone?: Tone }
  /** The bonus-roll chip — the single most common effect in the tree. */
  | { k: 'roll'; text?: string }
  /** A continuous counter: Pressure, a long threshold. Drawn as a bar. */
  | { k: 'meter'; fill: number; text?: string }
  /** A short countable counter: Climb 0/5, Hold 0/1. Drawn as pips. */
  | { k: 'pips'; of: number; filled?: number; text?: string }
  /**
   * Row marker. A row that opens with this is a clause: a secondary rule,
   * inset under the primary one rather than competing with it. Only ever the
   * first token of a row.
   */
  | { k: 'clause'; icon?: ClauseIcon }
  /** This node does nothing under the framework in play. */
  | { k: 'off'; text?: string };

/** What kind of rule a clause states, so the eye can sort them by shape. */
export type ClauseIcon =
  /** Pays out. */
  | 'score'
  /** Grants rolls. */
  | 'roll'
  /** Builds or spends a counter. */
  | 'streak'
  /** Exchanges one thing for another. */
  | 'swap'
  /** Takes something away, or refuses it. */
  | 'deny';

/** One line of notation: the primary statement, or a clause under it. */
export type Row = Token[];
export type Notation = Row[];

/** A node's notation, per framework where the mechanic differs. */
export type NodeNotation = Notation | Record<FrameworkId, Notation>;

export function notationFor(n: NodeNotation, framework: FrameworkId): Notation {
  return Array.isArray(n) ? n : n[framework];
}

// --- authoring helpers -----------------------------------------------------
// Terse on purpose: the node catalogue stays readable as data.

export const die = (face: Face, tone?: 'lit' | 'dim' | 'out'): Token => ({ k: 'die', face, tone });
export const dice = (...faces: Face[]): Token[] => faces.map((f) => die(f));
export const any = (text?: string, tone?: 'lit' | 'dim'): Token => ({ k: 'any', text, tone });
export const slot = (filled?: boolean, text?: string): Token => ({ k: 'slot', filled, text });
export const op = (text: string, over?: string): Token => ({ k: 'op', text, over });
export const to = (over?: string): Token => ({ k: 'op', text: '→', over });
export const val = (text: string, tone?: Tone): Token => ({ k: 'val', text, tone });
export const roll = (text = '+1'): Token => ({ k: 'roll', text });
export const meter = (fill: number, text?: string): Token => ({ k: 'meter', fill, text });
export const pips = (of: number, filled = 0, text?: string): Token => ({ k: 'pips', of, filled, text });
export const off = (text = 'inactive'): Token => ({ k: 'off', text });

/**
 * A secondary rule. Nodes above a Small usually have two things to say, and
 * saying them in two equal rows makes neither of them the headline. A clause
 * is indented, quieter and prefixed by what kind of rule it is.
 */
export const clause = (icon: ClauseIcon, ...tokens: Token[]): Row =>
  [{ k: 'clause', icon }, ...tokens];

/** True when this row is a clause rather than the primary statement. */
export const isClause = (row: Row): boolean => row[0]?.k === 'clause';

/** Score and Meta amounts, in their own colours wherever they appear. */
export const score = (text: string): Token => ({ k: 'val', text, tone: 'score' });
export const meta = (text: string): Token => ({ k: 'val', text, tone: 'meta' });
/** A weight change, the tree's probability currency. */
export const weight = (text: string): Token => ({ k: 'val', text, tone: 'accent' });
/** A muted aside: a duration, a cap, a cadence. */
export const note = (text: string): Token => ({ k: 'val', text, tone: 'muted' });

/**
 * Terms that name a system rather than describe one. Highlighted identically
 * everywhere they appear, so the same mechanic reads as the same mechanic
 * across the whole tree.
 */
export const KEYWORDS = [
  'bonus roll', 'bonus rolls',
  'weight',
  'jackpot',
  'Pressure',
  'Climb',
  'Pendulum',
  'Hold', 'held',
  'Full Set', 'set window',
  'stacks', 'stacking',
  'wager', 'wagered',
  'Score', 'Meta',
] as const;
