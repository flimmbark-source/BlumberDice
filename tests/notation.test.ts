import { describe, expect, it } from 'vitest';
import { NODES, NODES_BY_ID } from '../src/engine/nodes.ts';
import { describeNode } from '../src/engine/tree.ts';
import { KEYWORDS, isClause, notationFor, type Token } from '../src/engine/notation.ts';
import type { FrameworkId } from '../src/engine/types.ts';

const FRAMEWORKS: FrameworkId[] = ['A', 'B'];
const tokens = (id: string, fw: FrameworkId): Token[] =>
  notationFor(NODES_BY_ID.get(id)!.notation!, fw).flat();

describe('every node states its mechanic symbolically', () => {
  it('gives every node notation under both frameworks', () => {
    const missing: string[] = [];
    for (const n of NODES) {
      if (!n.notation) { missing.push(n.id); continue; }
      for (const fw of FRAMEWORKS) {
        const rows = notationFor(n.notation, fw);
        if (rows.length === 0 || rows.some((r) => r.length === 0)) missing.push(`${n.id}/${fw}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('keeps notation compact enough to scan', () => {
    // A tooltip is a glance, not a paragraph. Two rows, and few tokens each.
    const bulky: string[] = [];
    for (const n of NODES) {
      for (const fw of FRAMEWORKS) {
        const rows = notationFor(n.notation!, fw);
        if (rows.length > 2) bulky.push(`${n.id}/${fw}: ${rows.length} rows`);
        rows.forEach((r, i) => {
          if (r.length > 9) bulky.push(`${n.id}/${fw} row ${i}: ${r.length} tokens`);
        });
      }
    }
    expect(bulky).toEqual([]);
  });

  it('gives smalls a lighter diagram than notables and keystones', () => {
    for (const n of NODES.filter((x) => x.nodeType === 'small')) {
      for (const fw of FRAMEWORKS) {
        const rows = notationFor(n.notation!, fw);
        expect(rows.length, `${n.id} is a small node`).toBeLessThanOrEqual(2);
      }
    }
  });

  it('marks a node inactive rather than leaving it blank', () => {
    // Nodes that do nothing under one framework say so in the notation, not
    // only in the prose.
    for (const id of ['hr_upper', 'jp_longodds', 'jp_ride', 'jp_oneinsix', 'pt_repeat']) {
      const b = tokens(id, 'B');
      expect(b.some((t) => t.k === 'off'), `${id} should read as inactive`).toBe(true);
      expect(tokens(id, 'A').some((t) => t.k === 'off')).toBe(false);
    }
  });

  it('spells quantities as die faces, never as algebra', () => {
    // A variable is text to decode. A face is the thing itself, and the prose
    // underneath is where the general rule lives.
    const algebra = /^(n|a|b|x|hi|lo|any|\?|[0-9]\s*[-\u2212+\u00b1]\s*n|n\s*[-\u2212+\u00b1]\s*[0-9])$/i;
    for (const n of NODES) {
      for (const fw of FRAMEWORKS) {
        for (const t of notationFor(n.notation!, fw).flat()) {
          if (t.k !== 'any') continue;
          expect(t.text, `${n.id}: ${t.text}`).toBeUndefined();
        }
        for (const t of notationFor(n.notation!, fw).flat()) {
          const text = 'text' in t ? t.text ?? '' : '';
          expect(algebra.test(text.trim()), `${n.id}: ${text}`).toBe(false);
        }
      }
    }
  });

  it('never names a framework in the notation', () => {
    for (const n of NODES) {
      for (const fw of FRAMEWORKS) {
        for (const t of notationFor(n.notation!, fw).flat()) {
          const text = 'text' in t ? t.text ?? '' : '';
          expect(/framework/i.test(text), `${n.id}: ${text}`).toBe(false);
        }
      }
    }
  });
});

describe('a card leads with one statement and indents the rest', () => {
  it('never opens a node with a clause', () => {
    // The first row is the mechanic. A secondary rule that arrives first
    // makes the reader hunt for the headline.
    for (const n of NODES) {
      for (const fw of FRAMEWORKS) {
        const rows = notationFor(n.notation!, fw);
        expect(isClause(rows[0]), n.id).toBe(false);
      }
    }
  });

  it('keeps the clause marker to the head of its own row', () => {
    for (const n of NODES) {
      for (const fw of FRAMEWORKS) {
        for (const row of notationFor(n.notation!, fw)) {
          row.slice(1).forEach((t) => expect(t.k, n.id).not.toBe('clause'));
        }
      }
    }
  });

  it('says what kind of rule every clause states', () => {
    for (const n of NODES) {
      for (const fw of FRAMEWORKS) {
        for (const row of notationFor(n.notation!, fw)) {
          if (!isClause(row)) continue;
          const head = row[0];
          expect(head.k === 'clause' && head.icon, n.id).toBeTruthy();
          // A clause with nothing after the marker is just decoration.
          expect(row.length, n.id).toBeGreaterThan(1);
        }
      }
    }
  });

  it('allows at most one clause per node', () => {
    for (const n of NODES) {
      for (const fw of FRAMEWORKS) {
        const clauses = notationFor(n.notation!, fw).filter(isClause);
        expect(clauses.length, `${n.id} under ${fw}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('counts short thresholds in pips and long ones on a bar', () => {
    // Five circles read as five. A bar at 20% does not, and 25 circles are
    // no longer countable at a glance either.
    for (const n of NODES) {
      for (const fw of FRAMEWORKS) {
        for (const t of notationFor(n.notation!, fw).flat()) {
          if (t.k === 'pips') expect(t.of, n.id).toBeLessThanOrEqual(8);
        }
      }
    }
  });
});

describe('the vocabulary is shared rather than per-node', () => {
  it('uses one bonus-roll token everywhere a bonus roll is granted', () => {
    // The single most common effect in the tree; it must look the same each
    // time, or the shape stops being recognisable.
    const grantsBonus = NODES.filter((n) =>
      (n.triggers ?? []).some((t) => t.effects.some((e) => e.kind === 'bonusRoll'))
      || (n.modifiers ?? []).some((m) => m.stat === 'bonusRollChance'));
    for (const n of grantsBonus) {
      const any = FRAMEWORKS.some((fw) => tokens(n.id, fw).some((t) => t.k === 'roll'));
      expect(any, `${n.id} grants a bonus roll but does not show the chip`).toBe(true);
    }
  });

  it('shows a die face wherever a specific face is weighted', () => {
    const weights = NODES.filter((n) => (n.modifiers ?? []).some((m) => /^w[1-6]$/.test(m.stat)));
    for (const n of weights) {
      expect(tokens(n.id, 'A').some((t) => t.k === 'die'), n.id).toBe(true);
    }
  });

  it('shows a sequence of dice wherever a pattern is detected', () => {
    const patterns = NODES.filter((n) =>
      (n.triggers ?? []).some((t) => t.on === 'onPattern'));
    for (const n of patterns) {
      const row = notationFor(n.notation!, 'A').flat();
      const cells = row.filter((t) => t.k === 'die' || t.k === 'any').length;
      // A pattern is a relationship between rolls, so it needs more than one,
      // unless it is about a single new face entering the set.
      const single = ['pt_collector', 'br_chain', 'br_peak'].includes(n.id);
      if (!single) expect(cells, `${n.id} shows ${cells} cells`).toBeGreaterThanOrEqual(2);
    }
  });

  it('marks an arrow wherever one thing becomes another', () => {
    for (const id of ['hr_floor', 'ct_flip', 'hr_nogoback', 'ct_second']) {
      const row = tokens(id, 'A');
      expect(row.some((t) => t.k === 'op' && t.text === '→'), id).toBe(true);
    }
  });

  it('puts the probability on the arrow, not loose in the row', () => {
    for (const id of ['hr_floor', 'vl_lowgear', 'br_overflow', 'ct_second', 'vl_follow']) {
      const arrow = tokens(id, 'A').find((t) => t.k === 'op' && t.text === '→');
      expect(arrow && 'over' in arrow && arrow.over, `${id} arrow label`).toMatch(/%$/);
    }
  });
});

describe('prose stays the precision layer, not the explanation', () => {
  it('keeps every description to a couple of sentences', () => {
    const wordy: string[] = [];
    for (const n of NODES) {
      for (const fw of FRAMEWORKS) {
        const words = describeNode(n, fw).split(/\s+/).length;
        const cap = n.nodeType === 'keystone' ? 46 : 34;
        if (words > cap) wordy.push(`${n.id}/${fw}: ${words} words`);
      }
    }
    expect(wordy).toEqual([]);
  });

  it('names its systems with the shared keywords', () => {
    // A node that talks about a system should use the word the rest of the
    // tree uses for it, so the highlight ties them together.
    const lower = KEYWORDS.map((k) => k.toLowerCase());
    const checks: [string, string][] = [
      ['vl_quick', 'bonus roll'], ['hr_edge', 'weight'], ['jp_longodds', 'jackpot'],
      ['jp_hotstreak', 'pressure'], ['hr_climb', 'climb'], ['ct_hold', 'held'],
      ['ct_prepared', 'queue'], ['ad_pendulum', 'pendulum'], ['br_tickets', 'stacking'],
    ];
    for (const [id, word] of checks) {
      expect(lower, `${word} is not a registered keyword`).toContain(word);
      const text = describeNode(NODES_BY_ID.get(id)!, 'A').toLowerCase();
      expect(text.includes(word), `${id} should say "${word}"`).toBe(true);
    }
  });
});
