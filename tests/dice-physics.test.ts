import { describe, expect, it } from 'vitest';
import {
  createWorld, DIE, dieAt, floorBand, nudgeDie, retireDie, setWorldWidth,
  spawnDie, step, throwDie, WORLD_H, type DieBody, type World,
} from '../src/ui/dice/physics.ts';
import type { Face } from '../src/engine/types.ts';

/** Advances the world in 16ms frames. */
function run(world: World, ms: number): void {
  for (let t = 0; t < ms; t += 16) step(world, 16);
}

function thrownDie(result: Face | null, minTumbleMs = 480): { world: World; die: DieBody } {
  const world = createWorld(900);
  const die = spawnDie(world);
  throwDie(world, die, { minTumbleMs });
  if (result !== null) die.result = result;
  return { world, die };
}

describe('the animation always reports the engine result', () => {
  it('settles on exactly the face it was handed, for every face', () => {
    for (const face of [1, 2, 3, 4, 5, 6] as Face[]) {
      for (let trial = 0; trial < 12; trial++) {
        const { world, die } = thrownDie(face);
        run(world, 4000);
        expect(die.tumbling, `face ${face} never settled`).toBe(false);
        expect(die.face, `face ${face} trial ${trial}`).toBe(face);
      }
    }
  });

  it('keeps tumbling while no result has arrived', () => {
    const { world, die } = thrownDie(null);
    run(world, 3000);
    expect(die.tumbling).toBe(true);
    expect(die.settledAt).toBe(-1);

    die.result = 3;
    run(world, 2000);
    expect(die.tumbling).toBe(false);
    expect(die.face).toBe(3);
  });

  it('keeps a die alive while a player is deciding', () => {
    // A roll suspends on a player decision, so the die must go on tumbling for
    // as long as someone might reasonably take to answer.
    const { world, die } = thrownDie(null);
    run(world, 30000);
    expect(die.retiring).toBe(false);
    expect(die.tumbling).toBe(true);
  });

  it('eventually gives up on a die that is never handed a result', () => {
    const { world, die } = thrownDie(null);
    run(world, 50000);
    expect(die.retiring || !world.dice.includes(die)).toBe(true);
  });

  it('honours the minimum tumble before showing an answer', () => {
    const { world, die } = thrownDie(4, 900);
    run(world, 700);
    expect(die.tumbling).toBe(true);
    run(world, 2000);
    expect(die.tumbling).toBe(false);
    expect(die.face).toBe(4);
  });

  it('settles quickly enough to keep up with play', () => {
    let worst = 0;
    for (let trial = 0; trial < 40; trial++) {
      const { world, die } = thrownDie(6, 480);
      let elapsed = 0;
      while (die.tumbling && elapsed < 6000) { step(world, 16); elapsed += 16; }
      expect(die.tumbling).toBe(false);
      worst = Math.max(worst, elapsed);
    }
    // Comfortably inside the shortest possible gap between two manual rolls.
    expect(worst).toBeLessThan(1400);
  });
});

describe('the tray contains its dice', () => {
  it('keeps every die inside the floor band and the side walls', () => {
    const world = createWorld(780);
    const [top, bottom] = floorBand(WORLD_H);
    for (let i = 0; i < 10; i++) {
      const d = spawnDie(world, { dropped: true });
      throwDie(world, d, { minTumbleMs: 300, power: 1.4 });
      d.result = ((i % 6) + 1) as Face;
    }
    for (let t = 0; t < 5000; t += 16) {
      step(world, 16);
      for (const d of world.dice) {
        expect(d.x).toBeGreaterThanOrEqual(DIE * 0.6);
        expect(d.x).toBeLessThanOrEqual(world.w - DIE * 0.6);
        expect(d.y).toBeGreaterThanOrEqual(top);
        expect(d.y).toBeLessThanOrEqual(bottom);
        expect(d.z).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('separates dice that land on each other', () => {
    const world = createWorld(900);
    const a = spawnDie(world, { x: 400, y: 300 });
    const b = spawnDie(world, { x: 404, y: 302 });
    a.result = 1; b.result = 2;
    throwDie(world, a, { minTumbleMs: 200 });
    throwDie(world, b, { minTumbleMs: 200 });
    run(world, 4000);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(DIE * 0.7);
  });

  it('rescales positions when the tray changes width', () => {
    const world = createWorld(1000);
    const d = spawnDie(world, { x: 900, y: 400 });
    setWorldWidth(world, 500);
    expect(d.x).toBeLessThanOrEqual(500 - DIE * 0.6);
    expect(d.x).toBeGreaterThan(0);
  });
});

describe('tray interaction', () => {
  it('finds the die under a point, preferring the one in the air', () => {
    const world = createWorld(900);
    const low = spawnDie(world, { x: 300, y: 400 });
    const high = spawnDie(world, { x: 300, y: 400 });
    high.z = 200;
    expect(dieAt(world, 300, 400 - 200 * 0.55)).toBe(high);
    expect(dieAt(world, 300, 400)).toBe(low);
    expect(dieAt(world, 20, 20)).toBeNull();
  });

  it('ignores dice that are leaving', () => {
    const world = createWorld(900);
    const d = spawnDie(world, { x: 300, y: 400 });
    retireDie(d);
    expect(dieAt(world, 300, 400)).toBeNull();
  });

  it('removes a retired die once it has faded', () => {
    const world = createWorld(900);
    const d = spawnDie(world, { x: 300, y: 400 });
    retireDie(d);
    run(world, 2000);
    expect(world.dice).not.toContain(d);
  });

  it('nudges a resting die without starting a roll', () => {
    const world = createWorld(900);
    const d = spawnDie(world, { x: 400, y: 400 });
    nudgeDie(d);
    expect(Math.abs(d.vx) + Math.abs(d.vy)).toBeGreaterThan(0);
    run(world, 600);
    expect(d.tumbling).toBe(false);
    expect(d.settledAt).toBe(-1);
  });

  it('re-throwing clears the previous answer', () => {
    const { world, die } = thrownDie(5);
    run(world, 3000);
    expect(die.face).toBe(5);
    throwDie(world, die, { minTumbleMs: 400 });
    expect(die.result).toBeNull();
    expect(die.tumbling).toBe(true);
    die.result = 2;
    run(world, 3000);
    expect(die.face).toBe(2);
  });
});
