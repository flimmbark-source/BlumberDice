import type { PassiveNode, Region } from '../engine/types.ts';

/** Region hues, shared with the web so a node looks the same in both places. */
export const REGION_HUE: Record<Region, number> = {
  core: 45, high: 18, volume: 150, jackpot: 330, control: 205, pattern: 265, adaptive: 90,
};

/**
 * A drawn mark per region, for the badge at inspector scale.
 *
 * Decoration, and deliberately redundant: the region is already carried by
 * the badge's colour, and the node's behaviour is stated in full by the
 * notation and prose beside it. The glyph only gives the card a face.
 */
const REGION_GLYPH: Record<Region, JSX.Element> = {
  core: (
    <>
      <rect x={-6} y={-6} width={12} height={12} rx={2.4} />
      <circle cx={-2.6} cy={-2.6} r={0.9} fill="currentColor" />
      <circle cx={2.6} cy={2.6} r={0.9} fill="currentColor" />
    </>
  ),
  high: <path d="M-6.5 1.5 0 -6 6.5 1.5M-6.5 7 0 -0.5 6.5 7" />,
  volume: (
    <>
      <rect x={-7} y={-2} width={8} height={8} rx={1.6} />
      <rect x={-1} y={-7} width={8} height={8} rx={1.6} />
    </>
  ),
  jackpot: <path d="M0-7.5V7.5M-7.5 0H7.5M-5.3-5.3 5.3 5.3M-5.3 5.3 5.3-5.3" />,
  control: (
    <>
      <circle cx={-2.5} cy={-2.5} r={3.6} />
      <path d="M-0.2 0 6.5 6.7M4 5 2.4 6.6M6.5 6.7 4.9 8.3" />
    </>
  ),
  pattern: <path d="M-7.5 2.5q3.7-7.5 7.5 0t7.5 0" />,
  adaptive: (
    <>
      <path d="M0 8C-7 3-6.5-4.5 0-7.5 6.5-4.5 7 3 0 8Z" />
      <path d="M0 6.5V-4" />
    </>
  ),
};

/**
 * A node's badge: the same silhouette the web draws, at panel scale, so a
 * row in a list and a dot in the graph are recognisably the same thing.
 */
export function NodeMark({ type, region, size = 32, dim, glyph = false }: {
  type: PassiveNode['nodeType'];
  region: Region;
  size?: number;
  dim?: boolean;
  /** Draws the region's mark inside the badge. Only worth it at card scale. */
  glyph?: boolean;
}): JSX.Element {
  const r = 13;
  return (
    <svg
      className={`nmark nmark--${type}${dim ? ' nmark--dim' : ''}`}
      width={size} height={size} viewBox="-16 -16 32 32" aria-hidden
      style={{ ['--hue' as string]: REGION_HUE[region] }}
    >
      {type === 'small' && <circle r={r * 0.62} className="nmark__shape" />}
      {type === 'notable' && <circle r={r * 0.92} className="nmark__shape" />}
      {type === 'bridge' && (
        <rect x={-r * 0.68} y={-r * 0.68} width={r * 1.36} height={r * 1.36}
          transform="rotate(45)" className="nmark__shape" />
      )}
      {type === 'keystone' && (
        <path d="M0,-13 L11,-6.5 L11,6.5 L0,13 L-11,6.5 L-11,-6.5 Z" className="nmark__shape" />
      )}
      {glyph && <g className="nmark__glyph">{REGION_GLYPH[region]}</g>}
    </svg>
  );
}
