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
  /** A storage cell: Hold capacity, a queued result. */
  | { k: 'slot'; filled?: boolean; text?: string }
  /** Connective: an arrow, a comparison, an ellipsis. `over` labels the arrow. */
  | { k: 'op'; text: string; over?: string }
  /** A number or short keyword. */
  | { k: 'val'; text: string; tone?: Tone }
  /** The bonus-roll chip — the single most common effect in the tree. */
  | { k: 'roll'; text?: string }
  /** A counter that fills: Pressure, Climb, Pendulum, tickets. */
  | { k: 'meter'; fill: number; text?: string }
  /** This node does nothing under the framework in play. */
  | { k: 'off'; text?: string };

/** One line of notation. Smalls use one; notables may use two. */
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
export const off = (text = 'inactive'): Token => ({ k: 'off', text });

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
  'queue', 'queued',
  'Full Set', 'set window',
  'stacks', 'stacking',
  'wager', 'wagered',
  'Score', 'Meta',
] as const;
