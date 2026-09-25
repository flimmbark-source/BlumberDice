import { EDGES, NODES } from '../src/engine/nodes.ts';
import {
  countCrossings, crossingPairs, currentPositions, minSeparation,
  nodeEdgeConflicts, VISIBLE_PRE_B,
} from './layoutlib.ts';

const pos = currentPositions();
console.log('nodes', NODES.length, 'edges', EDGES.length);
console.log('crossings (full web)   ', countCrossings(pos));
console.log('crossings (pre-discovery)', countCrossings(pos, VISIBLE_PRE_B));
console.log('node-on-edge conflicts ', nodeEdgeConflicts(pos, 26));
const ms = minSeparation(pos);
console.log('closest pair           ', ms.dist.toFixed(1), ms.pair.join(' / '));
console.log('\nworst offenders:');
const tally: Record<string, number> = {};
for (const [e1, e2] of crossingPairs(pos)) {
  for (const e of [e1, e2]) { const k = e.join('→'); tally[k] = (tally[k] ?? 0) + 1; }
}
Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 12)
  .forEach(([k, v]) => console.log(`   ${v}x  ${k}`));
