import { notationFor, KEYWORDS, type Notation, type Token } from '../engine/notation.ts';
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

/** A die face at glyph scale: 18px, pips only, no bevel. */
function DieGlyph({ face }: { face: Face }): JSX.Element {
  const s = 18;
  const off = s * 0.235;
  return (
    <svg className="nt__die" width={s} height={s} viewBox={`0 0 ${s} ${s}`} aria-hidden>
      <rect x={0.75} y={0.75} width={s - 1.5} height={s - 1.5} rx={4} className="nt__dieBody" />
      {PIPS[face].map(([dx, dy], i) => (
        <circle key={i} cx={s / 2 + dx * off} cy={s / 2 + dy * off} r={1.7} className="nt__diePip" />
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
            <svg className="nt__die" width={18} height={18} viewBox="0 0 18 18" aria-hidden>
              <rect x={4.5} y={4.5} width={9} height={9} rx={2} className="nt__anyMark" />
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

    case 'off':
      return <span className="nt__off">{t.text}</span>;
  }
}

export function NotationView({ notation, framework }: {
  notation: NodeNotation;
  framework: FrameworkId;
}): JSX.Element | null {
  const rows: Notation = notationFor(notation, framework);
  if (rows.length === 0) return null;
  return (
    <div className="nt">
      {rows.map((row, i) => (
        <div className="nt__row" key={i}>
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
 * mechanic reads the same way everywhere it is mentioned.
 */
export function Prose({ text }: { text: string }): JSX.Element {
  const parts = text.split(KEYWORD_RE);
  return (
    <p className="nodepop__desc">
      {parts.map((part, i) => (
        i % 2 === 1 ? <em className="kw" key={i}>{part}</em> : <span key={i}>{part}</span>
      ))}
    </p>
  );
}
