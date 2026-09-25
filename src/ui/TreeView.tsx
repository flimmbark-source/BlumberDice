import { memo, useMemo, useRef, useState } from 'react';
import { EDGES, NODES, NODES_BY_ID } from '../engine/nodes.ts';
import { checkAllocation, isReachable, isVisible } from '../engine/tree.ts';
import type { DiscoveryFlag, PassiveNode, Region } from '../engine/types.ts';
import { actions } from './store.ts';

/**
 * One interconnected web. Build identity is carried by shape, size and
 * connection structure — there are no branch labels.
 */

/** Viewport fitted to the real node bounds, so the whole web is visible at 1x. */
const VIEWBOX = (() => {
  const pad = 80;
  const xs = NODES.map((n) => n.position.x);
  const ys = NODES.map((n) => n.position.y);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  return `${minX} ${minY} ${Math.max(...xs) + pad - minX} ${Math.max(...ys) + pad - minY}`;
})();

const REGION_HUE: Record<Region, number> = {
  core: 45, high: 18, volume: 150, jackpot: 330, control: 205, pattern: 265, adaptive: 90,
};

type Status = 'allocated' | 'available' | 'unaffordable' | 'locked' | 'hidden';

interface Props {
  allocatedKey: string;
  discoveredKey: string;
  score: number;
  meta: number;
}

function statusOf(
  node: PassiveNode, allocated: Set<string>, discovered: Set<DiscoveryFlag>,
  score: number, meta: number,
): Status {
  if (!isVisible(node, discovered)) return 'hidden';
  if (allocated.has(node.id)) return 'allocated';
  if (!isReachable(node.id, allocated)) return 'locked';
  return checkAllocation(node.id, { allocated, discovered, score, meta }).ok
    ? 'available' : 'unaffordable';
}

export const TreeView = memo(function TreeView({
  allocatedKey, discoveredKey, score, meta,
}: Props): JSX.Element {
  const allocated = useMemo(() => new Set(allocatedKey.split(',').filter(Boolean)), [allocatedKey]);
  const discovered = useMemo(
    () => new Set(discoveredKey.split(',').filter(Boolean) as DiscoveryFlag[]), [discoveredKey],
  );

  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const [hover, setHover] = useState<string | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const statuses = useMemo(() => {
    const m = new Map<string, Status>();
    for (const n of NODES) m.set(n.id, statusOf(n, allocated, discovered, score, meta));
    return m;
  }, [allocated, discovered, score, meta]);

  const onWheel = (e: React.WheelEvent): void => {
    const z = Math.min(3, Math.max(0.5, view.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    setView((v) => ({ ...v, zoom: z }));
  };

  const onDown = (e: React.PointerEvent): void => {
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent): void => {
    const d = drag.current;
    if (!d) return;
    setView((v) => ({ ...v, x: d.vx + (e.clientX - d.x) / v.zoom, y: d.vy + (e.clientY - d.y) / v.zoom }));
  };
  const onUp = (): void => { drag.current = null; };

  const hovered = hover ? NODES_BY_ID.get(hover) ?? null : null;

  return (
    <div className="tree">
      <svg
        ref={svgRef}
        className="tree__svg"
        viewBox={VIEWBOX}
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={onUp}
      >
        <g transform={`scale(${view.zoom}) translate(${view.x} ${view.y})`}>
          {EDGES.map(([a, b]) => {
            const na = NODES_BY_ID.get(a)!;
            const nb = NODES_BY_ID.get(b)!;
            const sa = statuses.get(a)!;
            const sb = statuses.get(b)!;
            if (sa === 'hidden' || sb === 'hidden') return null;
            const both = sa === 'allocated' && sb === 'allocated';
            const live = sa === 'allocated' || sb === 'allocated';
            return (
              <path
                key={`${a}|${b}`}
                d={edgePath(na, nb)}
                className={`edge${both ? ' edge--on' : live ? ' edge--live' : ''}`}
              />
            );
          })}
          {NODES.map((n) => {
            const st = statuses.get(n.id)!;
            if (st === 'hidden') {
              return <circle key={n.id} cx={n.position.x} cy={n.position.y} r={4.5} className="node--hidden" />;
            }
            return (
              <g
                key={n.id}
                transform={`translate(${n.position.x} ${n.position.y})`}
                className={`node node--${n.nodeType} node--${st}`}
                style={{ ['--hue' as string]: REGION_HUE[n.region] }}
                onPointerEnter={() => setHover(n.id)}
                onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}
                onClick={() => { if (st === 'available') actions.allocate(n.id); }}
              >
                <NodeShape type={n.nodeType} />
                {(n.nodeType === 'keystone' || n.nodeType === 'notable') && st === 'allocated' && (
                  <text className="node__name" y={n.nodeType === 'keystone' ? 53 : 39}>{n.name}</text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {hovered && <Tooltip node={hovered} status={statuses.get(hovered.id)!} score={score} meta={meta} />}

      <div className="tree__legend">
        <span><Swatch type="small" /> small</span>
        <span><Swatch type="notable" /> notable</span>
        <span><Swatch type="bridge" /> bridge</span>
        <span><Swatch type="keystone" /> keystone</span>
        <span className="tree__hint">drag to pan · scroll to zoom</span>
      </div>
    </div>
  );
});

function NodeShape({ type }: { type: PassiveNode['nodeType'] }): JSX.Element {
  switch (type) {
    case 'small': return <circle r={13} className="node__shape" />;
    case 'notable': return <><circle r={22} className="node__shape" /><circle r={11} className="node__inner" /></>;
    case 'bridge': return <rect x={-15} y={-15} width={30} height={30} rx={4} transform="rotate(45)" className="node__shape" />;
    case 'keystone': return (
      <>
        <path d="M0,-34 L29,-17 L29,17 L0,34 L-29,17 L-29,-17 Z" className="node__shape" />
        <path d="M0,-16 L14,-8 L14,8 L0,16 L-14,8 L-14,-8 Z" className="node__inner" />
      </>
    );
  }
}

function Swatch({ type }: { type: PassiveNode['nodeType'] }): JSX.Element {
  return (
    <svg width={26} height={26} viewBox="-13 -13 26 26" className="swatch">
      <g className={`node node--${type} node--allocated`} style={{ ['--hue' as string]: 210 }}>
        {type === 'small' && <circle r={5} className="node__shape" />}
        {type === 'notable' && <circle r={9} className="node__shape" />}
        {type === 'bridge' && <rect x={-6} y={-6} width={12} height={12} transform="rotate(45)" className="node__shape" />}
        {type === 'keystone' && <path d="M0,-11 L9,-5 L9,5 L0,11 L-9,5 L-9,-5 Z" className="node__shape" />}
      </g>
    </svg>
  );
}

function Tooltip({ node, status, score, meta }: {
  node: PassiveNode; status: Status; score: number; meta: number;
}): JSX.Element {
  const costScore = node.costs.score ?? 0;
  const costMeta = node.costs.meta ?? 0;
  return (
    <div className="tip">
      <div className="tip__head">
        <span className="tip__name">{node.name}</span>
        <span className="tip__type">{node.nodeType}</span>
      </div>
      <p className="tip__desc">{node.description}</p>
      {(costScore > 0 || costMeta > 0) && (
        <div className="tip__costs">
          {costScore > 0 && (
            <span className={costScore > score ? 'tip__cost tip__cost--short' : 'tip__cost'}>
              {costScore} Score
            </span>
          )}
          {costMeta > 0 && (
            <span className={costMeta > meta ? 'tip__cost tip__cost--short' : 'tip__cost'}>
              {costMeta} Meta
            </span>
          )}
        </div>
      )}
      <div className="tip__status">
        {status === 'allocated' && 'Allocated'}
        {status === 'available' && 'Click to allocate'}
        {status === 'unaffordable' && 'Cannot afford'}
        {status === 'locked' && 'Connect an adjacent node first'}
      </div>
    </div>
  );
}

/** Straight for short links; bowed away from the origin for long ones. */
function edgePath(a: PassiveNode, b: PassiveNode): string {
  const { x: x1, y: y1 } = a.position;
  const { x: x2, y: y2 } = b.position;
  const dist = Math.hypot(x2 - x1, y2 - y1);
  if (dist < 260) return `M${x1},${y1} L${x2},${y2}`;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const len = Math.hypot(mx, my) || 1;
  const bow = Math.min(dist * 0.18, 90);
  return `M${x1},${y1} Q${mx + (mx / len) * bow},${my + (my / len) * bow} ${x2},${y2}`;
}
