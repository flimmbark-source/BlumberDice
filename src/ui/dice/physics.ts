import type { Face } from '../../engine/types.ts';

/**
 * Presentation physics for the dice tray.
 *
 * This decides nothing. The engine has already resolved every roll; a body
 * tumbles through random faces and then lands on the face it was handed. The
 * randomness in here is cosmetic and deliberately not drawn from the seeded
 * game RNG, so watching dice can never perturb a reproducible run.
 *
 * Space is a fixed logical tray (WORLD_W x WORLD_H) that the renderer scales.
 * `z` is height above the tray: the renderer lifts the die up-screen and grows
 * its shadow, which reads as depth without a 3D pipeline.
 */

/** Logical tray height. Width follows the container's aspect so nothing is cropped. */
export const WORLD_H = 600;
export const DIE = 94;
export const floorBand = (h: number): [number, number] => [h * FLOOR_TOP, h * FLOOR_BOTTOM];

const GRAVITY = 5200;
const FLOOR_BOUNCE = 0.44;
const WALL_BOUNCE = 0.56;
const AIR_DRAG = 0.4;
const FLOOR_DRAG = 3.4;
const SPIN_DRAG = 2.6;
/** On the tray, a die stops turning quickly; in the air it keeps its spin. */
const GROUND_SPIN_DRAG = 14;
const SLEEP_SPEED = 30;
const SLEEP_SPIN = 1.4;
/** However unlucky the bounces, a die stops this long after its minimum tumble. */
const SETTLE_DEADLINE = 320;
/** Dice rest in the lower band; the space above it is the throw's headroom. */
const FLOOR_TOP = 0.34;
const FLOOR_BOTTOM = 0.94;

export interface DieBody {
  key: number;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  rot: number; spin: number;
  flip: number; flipSpin: number;
  /** Face currently shown; random while tumbling, the result once settled. */
  face: Face;
  /** The engine's answer. Null while the die is still waiting for one. */
  result: Face | null;
  rollId: number | null;
  action: number;
  scoreDelta: number;
  metaDelta: number;
  isBonus: boolean;
  tumbling: boolean;
  settledAt: number;
  /** Earliest time the die is allowed to stop, so a roll always reads. */
  minTumbleUntil: number;
  bornAt: number;
  /** Fades to 0 as the die leaves the tray. */
  alpha: number;
  retiring: boolean;
  /** Impact flashes, drawn as expanding rings. */
  impacts: { t: number; strength: number }[];
  hover: boolean;
  /** Small idle bob so a resting tray still feels alive. */
  bobPhase: number;
  /** How long this die's result floats above it, in ms. */
  ghostLife: number;
}

export interface World {
  t: number;
  w: number;
  h: number;
  dice: DieBody[];
  nextKey: number;
  shake: number;
}

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
const randomFace = (): Face => (1 + Math.floor(Math.random() * 6)) as Face;

export function createWorld(w = 1000): World {
  return { t: 0, w, h: WORLD_H, dice: [], nextKey: 1, shake: 0 };
}

/** Resizes the tray, keeping every die inside it. */
export function setWorldWidth(world: World, w: number): void {
  const prev = world.w;
  world.w = w;
  if (prev > 0 && Math.abs(prev - w) > 0.5) {
    const k = w / prev;
    for (const d of world.dice) d.x = Math.min(w - DIE * 0.6, Math.max(DIE * 0.6, d.x * k));
  }
}

export function spawnDie(world: World, opts: { x?: number; y?: number; dropped?: boolean } = {}): DieBody {
  const die: DieBody = {
    key: world.nextKey++,
    x: opts.x ?? rnd(world.w * 0.22, world.w * 0.78),
    y: opts.y ?? rnd(world.h * (FLOOR_TOP + 0.12), world.h * (FLOOR_BOTTOM - 0.06)),
    z: opts.dropped ? rnd(300, 430) : 0,
    vx: 0, vy: 0, vz: 0,
    rot: rnd(-0.3, 0.3), spin: 0,
    flip: 0, flipSpin: 0,
    face: randomFace(),
    result: null,
    rollId: null,
    action: -1,
    scoreDelta: 0,
    metaDelta: 0,
    isBonus: false,
    tumbling: false,
    settledAt: -1,
    minTumbleUntil: 0,
    bornAt: world.t,
    alpha: opts.dropped ? 0 : 1,
    retiring: false,
    impacts: [],
    hover: false,
    bobPhase: Math.random() * Math.PI * 2,
    ghostLife: 1400,
  };
  world.dice.push(die);
  return die;
}

/** Launches a die into a tumble. It will not settle before `minTumbleMs`. */
export function throwDie(
  world: World,
  die: DieBody,
  opts: { minTumbleMs: number; power?: number; fromClick?: boolean } = { minTumbleMs: 600 },
): void {
  const power = opts.power ?? 1;
  die.vz = rnd(1080, 1290) * power;
  const ang = rnd(0, Math.PI * 2);
  const speed = rnd(110, 300) * power;
  die.vx = Math.cos(ang) * speed;
  die.vy = Math.sin(ang) * speed * 0.6;
  die.spin = rnd(-12, 12);
  die.flipSpin = rnd(17, 27) * (Math.random() < 0.5 ? -1 : 1);
  die.tumbling = true;
  die.result = null;
  die.rollId = null;
  die.settledAt = -1;
  die.retiring = false;
  die.alpha = 1;
  die.minTumbleUntil = world.t + opts.minTumbleMs;
  die.bornAt = world.t;
  if (opts.fromClick) {
    die.vz *= 1.12;
    world.shake = Math.min(world.shake + 3, 9);
  }
}

export function retireDie(die: DieBody): void {
  die.retiring = true;
}

function collide(a: DieBody, b: DieBody): void {
  // Height separation means they simply pass each other.
  if (Math.abs(a.z - b.z) > DIE * 0.85) return;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy);
  const min = DIE * 0.92;
  if (dist >= min || dist === 0) return;

  const nx = dx / dist;
  const ny = dy / dist;
  const overlap = (min - dist) / 2;
  a.x -= nx * overlap; a.y -= ny * overlap;
  b.x += nx * overlap; b.y += ny * overlap;

  const rvx = b.vx - a.vx;
  const rvy = b.vy - a.vy;
  const sep = rvx * nx + rvy * ny;
  if (sep > 0) return;
  const imp = -(1 + 0.5) * sep / 2;
  a.vx -= imp * nx; a.vy -= imp * ny;
  b.vx += imp * nx; b.vy += imp * ny;
  a.spin += rnd(-2.5, 2.5);
  b.spin += rnd(-2.5, 2.5);
}

export function step(world: World, dtMs: number): void {
  const dt = Math.min(dtMs, 34) / 1000;
  world.t += dtMs;
  world.shake = Math.max(0, world.shake - dtMs * 0.03);

  for (const d of world.dice) {
    if (d.alpha < 1 && !d.retiring) d.alpha = Math.min(1, d.alpha + dt * 5);
    if (d.retiring) d.alpha = Math.max(0, d.alpha - dt * 2.6);

    d.bobPhase += dt * 1.7;
    for (const im of d.impacts) im.t += dtMs;
    d.impacts = d.impacts.filter((im) => im.t < 520);

    if (!d.tumbling) {
      // Resting: ease toward the tray, keep a whisper of motion.
      d.vx *= 0.82; d.vy *= 0.82;
      d.x += d.vx * dt; d.y += d.vy * dt;
      d.spin *= 0.84;
      d.rot += d.spin * dt;
      continue;
    }

    d.vz -= GRAVITY * dt;
    d.z += d.vz * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;

    const drag = d.z > 1 ? AIR_DRAG : FLOOR_DRAG;
    const damp = Math.max(0, 1 - drag * dt);
    d.vx *= damp;
    d.vy *= damp;

    // Floor
    if (d.z <= 0) {
      d.z = 0;
      if (d.vz < -70) {
        const strength = Math.min(1, -d.vz / 1200);
        d.vz = -d.vz * FLOOR_BOUNCE;
        d.spin *= 0.7;
        d.flipSpin *= 0.62;
        d.impacts.push({ t: 0, strength });
        world.shake = Math.min(world.shake + strength * 5, 10);
      } else {
        d.vz = 0;
      }
    }

    // Walls
    const m = DIE * 0.6;
    const top = world.h * FLOOR_TOP;
    const bottom = world.h * FLOOR_BOTTOM;
    if (d.x < m) { d.x = m; d.vx = Math.abs(d.vx) * WALL_BOUNCE; d.spin += 3; }
    if (d.x > world.w - m) { d.x = world.w - m; d.vx = -Math.abs(d.vx) * WALL_BOUNCE; d.spin -= 3; }
    if (d.y < top) { d.y = top; d.vy = Math.abs(d.vy) * WALL_BOUNCE; d.spin -= 3; }
    if (d.y > bottom) { d.y = bottom; d.vy = -Math.abs(d.vy) * WALL_BOUNCE; d.spin += 3; }

    d.rot += d.spin * dt;
    const prevFlip = d.flip;
    d.flip += d.flipSpin * dt;
    const onFloor = d.z <= 0.5 && Math.abs(d.vz) < 60;
    const spinDrag = onFloor ? GROUND_SPIN_DRAG : SPIN_DRAG;
    d.spin *= Math.max(0, 1 - spinDrag * dt);
    d.flipSpin *= Math.max(0, 1 - spinDrag * 0.8 * dt);

    // Each half turn hides the face, which is where it can change.
    if (Math.floor(prevFlip / Math.PI) !== Math.floor(d.flip / Math.PI)) {
      d.face = randomFace();
    }

    const speed = Math.hypot(d.vx, d.vy);
    const restEnough = d.z <= 0.5
      && Math.abs(d.vz) < 40
      && speed < SLEEP_SPEED
      && Math.abs(d.flipSpin) < 3.6
      && Math.abs(d.spin) < SLEEP_SPIN;
    // A die that has had its time and is back on the tray stops regardless of
    // how the bounces went, so a roll never drags on.
    const overdue = d.z <= 1 && world.t > d.minTumbleUntil + SETTLE_DEADLINE;
    const canStop = restEnough || overdue;

    if (canStop && d.result !== null && world.t >= d.minTumbleUntil) {
      d.tumbling = false;
      d.settledAt = world.t;
      d.face = d.result;
      d.z = 0; d.vz = 0; d.vx = 0; d.vy = 0;
      d.flip = 0; d.flipSpin = 0;
      // Land on a lightly random tilt rather than perfectly square.
      d.rot = Math.round(d.rot / (Math.PI / 2)) * (Math.PI / 2) + rnd(-0.05, 0.05);
      d.spin = 0;
    } else if (restEnough) {
      if (world.t - d.bornAt > 45000 && d.result === null) {
        // Nothing is coming for this die. Rather than hop forever, bow out.
        // Generous, because a die keeps tumbling while a player thinks about
        // a decision, and a replacement is thrown if a result arrives later.
        d.retiring = true;
        d.tumbling = false;
      } else {
        // Waiting on a result, or on the minimum tumble: keep it alive.
        d.vz = rnd(260, 380);
        d.flipSpin = rnd(10, 16) * (Math.random() < 0.5 ? -1 : 1);
        d.spin = rnd(-5, 5);
      }
    }
  }

  for (let i = 0; i < world.dice.length; i++) {
    for (let j = i + 1; j < world.dice.length; j++) collide(world.dice[i], world.dice[j]);
  }

  // Separating overlapping dice can shove one through a wall, so the bounds
  // are enforced last rather than mid-step.
  const m = DIE * 0.6;
  const top = world.h * FLOOR_TOP;
  const bottom = world.h * FLOOR_BOTTOM;
  for (const d of world.dice) {
    d.x = Math.min(world.w - m, Math.max(m, d.x));
    d.y = Math.min(bottom, Math.max(top, d.y));
    if (d.z < 0) d.z = 0;
  }

  world.dice = world.dice.filter((d) => !(d.retiring && d.alpha <= 0));
}

/** Nudges a resting die, for a click that cannot start a roll. */
export function nudgeDie(die: DieBody): void {
  die.vx += rnd(-190, 190);
  die.vy += rnd(-120, 120);
  die.spin += rnd(-6, 6);
}

export function dieAt(world: World, x: number, y: number): DieBody | null {
  let best: DieBody | null = null;
  for (const d of world.dice) {
    if (d.retiring) continue;
    const sy = d.y - d.z * 0.55;
    if (Math.abs(x - d.x) < DIE * 0.75 && Math.abs(y - sy) < DIE * 0.75) {
      if (!best || d.z > best.z) best = d;
    }
  }
  return best;
}
