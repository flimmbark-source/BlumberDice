import { describe, expect, it } from 'vitest';
import { EDGES, NODES, NODES_BY_ID } from '../src/engine/nodes.ts';

type P = { x: number; y: number };
const pos = (id: string): P => NODES_BY_ID.get(id)!.position;

const orient = (a: P, b: P, c: P): number => (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);

function segmentsCross(a1: P, a2: P, b1: P, b2: P): boolean {
  const d1 = orient(a1, a2, b1);
  const d2 = orient(a1, a2, b2);
  const d3 = orient(b1, b2, a1);
  const d4 = orient(b1, b2, a2);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

function pointSegDist(p: P, a: P, b: P): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

const RADIUS: Record<string, number> = { keystone: 34, notable: 22, bridge: 21, small: 13 };

/** Edges visible before the second framework is discovered. */
const PRE_B = EDGES.filter(([a, b]) =>
  (NODES_BY_ID.get(a)!.discoveryRequirements ?? []).length === 0
  && (NODES_BY_ID.get(b)!.discoveryRequirements ?? []).length === 0);

function crossings(edges: readonly (readonly [string, string])[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      const [a, b] = edges[i];
      const [c, d] = edges[j];
      if (a === c || a === d || b === c || b === d) continue;
      if (segmentsCross(pos(a), pos(b), pos(c), pos(d))) {
        out.push([`${a}-${b}`, `${c}-${d}`]);
      }
    }
  }
  return out;
}

describe('passive web layout', () => {
  it('draws no crossing connections anywhere in the web', () => {
    // Regenerate with: node --experimental-strip-types scripts/radial.ts --write
    expect(crossings(EDGES)).toEqual([]);
  });

  it('draws no crossing connections in the pre-discovery web either', () => {
    expect(crossings(PRE_B)).toEqual([]);
  });

  it('never sits a node on top of a connection it is not part of', () => {
    const offenders: string[] = [];
    for (const n of NODES) {
      const need = RADIUS[n.nodeType] + 14;
      for (const [a, b] of EDGES) {
        if (a === n.id || b === n.id) continue;
        if (pointSegDist(n.position, pos(a), pos(b)) < need) offenders.push(`${n.id} on ${a}-${b}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('keeps every pair of nodes visually separated', () => {
    const tight: string[] = [];
    for (let i = 0; i < NODES.length; i++) {
      for (let j = i + 1; j < NODES.length; j++) {
        const a = NODES[i];
        const b = NODES[j];
        const need = RADIUS[a.nodeType] + RADIUS[b.nodeType] + 12;
        const d = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
        if (d < need) tight.push(`${a.id}/${b.id} ${d.toFixed(0)} < ${need}`);
      }
    }
    expect(tight).toEqual([]);
  });

  it('keeps connections short enough to read as local links', () => {
    const long = EDGES
      .map(([a, b]) => ({ e: `${a}-${b}`, d: Math.hypot(pos(a).x - pos(b).x, pos(a).y - pos(b).y) }))
      .filter((x) => x.d > 420);
    expect(long.map((x) => `${x.e} ${x.d.toFixed(0)}`)).toEqual([]);
  });

  it('still declares two regions for every bridge', () => {
    for (const n of NODES.filter((x) => x.nodeType === 'bridge')) {
      expect(n.bridges, n.id).toBeDefined();
      expect(n.bridges![0]).not.toBe(n.bridges![1]);
    }
  });
});
