import { makeBuild, runManualRolls } from '../src/engine/sim.ts';
import { CONFIG, displayStats } from '../src/engine/game.ts';
import { FIXTURES } from '../src/engine/fixtures.ts';

// Shared with tests/builds.test.ts, and asserted reachable there.
const FIX: Record<string, string[]> = { ...FIXTURES, everything: [] };

const pad = (v: string | number, n: number) => String(v).padStart(n);

console.log('\n=== FRAMEWORK A: score economy (2000 manual rolls, flip=higher) ===');
console.log([pad('build', 20), pad('rolls/act', 10), pad('avgFace', 8), pad('score/act', 10), pad('score/roll', 11), pad('score/sec', 10)].join(' '));
for (const [name, nodes] of Object.entries(FIX)) {
  if (name === 'everything') continue;
  const s = makeBuild({ seed: 20260925, nodes, policies: { flip: 'higher', hold: 'never', letItRide: 'bank' } });
  if (nodes.includes('ct_seal')) s.sealedFace = 1;
  const cd = CONFIG.baseCooldownMs * displayStats(s).cooldownMult;
  const r = runManualRolls(s, 2000);
  const perSec = r.scorePerManual / (cd / 1000);
  console.log([
    pad(name, 20), pad(r.rollsPerManual.toFixed(2), 10), pad(r.averageFace.toFixed(2), 8),
    pad(r.scorePerManual.toFixed(1), 10), pad((r.scoreEarned / r.resolvedRolls).toFixed(2), 11),
    pad(perSec.toFixed(1), 10),
  ].join(' '));
}

console.log('\n=== FRAMEWORK B: meta economy (2000 manual rolls) ===');
console.log([pad('build', 20), pad('rolls/act', 10), pad('meta/act', 9), pad('meta/sec', 9), pad('loss/roll', 10)].join(' '));
for (const [name, nodes] of Object.entries(FIX)) {
  if (name === 'everything') continue;
  const s = makeBuild({ seed: 20260925, nodes, framework: 'B', startingScore: 5_000_000, policies: { flip: 'lower', hold: 'never' } });
  if (nodes.includes('ct_seal')) s.sealedFace = 6;
  const cd = CONFIG.baseCooldownMs * displayStats(s).cooldownMult;
  const r = runManualRolls(s, 2000);
  console.log([
    pad(name, 20), pad(r.rollsPerManual.toFixed(2), 10), pad(r.metaPerManual.toFixed(2), 9),
    pad((r.metaPerManual / (cd / 1000)).toFixed(1), 9), pad((r.scoreLost / r.resolvedRolls).toFixed(2), 10),
  ].join(' '));
}

console.log('\n=== TIME TO AFFORD, from zero, baseline build (seconds of manual rolling) ===');
{
  const s = makeBuild({ seed: 7 });
  const cd = CONFIG.baseCooldownMs / 1000;
  let acts = 0;
  const marks = [45, 120, 250, 420, 520, 1450, 1700, 1900];
  const found: Record<number, number> = {};
  while (acts < 60000 && Object.keys(found).length < marks.length) {
    runManualRolls(s, 1); acts++;
    for (const m of marks) if (found[m] === undefined && s.score >= m) found[m] = acts * cd;
  }
  for (const m of marks) console.log(`  ${pad(m, 5)} score  ->  ${(found[m] ?? -1).toFixed(0)}s`);
}
