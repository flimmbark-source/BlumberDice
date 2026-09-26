import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { EDGES, NODES, NODES_BY_ID } from '../engine/nodes.ts';
import { checkAllocation, describeNode, isReachable, isVisible } from '../engine/tree.ts';
import type { DiscoveryFlag, FrameworkId, PassiveNode, Region } from '../engine/types.ts';
import { actions } from './store.ts';
import { KEYWORDS } from '../engine/glossary.ts';

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
  pinned: string | null;
  /** Owned by the app: the upgrade panel in the next column reads it too. */
  inspected: string | null;
  setInspected: (id: string | null) => void;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
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
  allocatedKey, discoveredKey, score, meta, framework, pinned, inspected, setInspected,
  expanded, setExpanded,
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

  /** Zoom about the middle of the panel, which is where the eye already is. */
  const nudgeZoom = (k: number): void => {
    userZoomed.current = true;
    setView((v) => {
      const z = Math.min(3, Math.max(0.5, v.zoom * k));
      const cx = VB.minX + VB.w / 2;
      const cy = VB.minY + VB.h / 2;
      const ax = (v.x - cx / v.zoom);
      const ay = (v.y - cy / v.zoom);
      return { zoom: z, x: cx / z + ax, y: cy / z + ay };
    });
  };

  const recentre = (): void => {
    userZoomed.current = false;
    const fit = Math.min(size.w / VB.w, size.h / VB.h);
    const drawn = NODE_RADIUS.small * 2 * fit;
    const z = drawn >= MIN_NODE_PX ? 1 : Math.min(3, MIN_NODE_PX / drawn);
    setView({ x: z === 1 ? 0 : (VB.minX + VB.w / 2) / z, y: z === 1 ? 0 : (VB.minY + VB.h / 2) / z, zoom: z });
  };

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
    if (d && !d.moved && !d.onNode) setInspected(null);
  };

  return (
    <div className={`tree panel panel--left${expanded ? ' tree--expanded' : ''}`} ref={wrapRef}>
      <h2 className="panel__title">
        Build tree
        <span className="tree__key">
          <i className="dotk dotk--owned" />Owned
          <i className="dotk dotk--avail" />Available
          <i className="dotk dotk--locked" />Locked
          <i className="dotk dotk--goal" />Goal
        </span>
      </h2>
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
                className={`node node--${n.nodeType} node--${st}${inspected === n.id ? ' node--inspected' : ''}${pinned === n.id ? ' node--pinned' : ''}`}
                style={{ ['--hue' as string]: REGION_HUE[n.region] }}
                /* Every visible node is focusable, not only the affordable
                   ones: reading the web is half of using it, and without
                   this the whole tree was unreachable without a mouse. */
                tabIndex={0}
                role="button"
                aria-label={nodeLabel(n, st, pinned === n.id, hasKeywords(n, framework))}
                /* Only genuinely inert nodes are disabled. An unaffordable
                   one is now an active control: pressing it sets the goal. */
                aria-disabled={st === 'locked' || st === 'allocated'}
                onPointerEnter={() => setInspected(n.id)}
                onFocus={() => setInspected(n.id)}
                onKeyDown={(e) => {
                  // The popup always describes whatever node has focus, so
                  // Tab can never walk into it -- it walks to the next node
                  // and the popup changes underneath. This is the way in.
                  if (e.key === '?') {
                    e.preventDefault();
                    const first = wrapRef.current?.querySelector<HTMLElement>('.kw--known');
                    first?.focus();
                    return;
                  }
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  // Space also throws the dice; a focused node owns it first.
                  e.preventDefault();
                  e.stopPropagation();
                                    if (st === 'available') actions.allocate(n.id);
                  else if (st === 'unaffordable') actions.pin(pinned === n.id ? null : n.id);
                }}
                onClick={() => {
                  setInspected(n.id);
                  // Touching the web is an answer of sorts: stop asking.
                                    if (st === 'available') actions.allocate(n.id);
                  // One purchase away and out of pocket: the only node worth
                  // saving toward, so a press makes it the goal.
                  else if (st === 'unaffordable') actions.pin(pinned === n.id ? null : n.id);
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

      <div className="tree__regions" aria-hidden>
        {REGION_NAMES.map(([region, label]) => (
          <span key={region} style={{ ['--hue' as string]: REGION_HUE[region] }}>
            <i className="tree__regionDot" />{label}
          </span>
        ))}
      </div>

      <div className="tree__tools">
        <button type="button" className="iconbtn" aria-label="Zoom out"
          onClick={() => nudgeZoom(1 / 1.25)}>&minus;</button>
        <button type="button" className="iconbtn" aria-label="Zoom in"
          onClick={() => nudgeZoom(1.25)}>+</button>
        <button type="button" className="iconbtn" aria-label="Recentre the web"
          onClick={recentre}>&#9678;</button>
        <button type="button" className="btn btn--ghost btn--sm"
          onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Close full tree' : 'View full tree'}
        </button>
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


/** What a screen reader says for a node: what it is, what it costs, and why
 *  it can or cannot be taken. */
/** Whether this node's description contains a term with a definition. */
function hasKeywords(n: PassiveNode, framework: FrameworkId): boolean {
  const text = describeNode(n, framework);
  return KEYWORDS.some((k) => new RegExp(`\\b${k}\\b`).test(text));
}

function nodeLabel(n: PassiveNode, st: Status, isGoal: boolean, terms: boolean): string {
  const cost = [
    n.costs.score ? `${n.costs.score} Score` : '',
    n.costs.meta ? `${n.costs.meta} Meta` : '',
  ].filter(Boolean).join(' and ');
  const state = st === 'allocated' ? 'allocated'
    : st === 'available' ? 'available'
    : st === 'unaffordable' ? 'cannot afford'
    : 'locked, connect an adjacent node first';
  // Say what activating it does, since that now differs by state.
  const act = st === 'available' ? ' Press to allocate.'
    : st === 'unaffordable' ? (isGoal ? ' Current goal. Press to clear.' : ' Press to set as your goal.')
    : '';
  // Only mentioned where there is something to read, so it does not pad
  // every one of fifty-four labels.
  const terms_ = terms ? ' Press question mark for the terms used here.' : '';
  return `${n.name}, ${n.nodeType}${cost ? `, ${cost}` : ''}. ${state}.${act}${terms_}`;
}

/**
 * Straight lines. The layout is generated by scripts/radial.ts and verified
 * crossing-free by tests/layout.test.ts, so connections need no bowing to
 * disguise overlaps.
 */
function edgePath(a: PassiveNode, b: PassiveNode): string {
  return `M${a.position.x},${a.position.y} L${b.position.x},${b.position.y}`;
}
