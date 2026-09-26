/**
 * Pure decoration: the inked botanical border and the ruined arch the die is
 * thrown under. Nothing here reads or changes game state, nothing here is
 * focusable, and every element is hidden from assistive technology — the
 * information in the workspace is carried entirely by the panels around it.
 *
 * The drawings are generated rather than hand-plotted: a stem is a cubic
 * bezier, and leaves are placed along it by sampling the curve and turning
 * each leaf onto the tangent. That keeps a sprig a dozen numbers instead of a
 * wall of path data, and lets the same sprig be reused at every corner.
 */

type Pt = { x: number; y: number };

const bez = (a: Pt, b: Pt, c: Pt, d: Pt, t: number): Pt => {
  const u = 1 - t;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
};

const tangent = (a: Pt, b: Pt, c: Pt, d: Pt, t: number): number => {
  const u = 1 - t;
  const x = 3 * u * u * (b.x - a.x) + 6 * u * t * (c.x - b.x) + 3 * t * t * (d.x - c.x);
  const y = 3 * u * u * (b.y - a.y) + 6 * u * t * (c.y - b.y) + 3 * t * t * (d.y - c.y);
  return (Math.atan2(y, x) * 180) / Math.PI;
};

/** A single leaf, drawn from its stalk outward along +x. */
function Leaf({ at, angle, size }: { at: Pt; angle: number; size: number }): JSX.Element {
  return (
    <g transform={`translate(${at.x} ${at.y}) rotate(${angle}) scale(${size})`}>
      <path className="orn__leaf" d="M0 0C5-8 15-11 22-9 21-1 12 7 0 0Z" />
      <path className="orn__vein" d="M1.5 -0.8C7-3 14-6 20-8" />
    </g>
  );
}

/** A five-petal blossom, the pale punctuation in a run of leaves. */
function Bloom({ at, size, spin = 0 }: { at: Pt; size: number; spin?: number }): JSX.Element {
  return (
    <g transform={`translate(${at.x} ${at.y}) rotate(${spin}) scale(${size})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse key={a} className="orn__petal" cx={0} cy={-5.4} rx={3.3} ry={5}
          transform={`rotate(${a})`} />
      ))}
      <circle className="orn__pollen" r={1.9} />
    </g>
  );
}

/** A curling tendril: the loose end of a stem, with nothing growing on it. */
function Tendril({ d }: { d: string }): JSX.Element {
  return <path className="orn__tendril" d={d} />;
}

interface SprigSpec {
  stem: [Pt, Pt, Pt, Pt];
  /** Leaf positions along the stem, as curve parameters. */
  leaves: number[];
  blooms: { t: number; size: number; spin: number }[];
  tendrils: string[];
}

const p = (x: number, y: number): Pt => ({ x, y });

/**
 * Two overlapping stems make a corner: a long sweeping one and a shorter
 * counter-curve, so the cluster reads as growth rather than as one wire.
 */
const CORNER: SprigSpec[] = [
  {
    stem: [p(-8, 34), p(58, 22), p(96, 60), p(104, 150)],
    leaves: [0.12, 0.24, 0.36, 0.47, 0.58, 0.69, 0.79, 0.89],
    blooms: [{ t: 0.3, size: 1.25, spin: 14 }, { t: 0.72, size: 0.95, spin: -22 }],
    tendrils: ['M104 150c6 16 1 26-6 31'],
  },
  {
    stem: [p(34, -8), p(22, 52), p(60, 82), p(150, 96)],
    leaves: [0.15, 0.28, 0.4, 0.52, 0.63, 0.75, 0.86],
    blooms: [{ t: 0.55, size: 1.05, spin: 40 }],
    tendrils: ['M150 96c16 5 25 1 30-7'],
  },
];

function Sprig({ spec, flip }: { spec: SprigSpec; flip: number }): JSX.Element {
  const [a, b, c, d] = spec.stem;
  const path = `M${a.x} ${a.y}C${b.x} ${b.y} ${c.x} ${c.y} ${d.x} ${d.y}`;
  return (
    <g>
      <path className="orn__stem" d={path} />
      {spec.tendrils.map((t) => <Tendril key={t} d={t} />)}
      {spec.leaves.map((t, i) => {
        const side = i % 2 === 0 ? 1 : -1;
        // Leaves lean off the tangent; alternating sides keeps the stem read.
        const angle = tangent(a, b, c, d, t) + side * (48 + ((i * 7) % 17)) * flip;
        const size = 0.85 + ((i * 5) % 4) * 0.16;
        return <Leaf key={t} at={bez(a, b, c, d, t)} angle={angle} size={size} />;
      })}
      {spec.blooms.map((bl) => (
        <Bloom key={bl.t} at={bez(a, b, c, d, bl.t)} size={bl.size} spin={bl.spin} />
      ))}
    </g>
  );
}

const CORNERS = [
  { key: 'tl', cls: 'orn--tl', flip: 1 },
  { key: 'tr', cls: 'orn--tr', flip: -1 },
  { key: 'bl', cls: 'orn--bl', flip: -1 },
  { key: 'br', cls: 'orn--br', flip: 1 },
] as const;

/** The border that frames the workspace. */
export function VineFrame(): JSX.Element {
  return (
    <div className="orn" aria-hidden>
      {CORNERS.map((c) => (
        <svg key={c.key} className={`orn__corner ${c.cls}`} viewBox="0 0 190 190" width={190} height={190}>
          {CORNER.map((spec, i) => <Sprig key={i} spec={spec} flip={c.flip} />)}
        </svg>
      ))}
    </div>
  );
}

/**
 * The arch behind the tray. Stone, weathered, with a wash of open country
 * inside it — the same illustration every throw happens in front of.
 */
export function ArchBackdrop(): JSX.Element {
  // The opening: a 120-radius semicircle on 150-tall jambs.
  const opening = 'M40 400V190A110 110 0 0 1 260 190V400Z';
  const outer = 'M0 400V190A150 150 0 0 1 300 190V400H260V190A110 110 0 0 0 40 190V400Z';
  return (
    <svg className="arch" viewBox="0 0 300 400" preserveAspectRatio="xMidYMax meet" aria-hidden>
      <defs>
        <clipPath id="archOpening"><path d={opening} /></clipPath>
        <linearGradient id="archSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--arch-sky-top)" />
          <stop offset="1" stopColor="var(--arch-sky-bottom)" />
        </linearGradient>
        {/* The far country has to meet the near ground somewhere. It fades
            into it across the bottom of the opening rather than ending on a
            line the arena's own floor would contradict. */}
        <linearGradient id="archGround" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--arch-ground)" stopOpacity="0" />
          <stop offset="1" stopColor="var(--arch-ground)" stopOpacity="1" />
        </linearGradient>
      </defs>

      <g clipPath="url(#archOpening)">
        <rect x={0} y={0} width={300} height={400} fill="url(#archSky)" />
        {/* Far hills, then a keep on the ridge: distance, drawn faintly, and
            kept high in the opening where the arena floor cannot cover it. */}
        <path className="arch__hill" d="M20 252c34-28 60-16 88-30 30-16 56-4 84 10 22 10 40 8 68 2v180H20Z" />
        <path className="arch__hill arch__hill--near" d="M8 288c44-16 70 2 106-8 32-8 58 6 90 14 20 6 46 2 78-8v128H8Z" />
        <g className="arch__keep">
          <path d="M84 196h22v58H84z" />
          <path d="M78 210h9v44h-9zM104 206h10v48h-10z" />
          <path d="M87 196l4-11 4 11zM105 192l5-12 5 12z" />
        </g>
        <rect x={0} y={250} width={300} height={150} fill="url(#archGround)" />
      </g>

      {/* The stone itself. */}
      <path className="arch__stone" d={outer} />
      {/* Voussoirs: the wedge joints of the arch, struck from its centre. */}
      <g className="arch__joint">
        {Array.from({ length: 11 }, (_, i) => {
          const a = Math.PI + (i / 10) * Math.PI;
          return (
            <line key={i}
              x1={150 + Math.cos(a) * 110} y1={190 + Math.sin(a) * 110}
              x2={150 + Math.cos(a) * 150} y2={190 + Math.sin(a) * 150} />
          );
        })}
        <line x1={0} y1={250} x2={40} y2={250} />
        <line x1={0} y1={310} x2={40} y2={310} />
        <line x1={0} y1={366} x2={40} y2={366} />
        <line x1={260} y1={250} x2={300} y2={250} />
        <line x1={260} y1={312} x2={300} y2={312} />
        <line x1={260} y1={368} x2={300} y2={368} />
      </g>

      {/* Growth reclaiming the stonework: it climbs the jambs, and never
          wanders out into the opening the landscape is drawn in. */}
      <g className="arch__ivy">
        <path className="orn__stem" d="M16 400c-2-54 2-92 14-124 9-24 22-42 36-56" />
        <path className="orn__stem" d="M286 400c4-50-2-86-14-116-8-20-18-36-30-48" />
        {[
          [20, 356, -55], [14, 312, 25], [22, 272, -35], [32, 234, 20],
          [46, 200, -30], [64, 172, 15],
          [282, 360, 235], [288, 316, 155], [280, 276, 215], [270, 240, 160],
          [256, 208, 210], [240, 180, 165],
        ].map(([x, y, r], i) => (
          <Leaf key={i} at={p(x, y)} angle={r} size={0.68 + (i % 3) * 0.11} />
        ))}
      </g>
    </svg>
  );
}

/** A short horizontal flourish, used as a divider inside panels. */
export function Flourish(): JSX.Element {
  return (
    <svg className="flourish" viewBox="0 0 120 14" width={120} height={14} aria-hidden>
      <path className="orn__rule" d="M2 7h40M78 7h40" />
      <Leaf at={p(60, 7)} angle={-28} size={0.62} />
      <Leaf at={p(60, 7)} angle={208} size={0.62} />
      <circle className="orn__pollen" cx={60} cy={7} r={1.5} />
    </svg>
  );
}
