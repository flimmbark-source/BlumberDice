import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { EDGES, NODES, NODES_BY_ID } from '../engine/nodes.ts';
import { checkAllocation, describeNode, isReachable, isVisible } from '../engine/tree.ts';
import type { DiscoveryFlag, FrameworkId, PassiveNode, Region } from '../engine/types.ts';
import { KEYWORDS } from '../engine/glossary.ts';
import { actions } from './store.ts';

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
  /** A node to pan onto. `n` rises each request, so repeats still land. */
  focus: { id: string; n: number } | null;
  /** Removes duplicate chrome when the tree lives inside a desktop window. */
  embedded?: boolean;
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
  expanded, setExpanded, focus, embedded = false,
}: Props): JSX.Element {
  const allocated = useMemo(() => new Set(allocatedKey.split(',').filter(Boolean)), [allocatedKey]);
  const discovered = useMemo(
    () => new Set(discoveredKey.split(',').filter(Boolean) as DiscoveryFlag[]), [discoveredKey],
  );

  const [view, setView] = useState({ x: 0, y: 0, zoom: 1 });
  const userZoomed = useRef(false);

  const [size, setSize] = useState({ w: 0, h: 0 });

  /**
   * A node that was just bought, for the spark that marks the purchase.
   * Driven off `allocatedKey` so it fires wherever the buy came from — the
   * web, the upgrade panel, or a keyboard press.
   */
  const [burst, setBurst] = useState<string | null>(null);
  const seen = useRef(allocatedKey);
  useEffect(() => {
    const before = new Set(seen.current.split(',').filter(Boolean));
    seen.current = allocatedKey;
    const added = allocatedKey.split(',').filter((id) => id && !before.has(id));
    // Only a single new node: a refund adds nothing and a reload adds many.
    if (added.length !== 1 || before.size === 0) return;
    setBurst(added[0]);
    const timer = setTimeout(() => setBurst(null), 700);
    return () => clearTimeout(timer);
  }, [allocatedKey]);
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
  const suppressNodeClick = useRef(false);
  const [dragging, setDragging] = useState(false);
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

  /**
   * Pan a requested node to the middle of the panel.
   *
   * `scale(z) translate(t)` maps a node at p to z*(p + t), so putting p at
   * the viewBox centre C means t = C/z − p.
   */
  useEffect(() => {
    if (!focus) return;
    const node = NODES_BY_ID.get(focus.id);
    if (!node) return;
    // The player has now said where they want to be looking; stop refitting.
    userZoomed.current = true;
    setView((v) => ({
      ...v,
      x: (VB.minX + VB.w / 2) / v.zoom - node.position.x,
      y: (VB.minY + VB.h / 2) / v.zoom - node.position.y,
    }));
  }, [focus?.n]);

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

  const onDown = (e: React.PointerEvent<SVGSVGElement>): void => {
    if (e.button !== 0) return;
    suppressNodeClick.current = false;
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      vx: view.x,
      vy: view.y,
      moved: false,
      onNode: (e.target as Element).closest?.('.node') != null,
    };
    // Capture on the SVG itself rather than whichever path/circle happened
    // to receive the press. Panning then remains stable across node edges.
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && (Math.abs(dx) > DRAG_SLOP || Math.abs(dy) > DRAG_SLOP)) {
      d.moved = true;
      suppressNodeClick.current = true;
      setDragging(true);
    }

    // view.x/y are SVG user units, not CSS pixels. Convert the pointer delta
    // through the fitted viewBox scale first; otherwise panning in this narrow
    // tech window feels several times slower than the mouse.
    const fit = size.w > 0 && size.h > 0 ? Math.min(size.w / VB.w, size.h / VB.h) : 1;
    setView((v) => ({
      ...v,
      x: d.vx + dx / (fit * v.zoom),
      y: d.vy + dy / (fit * v.zoom),
    }));
  };

  const onUp = (e: React.PointerEvent<SVGSVGElement>): void => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    // A press on empty canvas that was not a pan puts the popup away.
    if (d && !d.moved && !d.onNode) setInspected(null);
  };

  return (
    <div className={`tree panel panel--left${expanded ? ' tree--expanded' : ''}`} ref={wrapRef}>
      {!embedded && <h2 className="panel__title">Build tree</h2>}
      <svg
        ref={svgRef}
        className={`tree__svg${dragging ? ' tree__svg--dragging' : ''}`}
        viewBox={VIEWBOX}
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
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
                /* Selecting a reachable unowned node also makes it the goal. */
                onFocus={() => setInspected(n.id)}
                onKeyDown={(e) => {
                  if (e.key === '?') {
                    e.preventDefault();
                    const first = wrapRef.current?.querySelector<HTMLElement>('.kw--known');
                    first?.focus();
                    return;
                  }
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  e.stopPropagation();
                  // Selecting a node can make the embedded Next Goal appear,
                  // which changes the tree's measured height. Treat activation
                  // as user navigation so the auto-fit effect does not recenter
                  // the web in response to that internal layout change.
                  userZoomed.current = true;
                  selectNode(n.id, st, pinned, setInspected);
                }}
                onClick={() => {
                  if (suppressNodeClick.current) {
                    suppressNodeClick.current = false;
                    return;
                  }
                  userZoomed.current = true;
                  selectNode(n.id, st, pinned, setInspected);
                }}
              >
                <NodeShape type={n.nodeType} />
                {(n.nodeType === 'keystone' || n.nodeType === 'notable') && st === 'allocated' && (
                  <text className="node__name" y={n.nodeType === 'keystone' ? 53 : 39}>{n.name}</text>
                )}
              </g>
            );
          })}
          {burst && NODES_BY_ID.has(burst) && <Spark node={NODES_BY_ID.get(burst)!} />}
        </g>
      </svg>


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

function selectNode(
  id: string,
  status: Status,
  pinned: string | null,
  setInspected: (id: string | null) => void,
): void {
  setInspected(id);
  // Selection is the goal gesture. Any unowned visible node becomes the
  // current Next Goal, even when it is still locked deeper in the tree.
  // Selecting the current goal again clears it; owned nodes only inspect.
  if (status === 'allocated' || status === 'hidden') return;
  actions.pin(pinned === id ? null : id);
}

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
  const goal = isGoal ? ' Current goal.' : '';
  // Only mentioned where there is something to read, so it does not pad
  // every one of fifty-four labels.
  const terms_ = terms ? ' Press question mark for the terms used here.' : '';
  return `${n.name}, ${n.nodeType}${cost ? `, ${cost}` : ''}. ${state}.${goal}${terms_}`;
}

/**
 * The mark a purchase leaves: a ring of short lines thrown outward from the
 * node. It is decoration, so it never takes a pointer event, and the motion
 * is dropped for anyone who asked for less of it.
 */
function Spark({ node }: { node: PassiveNode }): JSX.Element {
  const rays = 12;
  const r0 = NODE_RADIUS[node.nodeType] + 3;
  return (
    <g
      className="spark"
      transform={`translate(${node.position.x} ${node.position.y})`}
      style={{ ['--hue' as string]: REGION_HUE[node.region] }}
      pointerEvents="none"
      aria-hidden
    >
      <circle className="spark__ring" r={r0} />
      {/* One group, so the rays fly out from the node. Scaling each line on
          its own would scale it about its own middle and go nowhere. */}
      <g className="spark__rays">
        {Array.from({ length: rays }, (_, i) => {
          const a = (i / rays) * Math.PI * 2;
          return (
            <line
              key={i}
              x1={Math.cos(a) * r0} y1={Math.sin(a) * r0}
              x2={Math.cos(a) * (r0 + 11)} y2={Math.sin(a) * (r0 + 11)}
            />
          );
        })}
      </g>
    </g>
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
