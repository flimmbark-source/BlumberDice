import type { RollProc } from '../../engine/game.ts';
import type { Face } from '../../engine/types.ts';
import {
  add, depthOf, dot, ISO_X, ISO_Y, normalize, project, qRotate, scale, v3,
  VIEW_DIR, type Vec2, type Vec3,
} from './math3d.ts';
import { DIE, DIE_HALF as H, type DieBody, type ResultGhost, type World } from './physics.ts';

/** Isometric painting for the dice tray. Reads the world, never changes it. */

export interface Theme {
  surface: [string, string];
  grid: string;
  faceLight: string;
  faceShade: string;
  edge: string;
  pip: string;
  accent: string;
  glow: string;
  /** Warm cast-shadow colour: the dice sit on paper, not on black. */
  shadow: string;
  /** The halo drawn behind floating text so it reads over the arena. */
  halo: string;
  /** Floating text that is not calling out a jackpot. */
  text: string;
  /** Paper speck: the tooth of the page, scattered behind the arena. */
  fleck: string;
}

/** Every number the tray paints is set in the page's own face. */
const FACE = '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';

export const THEME_A: Theme = {
  surface: ['rgba(252, 246, 228, 0.6)', 'rgba(226, 208, 166, 0.24)'],
  grid: 'rgba(122, 101, 60, 0.42)',
  faceLight: '#fdf7e6',
  faceShade: '#a8906a',
  edge: 'rgba(40, 33, 21, 0.8)',
  pip: '#221e17',
  accent: '#a8761b',
  glow: 'rgba(196, 160, 86, ',
  shadow: '#6b5730',
  halo: 'rgba(250, 243, 224, 0.95)',
  text: '#3c362a',
  fleck: '#8d7c56',
};

export const THEME_B: Theme = {
  surface: ['rgba(238, 246, 240, 0.6)', 'rgba(198, 219, 209, 0.26)'],
  grid: 'rgba(59, 123, 114, 0.4)',
  faceLight: '#f4f8f1',
  faceShade: '#8ba294',
  edge: 'rgba(24, 40, 34, 0.8)',
  pip: '#1b2b26',
  accent: '#2f6d64',
  glow: 'rgba(104, 168, 156, ',
  shadow: '#4a6258',
  halo: 'rgba(246, 250, 242, 0.95)',
  text: '#2a3a33',
  fleck: '#7d9489',
};

/** Direction the light travels. Down, and over the viewer's left shoulder. */
const LIGHT = normalize(v3(-0.45, -0.25, -1));
const AMBIENT = 0.42;

/** Pip layout in face-local coordinates, in units of the half-face. */
const PIPS: Record<Face, [number, number][]> = {
  1: [[0, 0]],
  2: [[-0.46, -0.46], [0.46, 0.46]],
  3: [[-0.46, -0.46], [0, 0], [0.46, 0.46]],
  4: [[-0.46, -0.46], [0.46, -0.46], [-0.46, 0.46], [0.46, 0.46]],
  5: [[-0.46, -0.46], [0.46, -0.46], [0, 0], [-0.46, 0.46], [0.46, 0.46]],
  6: [[-0.46, -0.5], [0.46, -0.5], [-0.46, 0], [0.46, 0], [-0.46, 0.5], [0.46, 0.5]],
};

/**
 * The six faces, each as an outward normal plus two in-plane axes. The axes
 * give a frame for placing pips, and are ordered so every face winds the same
 * way when seen from outside.
 */
interface FaceDef { value: Face; n: Vec3; u: Vec3; v: Vec3 }
const FACES: FaceDef[] = [
  { value: 1, n: v3(0, 0, 1), u: v3(1, 0, 0), v: v3(0, 1, 0) },
  { value: 6, n: v3(0, 0, -1), u: v3(1, 0, 0), v: v3(0, -1, 0) },
  { value: 2, n: v3(0, 1, 0), u: v3(1, 0, 0), v: v3(0, 0, -1) },
  { value: 5, n: v3(0, -1, 0), u: v3(1, 0, 0), v: v3(0, 0, 1) },
  { value: 3, n: v3(1, 0, 0), u: v3(0, 1, 0), v: v3(0, 0, -1) },
  { value: 4, n: v3(-1, 0, 0), u: v3(0, 1, 0), v: v3(0, 0, 1) },
];

const hexToRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16),
];

function shade(theme: Theme, amount: number): string {
  const a = hexToRgb(theme.faceShade);
  const b = hexToRgb(theme.faceLight);
  const t = Math.max(0, Math.min(1, amount));
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

function polygon(c: CanvasRenderingContext2D, pts: Vec2[]): void {
  c.beginPath();
  c.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
  c.closePath();
}

// ---------------------------------------------------------------------------
// Surface
// ---------------------------------------------------------------------------

/**
 * The arena floor: concentric rings on the ground plane rather than a slab.
 *
 * They are circles in world space, so the projection turns them into the
 * ellipses the perspective calls for without any of it being faked. The
 * dice still live in the same square the physics uses; the rings are how
 * that square is dressed.
 */
export function drawSurface(c: CanvasRenderingContext2D, world: World, theme: Theme): void {
  const { w, d } = world;
  const cx = w / 2;
  const cy = d / 2;
  const outer = Math.min(w, d) / 2;

  const mid = project(v3(cx, cy, 0));

  // The disc the dice are thrown onto: a wash of paler paper, laid down
  // first so the ink rings sit on top of it.
  c.beginPath();
  ringPath(c, cx, cy, outer);
  const wash = c.createRadialGradient(mid.x, mid.y, 4, mid.x, mid.y, outer);
  wash.addColorStop(0, theme.surface[0]);
  wash.addColorStop(1, theme.surface[1]);
  c.fillStyle = wash;
  c.fill();

  // Four rings, drawn like a compass figure: heaviest at the rim the dice
  // actually bounce off, and doubled there the way an inked rule is.
  const rings = [0.34, 0.58, 0.79, 1];
  rings.forEach((k, i) => {
    c.beginPath();
    ringPath(c, cx, cy, outer * k);
    c.strokeStyle = theme.grid;
    c.lineWidth = i === rings.length - 1 ? 2.2 : 1;
    c.globalAlpha = i === rings.length - 1 ? 1 : 0.42 + i * 0.12;
    c.stroke();
  });
  c.beginPath();
  ringPath(c, cx, cy, outer * 0.955);
  c.strokeStyle = theme.grid;
  c.lineWidth = 0.9;
  c.globalAlpha = 0.7;
  c.stroke();

  // Ticks around the rim, so the circle reads as drawn rather than printed.
  c.globalAlpha = 0.55;
  c.lineWidth = 1.2;
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    const a = project(v3(cx + Math.cos(t) * outer, cy + Math.sin(t) * outer, 0));
    const b = project(v3(cx + Math.cos(t) * outer * 1.035, cy + Math.sin(t) * outer * 1.035, 0));
    c.beginPath();
    c.moveTo(a.x, a.y);
    c.lineTo(b.x, b.y);
    c.stroke();
  }
  c.globalAlpha = 1;
}

/** A circle on the ground plane, projected. */
function ringPath(c: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const steps = 72;
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const p = project(v3(cx + Math.cos(t) * r, cy + Math.sin(t) * r, 0));
    if (i === 0) c.moveTo(p.x, p.y); else c.lineTo(p.x, p.y);
  }
  c.closePath();
}

/**
 * The tooth of the page: flecks scattered in canvas space before the world
 * transform, so they sit behind everything and do not scale with the zoom.
 */
const SPECKS: { x: number; y: number; r: number; a: number }[] = Array.from(
  { length: 110 },
  (_, i) => {
    // Deterministic: a fixed sheet of paper, not one that churns each frame.
    const n = Math.sin(i * 127.1) * 43758.5453;
    const m = Math.sin(i * 311.7) * 24634.6345;
    return {
      x: n - Math.floor(n),
      y: m - Math.floor(m),
      r: 0.6 + ((i * 7) % 5) * 0.3,
      a: 0.1 + ((i * 13) % 9) * 0.05,
    };
  },
);

export function drawBackdrop(
  c: CanvasRenderingContext2D, w: number, h: number, theme: Theme,
): void {
  // A warm bloom where the light falls, and nothing else: the arena is a
  // patch of lit page, so the illustration behind it stays readable.
  const bloom = c.createRadialGradient(w / 2, h * 0.42, 10, w / 2, h * 0.42, Math.max(w, h) * 0.62);
  bloom.addColorStop(0, `${theme.glow}0.16)`);
  bloom.addColorStop(1, `${theme.glow}0)`);
  c.fillStyle = bloom;
  c.fillRect(0, 0, w, h);

  // Flecks in the pulp. Deterministic, so the page does not shimmer.
  for (const st of SPECKS) {
    c.globalAlpha = st.a * 0.5;
    c.fillStyle = theme.fleck;
    c.beginPath();
    c.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Shadows
// ---------------------------------------------------------------------------

/** Andrew's monotone chain, for the outline of a cube's cast shadow. */
function convexHull(points: Vec2[]): Vec2[] {
  const pts = [...points].sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const half = (src: Vec2[]): Vec2[] => {
    const out: Vec2[] = [];
    for (const p of src) {
      while (out.length >= 2) {
        const o = out[out.length - 2];
        const q = out[out.length - 1];
        if ((q.x - o.x) * (p.y - o.y) - (q.y - o.y) * (p.x - o.x) > 0) break;
        out.pop();
      }
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...half(pts), ...half([...pts].reverse())];
}

function cubeVertices(die: DieBody): Vec3[] {
  return [
    v3(-H, -H, -H), v3(H, -H, -H), v3(H, H, -H), v3(-H, H, -H),
    v3(-H, -H, H), v3(H, -H, H), v3(H, H, H), v3(-H, H, H),
  ].map((lv) => add(die.pos, qRotate(die.q, lv)));
}

export function drawShadow(c: CanvasRenderingContext2D, die: DieBody, theme: Theme): void {
  const verts = cubeVertices(die);
  const lift = Math.max(0, die.pos.z - H);
  const fade = Math.max(0, 1 - lift / (DIE * 5));
  const alpha = (0.44 * fade + 0.06) * die.alpha;
  if (alpha <= 0.02) return;

  // Project each vertex down the light ray onto z = 0.
  const flat = verts.map((p) => {
    const t = p.z / -LIGHT.z;
    return project(v3(p.x + LIGHT.x * t, p.y + LIGHT.y * t, 0));
  });
  const hull = convexHull(flat);
  if (hull.length < 3) return;

  c.save();
  c.globalAlpha = alpha;
  c.filter = `blur(${Math.min(14, 1.5 + lift * 0.035)}px)`;
  polygon(c, hull);
  c.fillStyle = theme.shadow;
  c.fill();
  c.restore();
}

function drawImpacts(c: CanvasRenderingContext2D, die: DieBody, theme: Theme): void {
  for (const im of die.impacts) {
    const p = im.t / 520;
    const r = DIE * (0.25 + p * 0.95);
    const centre = project(v3(im.x, im.y, 0));
    c.save();
    c.translate(centre.x, centre.y);
    // A circle on the ground is an ellipse under this projection.
    c.scale(ISO_X, ISO_Y);
    c.strokeStyle = theme.glow + `${(1 - p) * 0.5 * im.strength})`;
    c.lineWidth = (3.5 * (1 - p) + 0.5) / ISO_Y;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }
}

// ---------------------------------------------------------------------------
// Dice
// ---------------------------------------------------------------------------

export function drawDie(c: CanvasRenderingContext2D, die: DieBody, theme: Theme): void {
  if (die.alpha <= 0) return;
  c.save();
  c.globalAlpha = die.alpha;

  if (die.hover && die.state !== 'tumbling') {
    const p = project(v3(die.pos.x, die.pos.y, 0));
    c.save();
    c.translate(p.x, p.y);
    c.scale(ISO_X, ISO_Y);
    c.strokeStyle = theme.accent;
    c.globalAlpha = 0.55 * die.alpha;
    c.lineWidth = 2 / ISO_Y;
    c.beginPath();
    c.arc(0, 0, DIE * 0.8, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }

  const visible: { def: FaceDef; n: Vec3; depth: number }[] = [];
  for (const def of FACES) {
    const n = qRotate(die.q, def.n);
    if (dot(n, VIEW_DIR) <= 0.002) continue; // facing away
    const centre = add(die.pos, scale(n, H));
    visible.push({ def, n, depth: depthOf(centre) });
  }
  visible.sort((a, b) => a.depth - b.depth);

  for (const { def, n } of visible) {
    const u = qRotate(die.q, def.u);
    const v = qRotate(die.q, def.v);
    const centre = add(die.pos, scale(n, H));
    const corners = [
      add(centre, add(scale(u, -H), scale(v, -H))),
      add(centre, add(scale(u, H), scale(v, -H))),
      add(centre, add(scale(u, H), scale(v, H))),
      add(centre, add(scale(u, -H), scale(v, H))),
    ].map(project);

    const lambert = Math.max(0, dot(n, scale(LIGHT, -1)));
    polygon(c, corners);
    c.fillStyle = shade(theme, AMBIENT + (1 - AMBIENT) * lambert);
    c.fill();
    c.strokeStyle = theme.edge;
    c.lineWidth = 1.5;
    c.stroke();

    // Pips live in the face's own frame, so the projection places them exactly.
    const o = project(add(centre, scale(n, 0.6)));
    const pu = project(add(centre, add(scale(u, H), scale(n, 0.6))));
    const pv = project(add(centre, add(scale(v, H), scale(n, 0.6))));
    const ux = { x: pu.x - o.x, y: pu.y - o.y };
    const vy = { x: pv.x - o.x, y: pv.y - o.y };
    c.save();
    c.transform(ux.x, ux.y, vy.x, vy.y, o.x, o.y);
    c.fillStyle = theme.pip;
    for (const [px, py] of PIPS[def.value]) {
      c.beginPath();
      c.arc(px, py, 0.135, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  c.restore();
}

const PROC_STEP_MS = 820;
const PROC_VISIBLE_MS = 820;

function procAt(procs: RollProc[], settledAt: number, t: number): {
  proc: RollProc;
  age: number;
} | null {
  if (procs.length === 0 || settledAt < 0) return null;
  const sinceSettle = t - settledAt;
  if (sinceSettle < 0) return null;
  const index = Math.floor(sinceSettle / PROC_STEP_MS);
  if (index < 0 || index >= procs.length) return null;
  const age = sinceSettle - index * PROC_STEP_MS;
  if (age > PROC_VISIBLE_MS) return null;
  return { proc: procs[index], age };
}

/**
 * Mechanical feedback stays attached to the result that caused it.
 *
 * Jackpot gets the strongest local punctuation: a floor pulse around the die.
 * Pattern/bonus events use the same grammar at lower intensity so the player
 * learns cause -> proc without the arena turning into a full-screen banner.
 */
function drawProcPulse(
  c: CanvasRenderingContext2D,
  pos: Vec3,
  settledAt: number,
  procs: RollProc[],
  t: number,
  alpha: number,
  theme: Theme,
): void {
  const active = procAt(procs, settledAt, t);
  if (!active) return;
  const { proc, age } = active;
  const p = Math.min(1, age / PROC_VISIBLE_MS);
  const strength = proc.kind === 'jackpot' ? 1 : proc.kind === 'pattern' ? 0.55 : 0.4;
  const centre = project(v3(pos.x, pos.y, 0));
  const radius = DIE * (0.62 + p * (proc.kind === 'jackpot' ? 1.15 : 0.72));

  c.save();
  c.translate(centre.x, centre.y);
  c.scale(ISO_X, ISO_Y);
  c.globalAlpha = Math.max(0, 1 - p) * strength * alpha;
  c.strokeStyle = proc.kind === 'jackpot' ? theme.accent : theme.edge;
  c.lineWidth = (proc.kind === 'jackpot' ? 3.2 : 1.8) / ISO_Y;
  c.beginPath();
  c.arc(0, 0, radius, 0, Math.PI * 2);
  c.stroke();

  if (proc.kind === 'jackpot') {
    c.globalAlpha *= 0.55;
    c.lineWidth = 1.4 / ISO_Y;
    c.beginPath();
    c.arc(0, 0, radius * 0.72, 0, Math.PI * 2);
    c.stroke();
  }
  c.restore();
}

function drawProcLabelScreen(
  c: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  settledAt: number,
  procs: RollProc[],
  t: number,
  alpha: number,
  theme: Theme,
): void {
  const active = procAt(procs, settledAt, t);
  if (!active) return;
  const { proc, age } = active;
  const p = Math.min(1, age / PROC_VISIBLE_MS);
  const enter = Math.min(1, p / 0.12);
  const exit = p < 0.72 ? 1 : Math.max(0, 1 - (p - 0.72) / 0.28);
  const fade = enter * exit * alpha;
  const rise = 5 + p * 14;

  c.save();
  c.translate(screenX, screenY - rise);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.globalAlpha = fade;

  c.font = proc.kind === 'jackpot' ? `700 30px ${FACE}` : `700 18px ${FACE}`;
  c.lineJoin = 'round';
  c.lineWidth = 6;
  c.strokeStyle = theme.halo;
  c.strokeText(proc.label, 0, 0);
  c.fillStyle = proc.kind === 'jackpot' ? theme.accent : theme.text;
  c.fillText(proc.label, 0, 0);

  if (proc.detail) {
    c.font = `600 13px ${FACE}`;
    c.lineWidth = 5;
    c.globalAlpha = fade * 0.95;
    c.strokeStyle = theme.halo;
    c.strokeText(proc.detail, 0, 24);
    c.fillStyle = proc.kind === 'jackpot' ? theme.accent : theme.text;
    c.fillText(proc.detail, 0, 24);
  }
  c.restore();
}

/** The number that floats up once a die stops. */
function drawGhostValue(
  c: CanvasRenderingContext2D,
  result: number,
  pos: { x: number; y: number; z: number },
  settledAt: number,
  ghostLife: number,
  alpha: number,
  theme: Theme,
  t: number,
): void {
  const age = t - settledAt;
  if (age < 0 || age > ghostLife) return;

  const p = age / ghostLife;
  const rise = 20 + p * 52;
  const fade = p < 0.12 ? p / 0.12 : Math.max(0, 1 - (p - 0.12) / 0.88);
  const pop = p < 0.12 ? 0.78 + (p / 0.12) * 0.22 : 1;
  const anchor = project(v3(pos.x, pos.y, pos.z + H));

  c.save();
  c.globalAlpha = fade * 0.95 * alpha;
  c.translate(anchor.x, anchor.y - 30 - rise);
  c.scale(pop, pop);
  c.textAlign = 'center';
  c.textBaseline = 'middle';

  c.font = `700 50px ${FACE}`;
  c.lineJoin = 'round';
  c.lineWidth = 9;
  c.strokeStyle = theme.halo;
  c.strokeText(String(result), 0, 0);
  c.fillStyle = theme.accent;
  c.fillText(String(result), 0, 0);
  c.restore();
}

export function drawGhost(c: CanvasRenderingContext2D, die: DieBody, theme: Theme, t: number): void {
  if (die.state !== 'rest' || die.settledAt < 0 || die.result === null) return;
  drawGhostValue(c, die.result, die.pos, die.settledAt, die.ghostLife, die.alpha, theme, t);
}

function drawDetachedGhost(
  c: CanvasRenderingContext2D, ghost: ResultGhost, theme: Theme, t: number,
): void {
  drawGhostValue(
    c, ghost.result, ghost.pos, ghost.settledAt, ghost.ghostLife, ghost.alpha, theme, t,
  );
}

/**
 * Everything that stands on the ground, but not the ground itself.
 *
 * The surface is painted on its own layer so the arch behind the tray can
 * come between the two: the stonework hides the circle it stands on, and
 * the dice still land in front of the stonework.
 */
export function drawWorld(c: CanvasRenderingContext2D, world: World, theme: Theme): void {
  // Shadows, landing rings and proc pulses belong with the dice that cast
  // them, so they ride this layer rather than the ground.
  for (const die of world.dice) drawShadow(c, die, theme);
  for (const die of world.dice) drawImpacts(c, die, theme);
  for (const die of world.dice) {
    if (die.state === 'rest') {
      drawProcPulse(c, die.pos, die.settledAt, die.procs, world.t, die.alpha, theme);
    }
  }
  for (const ghost of world.ghosts) {
    drawProcPulse(c, ghost.pos, ghost.settledAt, ghost.procs, world.t, ghost.alpha, theme);
  }

  // Painter's algorithm: the camera looks along -(1,1,1), so larger x+y+z is
  // nearer and must be drawn last.
  const order = [...world.dice].sort((a, b) => depthOf(a.pos) - depthOf(b.pos));
  for (const die of order) drawDie(c, die, theme);
  for (const ghost of world.ghosts) drawDetachedGhost(c, ghost, theme, world.t);
  for (const die of order) drawGhost(c, die, theme, world.t);
}

/**
 * Screen-space proc labels: anchored to dice, but never shrunk by arena zoom.
 * Call after the world transform has been restored.
 */
export function drawProcOverlay(
  c: CanvasRenderingContext2D,
  world: World,
  theme: Theme,
  originX: number,
  originY: number,
  zoom: number,
): void {
  // Result numbers own the space above the die. Mechanical proc labels own
  // the space below it, so the two feedback channels never fight for the
  // same pixels.
  for (const ghost of world.ghosts) {
    const p = project(v3(ghost.pos.x, ghost.pos.y, 0));
    drawProcLabelScreen(
      c,
      originX + p.x * zoom,
      originY + p.y * zoom + 58,
      ghost.settledAt,
      ghost.procs,
      world.t,
      ghost.alpha,
      theme,
    );
  }
  for (const die of world.dice) {
    if (die.state !== 'rest') continue;
    const p = project(v3(die.pos.x, die.pos.y, 0));
    drawProcLabelScreen(
      c,
      originX + p.x * zoom,
      originY + p.y * zoom + 58,
      die.settledAt,
      die.procs,
      world.t,
      die.alpha,
      theme,
    );
  }
}
