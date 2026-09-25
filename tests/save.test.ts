import { describe, expect, it } from 'vitest';
import { deserialize, serialize } from '../src/engine/save.ts';
import { makeBuild, runManualRolls } from '../src/engine/sim.ts';
import { currentDistribution, manualRoll } from '../src/engine/game.ts';

describe('save round-trip', () => {
  it('preserves currencies, build, framework and RNG position', () => {
    const s = makeBuild({ seed: 4321, nodes: ['hr_edge', 'vl_quick', 'pt_repeat'] });
    s.discovered.push('frameworkB');
    runManualRolls(s, 120);
    const restored = deserialize(serialize(s))!;

    expect(restored.score).toBe(s.score);
    expect(restored.meta).toBe(s.meta);
    expect(restored.framework).toBe(s.framework);
    expect(restored.allocated).toEqual(s.allocated);
    expect(restored.discovered).toEqual(s.discovered);
    expect(restored.totalRolls).toBe(s.totalRolls);
    expect(restored.rng).toEqual(s.rng);
    expect(currentDistribution(restored).probabilities)
      .toEqual(currentDistribution(s).probabilities);
  });

  it('continues the same RNG stream after a reload', () => {
    const a = makeBuild({ seed: 999 });
    runManualRolls(a, 50);
    const b = deserialize(serialize(a))!;
    const contA = runManualRolls(a, 50);
    const contB = runManualRolls(b, 50);
    expect(contB.state.stats.faceCounts).toEqual(contA.state.stats.faceCounts);
  });

  it('drops a cascade that was in flight', () => {
    const s = makeBuild({ seed: 5, nodes: ['vl_quick', 'vl_splinter'] });
    manualRoll(s);
    expect(s.pending.length).toBeGreaterThan(0);
    const restored = deserialize(serialize(s))!;
    expect(restored.pending).toEqual([]);
    expect(restored.decision).toBeNull();
  });

  it('rejects malformed and version-mismatched payloads', () => {
    expect(deserialize('not json')).toBeNull();
    expect(deserialize('null')).toBeNull();
    expect(deserialize(JSON.stringify({ v: 99, state: {} }))).toBeNull();
  });

  it('drops unknown node ids and keeps the root', () => {
    const s = makeBuild({ seed: 1 });
    const payload = JSON.parse(serialize(s));
    payload.state.allocated = ['ghost_node', 'hr_edge'];
    const restored = deserialize(JSON.stringify(payload))!;
    expect(restored.allocated).toEqual(['start', 'hr_edge']);
  });

  it('fills in fields a save predates', () => {
    const s = makeBuild({ seed: 1 });
    const payload = JSON.parse(serialize(s));
    delete payload.state.policies;
    delete payload.state.stats;
    const restored = deserialize(JSON.stringify(payload))!;
    expect(restored.policies.loadedChoice).toBe('ask');
    expect(restored.stats.faceCounts[1]).toBe(0);
  });
});
