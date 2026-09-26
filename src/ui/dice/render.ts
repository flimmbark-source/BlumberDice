import type { Face } from '../../engine/types.ts';
import {
  add, depthOf, dot, ISO_X, ISO_Y, normalize, project, qRotate, scale, v3,
  VIEW_DIR, type Vec2, type Vec3,
} from './math3d.ts';
import { DIE, DIE_HALF as H, type DieBody, type World } from './physics.ts';

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
}

export const THEME_A: Theme = {
  surface: ['#123056', '#060c18'],
  grid: 'rgba(77, 166, 255, 0.16)',
  faceLight: '#fbf6ea',
  faceShade: '#8e8878',
  edge: 'rgba(255, 252, 240, 0.55)',
  pip: '#22252b',
  accent: '#e8c05a',
  glow: 'rgba(120, 190, 255, ',
};

export const THEME_B: Theme = {
  surface: ['#0d3a3c', '#050f12'],
  grid: 'rgba(111, 211, 199, 0.16)',
  faceLight: '#eaf7f4',
  faceShade: '#779a96',
  edge: 'rgba(240, 255, 252, 0.55)',
  pip: '#16262a',
  accent: '#6fd3c7',
  glow: 'rgba(111, 211, 199, ',
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
  const glow = c.createRadialGradient(mid.x, mid.y, 8, mid.x, mid.y, outer * 1.5);
  glow.addColorStop(0, theme.surface[0]);
  glow.addColorStop(0.55, 'rgba(10, 20, 40, 0.55)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  c.fillStyle = glow;
  c.beginPath();
  ringPath(c, cx, cy, outer * 1.45);
  c.fill();

  // Four rings, brightest at the rim the dice actually bounce off.
  const rings = [0.34, 0.58, 0.79, 1];
  rings.forEach((k, i) => {
    c.beginPath();
    ringPath(c, cx, cy, outer * k);
    c.strokeStyle = theme.grid;
    c.lineWidth = i === rings.length - 1 ? 2.4 : 1.1;
    c.globalAlpha = i === rings.length - 1 ? 1 : 0.5 + i * 0.12;
    c.stroke();
  });
  c.globalAlpha = 1;

  // A wash inside the rim so dice read against something.
  c.beginPath();
  ringPath(c, cx, cy, outer);
  const inner = c.createRadialGradient(mid.x, mid.y, 4, mid.x, mid.y, outer);
  inner.addColorStop(0, 'rgba(30, 90, 170, 0.20)');
  inner.addColorStop(1, 'rgba(10, 30, 70, 0.02)');
  c.fillStyle = inner;
  c.fill();
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
 * Starfield and the shaft of light above the arena, drawn in canvas space
 * before the world transform so they sit behind everything and do not
 * scale with the zoom.
 */
const STARS: { x: number; y: number; r: number; a: number }[] = Array.from(
  { length: 90 },
  (_, i) => {
    // Deterministic: a fixed sky, not a twinkling one that churns each frame.
    const n = Math.sin(i * 127.1) * 43758.5453;
    const m = Math.sin(i * 311.7) * 24634.6345;
    return {
      x: n - Math.floor(n),
      y: m - Math.floor(m),
      r: 0.5 + ((i * 7) % 5) * 0.22,
      a: 0.18 + ((i * 13) % 9) * 0.06,
    };
  },
);

export function drawBackdrop(
  c: CanvasRenderingContext2D, w: number, h: number, theme: Theme,
): void {
  const sky = c.createRadialGradient(w / 2, h * 0.34, 10, w / 2, h * 0.34, Math.max(w, h) * 0.8);
  sky.addColorStop(0, 'rgba(18, 42, 84, 0.55)');
  sky.addColorStop(1, 'rgba(4, 8, 18, 0)');
  c.fillStyle = sky;
  c.fillRect(0, 0, w, h);

  for (const st of STARS) {
    c.globalAlpha = st.a;
    c.fillStyle = '#cfe4ff';
    c.beginPath();
    c.arc(st.x * w, st.y * h * 0.82, st.r, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;

  // The shaft of light the arena sits under. Drawn additively: over a dark
  // field a plain fill reads as a grey wedge rather than as light.
  c.globalCompositeOperation = 'lighter';
  const beam = c.createLinearGradient(w / 2, 0, w / 2, h * 0.52);
  beam.addColorStop(0, `${theme.glow}0.22)`);
  beam.addColorStop(0.5, `${theme.glow}0.07)`);
  beam.addColorStop(1, `${theme.glow}0)`);
  c.fillStyle = beam;
  c.beginPath();
  c.moveTo(w / 2 - 1.5, 0);
  c.lineTo(w / 2 + 1.5, 0);
  c.lineTo(w / 2 + 26, h * 0.5);
  c.lineTo(w / 2 - 26, h * 0.5);
  c.closePath();
  c.fill();
  c.globalCompositeOperation = 'source-over';
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

export function drawShadow(c: CanvasRenderingContext2D, die: DieBody): void {
  const verts = cubeVertices(die);
  const lift = Math.max(0, die.pos.z - H);
  const fade = Math.max(0, 1 - lift / (DIE * 5));
  const alpha = (0.62 * fade + 0.08) * die.alpha;
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
  c.fillStyle = '#000';
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
    c.lineWidth = 1.1;
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

/** The number that floats up once a die stops, plus its currency change. */
export function drawGhost(c: CanvasRenderingContext2D, die: DieBody, theme: Theme, t: number): void {
  if (die.state !== 'rest' || die.settledAt < 0 || die.result === null) return;
  const age = t - die.settledAt;
  if (age > die.ghostLife) return;

  const p = age / die.ghostLife;
  const rise = 20 + p * 52;
  const fade = p < 0.12 ? p / 0.12 : Math.max(0, 1 - (p - 0.12) / 0.88);
  const pop = p < 0.12 ? 0.78 + (p / 0.12) * 0.22 : 1;
  const anchor = project(v3(die.pos.x, die.pos.y, die.pos.z + H));

  c.save();
  c.globalAlpha = fade * 0.95 * die.alpha;
  c.translate(anchor.x, anchor.y - 30 - rise);
  c.scale(pop, pop);
  c.textAlign = 'center';
  c.textBaseline = 'middle';

  // Just the rolled value. What it was worth is the HUD's job.
  c.font = '700 50px ui-sans-serif, system-ui, sans-serif';
  c.fillStyle = 'rgba(0,0,0,0.55)';
  c.fillText(String(die.result), 0, 3);
  c.fillStyle = theme.accent;
  c.globalAlpha = fade * 0.6 * die.alpha;
  c.fillText(String(die.result), 0, 0);
  c.restore();
}

export function drawWorld(c: CanvasRenderingContext2D, world: World, theme: Theme): void {
  drawSurface(c, world, theme);
  // Shadows and landing rings all belong to the surface, so they are laid down
  // before any body; otherwise a near die's shadow paints over a far one.
  for (const die of world.dice) drawShadow(c, die);
  for (const die of world.dice) drawImpacts(c, die, theme);
  // Painter's algorithm: the camera looks along -(1,1,1), so larger x+y+z is
  // nearer and must be drawn last.
  const order = [...world.dice].sort((a, b) => depthOf(a.pos) - depthOf(b.pos));
  for (const die of order) drawDie(c, die, theme);
  for (const die of order) drawGhost(c, die, theme, world.t);
}
