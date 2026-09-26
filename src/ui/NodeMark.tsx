import type { PassiveNode, Region } from '../engine/types.ts';

/** Region hues, shared with the web so a node looks the same in both places. */
export const REGION_HUE: Record<Region, number> = {
  core: 45, high: 18, volume: 150, jackpot: 330, control: 205, pattern: 265, adaptive: 90,
};

/**
 * A node's badge: the same silhouette the web draws, at panel scale, so a
 * row in a list and a dot in the graph are recognisably the same thing.
 */
export function NodeMark({ type, region, size = 32, dim }: {
  type: PassiveNode['nodeType'];
  region: Region;
  size?: number;
  dim?: boolean;
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
    </svg>
  );
}
