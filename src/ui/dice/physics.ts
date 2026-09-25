import type { Face } from '../../engine/types.ts';
import {
  add, cross, dot, len, normalize, project, qFromTo, qIntegrate, qMul, qNormalize,
  qRandom, qRotate, qSlerp, scale, sub, v3,
  type Quat, type Vec3,
} from './math3d.ts';

/**
 * Rigid-body dice on an isometric surface.
 *
 * This decides nothing. The engine has already resolved every roll; a cube
 * tumbles freely and is then eased onto the face it was handed, by the
 * shortest rotation that puts that face up. The randomness here is cosmetic
 * and deliberately not drawn from the seeded game RNG, so watching dice can
 * never perturb a reproducible run.
 *
 * Coordinates are a right-handed world with +z up. The surface is the
 * rectangle [0,w] x [0,d] at z = 0; see math3d.ts for the projection.
 */

export const DIE = 66;
const H = DIE / 2;

const GRAVITY = 4200;
const FLOOR_RESTITUTION = 0.34;
const WALL_RESTITUTION = 0.44;
const FRICTION = 0.42;
const LINEAR_DRAG = 0.5;
const ANGULAR_DRAG = 0.55;
/** Extra damping once the cube is lying on the surface, so it beds down. */
const GROUND_ANGULAR_DRAG = 3.6;
const SLEEP_SPEED = 26;
const SLEEP_SPIN = 1.5;
const SOLVER_ITERATIONS = 3;
/** Contacts shallower than this are solved but not pushed apart. */
const PENETRATION_SLOP = 0.4;
/** Below this approach speed a contact is treated as resting, not bouncing. */
const RESTITUTION_CUTOFF = 110;
/**
 * The settling hop. Free physics cannot be trusted to land on a chosen face,
 * so the last part of a roll is steered — but the cube pops off the surface
 * while it turns, which both reads as a real final bounce and lifts its
 * corners clear of the surface during the rotation.
 */
const ALIGN_MIN_MS = 190;
const ALIGN_MAX_MS = 360;
/** Samples taken along the turn to size the hop. */
const CLEARANCE_SAMPLES = 16;
const SETTLE_DEADLINE = 420;
const ORPHAN_TIMEOUT = 45000;

/** Opposite faces sum to seven. */
export const FACE_AXIS: Record<Face, Vec3> = {
  1: v3(0, 0, 1),
  6: v3(0, 0, -1),
  2: v3(0, 1, 0),
  5: v3(0, -1, 0),
  3: v3(1, 0, 0),
  4: v3(-1, 0, 0),
};

export const LOCAL_VERTICES: Vec3[] = [
  v3(-H, -H, -H), v3(H, -H, -H), v3(H, H, -H), v3(-H, H, -H),
  v3(-H, -H, H), v3(H, -H, H), v3(H, H, H), v3(-H, H, H),
];

export type DieState = 'idle' | 'tumbling' | 'aligning' | 'rest';

export interface DieBody {
  key: number;
  pos: Vec3;
  vel: Vec3;
  q: Quat;
  omega: Vec3;

  result: Face | null;
  /** The engine roll this die is showing, or null while it is still turning. */
  rollId: number | null;

  state: DieState;
  minTumbleUntil: number;
  bornAt: number;
  settledAt: number;

  alignFrom: Quat;
  alignTo: Quat;
  alignT: number;
  alignZ0: number;
  alignX0: number;
  alignY0: number;
  alignDriftX: number;
  alignDriftY: number;
  /** Apex of the hop above the straight line from start to resting height. */
  alignHop: number;
  alignMs: number;

  alpha: number;
  retiring: boolean;
  hover: boolean;
  /** Landing rings, drawn on the surface. */
  impacts: { t: number; strength: number; x: number; y: number }[];
  ghostLife: number;
}

export interface World {
  t: number;
  /** Surface extent along the two ground axes. */
  w: number;
  d: number;
  dice: DieBody[];
  nextKey: number;
  shake: number;
}

const rnd = (a: number, b: number): number => a + Math.random() * (b - a);
const INV_MASS = 1;
/** Uniform cube: the inertia tensor is a scalar, which keeps the solver short. */
const INV_INERTIA = 6 / (DIE * DIE);

export function createWorld(w = 420, d = 420): World {
  return { t: 0, w, d, dice: [], nextKey: 1, shake: 0 };
}

export function setWorldSize(world: World, w: number, d: number): void {
  const kx = world.w > 0 ? w / world.w : 1;
  const ky = world.d > 0 ? d / world.d : 1;
  world.w = w;
  world.d = d;
  for (const die of world.dice) {
    die.pos.x = Math.min(w - H, Math.max(H, die.pos.x * kx));
    die.pos.y = Math.min(d - H, Math.max(H, die.pos.y * ky));
  }
}

/** The face currently pointing up. */
export function faceUp(q: Quat): Face {
  let best: Face = 1;
  let bestZ = -Infinity;
  for (const f of [1, 2, 3, 4, 5, 6] as Face[]) {
    const z = qRotate(q, FACE_AXIS[f]).z;
    if (z > bestZ) { bestZ = z; best = f; }
  }
  return best;
}

/** Orientation nearest to `q` that puts `face` up. */
export function orientationFor(q: Quat, face: Face): Quat {
  const world = qRotate(q, FACE_AXIS[face]);
  return qNormalize(qMul(qFromTo(world, v3(0, 0, 1)), q));
}

export function spawnDie(
  world: World, opts: { x?: number; y?: number; dropped?: boolean } = {},
): DieBody {
  const die: DieBody = {
    key: world.nextKey++,
    pos: v3(
      opts.x ?? rnd(world.w * 0.25, world.w * 0.75),
      opts.y ?? rnd(world.d * 0.25, world.d * 0.75),
      opts.dropped ? rnd(DIE * 4, DIE * 6) : H,
    ),
    vel: v3(0, 0, 0),
    q: opts.dropped ? qRandom() : orientationFor(qRandom(), (1 + Math.floor(Math.random() * 6)) as Face),
    omega: v3(0, 0, 0),
    result: null,
    rollId: null,
    state: 'idle',
    minTumbleUntil: 0,
    bornAt: world.t,
    settledAt: -1,
    alignFrom: die_identity(),
    alignTo: die_identity(),
    alignT: 0,
    alignZ0: H,
    alignX0: 0,
    alignY0: 0,
    alignDriftX: 0,
    alignDriftY: 0,
    alignHop: 0,
    alignMs: ALIGN_MIN_MS,
    alpha: opts.dropped ? 0 : 1,
    retiring: false,
    hover: false,
    impacts: [],
    ghostLife: 1400,
  };
  world.dice.push(die);
  return die;
}

function die_identity(): Quat {
  return { x: 0, y: 0, z: 0, w: 1 };
}

export function throwDie(
  world: World,
  die: DieBody,
  opts: { minTumbleMs: number; power?: number; fromClick?: boolean } = { minTumbleMs: 520 },
): void {
  const power = opts.power ?? 1;
  die.vel = v3(rnd(-150, 150) * power, rnd(-150, 150) * power, rnd(880, 1080) * power);
  die.omega = v3(rnd(-15, 15), rnd(-15, 15), rnd(-15, 15));
  if (len(die.omega) < 7) die.omega = scale(normalize(die.omega), 9);
  die.state = 'tumbling';
  die.result = null;
  die.rollId = null;
  die.settledAt = -1;
  die.retiring = false;
  die.alpha = 1;
  die.minTumbleUntil = world.t + opts.minTumbleMs;
  die.bornAt = world.t;
  if (opts.fromClick) {
    die.vel.z *= 1.1;
    world.shake = Math.min(world.shake + 3, 9);
  }
}

export function retireDie(die: DieBody): void {
  die.retiring = true;
}

export function nudgeDie(die: DieBody): void {
  die.vel = add(die.vel, v3(rnd(-120, 120), rnd(-120, 120), rnd(120, 220)));
  die.omega = add(die.omega, v3(rnd(-4, 4), rnd(-4, 4), rnd(-4, 4)));
  if (die.state === 'rest' || die.state === 'idle') die.state = 'tumbling';
  // A nudge is not a roll: whatever it was showing is still its answer.
  die.minTumbleUntil = 0;
}

interface Plane { n: Vec3; c: number; restitution: number }

function planesFor(world: World): Plane[] {
  return [
    { n: v3(0, 0, 1), c: 0, restitution: FLOOR_RESTITUTION },
    { n: v3(1, 0, 0), c: 0, restitution: WALL_RESTITUTION },
    { n: v3(-1, 0, 0), c: -world.w, restitution: WALL_RESTITUTION },
    { n: v3(0, 1, 0), c: 0, restitution: WALL_RESTITUTION },
    { n: v3(0, -1, 0), c: -world.d, restitution: WALL_RESTITUTION },
  ];
}

/**
 * Velocity-only contact solve for one vertex against one plane: a normal
 * impulse plus Coulomb friction. Position is corrected separately, because
 * pushing the body out once per penetrating vertex over-corrects badly — a
 * cube resting flat has four contacts, and summing their corrections pumps
 * energy in until it never settles.
 */
function solveContactVelocity(
  die: DieBody, world: World, plane: Plane, vertex: Vec3, record: boolean,
): void {
  const p = add(die.pos, vertex);
  const dist = dot(plane.n, p) - plane.c;
  if (dist > PENETRATION_SLOP) return;

  const r = vertex;
  const pointVel = add(die.vel, cross(die.omega, r));
  const vn = dot(pointVel, plane.n);
  if (vn >= 0) return;

  // Treat a slow contact as resting, so a settled cube does not buzz.
  const e = -vn > RESTITUTION_CUTOFF ? plane.restitution : 0;
  const rn = cross(r, plane.n);
  const denom = INV_MASS + INV_INERTIA * dot(rn, rn);
  const j = (-(1 + e) * vn) / denom;
  die.vel = add(die.vel, scale(plane.n, j * INV_MASS));
  die.omega = add(die.omega, scale(cross(r, scale(plane.n, j)), INV_INERTIA));

  if (record && plane.n.z > 0.5 && -vn > 170) {
    world.shake = Math.min(world.shake + Math.min(1, -vn / 900) * 4, 10);
    die.impacts.push({ t: 0, strength: Math.min(1, -vn / 900), x: p.x, y: p.y });
  }

  const tangentVel = sub(pointVel, scale(plane.n, vn));
  const tLen = len(tangentVel);
  if (tLen < 1e-4) return;
  const tDir = scale(tangentVel, -1 / tLen);
  const rt = cross(r, tDir);
  const tDenom = INV_MASS + INV_INERTIA * dot(rt, rt);
  const jt = Math.min(tLen / tDenom, FRICTION * j);
  die.vel = add(die.vel, scale(tDir, jt * INV_MASS));
  die.omega = add(die.omega, scale(cross(r, scale(tDir, jt)), INV_INERTIA));
}

/** Pushes the body out of each plane once, by its deepest penetration. */
function correctPenetration(die: DieBody, planes: Plane[]): void {
  for (const plane of planes) {
    let deepest = 0;
    for (const lv of LOCAL_VERTICES) {
      const p = add(die.pos, qRotate(die.q, lv));
      deepest = Math.min(deepest, dot(plane.n, p) - plane.c);
    }
    if (deepest < 0) die.pos = add(die.pos, scale(plane.n, -deepest));
  }
}

function separate(a: DieBody, b: DieBody): void {
  const R = DIE * 0.62;
  const delta = sub(b.pos, a.pos);
  const dist = len(delta);
  if (dist >= R * 2 || dist < 1e-6) return;
  const n = scale(delta, 1 / dist);
  const push = (R * 2 - dist) / 2;
  a.pos = add(a.pos, scale(n, -push));
  b.pos = add(b.pos, scale(n, push));

  const rel = dot(sub(b.vel, a.vel), n);
  if (rel > 0) return;
  const j = (-(1 + 0.4) * rel) / 2;
  a.vel = add(a.vel, scale(n, -j));
  b.vel = add(b.vel, scale(n, j));
  a.omega = add(a.omega, v3(rnd(-2, 2), rnd(-2, 2), rnd(-2, 2)));
  b.omega = add(b.omega, v3(rnd(-2, 2), rnd(-2, 2), rnd(-2, 2)));
}

function lowestVertexHeight(die: DieBody): number {
  let lowest = Infinity;
  for (const lv of LOCAL_VERTICES) {
    const z = die.pos.z + qRotate(die.q, lv).z;
    if (z < lowest) lowest = z;
  }
  return lowest;
}

const easeOutQuad = (t: number): number => 1 - (1 - t) ** 2;

function beginAlign(die: DieBody, world: World): void {
  die.state = 'aligning';
  die.alignFrom = die.q;
  die.alignTo = orientationFor(die.q, die.result!);
  die.alignT = 0;
  die.alignZ0 = die.pos.z;
  die.alignX0 = die.pos.x;
  die.alignY0 = die.pos.y;

  // How far the cube still has to turn, as a fraction of a half turn.
  const d = Math.abs(
    die.alignFrom.x * die.alignTo.x + die.alignFrom.y * die.alignTo.y
    + die.alignFrom.z * die.alignTo.z + die.alignFrom.w * die.alignTo.w,
  );
  const angle = 2 * Math.acos(Math.min(1, d));
  const turn = Math.min(1, angle / Math.PI);

  // Big enough to look like a bounce, and always big enough that no corner
  // scrapes through the surface. The clearance a cube needs depends on how it
  // is tilted at each instant, and the rotation eases rather than running at
  // a constant rate, so the worst moment is not the apex — walk the actual
  // path and size the hop from it.
  const styled = H * (0.44 + 0.55 * turn);
  let needed = 0;
  for (let i = 1; i < CLEARANCE_SAMPLES; i++) {
    const t = i / CLEARANCE_SAMPLES;
    const q = qSlerp(die.alignFrom, die.alignTo, easeOutQuad(t));
    let lowest = 0;
    for (const lv of LOCAL_VERTICES) lowest = Math.min(lowest, qRotate(q, lv).z);
    const base = die.alignZ0 + (H - die.alignZ0) * t;
    const arc = 4 * t * (1 - t);
    if (arc > 1e-3) needed = Math.max(needed, (-lowest - base) / arc);
  }
  die.alignHop = Math.max(styled, needed + H * 0.08);

  // A parabola with apex `hop` above the chord has acceleration 8*hop/T^2, so
  // this airtime makes the hop fall under the same gravity as everything else.
  die.alignMs = Math.max(
    ALIGN_MIN_MS,
    Math.min(ALIGN_MAX_MS, 1000 * Math.sqrt((8 * die.alignHop) / GRAVITY)),
  );

  // Carry a little of the motion it had, so the hop continues the roll.
  const airtime = die.alignMs / 1000;
  const drift = Math.min(DIE * 0.22, len(v3(die.vel.x, die.vel.y, 0)) * airtime * 0.5);
  const flat = normalize(v3(die.vel.x, die.vel.y, 0));
  die.alignDriftX = flat.x * drift;
  die.alignDriftY = flat.y * drift;

  die.vel = v3(0, 0, 0);
  die.omega = v3(0, 0, 0);
  void world;
}

export function step(world: World, dtMs: number): void {
  const dt = Math.min(dtMs, 34) / 1000;
  world.t += dtMs;
  world.shake = Math.max(0, world.shake - dtMs * 0.03);
  const planes = planesFor(world);

  for (const die of world.dice) {
    if (die.alpha < 1 && !die.retiring) die.alpha = Math.min(1, die.alpha + dt * 5);
    if (die.retiring) die.alpha = Math.max(0, die.alpha - dt * 2.6);
    for (const im of die.impacts) im.t += dtMs;
    die.impacts = die.impacts.filter((im) => im.t < 520);

    if (die.state === 'aligning') {
      const t = Math.min(1, die.alignT + dtMs / die.alignMs);
      die.alignT = t;

      // Turn through the air, easing into the landing.
      die.q = qSlerp(die.alignFrom, die.alignTo, easeOutQuad(t));
      // Straight line from where it left the surface to its resting height,
      // plus a parabolic hop over the top.
      die.pos.z = die.alignZ0 + (H - die.alignZ0) * t + die.alignHop * 4 * t * (1 - t);
      die.pos.x = die.alignX0 + die.alignDriftX * t;
      die.pos.y = die.alignY0 + die.alignDriftY * t;

      if (t >= 1) {
        die.q = die.alignTo;
        die.pos.z = H;
        die.state = 'rest';
        die.settledAt = world.t;
        // The hop has to land like everything else does.
        const strength = Math.min(1, die.alignHop / (H * 1.1));
        die.impacts.push({ t: 0, strength, x: die.pos.x, y: die.pos.y });
        world.shake = Math.min(world.shake + strength * 3, 10);
      }
      continue;
    }

    if (die.state !== 'tumbling') continue;

    die.vel.z -= GRAVITY * dt;
    die.pos = add(die.pos, scale(die.vel, dt));
    die.q = qIntegrate(die.q, die.omega, dt);

    const grounded = lowestVertexHeight(die) < 1.5;
    const linDamp = Math.max(0, 1 - LINEAR_DRAG * dt);
    const angDamp = Math.max(0, 1 - (grounded ? GROUND_ANGULAR_DRAG : ANGULAR_DRAG) * dt);
    die.vel.x *= linDamp;
    die.vel.y *= linDamp;
    die.omega = scale(die.omega, angDamp);

    for (let iter = 0; iter < SOLVER_ITERATIONS; iter++) {
      for (const plane of planes) {
        for (const lv of LOCAL_VERTICES) {
          solveContactVelocity(die, world, plane, qRotate(die.q, lv), iter === 0);
        }
      }
    }
    correctPenetration(die, planes);

    const speed = len(die.vel);
    const spin = len(die.omega);
    const lowest = lowestVertexHeight(die);
    const calm = speed < SLEEP_SPEED && spin < SLEEP_SPIN && lowest < 2;
    const overdue = world.t > die.minTumbleUntil + SETTLE_DEADLINE && lowest < DIE * 0.9;

    if (die.result !== null && world.t >= die.minTumbleUntil && (calm || overdue)) {
      beginAlign(die, world);
    } else if (calm) {
      if (world.t - die.bornAt > ORPHAN_TIMEOUT && die.result === null) {
        // Nothing is coming for this die. Generous, because a roll suspends
        // while a player thinks, and a replacement is thrown if one arrives.
        die.retiring = true;
        die.state = 'rest';
      } else {
        // Waiting on a result, or on the minimum tumble: keep it moving.
        die.vel.z = rnd(210, 300);
        die.omega = v3(rnd(-6, 6), rnd(-6, 6), rnd(-6, 6));
      }
    }
  }

  for (let i = 0; i < world.dice.length; i++) {
    for (let j = i + 1; j < world.dice.length; j++) separate(world.dice[i], world.dice[j]);
  }

  // Separating dice can shove one through a wall, so bounds are enforced last.
  for (const die of world.dice) {
    die.pos.x = Math.min(world.w - H, Math.max(H, die.pos.x));
    die.pos.y = Math.min(world.d - H, Math.max(H, die.pos.y));
    if (die.state !== 'tumbling' && die.pos.z < H) die.pos.z = H;
    if (die.pos.z < 0) die.pos.z = 0;
  }

  world.dice = world.dice.filter((die) => !(die.retiring && die.alpha <= 0));
}

/** Frontmost die whose projected centre is near the given screen point. */
export function dieAt(world: World, sx: number, sy: number): DieBody | null {
  let best: DieBody | null = null;
  let bestDepth = -Infinity;
  for (const die of world.dice) {
    if (die.retiring) continue;
    const p = project(die.pos);
    if (Math.hypot(sx - p.x, sy - p.y) > DIE * 0.8) continue;
    const depth = die.pos.x + die.pos.y + die.pos.z;
    if (depth > bestDepth) { bestDepth = depth; best = die; }
  }
  return best;
}

export { H as DIE_HALF };
