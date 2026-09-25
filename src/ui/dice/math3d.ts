/** Minimal 3D maths for the dice tray: vectors, quaternions, isometric projection. */

export interface Vec3 { x: number; y: number; z: number }
export interface Quat { x: number; y: number; z: number; w: number }
export interface Vec2 { x: number; y: number }

export const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
export const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export function normalize(a: Vec3): Vec3 {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : v3(0, 0, 0);
}

// --- quaternions -----------------------------------------------------------

export const qIdentity = (): Quat => ({ x: 0, y: 0, z: 0, w: 1 });

export function qMul(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export function qNormalize(q: Quat): Quat {
  const l = Math.hypot(q.x, q.y, q.z, q.w);
  if (l < 1e-9) return qIdentity();
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}

export function qFromAxisAngle(axis: Vec3, angle: number): Quat {
  const n = normalize(axis);
  const h = angle / 2;
  const s = Math.sin(h);
  return { x: n.x * s, y: n.y * s, z: n.z * s, w: Math.cos(h) };
}

/** Rotates a vector by a unit quaternion. */
export function qRotate(q: Quat, v: Vec3): Vec3 {
  const u = v3(q.x, q.y, q.z);
  const t = scale(cross(u, v), 2);
  return add(add(v, scale(t, q.w)), cross(u, t));
}

/** Integrates orientation by an angular velocity over dt. */
export function qIntegrate(q: Quat, omega: Vec3, dt: number): Quat {
  const wq: Quat = { x: omega.x, y: omega.y, z: omega.z, w: 0 };
  const dq = qMul(wq, q);
  return qNormalize({
    x: q.x + dq.x * 0.5 * dt,
    y: q.y + dq.y * 0.5 * dt,
    z: q.z + dq.z * 0.5 * dt,
    w: q.w + dq.w * 0.5 * dt,
  });
}

/** Shortest-arc rotation taking unit vector `from` to unit vector `to`. */
export function qFromTo(from: Vec3, to: Vec3): Quat {
  const a = normalize(from);
  const b = normalize(to);
  const d = dot(a, b);
  if (d > 0.999999) return qIdentity();
  if (d < -0.999999) {
    // Opposed: any perpendicular axis gives a half turn.
    let axis = cross(v3(1, 0, 0), a);
    if (len(axis) < 1e-6) axis = cross(v3(0, 1, 0), a);
    return qFromAxisAngle(axis, Math.PI);
  }
  const c = cross(a, b);
  return qNormalize({ x: c.x, y: c.y, z: c.z, w: 1 + d });
}

export function qSlerp(a: Quat, b: Quat, t: number): Quat {
  let bx = b.x;
  let by = b.y;
  let bz = b.z;
  let bw = b.w;
  let d = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  if (d < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; d = -d; }
  if (d > 0.9995) {
    return qNormalize({
      x: a.x + (bx - a.x) * t,
      y: a.y + (by - a.y) * t,
      z: a.z + (bz - a.z) * t,
      w: a.w + (bw - a.w) * t,
    });
  }
  const theta = Math.acos(d);
  const s = Math.sin(theta);
  const k0 = Math.sin((1 - t) * theta) / s;
  const k1 = Math.sin(t * theta) / s;
  return { x: a.x * k0 + bx * k1, y: a.y * k0 + by * k1, z: a.z * k0 + bz * k1, w: a.w * k0 + bw * k1 };
}

export function qRandom(): Quat {
  // Shoemake's uniform random rotation.
  const u1 = Math.random();
  const u2 = Math.random() * Math.PI * 2;
  const u3 = Math.random() * Math.PI * 2;
  const a = Math.sqrt(1 - u1);
  const b = Math.sqrt(u1);
  return { x: a * Math.sin(u2), y: a * Math.cos(u2), z: b * Math.sin(u3), w: b * Math.cos(u3) };
}

// --- isometric projection --------------------------------------------------

/**
 * True isometric: the x and y ground axes lean 30 degrees apart and z runs
 * straight up the screen. The camera therefore looks along -(1,1,1), which is
 * also the depth key used for painter's-algorithm sorting.
 */
export const ISO_X = Math.cos(Math.PI / 6); // 0.866
export const ISO_Y = Math.sin(Math.PI / 6); // 0.5

export const project = (p: Vec3): Vec2 => ({
  x: (p.x - p.y) * ISO_X,
  y: (p.x + p.y) * ISO_Y - p.z,
});

/** Larger is nearer the camera. */
export const depthOf = (p: Vec3): number => p.x + p.y + p.z;

/** Unit vector from the scene toward the camera. */
export const VIEW_DIR: Vec3 = normalize(v3(1, 1, 1));
