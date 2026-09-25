/**
 * Deterministic radial layout for the passive web.
 *
 * The prerequisite graph is a DAG rooted at `start`: 53 of its 73 edges form a
 * spanning tree, and a radial tree drawing has no crossings among those by
 * construction. Only the 20 extra edges — a bridge's second entry, a notable
 * with two parents — can cross anything.
 *
 * So: lay out the spanning tree radially, then choose the angular order of
 * each node's children to minimise crossings from the extra edges. That search
 * space is tiny (a permutation per node) compared with free 2D placement, and
 * unlike annealing it is deterministic and repeatable.
 *
 *   node --experimental-strip-types scripts/radial.ts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { EDGES, NODES, NODES_BY_ID } from '../src/engine/nodes.ts';
import {
  countCrossings, crossingPairs, nodeEdgeConflicts, nodeRadius, pointSegDist,
  segmentsCross, VISIBLE_PRE_B, type Pos,
} from './layoutlib.ts';

const ROOT = 'start';

/**
 * The bridge graph over the archetypes needs more adjacencies than a ring can
 * offer, so the sector order is chosen by enumeration rather than by taste.
 */
const RING = [0, 205, 360, 505, 640, 762, 872, 975];
const ringRadius = (d: number): number =>
  d < RING.length ? RING[d] : RING[RING.length - 1] + (d - RING.length + 1) * 100;

// --- spanning tree ---------------------------------------------------------

const depth = new Map<string, number>([[ROOT, 0]]);
const parent = new Map<string, string>();
{
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of NODES) {
      if (n.id === ROOT || n.prerequisites.length === 0) continue;
      let bestDepth = Infinity;
      let bestParent = '';
      for (const p of n.prerequisites) {
        const d = depth.get(p);
        if (d !== undefined && d + 1 < bestDepth) { bestDepth = d + 1; bestParent = p; }
      }
      if (bestParent && depth.get(n.id) !== bestDepth) {
        depth.set(n.id, bestDepth);
        parent.set(n.id, bestParent);
        changed = true;
      }
    }
  }
}

const children = new Map<string, string[]>();
for (const n of NODES) children.set(n.id, []);
for (const [child, par] of parent) children.get(par)!.push(child);

const treeEdge = new Set<string>();
for (const [c, p] of parent) treeEdge.add([c, p].sort().join('|'));
const EXTRA = EDGES.filter(([a, b]) => !treeEdge.has([a, b].sort().join('|')));

// Subtree weight drives how much angle each branch receives.
const weight = new Map<string, number>();
function computeWeight(id: string): number {
  const kids = children.get(id)!;
  const w = kids.length === 0 ? 1 : kids.reduce((a, k) => a + computeWeight(k), 0);
  weight.set(id, w);
  return w;
}
computeWeight(ROOT);

// --- placement -------------------------------------------------------------

function place(order: Map<string, string[]>): Pos {
  const pos: Pos = { [ROOT]: { x: 0, y: 0 } };
  const walk = (id: string, a0: number, a1: number): void => {
    const kids = order.get(id) ?? children.get(id)!;
    if (kids.length === 0) return;
    const total = kids.reduce((s, k) => s + weight.get(k)!, 0);
    let a = a0;
    for (const k of kids) {
      const span = ((a1 - a0) * weight.get(k)!) / total;
      const mid = a + span / 2;
      const r = ringRadius(depth.get(k)!);
      pos[k] = { x: Math.round(Math.cos(mid) * r), y: Math.round(Math.sin(mid) * r) };
      walk(k, a, a + span);
      a += span;
    }
  };
  // Start the root's fan at -90 degrees so the first branch points up.
  walk(ROOT, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2);
  return pos;
}

const angleOf = (p: { x: number; y: number }): number => Math.atan2(p.y, p.x);

function subtree(id: string, acc: string[] = []): string[] {
  acc.push(id);
  for (const k of children.get(id)!) subtree(k, acc);
  return acc;
}

/**
 * A node with two parents belongs between them, not inside one parent's
 * sector. Rotating it (and whatever hangs off it) to the angular midpoint of
 * its parents is what puts a bridge in the gap between two archetypes, which
 * is both where it reads best and where its two edges stay short.
 */
function seatMultiParent(pos: Pos): Pos {
  const out: Pos = {};
  for (const id of Object.keys(pos)) out[id] = { ...pos[id] };

  const multi = NODES
    .filter((n) => n.prerequisites.length > 1 && n.id !== ROOT)
    .sort((a, b) => depth.get(a.id)! - depth.get(b.id)!);

  for (const n of multi) {
    const parents = n.prerequisites.filter((p) => out[p]);
    if (parents.length < 2) continue;
    const a0 = angleOf(out[parents[0]]);
    let spread = 0;
    for (let i = 1; i < parents.length; i++) {
      let d = angleOf(out[parents[i]]) - a0;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      spread += d;
    }
    const target = a0 + spread / parents.length;
    const current = angleOf(out[n.id]);
    let delta = target - current;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;

    const cos = Math.cos(delta);
    const sin = Math.sin(delta);
    for (const id of subtree(n.id)) {
      const q = out[id];
      out[id] = {
        x: Math.round(q.x * cos - q.y * sin),
        y: Math.round(q.x * sin + q.y * cos),
      };
    }
  }
  return out;
}


function extraCrossings(pos: Pos): number {
  let n = 0;
  for (let i = 0; i < EDGES.length; i++) {
    for (let j = i + 1; j < EDGES.length; j++) {
      const [a, b] = EDGES[i];
      const [c, d] = EDGES[j];
      if (a === c || a === d || b === c || b === d) continue;
      if (segmentsCross(pos[a], pos[b], pos[c], pos[d])) n++;
    }
  }
  return n;
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

/** Hill-climb the child orderings; each node's permutation is tried in full. */
/** Crossings of the drawing as it will actually be rendered. */
function scoreOrder(order: Map<string, string[]>): number {
  const raw = place(order);
  const seated = seatMultiParent(raw);
  const a = extraCrossings(raw);
  const b = extraCrossings(seated);
  return Math.min(a, b);
}

function climb(order: Map<string, string[]>, passes: number): number {
  let best = scoreOrder(order);
  const internal = [...children.entries()]
    .filter(([id, k]) => k.length > 1 && id !== ROOT).map(([id]) => id);
  for (let pass = 0; pass < passes && best > 0; pass++) {
    let improved = false;
    for (const id of internal) {
      const kids = order.get(id)!;
      const options = kids.length <= 5
        ? permutations(kids)
        : kids.map((_, i) => [...kids.slice(i), ...kids.slice(0, i)]);
      let bestKids = kids;
      for (const cand of options) {
        order.set(id, cand);
        const c = scoreOrder(order);
        if (c < best) { best = c; bestKids = cand; improved = true; }
      }
      order.set(id, bestKids);
    }
    if (!improved) break;
  }
  return best;
}

function optimiseOrder(): { order: Map<string, string[]>; pos: Pos; cross: number } {
  const rootKids = children.get(ROOT)!;
  let bestOrder: Map<string, string[]> | null = null;
  let bestCross = Infinity;
  let bestRoot: string[] = [];

  for (const rootPerm of permutations(rootKids)) {
    // Rotations of a ring are equivalent; fix the first branch.
    if (rootPerm[0] !== rootKids[0]) continue;
    const order = new Map<string, string[]>();
    for (const [id, kids] of children) order.set(id, [...kids]);
    order.set(ROOT, rootPerm);
    const c = climb(order, 10);
    if (c < bestCross) {
      bestCross = c;
      bestOrder = new Map([...order].map(([k, v]) => [k, [...v]]));
      bestRoot = rootPerm;
    }
  }
  console.log('best sector order:', bestRoot.join(' -> '), '=>', bestCross, 'crossings');
  const order = bestOrder!;
  return { order, pos: place(order), cross: bestCross };
}

const { order, pos: treePos, cross } = optimiseOrder();

// Seating positions every bridge between its parents; keep it only if the
// drawing actually improves.
const seated = seatMultiParent(treePos);
const basePos = countCrossings(seated) <= countCrossings(treePos) ? seated : treePos;



// --- radial nudge ----------------------------------------------------------
// Siblings share a ring, which can put a node on top of an unrelated edge.
// Push offenders slightly in or out along their own radius; this cannot create
// a crossing between tree edges because the angular order is unchanged.
function relieve(pos: Pos): Pos {
  const out: Pos = {};
  for (const id of Object.keys(pos)) out[id] = { ...pos[id] };
  for (let pass = 0; pass < 40; pass++) {
    let moved = false;
    for (const n of NODES) {
      if (n.id === ROOT) continue;
      const need = nodeRadius(n) + 16;
      let conflict = false;
      for (const [a, b] of EDGES) {
        if (a === n.id || b === n.id) continue;
        if (pointSegDist(out[n.id], out[a], out[b]) < need) { conflict = true; break; }
      }
      if (!conflict) {
        for (const m of NODES) {
          if (m.id === n.id) continue;
          const d = Math.hypot(out[n.id].x - out[m.id].x, out[n.id].y - out[m.id].y);
          if (d < nodeRadius(n) + nodeRadius(m) + 20) { conflict = true; break; }
        }
      }
      if (!conflict) continue;

      const r = Math.hypot(out[n.id].x, out[n.id].y) || 1;
      const ux = out[n.id].x / r;
      const uy = out[n.id].y / r;
      let bestDelta = 0;
      let bestBad = Infinity;
      for (const delta of [-70, -52, -34, -18, 18, 34, 52, 70, 88]) {
        const cand = { x: Math.round(ux * (r + delta)), y: Math.round(uy * (r + delta)) };
        const save = out[n.id];
        out[n.id] = cand;
        let bad = 0;
        for (const [a, b] of EDGES) {
          if (a === n.id || b === n.id) continue;
          const d = pointSegDist(cand, out[a], out[b]);
          if (d < need) bad += (need - d);
        }
        for (const m of NODES) {
          if (m.id === n.id) continue;
          const dd = Math.hypot(cand.x - out[m.id].x, cand.y - out[m.id].y);
          const want = nodeRadius(n) + nodeRadius(m) + 20;
          if (dd < want) bad += (want - dd) * 2;
        }
        bad += countCrossings(out) * 500;
        out[n.id] = save;
        if (bad < bestBad) { bestBad = bad; bestDelta = delta; }
      }
      if (bestDelta !== 0) {
        out[n.id] = { x: Math.round(ux * (r + bestDelta)), y: Math.round(uy * (r + bestDelta)) };
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

/**
 * Final repair: the radial rings can leave a cross-sector bridge sitting in the
 * same annulus as an unrelated branch. Try moving the few nodes still involved
 * in a crossing, accepting only strict improvements.
 */
function repair(start: Pos): Pos {
  const out: Pos = {};
  for (const id of Object.keys(start)) out[id] = { ...start[id] };

  for (let round = 0; round < 25; round++) {
    const pairs = crossingPairs(out);
    if (pairs.length === 0) break;
    const involved = new Set<string>();
    for (const [e1, e2] of pairs) for (const e of [e1, e2]) { involved.add(e[0]); involved.add(e[1]); }
    involved.delete(ROOT);

    let improved = false;
    for (const id of involved) {
      const node = NODES_BY_ID.get(id)!;
      const base = countCrossings(out);
      const old = { ...out[id] };
      const r0 = Math.hypot(old.x, old.y) || 1;
      const a0 = Math.atan2(old.y, old.x);

      let bestPos = old;
      let bestScore = Infinity;
      for (const dr of [-140, -90, -45, 0, 45, 90, 140, 200, 260]) {
        for (const da of [-0.5, -0.34, -0.2, -0.1, 0, 0.1, 0.2, 0.34, 0.5]) {
          if (dr === 0 && da === 0) continue;
          const r = Math.max(120, r0 + dr);
          const a = a0 + da;
          out[id] = { x: Math.round(Math.cos(a) * r), y: Math.round(Math.sin(a) * r) };
          const cross = countCrossings(out);
          if (cross > base) continue;
          let bad = 0;
          const need = nodeRadius(node) + 16;
          for (const [ea, eb] of EDGES) {
            if (ea === id || eb === id) continue;
            const d = pointSegDist(out[id], out[ea], out[eb]);
            if (d < need) bad += (need - d);
          }
          for (const m of NODES) {
            if (m.id === id) continue;
            const dd = Math.hypot(out[id].x - out[m.id].x, out[id].y - out[m.id].y);
            const want = nodeRadius(node) + nodeRadius(m) + 20;
            if (dd < want) bad += (want - dd) * 3;
          }
          const score = cross * 10000 + bad * 5 + Math.abs(dr) * 0.05 + Math.abs(da) * 40;
          if (score < bestScore) { bestScore = score; bestPos = { ...out[id] }; }
        }
      }
      out[id] = bestPos;
      if (countCrossings(out) < base) { improved = true; break; }
    }
    if (!improved) break;
  }
  return out;
}

const pos = relieve(repair(relieve(basePos)));

console.log('spanning tree depth', Math.max(...depth.values()));
console.log('tree edges', EDGES.length - EXTRA.length, '| extra edges', EXTRA.length);
console.log('root branches', children.get(ROOT)!.length, '->', (order.get(ROOT) ?? []).join(', '));
console.log('crossings, tree order only', cross);
console.log('crossings after seating   ', countCrossings(basePos));
console.log('crossings (full)        ', countCrossings(pos));
console.log('crossings (pre-discovery)', countCrossings(pos, VISIBLE_PRE_B));
console.log('node-on-edge conflicts  ', nodeEdgeConflicts(pos, 26));
const remaining = crossingPairs(pos);
if (remaining.length) {
  console.log('remaining:');
  for (const [e1, e2] of remaining) console.log(`   ${e1.join(' - ')}  x  ${e2.join(' - ')}`);
}
const xs = NODES.map((n) => pos[n.id].x);
const ys = NODES.map((n) => pos[n.id].y);
console.log(`bounds x[${Math.min(...xs)},${Math.max(...xs)}] y[${Math.min(...ys)},${Math.max(...ys)}]`);

if (process.argv.includes('--write')) {
  const file = 'src/engine/nodes.ts';
  let src = readFileSync(file, 'utf8');
  for (const n of NODES) {
    const p = pos[n.id];
    const re = new RegExp(`(id: '${n.id}',[\\s\\S]*?position: \\{ x: )-?[0-9.]+(, y: )-?[0-9.]+( \\})`);
    if (!re.test(src)) { console.warn('  ! could not rewrite', n.id); continue; }
    src = src.replace(re, `$1${p.x}$2${p.y}$3`);
  }
  writeFileSync(file, src);
  console.log('wrote', file);
}

export { NODES_BY_ID };
