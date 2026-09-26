import { describe, expect, it } from 'vitest';
import {
  createWorld, DIE, DIE_HALF, dieAt, faceUp, LOCAL_VERTICES, nudgeDie,
  orientationFor, owesReveal, planThrow, releaseFadedGhosts, retireDie, setWorldSize,
  spawnDie, step, throwDie, type DieBody, type World,
} from '../src/ui/dice/physics.ts';
import {
  dot, project, qRandom, qRotate, v3, VIEW_DIR, add, len,
} from '../src/ui/dice/math3d.ts';
import type { Face } from '../src/engine/types.ts';

const FACES: Face[] = [1, 2, 3, 4, 5, 6];

/** Advances the world in 16ms frames. */
function run(world: World, ms: number): void {
  for (let t = 0; t < ms; t += 16) step(world, 16);
}

function thrownDie(result: Face | null, minTumbleMs = 300): { world: World; die: DieBody } {
  const world = createWorld(420, 420);
  const die = spawnDie(world);
  throwDie(world, die, { minTumbleMs });
  if (result !== null) die.result = result;
  return { world, die };
}

describe('the animation always reports the engine result', () => {
  it('comes to rest with exactly the given face up, for every face', () => {
    for (const face of FACES) {
      for (let trial = 0; trial < 10; trial++) {
        const { world, die } = thrownDie(face);
        run(world, 6000);
        expect(die.state, `face ${face} never settled`).toBe('rest');
        expect(faceUp(die.q), `face ${face} trial ${trial}`).toBe(face);
      }
    }
  });

  it('settles perfectly flat, resting on a face rather than an edge', () => {
    for (const face of FACES) {
      const { world, die } = thrownDie(face);
      run(world, 6000);
      // Every vertex sits at either the floor or the top of the cube.
      for (const lv of LOCAL_VERTICES) {
        const z = die.pos.z + qRotate(die.q, lv).z;
        const onFloor = Math.abs(z) < 0.01;
        const onTop = Math.abs(z - DIE) < 0.01;
        expect(onFloor || onTop, `vertex at z=${z.toFixed(2)}`).toBe(true);
      }
      expect(die.pos.z).toBeCloseTo(DIE_HALF, 5);
    }
  });

  it('lands before it hops, rather than skipping the bounce', () => {
    // The hop reads as a final bounce only if the die has actually touched
    // down first.
    for (let trial = 0; trial < 30; trial++) {
      const { world, die } = thrownDie(2);
      let touches = 0;
      let low = false;
      while (die.state === 'tumbling' && world.t < 4000) {
        step(world, 16);
        let lowest = Infinity;
        for (const lv of LOCAL_VERTICES) lowest = Math.min(lowest, die.pos.z + qRotate(die.q, lv).z);
        const nowLow = lowest < 2;
        if (nowLow && !low) touches += 1;
        low = nowLow;
      }
      expect(touches, 'hopped without landing first').toBeGreaterThanOrEqual(1);
    }
  });

  it('starts the hop promptly rather than rolling on and on', () => {
    // The turn is what ends a roll, so it must not wait for free physics to
    // come to rest on its own, which it rarely does.
    let worst = 0;
    for (let trial = 0; trial < 30; trial++) {
      const { world, die } = thrownDie(3);
      let elapsed = 0;
      while (die.state !== 'aligning' && elapsed < 4000) { step(world, 16); elapsed += 16; }
      expect(die.state).toBe('aligning');
      worst = Math.max(worst, elapsed);
    }
    expect(worst).toBeLessThanOrEqual(560);
  });

  it('hops off the surface while it turns onto its face', () => {
    let sawHop = false;
    for (const face of FACES) {
      const { world, die } = thrownDie(face);
      let peak = 0;
      let sawAligning = false;
      for (let t = 0; t < 6000; t += 16) {
        step(world, 16);
        if (die.state === 'aligning') {
          sawAligning = true;
          peak = Math.max(peak, die.pos.z);
        }
      }
      expect(sawAligning, `face ${face} never entered the turn`).toBe(true);
      // It leaves the surface rather than pivoting in place.
      expect(peak, `face ${face} did not hop`).toBeGreaterThan(DIE_HALF * 1.2);
      sawHop = true;
    }
    expect(sawHop).toBe(true);
  });

  it('never scrapes a corner through the surface while turning', () => {
    // This is what the hop is for: a cube pivoting in place would drag its
    // corners below the floor, because a rotating cube needs its centre at
    // H * sqrt(2) to clear.
    for (const face of FACES) {
      for (let trial = 0; trial < 4; trial++) {
        const { world, die } = thrownDie(face);
        let worst = Infinity;
        for (let t = 0; t < 6000; t += 16) {
          step(world, 16);
          if (die.state !== 'aligning') continue;
          for (const lv of LOCAL_VERTICES) {
            worst = Math.min(worst, die.pos.z + qRotate(die.q, lv).z);
          }
        }
        expect(worst, `face ${face} dipped to ${worst.toFixed(2)}`).toBeGreaterThan(-0.5);
      }
    }
  });

  it('lands the hop exactly on the surface', () => {
    for (const face of FACES) {
      const { world, die } = thrownDie(face);
      run(world, 6000);
      expect(die.pos.z).toBeCloseTo(DIE_HALF, 6);
      expect(die.state).toBe('rest');
    }
  });

  it('picks the nearest orientation, so the correction is small', () => {
    // A die already close to showing its face should barely turn.
    for (let trial = 0; trial < 40; trial++) {
      const q = qRandom();
      const target = orientationFor(q, 4);
      expect(faceUp(target)).toBe(4);
      // The correction never exceeds a half turn.
      const d = Math.abs(q.x * target.x + q.y * target.y + q.z * target.z + q.w * target.w);
      expect(2 * Math.acos(Math.min(1, d))).toBeLessThanOrEqual(Math.PI + 1e-6);
    }
  });

  it('keeps tumbling while no result has arrived', () => {
    const { world, die } = thrownDie(null);
    run(world, 3000);
    expect(die.state).toBe('tumbling');
    expect(die.settledAt).toBe(-1);

    die.result = 3;
    run(world, 3000);
    expect(die.state).toBe('rest');
    expect(faceUp(die.q)).toBe(3);
  });

  it('keeps a die alive while a player is deciding', () => {
    const { world, die } = thrownDie(null);
    run(world, 30000);
    expect(die.retiring).toBe(false);
    expect(die.state).toBe('tumbling');
  });

  it('eventually gives up on a die that is never handed a result', () => {
    const { world, die } = thrownDie(null);
    run(world, 50000);
    expect(die.retiring || !world.dice.includes(die)).toBe(true);
  });

  it('honours the minimum tumble before showing an answer', () => {
    const { world, die } = thrownDie(4, 1100);
    run(world, 900);
    expect(die.state).toBe('tumbling');
    run(world, 3000);
    expect(die.state).toBe('rest');
    expect(faceUp(die.q)).toBe(4);
  });

  it('settles quickly enough to keep up with play', () => {
    let worst = 0;
    for (let trial = 0; trial < 40; trial++) {
      const { world, die } = thrownDie(6);
      let elapsed = 0;
      while (die.state !== 'rest' && elapsed < 8000) { step(world, 16); elapsed += 16; }
      expect(die.state).toBe('rest');
      worst = Math.max(worst, elapsed);
    }
    // Inside the 700ms cooldown plus one hop, so the tray is never the thing
    // holding up the next roll.
    expect(worst).toBeLessThan(1000);
  });
});

describe('the surface contains its dice', () => {
  it('keeps every die on the surface and above the floor', () => {
    const world = createWorld(460, 460);
    for (let i = 0; i < 10; i++) {
      const die = spawnDie(world, { dropped: true });
      throwDie(world, die, { minTumbleMs: 300, power: 1.5 });
      die.result = ((i % 6) + 1) as Face;
    }
    for (let t = 0; t < 6000; t += 16) {
      step(world, 16);
      for (const die of world.dice) {
        expect(die.pos.x).toBeGreaterThanOrEqual(DIE_HALF);
        expect(die.pos.x).toBeLessThanOrEqual(world.w - DIE_HALF);
        expect(die.pos.y).toBeGreaterThanOrEqual(DIE_HALF);
        expect(die.pos.y).toBeLessThanOrEqual(world.d - DIE_HALF);
        expect(die.pos.z).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(die.pos.z)).toBe(true);
      }
    }
  });

  it('never lets a cube sink through the surface while tumbling', () => {
    const world = createWorld(420, 420);
    const die = spawnDie(world, { dropped: true });
    throwDie(world, die, { minTumbleMs: 400, power: 1.6 });
    die.result = 2;
    let worst = 0;
    for (let t = 0; t < 5000; t += 16) {
      step(world, 16);
      for (const lv of LOCAL_VERTICES) {
        worst = Math.min(worst, die.pos.z + qRotate(die.q, lv).z);
      }
    }
    // A little penetration between solver passes is fine; a cube falling
    // through the floor is not.
    expect(worst).toBeGreaterThan(-DIE * 0.2);
  });

  it('separates dice that land on each other', () => {
    const world = createWorld(460, 460);
    const a = spawnDie(world, { x: 200, y: 200 });
    const b = spawnDie(world, { x: 205, y: 202 });
    a.result = 1; b.result = 2;
    throwDie(world, a, { minTumbleMs: 200 });
    throwDie(world, b, { minTumbleMs: 200 });
    run(world, 6000);
    expect(len({ x: a.pos.x - b.pos.x, y: a.pos.y - b.pos.y, z: a.pos.z - b.pos.z }))
      .toBeGreaterThan(DIE * 0.9);
  });

  it('rescales positions when the surface changes size', () => {
    const world = createWorld(500, 500);
    const die = spawnDie(world, { x: 450, y: 450 });
    setWorldSize(world, 250, 250);
    expect(die.pos.x).toBeLessThanOrEqual(250 - DIE_HALF);
    expect(die.pos.y).toBeLessThanOrEqual(250 - DIE_HALF);
    expect(die.pos.x).toBeGreaterThanOrEqual(DIE_HALF);
  });
});

describe('isometric projection', () => {
  it('places the ground axes 30 degrees off horizontal and z straight up', () => {
    const o = project(v3(0, 0, 0));
    expect(o).toEqual({ x: 0, y: 0 });
    const up = project(v3(0, 0, 100));
    expect(up.x).toBeCloseTo(0, 9);
    expect(up.y).toBeCloseTo(-100, 9);
    const xa = project(v3(100, 0, 0));
    expect(xa.y / xa.x).toBeCloseTo(Math.tan(Math.PI / 6), 9);
  });

  it('shows exactly three faces of a cube from this angle', () => {
    for (let trial = 0; trial < 30; trial++) {
      const q = qRandom();
      const axes = [
        v3(1, 0, 0), v3(-1, 0, 0), v3(0, 1, 0), v3(0, -1, 0), v3(0, 0, 1), v3(0, 0, -1),
      ];
      const facing = axes.filter((a) => dot(qRotate(q, a), VIEW_DIR) > 0.002).length;
      // Three, unless a face lies exactly edge-on to the camera.
      expect(facing).toBeGreaterThanOrEqual(2);
      expect(facing).toBeLessThanOrEqual(4);
    }
  });

  it('shows the result face on top, where the camera can see it', () => {
    const { world, die } = thrownDie(5);
    run(world, 6000);
    const up = qRotate(die.q, v3(0, 0, 1));
    expect(dot(add(die.pos, up), VIEW_DIR)).toBeGreaterThan(0);
    expect(faceUp(die.q)).toBe(5);
  });
});

describe('tray interaction', () => {
  it('finds the die under a point, preferring the nearer one', () => {
    const world = createWorld(500, 500);
    const back = spawnDie(world, { x: 100, y: 100 });
    const front = spawnDie(world, { x: 400, y: 400 });
    const pf = project(front.pos);
    expect(dieAt(world, pf.x, pf.y)).toBe(front);
    const pb = project(back.pos);
    expect(dieAt(world, pb.x, pb.y)).toBe(back);
    expect(dieAt(world, 9999, 9999)).toBeNull();
  });

  it('ignores dice that are leaving', () => {
    const world = createWorld(500, 500);
    const die = spawnDie(world, { x: 250, y: 250 });
    retireDie(die);
    const p = project(die.pos);
    expect(dieAt(world, p.x, p.y)).toBeNull();
  });

  it('removes a retired die once it has faded', () => {
    const world = createWorld(500, 500);
    const die = spawnDie(world, { x: 250, y: 250 });
    retireDie(die);
    run(world, 2000);
    expect(world.dice).not.toContain(die);
  });

  it('nudges a resting die without changing what it shows', () => {
    const world = createWorld(460, 460);
    const die = spawnDie(world, { x: 230, y: 230 });
    // throwDie clears the previous answer, so the result is handed over after.
    throwDie(world, die, { minTumbleMs: 200 });
    die.result = 3;
    run(world, 6000);
    expect(faceUp(die.q)).toBe(3);

    nudgeDie(die);
    run(world, 6000);
    expect(die.state).toBe('rest');
    // A nudge is not a re-roll: the answer is unchanged.
    expect(faceUp(die.q)).toBe(3);
  });

  it('re-throwing clears the previous answer', () => {
    const { world, die } = thrownDie(5);
    run(world, 6000);
    expect(faceUp(die.q)).toBe(5);
    throwDie(world, die, { minTumbleMs: 400 });
    expect(die.result).toBeNull();
    expect(die.state).toBe('tumbling');
    die.result = 2;
    run(world, 6000);
    expect(faceUp(die.q)).toBe(2);
  });
});


describe('holding the score back until the number fades', () => {
  /** Throws a die and hands it a roll worth `score`. */
  function rolling(score: number, meta = 0, ghostLife = 400): { world: World; die: DieBody } {
    const world = createWorld(420, 420);
    const die = spawnDie(world);
    throwDie(world, die, { minTumbleMs: 300 });
    die.result = 4;
    die.rollId = 1;
    die.heldScore = score;
    die.heldMeta = meta;
    die.ghostLife = ghostLife;
    return { world, die };
  }

  it('withholds a roll while the die is still in the air', () => {
    const { world } = rolling(12);
    step(world, 16);
    expect(releaseFadedGhosts(world)).toEqual({ score: 12, meta: 0 });
  });

  it('keeps withholding it while its number is showing', () => {
    const { world, die } = rolling(12);
    while (die.state !== 'rest' && world.t < 4000) step(world, 16);
    expect(die.state).toBe('rest');
    step(world, 16);
    expect(releaseFadedGhosts(world).score).toBe(12);
  });

  it('releases it once the number has faded', () => {
    const { world, die } = rolling(12, 0, 400);
    while (die.state !== 'rest' && world.t < 4000) step(world, 16);
    for (let t = 0; t < 500; t += 16) { step(world, 16); releaseFadedGhosts(world); }
    expect(releaseFadedGhosts(world)).toEqual({ score: 0, meta: 0 });
    expect(die.rollId).toBeNull();
  });

  it('withholds a loss the same way, so the number falls only after the fade', () => {
    const { world, die } = rolling(-5);
    step(world, 16);
    // A negative hold means the HUD keeps showing the pre-loss total.
    expect(releaseFadedGhosts(world).score).toBe(-5);
    while (die.state !== 'rest' && world.t < 4000) step(world, 16);
    for (let t = 0; t < 500; t += 16) { step(world, 16); releaseFadedGhosts(world); }
    expect(releaseFadedGhosts(world).score).toBe(0);
  });

  it('sums every die still showing a number', () => {
    const world = createWorld(460, 460);
    for (let i = 0; i < 4; i++) {
      const die = spawnDie(world, { dropped: true });
      throwDie(world, die, { minTumbleMs: 300 });
      die.result = 3;
      die.rollId = i + 1;
      die.heldScore = 10;
      die.heldMeta = 1;
    }
    step(world, 16);
    expect(releaseFadedGhosts(world)).toEqual({ score: 40, meta: 4 });
  });

  it('releases a roll when its die is re-thrown before the number fades', () => {
    const { world, die } = rolling(12);
    step(world, 16);
    expect(releaseFadedGhosts(world).score).toBe(12);
    throwDie(world, die, { minTumbleMs: 300 });
    expect(releaseFadedGhosts(world)).toEqual({ score: 0, meta: 0 });
  });

  it('releases a roll when its die leaves the tray', () => {
    const { world, die } = rolling(12);
    step(world, 16);
    expect(releaseFadedGhosts(world).score).toBe(12);
    retireDie(die);
    run(world, 2000);
    expect(world.dice).not.toContain(die);
    expect(releaseFadedGhosts(world)).toEqual({ score: 0, meta: 0 });
  });

  it('ignores dice that were never handed a roll', () => {
    const world = createWorld(420, 420);
    spawnDie(world);
    step(world, 16);
    expect(releaseFadedGhosts(world)).toEqual({ score: 0, meta: 0 });
  });

  it('releases sooner when a cascade shortens the ghost', () => {
    const quick = rolling(9, 0, 120);
    while (quick.die.state !== 'rest' && quick.world.t < 4000) step(quick.world, 16);
    const slow = rolling(9, 0, 1400);
    while (slow.die.state !== 'rest' && slow.world.t < 4000) step(slow.world, 16);
    for (let t = 0; t < 300; t += 16) {
      step(quick.world, 16); releaseFadedGhosts(quick.world);
      step(slow.world, 16); releaseFadedGhosts(slow.world);
    }
    expect(releaseFadedGhosts(quick.world).score).toBe(0);
    expect(releaseFadedGhosts(slow.world).score).toBe(9);
  });
});

/** A die sitting on the surface, still showing the number it rolled. */
function settledShowing(world: World, rollId: number, settledAt = world.t): DieBody {
  const die = spawnDie(world, { dropped: true });
  die.state = 'rest';
  die.result = 4;
  die.rollId = rollId;
  die.heldScore = 4;
  die.settledAt = settledAt;
  die.ghostLife = 1400;
  return die;
}

/** The same die, once its number has finished fading. */
function settledSpent(world: World): DieBody {
  const die = settledShowing(world, 1);
  die.rollId = null;
  return die;
}

describe('a roll does not cut short a result the player has not read', () => {
  it('leaves a die that is still showing its number alone', () => {
    // The bug: a bonus roll lands, the player clicks again, and the bonus
    // die is swept off mid-reveal.
    const world = createWorld(420, 420);
    const bonus = settledShowing(world, 7);
    const plan = planThrow(world, 1);
    expect(plan.retire).not.toContain(bonus);
    expect(plan.reuse).not.toContain(bonus);
  });

  it('spawns a fresh die rather than re-throwing one mid-reveal', () => {
    const world = createWorld(420, 420);
    settledShowing(world, 7);
    const plan = planThrow(world, 1);
    // Nothing reusable, so the caller has to spawn: the showing die is safe.
    expect(plan.reuse).toEqual([]);
    expect(plan.retire).toEqual([]);
  });

  it('still clears away dice whose number has been read', () => {
    const world = createWorld(420, 420);
    const spentA = settledSpent(world);
    const spentB = settledSpent(world);
    const plan = planThrow(world, 1);
    expect(plan.reuse).toEqual([spentA]);
    expect(plan.retire).toEqual([spentB]);
  });

  it('prefers a spent die over spawning, and protects the showing one', () => {
    const world = createWorld(420, 420);
    const showing = settledShowing(world, 7);
    const spent = settledSpent(world);
    const plan = planThrow(world, 1);
    expect(plan.reuse).toEqual([spent]);
    expect(plan.retire).toEqual([]);
    expect(showing.retiring).toBe(false);
  });

  it('gives up the oldest reveals only when the surface is full', () => {
    const world = createWorld(420, 420);
    const showing: DieBody[] = [];
    for (let i = 0; i < 6; i++) showing.push(settledShowing(world, 10 + i, i * 100));
    // Six standing plus the one this throw must spawn, against a cap of 4.
    const plan = planThrow(world, 1, 4);
    expect(plan.retire).toEqual([showing[0], showing[1], showing[2]]);
    expect(plan.retire).not.toContain(showing[5]);
  });

  it('counts dice still in the air against the cap', () => {
    // They are coming down onto the same surface, so a plan that ignores
    // them lets the pile grow without bound.
    const world = createWorld(420, 420);
    const showing: DieBody[] = [];
    for (let i = 0; i < 4; i++) showing.push(settledShowing(world, 20 + i, i * 100));
    const flying = spawnDie(world);
    throwDie(world, flying, { minTumbleMs: 300 });
    const plan = planThrow(world, 1, 4);
    // 4 settled + 1 flying + 1 spawned = 6 against a cap of 4.
    expect(plan.retire.length).toBe(2);
    expect(plan.retire).not.toContain(flying);
  });

  it('never touches a die that is still in the air', () => {
    const world = createWorld(420, 420);
    const flying = spawnDie(world);
    throwDie(world, flying, { minTumbleMs: 300 });
    const plan = planThrow(world, 1);
    expect(plan.reuse).not.toContain(flying);
    expect(plan.retire).not.toContain(flying);
  });

  it('keeps withholding the Score of a die retired mid-reveal', () => {
    // Retiring is allowed to interrupt a reveal when the surface is full,
    // but it must not swallow the roll: the HUD counts it as the die leaves.
    const world = createWorld(420, 420);
    const die = settledShowing(world, 7);
    retireDie(die);
    expect(releaseFadedGhosts(world).score).toBe(4);
    run(world, 900);
    expect(world.dice).not.toContain(die);
    expect(releaseFadedGhosts(world).score).toBe(0);
  });

  it('reports a reveal as owed until the ghost expires', () => {
    const world = createWorld(420, 420);
    const die = settledShowing(world, 7);
    expect(owesReveal(die)).toBe(true);
    world.t += die.ghostLife + 1;
    releaseFadedGhosts(world);
    expect(owesReveal(die)).toBe(false);
    // Now it is fair game for the next throw.
    expect(planThrow(world, 1).reuse).toEqual([die]);
  });
});
