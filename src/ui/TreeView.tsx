import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { EDGES, NODES, NODES_BY_ID } from '../engine/nodes.ts';
import { checkAllocation, describeNode, isReachable, isVisible } from '../engine/tree.ts';
import type { DiscoveryFlag, FrameworkId, PassiveNode, Region } from '../engine/types.ts';
import { actions } from './store.ts';
import { NotationView, Prose } from './Notation.tsx';

/**
 * One interconnected web. Build identity is carried by shape, size and
 * connection structure — there are no branch labels.
 */

/** Viewport fitted to the real node bounds, so the whole web is visible at 1x. */
const VB = (() => {
  const pad = 80;
  const xs = NODES.map((n) => n.position.x);
  const ys = NODES.map((n) => n.position.y);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  return { minX, minY, w: Math.max(...xs) + pad - minX, h: Math.max(...ys) + pad - minY };
})();
const VIEWBOX = `${VB.minX} ${VB.minY} ${VB.w} ${VB.h}`;

const NODE_RADIUS: Record<PassiveNode['nodeType'], number> = {
  keystone: 34, notable: 22, bridge: 21, small: 13,
};

const POPUP_WIDTH = 296;

/**
 * Smallest a Small node may be drawn before the view zooms in to compensate.
 *
 * Fitting all 54 nodes into the panel is the right default on a wide screen,
 * where a Small lands at about 15px. In a short panel the same fit put it at
 * 5px, which is not a target anyone can hit. Below this the web starts zoomed
 * and centred on `start`, and the player pans.
 */
const MIN_NODE_PX = 14;
/** Pointer travel, in pixels, past which a press counts as a pan not a click. */
const DRAG_SLOP = 3;

/**
 * Where a node sits in the container, in pixels.
 *
 * Computed rather than read back from the DOM: the transform is known exactly
 * (an SVG viewBox letterboxed by `xMidYMid meet`, then the pan and zoom applied
 * to the inner group), and doing the arithmetic keeps the popup in step with a
 * drag without a second render pass per frame.
 */
function nodeScreenPos(
  node: PassiveNode,
  view: { x: number; y: number; zoom: number },
  size: { w: number; h: number },
): { x: number; y: number; radius: number } {
  const fit = Math.min(size.w / VB.w, size.h / VB.h);
  const offX = (size.w - VB.w * fit) / 2 - VB.minX * fit;
  const offY = (size.h - VB.h * fit) / 2 - VB.minY * fit;
  // transform="scale(zoom) translate(x y)" maps p to zoom * (p + t).
  const ux = (node.position.x + view.x) * view.zoom;
  const uy = (node.position.y + view.y) * view.zoom;
  return {
    x: ux * fit + offX,
    y: uy * fit + offY,
    radius: NODE_RADIUS[node.nodeType] * view.zoom * fit,
  };
}

const REGION_HUE: Record<Region, number> = {
  core: 45, high: 18, volume: 150, jackpot: 330, control: 205, pattern: 265, adaptive: 90,
};

/** Hue is what tells the archetypes apart on the web, so it needs a key of
 *  its own; the shape legend only ever explained the three node classes. */
const REGION_NAMES: [Region, string][] = [
  ['high', 'high roll'], ['volume', 'volume'], ['jackpot', 'jackpot'],
  ['pattern', 'pattern'], ['control', 'control'], ['adaptive', 'switching'],
];

type Status = 'allocated' | 'available' | 'unaffordable' | 'locked' | 'hidden';

interface Props {
  allocatedKey: string;
  discoveredKey: string;
  score: number;
  meta: number;
  framework: FrameworkId;
  canRefund: boolean;
  /** Primitives, so memo can compare them by value. */
  refundScore: number;
  refundMeta: number;
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
  allocatedKey, discoveredKey, score, meta, framework, canRefund, refundScore, refundMeta,
}: Props): JSX.Element {
  const allocated = useMemo(() => new Set(allocatedKey.split(',').filter(Boolean)), [allocatedKey]);
  const discovered = useMemo(
    () => new Set(discoveredKey.split(',').filter(Boolean) as DiscoveryFlag[]), [discoveredKey],
  );

  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const userZoomed = useRef(false);

  const [size, setSize] = useState({ w: 0, h: 0 });
  // Keep the smallest node hittable. `scale(z) translate(t)` maps a node at p
  // to z*(p+t), so holding `start` in the middle of the viewBox means t = C/z.
  useEffect(() => {
    if (userZoomed.current || size.w === 0 || size.h === 0) return;
    const fit = Math.min(size.w / VB.w, size.h / VB.h);
    const drawn = NODE_RADIUS.small * 2 * fit;
    const z = drawn >= MIN_NODE_PX ? 1 : Math.min(3, MIN_NODE_PX / drawn);
    const cx = VB.minX + VB.w / 2;
    const cy = VB.minY + VB.h / 2;
    setView({ x: z === 1 ? 0 : cx / z, y: z === 1 ? 0 : cy / z, zoom: z });
  }, [size.w, size.h]);
  // The panel holds the last node the player looked at or pressed, so it does
  // not empty out the moment the pointer moves away.
  const [inspected, setInspected] = useState<string | null>(null);
  const [confirmRefund, setConfirmRefund] = useState(false);
  const drag = useRef<{
    x: number; y: number; vx: number; vy: number;
    /** Set once the pointer travels far enough to count as a pan. */
    moved: boolean;
    /** Whether the press landed on a node rather than empty canvas. */
    onNode: boolean;
  } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = (): void => {
      const r = el.getBoundingClientRect();
      setSize((s) => (s.w === r.width && s.h === r.height ? s : { w: r.width, h: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const statuses = useMemo(() => {
    const m = new Map<string, Status>();
    for (const n of NODES) m.set(n.id, statusOf(n, allocated, discovered, score, meta));
    return m;
  }, [allocated, discovered, score, meta]);

  const onWheel = (e: React.WheelEvent): void => {
    const z = Math.min(3, Math.max(0.5, view.zoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    userZoomed.current = true;
    setView((v) => ({ ...v, zoom: z }));
  };

  const onDown = (e: React.PointerEvent): void => {
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      vx: view.x,
      vy: view.y,
      moved: false,
      onNode: (e.target as Element).closest?.('.node') != null,
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const onMove = (e: React.PointerEvent): void => {
    const d = drag.current;
    if (!d) return;
    if (Math.abs(e.clientX - d.x) > DRAG_SLOP || Math.abs(e.clientY - d.y) > DRAG_SLOP) {
      d.moved = true;
    }
    setView((v) => ({ ...v, x: d.vx + (e.clientX - d.x) / v.zoom, y: d.vy + (e.clientY - d.y) / v.zoom }));
  };

  const onUp = (): void => {
    const d = drag.current;
    drag.current = null;
    // A press on empty canvas that was not a pan puts the popup away.
    if (d && !d.moved && !d.onNode) {
      setInspected(null);
      setConfirmRefund(false);
    }
  };

  const shown = inspected ? NODES_BY_ID.get(inspected) ?? null : null;
  const shownStatus = shown ? statuses.get(shown.id) ?? null : null;

  const anchor = shown && size.w > 0 ? nodeScreenPos(shown, view, size) : null;

  return (
    <div className="tree" ref={wrapRef}>
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
                className={`node node--${n.nodeType} node--${st}${inspected === n.id ? ' node--inspected' : ''}`}
                style={{ ['--hue' as string]: REGION_HUE[n.region] }}
                /* Every visible node is focusable, not only the affordable
                   ones: reading the web is half of using it, and without
                   this the whole tree was unreachable without a mouse. */
                tabIndex={0}
                role="button"
                aria-label={nodeLabel(n, st)}
                aria-disabled={st !== 'available'}
                onPointerEnter={() => setInspected(n.id)}
                onFocus={() => setInspected(n.id)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  // Space also throws the dice; a focused node owns it first.
                  e.preventDefault();
                  e.stopPropagation();
                  setConfirmRefund(false);
                  if (st === 'available') actions.allocate(n.id);
                }}
                onClick={() => {
                  setInspected(n.id);
                  // Touching the web is an answer of sorts: stop asking.
                  setConfirmRefund(false);
                  if (st === 'available') actions.allocate(n.id);
                }}
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

      {shown && anchor && (
        <NodePopup
          node={shown}
          status={shownStatus}
          framework={framework}
          score={score}
          meta={meta}
          anchor={anchor}
          size={size}
        />
      )}

      <div className="tree__regions" aria-hidden>
        {REGION_NAMES.map(([region, label]) => (
          <span key={region} style={{ ['--hue' as string]: REGION_HUE[region] }}>
            <i className="tree__regionDot" />{label}
          </span>
        ))}
      </div>

      <div className="tree__legend">
        <span><Swatch type="small" /> small</span>
        <span><Swatch type="notable" /> notable</span>
        <span><Swatch type="bridge" /> bridge</span>
        <span><Swatch type="keystone" /> keystone</span>
        <span className="tree__hint">drag to pan · scroll to zoom</span>
      </div>

      <div className="tree__tools">
        {confirmRefund ? (
          <>
            <button
              type="button"
              className="btn btn--risk btn--sm"
              onClick={() => { setConfirmRefund(false); actions.refund(); }}
            >
              Refund {Math.round(refundScore).toLocaleString()} Score
              {refundMeta > 0 && ` + ${Math.round(refundMeta).toLocaleString()} Meta`}
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => setConfirmRefund(false)}
            >
              Keep build
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setConfirmRefund(true)}
            disabled={!canRefund}
            title="Return every point spent on the web"
          >
            Refund Points
          </button>
        )}
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

/** What a screen reader says for a node: what it is, what it costs, and why
 *  it can or cannot be taken. */
function nodeLabel(n: PassiveNode, st: Status): string {
  const cost = [
    n.costs.score ? `${n.costs.score} Score` : '',
    n.costs.meta ? `${n.costs.meta} Meta` : '',
  ].filter(Boolean).join(' and ');
  const state = st === 'allocated' ? 'allocated'
    : st === 'available' ? 'available'
    : st === 'unaffordable' ? 'cannot afford'
    : 'locked, connect an adjacent node first';
  return `${n.name}, ${n.nodeType}${cost ? `, ${cost}` : ''}. ${state}.`;
}

/** Which currency a cost is in, told by shape as well as by colour. */
function CostMark({ kind }: { kind: 'score' | 'meta' }): JSX.Element {
  return (
    <svg className="cost__mark" width={9} height={9} viewBox="-5 -5 10 10" aria-hidden>
      {kind === 'score'
        ? <circle r={3.6} />
        : <rect x={-3.2} y={-3.2} width={6.4} height={6.4} rx={1} transform="rotate(45)" />}
    </svg>
  );
}

/**
 * Anchored above the last node the player pointed at or pressed. Floating
 * rather than docked, because a panel in the layout changed height with every
 * description and shoved the web around underneath the pointer.
 */
export function NodePopup({ node, status, framework, score, meta, anchor, size }: {
  node: PassiveNode;
  status: Status | null;
  framework: FrameworkId;
  score: number;
  meta: number;
  anchor: { x: number; y: number; radius: number };
  size: { w: number; h: number };
}): JSX.Element {
  const costScore = node.costs.score ?? 0;
  const costMeta = node.costs.meta ?? 0;

  const gap = anchor.radius + 14;
  // Sit under the node instead when there is no room above it.
  const below = anchor.y - gap < 150;
  const half = POPUP_WIDTH / 2;
  const left = Math.min(Math.max(anchor.x, half + 10), Math.max(half + 10, size.w - half - 10));

  return (
    <div
      className={`nodepop nodepop--${node.nodeType}${below ? ' nodepop--below' : ''}`}
      style={{ left, top: anchor.y + (below ? gap : -gap), width: POPUP_WIDTH }}
    >
      <div className="nodepop__head">
        <span className="nodepop__name">{node.name}</span>
        {/* The class is a badge, not an aside: it is how a player tells a
            numeric upgrade from a new rule from a change to the game. */}
        <span className={`nodepop__type nodepop__type--${node.nodeType}`}>{node.nodeType}</span>
      </div>

      {/* The mechanic first: the strongest element on the card. */}
      {node.notation && <NotationView notation={node.notation} framework={framework} />}

      {/* Prose clarifies the notation rather than carrying the explanation. */}
      <Prose text={describeNode(node, framework)} />

      <div className="nodepop__foot">
        {(costScore > 0 || costMeta > 0) && (
          <span className="nodepop__costs">
            {costScore > 0 && (
              <span className={costScore > score ? 'cost cost--short' : 'cost'}>
                <CostMark kind="score" />{costScore.toLocaleString()}
              </span>
            )}
            {costMeta > 0 && (
              <span className={costMeta > meta ? 'cost cost--alt cost--short' : 'cost cost--alt'}>
                <CostMark kind="meta" />{costMeta.toLocaleString()}
              </span>
            )}
          </span>
        )}
        <span className="nodepop__status">
          {status === 'allocated' && 'Allocated'}
          {status === 'available' && 'Click to allocate'}
          {status === 'unaffordable' && 'Cannot afford'}
          {status === 'locked' && 'Connect an adjacent node first'}
        </span>
      </div>
    </div>
  );
}

/**
 * Straight lines. The layout is generated by scripts/radial.ts and verified
 * crossing-free by tests/layout.test.ts, so connections need no bowing to
 * disguise overlaps.
 */
function edgePath(a: PassiveNode, b: PassiveNode): string {
  return `M${a.position.x},${a.position.y} L${b.position.x},${b.position.y}`;
}
