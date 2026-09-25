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
  surface: ['#2b3543', '#111821'],
  grid: 'rgba(232, 192, 90, 0.09)',
  faceLight: '#fbf6ea',
  faceShade: '#8e8878',
  edge: 'rgba(255, 252, 240, 0.55)',
  pip: '#22252b',
  accent: '#e8c05a',
  glow: 'rgba(232, 192, 90, ',
};

export const THEME_B: Theme = {
  surface: ['#26383c', '#0e1a1d'],
  grid: 'rgba(111, 211, 199, 0.09)',
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

export function drawSurface(c: CanvasRenderingContext2D, world: World, theme: Theme): void {
  const { w, d } = world;
  const corners = [v3(0, 0, 0), v3(w, 0, 0), v3(w, d, 0), v3(0, d, 0)].map(project);

  const mid = project(v3(w / 2, d / 2, 0));
  const g = c.createRadialGradient(mid.x, mid.y, 10, mid.x, mid.y, (w + d) * 0.55);
  g.addColorStop(0, theme.surface[0]);
  g.addColorStop(1, theme.surface[1]);

  // A soft drop below the surface reads as a raised slab.
  c.save();
  c.translate(0, 13);
  polygon(c, corners);
  c.fillStyle = 'rgba(0,0,0,0.5)';
  c.fill();
  c.restore();

  polygon(c, corners);
  c.fillStyle = g;
  c.fill();

  c.save();
  polygon(c, corners);
  c.clip();
  c.strokeStyle = theme.grid;
  c.lineWidth = 1.2;
  const stepSize = DIE;
  for (let x = 0; x <= w + 0.1; x += stepSize) {
    const a = project(v3(x, 0, 0));
    const b = project(v3(x, d, 0));
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
  }
  for (let y = 0; y <= d + 0.1; y += stepSize) {
    const a = project(v3(0, y, 0));
    const b = project(v3(w, y, 0));
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
  }
  // Inner shading toward the far corner.
  const far = project(v3(0, 0, 0));
  const near = project(v3(w, d, 0));
  const lin = c.createLinearGradient(far.x, far.y, near.x, near.y);
  lin.addColorStop(0, 'rgba(0,0,0,0.45)');
  lin.addColorStop(0.55, 'rgba(0,0,0,0)');
  c.fillStyle = lin;
  polygon(c, corners);
  c.fill();
  c.restore();

  polygon(c, corners);
  c.strokeStyle = theme.glow + '0.3)';
  c.lineWidth = 1.6;
  c.stroke();
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

  c.font = '700 46px ui-sans-serif, system-ui, sans-serif';
  c.fillStyle = 'rgba(0,0,0,0.55)';
  c.fillText(String(die.result), 0, 3);
  c.fillStyle = theme.accent;
  c.globalAlpha = fade * 0.55 * die.alpha;
  c.fillText(String(die.result), 0, 0);

  // Colour follows what is being reported: in Framework B a roll gains Meta
  // and costs Score at the same time.
  let delta = '';
  let colour = theme.accent;
  if (die.metaDelta > 0) delta = `+${Math.round(die.metaDelta)}`;
  else if (die.scoreDelta > 0) delta = `+${Math.round(die.scoreDelta)}`;
  else if (die.scoreDelta < 0) { delta = String(Math.round(die.scoreDelta)); colour = '#e0685f'; }
  if (delta) {
    c.globalAlpha = fade * 0.95 * die.alpha;
    c.font = '600 20px ui-sans-serif, system-ui, sans-serif';
    c.fillStyle = colour;
    c.fillText(delta, 0, 34);
  }
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
