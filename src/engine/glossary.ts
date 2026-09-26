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
    text: 'The main currency. Framework A rolls gain Score from their face value '
      + 'and other effects; it buys nodes in the web. Framework B rolls can reduce it.',
  },
  meta: {
    term: 'Meta',
    text: 'The second currency. In Framework B, every resolved roll grants exactly '
      + '1 Meta, regardless of the face rolled. Some deeper nodes cost Meta.',
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
    text: 'A jackpot counter. Each miss adds Pressure; when a jackpot hits, all '
      + 'current Pressure is added to the jackpot payout and then resets to 0. '
      + 'Its starting cap is 25 and other nodes can raise it.',
  },
  climb: {
    term: 'Climb',
    text: 'A streak stack gained whenever a roll is strictly higher than the '
      + 'previous roll, up to 5 stacks. Each Climb stack gives faces 4, 5, and 6 '
      + '+0.3 weight. A roll that is not higher clears all Climb stacks.',
  },
  pendulum: {
    term: 'Pendulum',
    text: 'A counter that gains 1 per roll, up to 25. Changing framework stores '
      + 'that amount for the next 3 rolls: each pays Pendulum ÷ 5 Score in '
      + 'Framework A or Pendulum ÷ 10 Meta in Framework B.',
  },
  hold: {
    term: 'Hold',
    text: 'Storage for rolled results. A held result pays no Score or Meta while '
      + 'stored; when played later, it replaces that roll’s result. Hold starts '
      + 'with 1 slot and Reserve increases its capacity.',
  },
  'full set': {
    term: 'Full Set',
    text: 'A set is complete once all six faces have appeared since the previous '
      + 'Full Set. Completing it pays its reward, then clears the collected faces '
      + 'and starts a new set.',
  },
  'set window': {
    term: 'Set window',
    text: 'The rolls since the last Full Set completed. Collector treats a face '
      + 'as new only the first time that face appears during this window.',
  },
  stacks: {
    term: 'Stacks',
    text: 'A counter whose effect applies once per stack, up to a cap. What '
      + 'clears it is named by whichever node builds it.',
  },
  wager: {
    term: 'Wager',
    text: 'Score removed before a roll and staked on that result. With Stake, a '
      + 'jackpot returns the wager multiplied by 2.5; a miss loses it unless '
      + 'another effect refunds part of it.',
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
