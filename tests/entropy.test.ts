import { describe, expect, it } from 'vitest';
import { CONFIG, createGame, drain, manualRoll, switchFramework, tick } from '../src/engine/game.ts';
import { FIXTURES } from '../src/engine/fixtures.ts';
import { makeBuild, runManualRolls } from '../src/engine/sim.ts';

const SECOND = CONFIG.entropyIntervalMs;
const RATE = CONFIG.entropyPerSecond;

/** Runs `ms` of game time in frame-sized slices, the way the store does. */
function run(s: ReturnType<typeof createGame>, ms: number, slice = 16): void {
  let left = ms;
  while (left > 0) {
    const dt = Math.min(slice, left);
    tick(s, dt);
    left -= dt;
  }
}

describe('entropy', () => {
  it('takes exactly the rate once a second', () => {
    const s = createGame(1);
    s.score = 100;
    run(s, SECOND);
    expect(s.score).toBe(100 - RATE);
    run(s, SECOND);
    expect(s.score).toBe(100 - RATE * 2);
  });

  it('does not act before its second is up', () => {
    const s = createGame(1);
    s.score = 100;
    run(s, SECOND - 32);
    expect(s.score).toBe(100);
  });

  it('settles exactly on zero rather than overshooting it', () => {
    const s = createGame(1);
    s.score = RATE - 2;
    run(s, SECOND);
    expect(s.score).toBe(0);
    // And stays there: zero is a resting point, not a crossing.
    run(s, SECOND * 3);
    expect(s.score).toBe(0);
  });

  it('reverses below zero and climbs back to exactly zero', () => {
    const s = createGame(1);
    s.score = -20;
    run(s, SECOND);
    expect(s.score).toBe(-20 + RATE);
    run(s, SECOND * 2);
    expect(s.score).toBe(-20 + RATE * 3);
    // -2 left, so the last step is short.
    run(s, SECOND);
    expect(s.score).toBe(0);
  });

  it('records each step for the HUD, signed by direction', () => {
    const s = createGame(1);
    s.score = 50;
    run(s, SECOND);
    expect(s.entropyLog.at(-1)?.amount).toBe(-RATE);

    s.score = -50;
    run(s, SECOND);
    expect(s.entropyLog.at(-1)?.amount).toBe(RATE);
  });

  it('logs a reversal once rather than once a second', () => {
    const s = createGame(1);
    s.score = 60;
    run(s, SECOND * 4);
    const drains = s.log.filter((e) => e.text.includes('draining'));
    expect(drains).toHaveLength(1);
  });

  it('keeps running while a decision is open', () => {
    const s = createGame(1);
    s.score = 100;
    s.decision = { kind: 'flip', intentId: 1, face: 3, flipped: 4 };
    run(s, SECOND);
    expect(s.score).toBe(100 - RATE);
  });

  it('drops arrears instead of paying out a backgrounded tab all at once', () => {
    const s = createGame(1);
    s.score = 10_000;
    // One enormous frame, as a restored tab delivers.
    tick(s, SECOND * 600);
    expect(s.score).toBeGreaterThan(10_000 - RATE * 20);
  });
});

describe('framework B without a floor', () => {
  it('lets Score go below zero', () => {
    const s = createGame(7);
    s.discovered.push('frameworkB');
    switchFramework(s);
    expect(s.framework).toBe('B');

    s.score = 2;
    manualRoll(s);
    drain(s);
    // One roll costs its face, which is at least 1 and can exceed the 2 held.
    expect(s.score).toBeLessThanOrEqual(1);
    for (let i = 0; i < 12; i++) { s.cooldownRemaining = 0; manualRoll(s); drain(s); }
    expect(s.score).toBeLessThan(0);
  });

  it('counts the whole cost as lost, not just the part that was covered', () => {
    const s = createGame(11);
    s.discovered.push('frameworkB');
    switchFramework(s);
    s.score = 0;
    manualRoll(s);
    drain(s);
    expect(s.stats.scoreLost).toBe(-s.score);
  });

  it('leaves framework A unable to go below zero on its own', () => {
    const s = createGame(3);
    s.score = 0;
    for (let i = 0; i < 20; i++) { s.cooldownRemaining = 0; manualRoll(s); drain(s); }
    expect(s.score).toBeGreaterThanOrEqual(0);
  });
});

describe('bonus dice lapsing', () => {
  it('counts each destroyed die and says so in the log', () => {
    const s = createGame(1);
    s.bonusDice = [40, 40, 5000];
    run(s, 100);
    expect(s.bonusDice).toHaveLength(1);
    expect(s.bonusLapses).toBe(2);
    expect(s.stats.bonusLapsed).toBe(2);
    expect(s.log.some((e) => e.text.includes('out of time'))).toBe(true);
  });

  it('destroys them while rolls are still resolving', () => {
    const s = createGame(5);
    s.bonusDice = [30];
    manualRoll(s);
    expect(s.pending.length).toBeGreaterThan(0);
    run(s, 60);
    expect(s.bonusLapses).toBe(1);
  });

  it('is monotonic, so the tray can diff it', () => {
    const s = createGame(1);
    s.bonusDice = [20];
    run(s, 50);
    const first = s.bonusLapses;
    s.bonusDice = [20];
    run(s, 50);
    expect(s.bonusLapses).toBe(first + 1);
  });
});

describe('the log mirrors the dice', () => {
  // Both lists are capped, and they trim on their own clocks: a long enough
  // run drops old procs off one end and old lines off the other. The
  // invariant is that a proc is written down when it is shown, so it is
  // checked over a run short enough that neither cap has bitten.
  it('writes a line for every proc the tray is handed', () => {
    // A build with enough going on to throw procs of several kinds. A bare
    // build produces none at all, which would pass this by saying nothing.
    const s = makeBuild({ seed: 42, nodes: FIXTURES.comboEngine });
    runManualRolls(s, 8);

    const shown = s.rollLog.flatMap((r) => r.procs ?? []);
    expect(shown.length).toBeGreaterThan(0);
    // Guards the premise: past the cap the check below would be testing the
    // trim rather than the writing.
    expect(s.log.length).toBeLessThan(240);

    for (const proc of shown) {
      const name = proc.label.charAt(0) + proc.label.slice(1).toLowerCase();
      const line = proc.detail ? `${name} ${proc.detail}` : name;
      expect(s.log.some((e) => e.text === line)).toBe(true);
    }
  });

  it('covers every kind of proc a die can show, not just some', () => {
    const s = makeBuild({ seed: 7, nodes: FIXTURES.slotMachine });
    runManualRolls(s, 8);
    const shown = s.rollLog.flatMap((r) => r.procs ?? []);
    expect(new Set(shown.map((pr) => pr.kind)).size).toBeGreaterThan(1);
    for (const proc of shown) {
      const name = proc.label.charAt(0) + proc.label.slice(1).toLowerCase();
      expect(s.log.some((e) => e.text.startsWith(name))).toBe(true);
    }
  });

  it('keeps writing them down once both lists are rolling over', () => {
    const s = makeBuild({ seed: 5, nodes: FIXTURES.comboEngine });
    runManualRolls(s, 300);
    // The newest procs are the ones that must still be present: anything
    // older has legitimately aged out of a capped log.
    const recent = s.rollLog.slice(-3).flatMap((r) => r.procs ?? []);
    expect(recent.length).toBeGreaterThan(0);
    for (const proc of recent) {
      const name = proc.label.charAt(0) + proc.label.slice(1).toLowerCase();
      expect(s.log.some((e) => e.text.startsWith(name))).toBe(true);
    }
  });

  it('does not say the same thing twice', () => {
    const s = createGame(9);
    s.pendulumRollsLeft = 1;
    s.pendulumPayout = 50;
    manualRoll(s);
    drain(s);
    const pendulum = s.log.filter((e) => e.text.toLowerCase().startsWith('pendulum'));
    expect(pendulum.length).toBeLessThanOrEqual(1);
  });
});
