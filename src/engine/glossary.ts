/**
 * What the tree's terms mean.
 *
 * The keyword registry and the glossary are the same thing: a term is
 * highlighted in a tooltip precisely because there is an entry explaining it,
 * so a highlighted word can never be one the player has no way to look up.
 * `tests/glossary.test.ts` holds that both ways.
 *
 * Entries define, they do not advise. House style is the same as the node
 * copy: say the number where there is one, "roll" for something that
 * happened and "result" for a stored or candidate value, active voice, and
 * no pipeline vocabulary.
 */
export interface GlossaryEntry {
  /** The heading, in the form a player reads it in the tree. */
  term: string;
  text: string;
}

/** Keyed by lemma. Inflections point here through `KEYWORD_FORMS`. */
export const GLOSSARY: Record<string, GlossaryEntry> = {
  score: {
    term: 'Score',
    text: 'The main currency used to buy upgrades.',
  },
  meta: {
    term: 'Meta',
    text: 'The second currency, used by deeper upgrades.',
  },
  'bonus roll': {
    term: 'Bonus roll',
    text: 'An extra roll granted by an effect.',
  },
  weight: {
    term: 'Weight',
    text: 'More weight makes a face more likely to roll.',
  },
  jackpot: {
    term: 'Jackpot',
    text: 'A 6 that triggers jackpot effects.',
  },
  pressure: {
    term: 'Pressure',
    text: 'A jackpot adds all current Pressure to its payout, then clears it.',
  },
  climb: {
    term: 'Climb',
    text: 'Each Climb stack gives faces 4, 5, and 6 +0.3 weight.',
  },
  pendulum: {
    term: 'Pendulum',
    text: 'Pendulum becomes a payout for the next 3 rolls after switching frameworks.',
  },
  hold: {
    term: 'Hold',
    text: 'A held result can replace a later roll.',
  },
  'full set': {
    term: 'Full Set',
    text: 'All six faces rolled since the last Full Set.',
  },
  'set window': {
    term: 'Set window',
    text: 'The rolls since the last Full Set.',
  },
  stacks: {
    term: 'Stacks',
    text: 'A repeated effect that grows with each stack.',
  },
  wager: {
    term: 'Wager',
    text: 'Score risked on the next roll.',
  },
};

/**
 * Every surface form the tree actually writes, mapped to its entry. Adding an
 * inflection here is what makes it highlight, so the two cannot drift.
 */
export const KEYWORD_FORMS: Record<string, string> = {
  'bonus roll': 'bonus roll',
  'bonus rolls': 'bonus roll',
  weight: 'weight',
  jackpot: 'jackpot',
  Pressure: 'pressure',
  Climb: 'climb',
  Pendulum: 'pendulum',
  Hold: 'hold',
  held: 'hold',
  'Full Set': 'full set',
  'set window': 'set window',
  stacks: 'stacks',
  stacking: 'stacks',
  wager: 'wager',
  wagered: 'wager',
  Score: 'score',
  Meta: 'meta',
};

/** The terms the tree highlights — exactly those it can also explain. */
export const KEYWORDS: string[] = Object.keys(KEYWORD_FORMS);

export function lookupKeyword(surface: string): GlossaryEntry | null {
  const lemma = KEYWORD_FORMS[surface]
    ?? KEYWORD_FORMS[surface.toLowerCase()]
    ?? Object.entries(KEYWORD_FORMS)
      .find(([form]) => form.toLowerCase() === surface.toLowerCase())?.[1];
  return lemma ? GLOSSARY[lemma] ?? null : null;
}
