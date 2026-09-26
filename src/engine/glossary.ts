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
    text: 'The currency rolls pay out in. It buys nodes in the web, and a few '
      + 'nodes stake it on a roll.',
  },
  meta: {
    term: 'Meta',
    text: 'The second currency. It accrues on rolls that do not add Score, and '
      + 'the deepest nodes cost it as well.',
  },
  'bonus roll': {
    term: 'Bonus roll',
    text: 'An extra roll granted by an effect rather than by clicking. It counts '
      + 'like any other roll, so it can grant further bonus rolls.',
  },
  weight: {
    term: 'Weight',
    text: 'How likely a face is to come up. Every face starts equal; giving one '
      + 'face weight makes it more common and the rest correspondingly less.',
  },
  jackpot: {
    term: 'Jackpot',
    text: 'A 6 that pays a flat bonus on top of its usual Score. Only a build '
      + 'that opens the jackpot has one.',
  },
  pressure: {
    term: 'Pressure',
    text: 'A counter that rises on every roll missing the jackpot, up to a cap. '
      + 'A jackpot pays the whole of it out as Score, then clears it.',
  },
  climb: {
    term: 'Climb',
    text: 'A stack gained for each roll strictly higher than the one before it. '
      + 'Any roll that is not higher clears every stack at once.',
  },
  pendulum: {
    term: 'Pendulum',
    text: 'A counter that rises on every roll, up to a cap. Changing framework '
      + 'spends it across the rolls that follow.',
  },
  hold: {
    term: 'Hold',
    text: 'Storage for one result. A held result pays nothing while it sits '
      + 'there — no Score, no Meta — until you swap it into a later roll.',
  },
  'full set': {
    term: 'Full Set',
    text: 'All six faces rolled since the last set completed. Finishing one '
      + 'pays out and starts the count again.',
  },
  'set window': {
    term: 'Set window',
    text: 'The span since the last Full Set completed. A face counts as new the '
      + 'first time it appears inside it.',
  },
  stacks: {
    term: 'Stacks',
    text: 'A counter whose effect applies once per stack, up to a cap. What '
      + 'clears it is named by whichever node builds it.',
  },
  wager: {
    term: 'Wager',
    text: 'Score staked on a roll before it happens. A jackpot returns it '
      + 'multiplied; any other result loses it.',
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
