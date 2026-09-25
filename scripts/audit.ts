import { NODES } from '../src/engine/nodes.ts';

const preB = NODES.filter((n) => (n.discoveryRequirements ?? []).length === 0);
const postB = NODES.filter((n) => (n.discoveryRequirements ?? []).length > 0);
const roots = NODES.filter((n) => n.prerequisites.includes('start'));
const multi = NODES.filter((n) => n.prerequisites.length > 1);
const byType: Record<string, number> = {};
const byRegion: Record<string, number> = {};
for (const n of NODES) {
  byType[n.nodeType] = (byType[n.nodeType] ?? 0) + 1;
  byRegion[n.region] = (byRegion[n.region] ?? 0) + 1;
}
console.log('total nodes      ', NODES.length);
console.log('pre-discovery    ', preB.length);
console.log('post-discovery   ', postB.length);
console.log('entry from root  ', roots.length);
console.log('multi-prereq     ', multi.length);
console.log('by type          ', byType);
console.log('by region        ', byRegion);
console.log('meta-costing     ', NODES.filter((n) => (n.costs.meta ?? 0) > 0).length);
const ratios = NODES.filter((n) => (n.costs.meta ?? 0) > 0)
  .map((n) => `${n.id} ${n.costs.score}/${n.costs.meta} = ${((n.costs.score ?? 0) / n.costs.meta!).toFixed(2)}`);
console.log('score:meta ratios');
for (const r of ratios) console.log('   ', r);
