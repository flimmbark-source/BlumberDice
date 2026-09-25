import type { Face } from '../engine/types.ts';

const PIPS: Record<Face, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

/**
 * Small inline die for the decision bar, control rail and stats panel. The
 * main tray is a canvas; see ui/dice.
 */
export function Die({ face, size = 168 }: {
  face: Face | null;
  size?: number;
}): JSX.Element {
  const s = size;
  const off = s * 0.24;
  const r = s * 0.075;
  return (
    <svg
      className="die"
      width={s}
      height={s}
      viewBox={`0 0 ${s} ${s}`}
      role="img"
      aria-label={face === null ? 'no result yet' : `result ${face}`}
    >
      <rect
        x={s * 0.04} y={s * 0.04} width={s * 0.92} height={s * 0.92}
        rx={s * 0.16} className="die__body"
      />
      {face === null
        ? <text x={s / 2} y={s / 2} className="die__empty" dominantBaseline="central" textAnchor="middle">–</text>
        : PIPS[face].map(([dx, dy], i) => (
            <circle key={i} cx={s / 2 + dx * off} cy={s / 2 + dy * off} r={r} className="die__pip" />
          ))}
    </svg>
  );
}

export function MiniDie({ face, active = false, onClick, title }: {
  face: Face;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}): JSX.Element {
  const Tag = onClick ? 'button' : 'span';
  return (
    <Tag
      className={`minidie${active ? ' minidie--active' : ''}`}
      onClick={onClick}
      title={title}
      type={onClick ? 'button' : undefined}
    >
      <Die face={face} size={34} />
    </Tag>
  );
}
