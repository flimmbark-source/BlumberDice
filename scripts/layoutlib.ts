import { EDGES, NODES } from '../src/engine/nodes.ts';
import type { PassiveNode } from '../src/engine/types.ts';

export type Pos = Record<string, { x: number; y: number }>;
export type Edge = [string, string];

export function currentPositions(): Pos {
  const p: Pos = {};
  for (const n of NODES) p[n.id] = { ...n.position };
  return p;
}

const orient = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number =>
  (by - ay) * (cx - bx) - (bx - ax) * (cy - by);

/** Proper segment intersection; segments sharing an endpoint never count. */
export function segmentsCross(
  a1: { x: number; y: number }, a2: { x: number; y: number },
  b1: { x: number; y: number }, b2: { x: number; y: number },
): boolean {
  const d1 = orient(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y);
  const d2 = orient(a1.x, a1.y, a2.x, a2.y, b2.x, b2.y);
  const d3 = orient(b1.x, b1.y, b2.x, b2.y, a1.x, a1.y);
  const d4 = orient(b1.x, b1.y, b2.x, b2.y, a2.x, a2.y);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

export function countCrossings(pos: Pos, edges: readonly Edge[] = EDGES): number {
  let n = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const [a, b] = edges[i];
      const [c, d] = edges[j];
      if (a === c || a === d || b === c || b === d) continue;
      if (!pos[a] || !pos[b] || !pos[c] || !pos[d]) continue;
      if (segmentsCross(pos[a], pos[b], pos[c], pos[d])) n++;
    }
  }
  return n;
}

export function crossingPairs(pos: Pos, edges: readonly Edge[] = EDGES): [Edge, Edge][] {
  const out: [Edge, Edge][] = [];
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const [a, b] = edges[i];
      const [c, d] = edges[j];
      if (a === c || a === d || b === c || b === d) continue;
      if (segmentsCross(pos[a], pos[b], pos[c], pos[d])) out.push([edges[i], edges[j]]);
    }
  }
  return out;
}

/** Distance from point p to segment ab. */
export function pointSegDist(
  p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number },
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Nodes sitting on top of an edge they are not part of. */
export function nodeEdgeConflicts(pos: Pos, clearance: number, edges: readonly Edge[] = EDGES): number {
  let n = 0;
  for (const node of NODES) {
    const p = pos[node.id];
    if (!p) continue;
    for (const [a, b] of edges) {
      if (a === node.id || b === node.id) continue;
      if (!pos[a] || !pos[b]) continue;
      if (pointSegDist(p, pos[a], pos[b]) < clearance) n++;
    }
  }
  return n;
}

export function minSeparation(pos: Pos): { dist: number; pair: [string, string] } {
  let best = Infinity;
  let pair: [string, string] = ['', ''];
  const ids = Object.keys(pos);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const d = Math.hypot(pos[ids[i]].x - pos[ids[j]].x, pos[ids[i]].y - pos[ids[j]].y);
      if (d < best) { best = d; pair = [ids[i], ids[j]]; }
    }
  }
  return { dist: best, pair };
}

/** Radius each node class occupies, used for spacing and clearance checks. */
export function nodeRadius(n: PassiveNode): number {
  switch (n.nodeType) {
    case 'keystone': return 34;
    case 'notable': return 22;
    case 'bridge': return 21;
    default: return 13;
  }
}

export const VISIBLE_PRE_B: readonly Edge[] = EDGES.filter(([a, b]) => {
  const na = NODES.find((n) => n.id === a)!;
  const nb = NODES.find((n) => n.id === b)!;
  return (na.discoveryRequirements ?? []).length === 0 && (nb.discoveryRequirements ?? []).length === 0;
});
