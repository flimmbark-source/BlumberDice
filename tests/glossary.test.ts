import { describe, expect, it } from 'vitest';
import { GLOSSARY, KEYWORDS, KEYWORD_FORMS, lookupKeyword } from '../src/engine/glossary.ts';
import { NODES } from '../src/engine/nodes.ts';
import { describeNode } from '../src/engine/tree.ts';
import type { FrameworkId } from '../src/engine/types.ts';

const FRAMEWORKS: FrameworkId[] = ['A', 'B'];

describe('every highlighted term can be looked up', () => {
  it('resolves every registered form to an entry', () => {
    for (const form of KEYWORDS) {
      expect(lookupKeyword(form), form).not.toBeNull();
    }
  });

  it('leaves no entry unreachable from the text', () => {
    // An entry nothing maps to is a definition the player can never open.
    const reachable = new Set(Object.values(KEYWORD_FORMS));
    for (const lemma of Object.keys(GLOSSARY)) {
      expect(reachable.has(lemma), `${lemma} has no surface form`).toBe(true);
    }
  });

  it('matches case-insensitively, since the tree writes both', () => {
    expect(lookupKeyword('SCORE')?.term).toBe('Score');
    expect(lookupKeyword('Weight')?.term).toBe('Weight');
    expect(lookupKeyword('held')?.term).toBe('Hold');
    expect(lookupKeyword('wagered')?.term).toBe('Wager');
  });

  it('knows nothing about words the tree does not highlight', () => {
    expect(lookupKeyword('roll')).toBeNull();
    expect(lookupKeyword('')).toBeNull();
  });
});

describe('the glossary is written to the same standard as the nodes', () => {
  it('defines rather than advises', () => {
    for (const [lemma, e] of Object.entries(GLOSSARY)) {
      expect(/\b(you should|try to|best|recommend|ideal|powerful)\b/i.test(e.text), lemma)
        .toBe(false);
    }
  });

  it('keeps every entry to a couple of sentences', () => {
    for (const [lemma, e] of Object.entries(GLOSSARY)) {
      const words = e.text.split(/\s+/).length;
      expect(words, `${lemma}: ${words} words`).toBeLessThanOrEqual(34);
      expect(e.term.length, lemma).toBeGreaterThan(0);
    }
  });

  it('uses no engine vocabulary and names no framework', () => {
    for (const [lemma, e] of Object.entries(GLOSSARY)) {
      expect(/\b(resolv\w*|sampling pool|manual roll)\b/i.test(e.text), lemma).toBe(false);
      expect(/framework [ab]\b/i.test(e.text), lemma).toBe(false);
    }
  });
});

describe('the terms the tree actually uses are the ones it explains', () => {
  it('has an entry for every term a description highlights', () => {
    // The registry drives the highlighting, so this is really a check that
    // no node leans on a term the registry forgot.
    const used = new Set<string>();
    for (const n of NODES) {
      for (const fw of FRAMEWORKS) {
        const text = describeNode(n, fw);
        for (const form of KEYWORDS) {
          if (new RegExp(`\\b${form}\\b`).test(text)) used.add(form);
        }
      }
    }
    expect(used.size).toBeGreaterThan(8);
    for (const form of used) expect(lookupKeyword(form), form).not.toBeNull();
  });
});
