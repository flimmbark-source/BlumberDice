import { displayStats, CONFIG, type GameState } from '../engine/game.ts';
import { lookupKeyword, type GlossaryEntry } from '../engine/glossary.ts';
import {
  notationFor, isClause, KEYWORDS,
  type ClauseIcon, type Notation, type Row, type Token,
} from '../engine/notation.ts';
import { useLayoutEffect, useRef, useState } from 'react';
import type { Face, FrameworkId } from '../engine/types.ts';
import type { NodeNotation } from '../engine/notation.ts';

/**
 * Renders the tree's symbolic notation. Everything here is deliberately tiny:
 * these are glyphs in a systemic language, not illustrations.
 */

const PIPS: Record<Face, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

/** A die face at glyph scale: pips only, no bevel. */
function DieGlyph({ face }: { face: Face }): JSX.Element {
  const s = 22;
  const off = s * 0.235;
  return (
    <svg className="nt__die" width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
      <rect x={0.75} y={0.75} width={s - 1.5} height={s - 1.5} rx={5} className="nt__dieBody" />
      {PIPS[face].map(([dx, dy], i) => (
        <circle key={i} cx={s / 2 + dx * off} cy={s / 2 + dy * off} r={2} className="nt__diePip" />
      ))}
    </svg>
  );
}

function TokenView({ t }: { t: Token }): JSX.Element {
  switch (t.k) {
    case 'die':
      return (
        <span className={`nt__cell nt__cell--${t.tone ?? 'lit'}`} aria-label={`face ${t.face}`}>
          <DieGlyph face={t.face} />
        </span>
      );

    case 'any':
      // No text means "a die, any face": an empty face, not a letter. Letters
      // have to be decoded; a die reads as a die.
      return (
        <span className={`nt__cell nt__cell--${t.tone ?? 'lit'}${t.text ? ' nt__cell--any' : ''}`}>
          {t.text ?? (
            <svg className="nt__die" width={22} height={22} viewBox="0 0 22 22" aria-hidden>
              <rect x={5.5} y={5.5} width={11} height={11} rx={2.5} className="nt__anyMark" />
            </svg>
          )}
        </span>
      );

    case 'slot':
      return (
        <span className={`nt__slot${t.filled ? ' nt__slot--filled' : ''}`}>
          {t.text ?? ''}
        </span>
      );

    case 'op':
      return t.over
        ? (
          <span className="nt__arrow">
            <span className="nt__arrowLabel">{t.over}</span>
            <span className="nt__op nt__op--arrow">{t.text}</span>
          </span>
        )
        : <span className={`nt__op${t.text === '→' ? ' nt__op--arrow' : ''}`}>{t.text}</span>;

    case 'val':
      return <span className={`nt__val nt__val--${t.tone ?? 'accent'}`}>{t.text}</span>;

    case 'roll':
      return (
        <span className="nt__roll" title="bonus roll">
          <svg className="nt__rollGlyph" width={11} height={11} viewBox="0 0 11 11" aria-hidden>
            <rect x={0.75} y={0.75} width={9.5} height={9.5} rx={2.5} />
            <circle cx={5.5} cy={5.5} r={1.35} />
          </svg>
          {t.text}
        </span>
      );

    case 'meter':
      return (
        <span className="nt__meter">
          <span className="nt__meterFill" style={{ width: `${Math.round(t.fill * 100)}%` }} />
          {t.text && <span className="nt__meterText">{t.text}</span>}
        </span>
      );

    case 'pips':
      // A countable threshold is drawn countable: five circles, not 60% of a
      // bar. The player should be able to see "two more" without arithmetic.
      return (
        <span className="nt__pips">
          <span className="nt__pipRow">
            {Array.from({ length: t.of }, (_, i) => (
              <span key={i} className={`nt__pip${i < (t.filled ?? 0) ? ' nt__pip--on' : ''}`} />
            ))}
          </span>
          <span className="nt__pipText">{t.text ?? `${t.filled ?? 0} / ${t.of}`}</span>
        </span>
      );

    case 'clause':
      return <ClauseIconGlyph icon={t.icon} />;

    case 'off':
      return <span className="nt__off">{t.text}</span>;
  }
}

/**
 * The clause marker. Five shapes, each tied to one kind of rule, so a player
 * can tell what a secondary line is about before reading it.
 */
function ClauseIconGlyph({ icon }: { icon?: ClauseIcon }): JSX.Element {
  const d: Record<ClauseIcon, string> = {
    // A payout: a stack rising to the right.
    score: 'M2 9 L2 6 M5 9 L5 3.5 M8 9 L8 1',
    // A roll: a die corner with a pip.
    roll: 'M1.5 1.5 h7 v7 h-7 z M5 5 h0.01',
    // A counter climbing.
    streak: 'M1 9 L3.5 5 L6 7 L9 1',
    // An exchange.
    swap: 'M1 3.5 h6 M5 1.5 L7.5 3.5 L5 5.5 M9 6.5 h-6 M5 4.5 L2.5 6.5 L5 8.5',
    // A refusal.
    deny: 'M1.8 1.8 L8.2 8.2 M8.2 1.8 L1.8 8.2',
  };
  return (
    <svg className={`nt__clauseIcon nt__clauseIcon--${icon ?? 'score'}`}
      width={10} height={10} viewBox="0 0 10 10" aria-hidden>
      <path d={d[icon ?? 'score']} />
    </svg>
  );
}

function liveNotation(rows: Notation, nodeId: string, s: GameState): Notation {
  const copy: Notation = rows.map((row) => row.map((token) => ({ ...token } as Token)));
  // An unowned node is still a rule preview, not an active system.
  if (!s.allocated.includes(nodeId)) return copy;

  const stats = displayStats(s);
  const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
  const mapTokens = (fn: (token: Token) => Token): void => {
    for (let i = 0; i < copy.length; i++) copy[i] = copy[i].map(fn);
  };

  switch (nodeId) {
    case 'hr_climb': {
      mapTokens((token) => token.k === 'pips'
        ? { ...token, filled: clamp(s.transient.climb, 0, token.of) }
        : token);
      break;
    }

    case 'vl_secondwind': {
      const threshold = Math.max(1, Math.floor(stats.secondWindThreshold));
      const filled = clamp(s.transient.rollsSinceBonus, 0, threshold);
      mapTokens((token) => token.k === 'pips'
        ? { ...token, of: threshold, filled, text: `${filled} / ${threshold} dry rolls` }
        : token);
      break;
    }

    case 'jp_hotstreak': {
      const cap = Math.max(1, stats.pressureCap);
      const pressure = clamp(s.transient.counters.pressure ?? 0, 0, cap);
      mapTokens((token) => token.k === 'meter'
        ? { ...token, fill: pressure / cap, text: `Pressure · ${Math.round(pressure)} / ${Math.round(cap)}` }
        : token);
      break;
    }

    case 'ct_hold': {
      const capacity = Math.max(1, Math.floor(stats.holdCapacity));
      const held = clamp(s.held.length, 0, capacity);
      mapTokens((token) => {
        if (token.k === 'slot') return { ...token, filled: held > 0 };
        if (token.k === 'pips') {
          return { ...token, of: capacity, filled: held, text: `${held} / ${capacity} held` };
        }
        return token;
      });
      break;
    }

    case 'ct_flip': {
      const period = Math.max(1, Math.floor(stats.flipPeriod));
      const remaining = clamp(s.transient.flipCooldown, 0, period);
      const readyProgress = period - remaining;
      copy.push([
        { k: 'clause', icon: 'streak' },
        {
          k: 'pips',
          of: period,
          filled: readyProgress,
          text: remaining > 0 ? `${remaining} rolls until ready` : 'ready',
        },
      ]);
      break;
    }

    case 'ct_seal': {
      if (s.sealedFace !== null) {
        let replaced = false;
        mapTokens((token) => {
          if (!replaced && token.k === 'any') {
            replaced = true;
            return { k: 'die', face: s.sealedFace!, tone: 'out' };
          }
          return token;
        });
      }
      break;
    }

    case 'ct_prepared': {
      if (s.allowed.length > 0 && copy.length > 0) {
        const lead = copy[0].filter((token) => token.k !== 'die');
        copy[0] = [
          ...lead,
          ...s.allowed.map((face): Token => ({ k: 'die', face })),
        ];
      }
      break;
    }

    case 'pt_fullset': {
      const seen = new Set(s.pattern.setProgress);
      mapTokens((token) => token.k === 'die'
        ? { ...token, tone: seen.has(token.face) ? 'lit' : 'dim' }
        : token);
      break;
    }

    case 'br_tickets': {
      const stacks = clamp(s.transient.counters.tickets ?? 0, 0, CONFIG.ticketMaxStacks);
      if (copy[0]) {
        copy[0].push({
          k: 'meter',
          fill: stacks / CONFIG.ticketMaxStacks,
          text: `${stacks} / ${CONFIG.ticketMaxStacks} stacks`,
        });
      }
      break;
    }

    case 'ad_pendulum': {
      const stacks = clamp(s.transient.counters.pendulum ?? 0, 0, CONFIG.pendulumMaxStacks);
      mapTokens((token) =>
        token.k === 'val' && token.tone === 'muted' && token.text.includes('Pendulum')
          ? {
            k: 'meter',
            fill: stacks / CONFIG.pendulumMaxStacks,
            text: `Pendulum · ${stacks} / ${CONFIG.pendulumMaxStacks}`,
          }
          : token
      );
      if (s.pendulumRollsLeft > 0) {
        copy.push([
          { k: 'clause', icon: 'streak' },
          {
            k: 'pips',
            of: CONFIG.pendulumRolls,
            filled: clamp(s.pendulumRollsLeft, 0, CONFIG.pendulumRolls),
            text: `${s.pendulumRollsLeft} payouts left`,
          },
        ]);
      }
      break;
    }

    case 'ad_reflection': {
      if (s.awaitingReflection && s.faceBeforeSwitch !== null) {
        mapTokens((token) => token.k === 'die'
          ? { ...token, face: s.faceBeforeSwitch! }
          : token);
        copy.push([{ k: 'clause', icon: 'streak' }, { k: 'val', text: 'watching', tone: 'accent' }]);
      }
      break;
    }
  }

  return copy;
}

export function NotationView({ notation, framework, game, nodeId }: {
  notation: NodeNotation;
  framework: FrameworkId;
  /** Optional live state. Used by the Selected Upgrade panel only. */
  game?: GameState;
  nodeId?: string;
}): JSX.Element | null {
  const base: Notation = notationFor(notation, framework);
  const rows = game && nodeId ? liveNotation(base, nodeId, game) : base;
  if (rows.length === 0) return null;
  return (
    <div className="nt">
      {rows.map((row: Row, i) => (
        <div className={isClause(row) ? 'nt__row nt__row--clause' : 'nt__row'} key={i}>
          {row.map((t, j) => <TokenView t={t} key={j} />)}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------

const KEYWORD_RE = new RegExp(
  `\\b(${[...KEYWORDS].sort((a, b) => b.length - a.length)
    .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'g',
);

/**
 * Marks the terms that name a system rather than describe one, so the same
 * mechanic reads the same way everywhere it is mentioned — and so each of
 * them can be asked what it means.
 */
export function Prose({ text }: { text: string }): JSX.Element {
  const parts = text.split(KEYWORD_RE);
  return (
    <p className="nodepop__desc">
      {parts.map((part, i) => (
        i % 2 === 1
          ? <Keyword word={part} key={i} />
          : <span key={i}>{part}</span>
      ))}
    </p>
  );
}

/**
 * A term that explains itself on hover, focus or press.
 *
 * The node popup sets `pointer-events: none` so the web underneath stays
 * hoverable; the keyword opts back in for itself alone, which is what lets
 * the pointer reach it without the tooltip swallowing the tree.
 *
 * Press latches the definition open, for touch and for anyone who would
 * rather not hold the pointer still.
 */
/** Width of the definition, also used to keep it inside the window. */
const KWPOP_W = 244;
const KWPOP_GAP = 8;
const KWPOP_EDGE = 10;

function Keyword({ word }: { word: string }): JSX.Element {
  const entry: GlossaryEntry | null = lookupKeyword(word);
  const [hover, setHover] = useState(false);
  const [held, setHeld] = useState(false);
  const wordRef = useRef<HTMLElement>(null);
  const popRef = useRef<HTMLSpanElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);
  const open = (hover || held) && entry !== null;

  /**
   * Put the definition beside the word it explains.
   *
   * Measured rather than guessed. An earlier version pinned it to the panel
   * instead, because anchoring to the word ran it off the edge whenever the
   * term sat near a margin — but the fix for that is to clamp, not to move
   * it away from what it is about. Fixed positioning, so a scrolling panel
   * cannot clip it.
   */
  useLayoutEffect(() => {
    if (!open) { setAt(null); return; }
    const w = wordRef.current?.getBoundingClientRect();
    if (!w) return;
    const h = popRef.current?.offsetHeight ?? 96;
    const left = Math.max(
      KWPOP_EDGE,
      Math.min(w.left + w.width / 2 - KWPOP_W / 2, window.innerWidth - KWPOP_W - KWPOP_EDGE),
    );
    const above = w.top - h - KWPOP_GAP;
    setAt({ left, top: above >= KWPOP_EDGE ? above : w.bottom + KWPOP_GAP });
  }, [open, word]);

  if (!entry) return <em className="kw">{word}</em>;

  return (
    <em
      ref={wordRef}
      className={`kw kw--known${open ? ' kw--open' : ''}`}
      tabIndex={0}
      role="button"
      aria-label={`${entry.term}: what it means`}
      aria-expanded={open}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => { setHover(false); setHeld(false); }}
      onClick={(e) => { e.stopPropagation(); setHeld((v) => !v); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); setHeld((v) => !v); }
        if (e.key === 'Escape') { setHeld(false); setHover(false); }
      }}
    >
      {word}
      {open && (
        <span
          ref={popRef}
          className="kwpop"
          role="tooltip"
          // Hidden for the one frame before it has been measured, so it is
          // never seen in the wrong place.
          style={at
            ? { left: at.left, top: at.top }
            : { left: 0, top: 0, visibility: 'hidden' }}
        >
          <span className="kwpop__term">{entry.term}</span>
          <span className="kwpop__text">{entry.text}</span>
        </span>
      )}
    </em>
  );
}

