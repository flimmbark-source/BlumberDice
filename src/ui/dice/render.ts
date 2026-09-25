import { DIE, type DieBody, type World } from './physics.ts';
import type { Face } from '../../engine/types.ts';

/** Canvas painting for the tray. Reads the world, never changes it. */

export interface Theme {
  faceTop: string;
  faceBottom: string;
  rim: string;
  pip: string;
  accent: string;
  glow: string;
}

export const THEME_A: Theme = {
  faceTop: '#f6f1e6',
  faceBottom: '#cfc6b4',
  rim: '#fffdf7',
  pip: '#23262c',
  accent: '#e8c05a',
  glow: 'rgba(232, 192, 90, 0.5)',
};

export const THEME_B: Theme = {
  faceTop: '#e8f4f2',
  faceBottom: '#a9c6c2',
  rim: '#f6fffd',
  pip: '#1d2a2c',
  accent: '#6fd3c7',
  glow: 'rgba(111, 211, 199, 0.5)',
};

const PIPS: Record<Face, [number, number][]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

export function drawTray(c: CanvasRenderingContext2D, theme: Theme, t: number, W: number, H: number): void {
  const g = c.createRadialGradient(
    W / 2, H * 0.42, 40,
    W / 2, H * 0.5, W * 0.72,
  );
  g.addColorStop(0, '#1b222c');
  g.addColorStop(0.55, '#141a22');
  g.addColorStop(1, '#0c1016');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);

  // A slow sweep of accent light so the surface is never flat.
  const sweep = c.createRadialGradient(
    W / 2 + Math.cos(t / 4200) * 200, H * 0.34 + Math.sin(t / 5600) * 70, 30,
    W / 2, H * 0.45, W * 0.6,
  );
  sweep.addColorStop(0, theme.glow.replace(/[\d.]+\)$/, '0.09)'));
  sweep.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sweep;
  c.fillRect(0, 0, W, H);

  // Floor grid, fading outward.
  c.save();
  c.strokeStyle = 'rgba(255,255,255,0.028)';
  c.lineWidth = 1.4;
  for (let x = 0; x <= W; x += 62) {
    c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
  }
  for (let y = 0; y <= H; y += 62) {
    c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
  }
  c.restore();

  const vig = c.createRadialGradient(
    W / 2, H / 2, H * 0.25,
    W / 2, H / 2, W * 0.66,
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  c.fillStyle = vig;
  c.fillRect(0, 0, W, H);
}

function drawShadow(c: CanvasRenderingContext2D, d: DieBody): void {
  const lift = Math.min(d.z / 520, 1);
  const spread = 1 + lift * 1.5;
  const alpha = (0.42 - lift * 0.3) * d.alpha;
  if (alpha <= 0.01) return;
  c.save();
  c.translate(d.x, d.y + DIE * 0.34);
  c.scale(spread, spread * 0.36);
  const g = c.createRadialGradient(0, 0, 2, 0, 0, DIE * 0.72);
  g.addColorStop(0, `rgba(0,0,0,${alpha})`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, DIE * 0.72, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

function drawImpacts(c: CanvasRenderingContext2D, d: DieBody, theme: Theme): void {
  for (const im of d.impacts) {
    const p = im.t / 520;
    const r = DIE * (0.3 + p * 1.15);
    c.save();
    c.translate(d.x, d.y + DIE * 0.34);
    c.scale(1, 0.34);
    c.strokeStyle = theme.glow.replace(/[\d.]+\)$/, `${(1 - p) * 0.4 * im.strength})`);
    c.lineWidth = 3 * (1 - p) + 0.5;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }
}

function drawFace(c: CanvasRenderingContext2D, d: DieBody, theme: Theme, size: number): void {
  const h = size / 2;
  roundRect(c, -h, -h, size, size, size * 0.2);
  const g = c.createLinearGradient(0, -h, 0, h);
  g.addColorStop(0, theme.faceTop);
  g.addColorStop(1, theme.faceBottom);
  c.fillStyle = g;
  c.fill();

  // Rim light along the top edge.
  c.save();
  c.clip();
  c.strokeStyle = theme.rim;
  c.lineWidth = size * 0.055;
  c.globalAlpha = 0.85;
  c.beginPath();
  c.moveTo(-h, -h + size * 0.03);
  c.lineTo(h, -h + size * 0.03);
  c.stroke();
  c.globalAlpha = 1;
  c.restore();

  roundRect(c, -h, -h, size, size, size * 0.2);
  c.strokeStyle = 'rgba(0,0,0,0.22)';
  c.lineWidth = size * 0.035;
  c.stroke();

  const off = size * 0.245;
  const pr = size * 0.079;
  c.fillStyle = theme.pip;
  for (const [px, py] of PIPS[d.face]) {
    c.beginPath();
    c.arc(px * off, py * off, pr, 0, Math.PI * 2);
    c.fill();
  }
}

export function drawDie(c: CanvasRenderingContext2D, d: DieBody, theme: Theme, t: number): void {
  if (d.alpha <= 0) return;
  drawShadow(c, d);
  drawImpacts(c, d, theme);

  const bob = d.tumbling ? 0 : Math.sin(d.bobPhase) * 1.7;
  const sy = d.y - d.z * 0.55 + bob;
  const perspective = 1 + Math.min(d.z / 520, 1) * 0.2;
  const hoverLift = d.hover && !d.tumbling ? 1.06 : 1;
  // |cos| of the tumble phase reads as a face turning away from the viewer.
  const squash = d.tumbling ? Math.max(0.3, Math.abs(Math.cos(d.flip))) : 1;

  c.save();
  c.globalAlpha = d.alpha;
  c.translate(d.x, sy);
  c.rotate(d.rot);
  c.scale(squash * perspective * hoverLift, perspective * hoverLift);

  if (!d.tumbling && d.settledAt >= 0 && t - d.settledAt < 260) {
    // A brief squash-and-stretch as the result locks in.
    const p = (t - d.settledAt) / 260;
    const k = Math.sin(p * Math.PI) * 0.1;
    c.scale(1 + k, 1 - k);
  }

  drawFace(c, d, theme, DIE);
  c.restore();

  if (d.hover && !d.tumbling) {
    c.save();
    c.globalAlpha = 0.5 * d.alpha;
    c.strokeStyle = theme.accent;
    c.lineWidth = 2;
    c.translate(d.x, sy);
    c.rotate(d.rot);
    roundRect(c, -DIE * 0.62, -DIE * 0.62, DIE * 1.24, DIE * 1.24, DIE * 0.24);
    c.stroke();
    c.restore();
  }
}

/** The number that floats up once a die stops, plus its currency change. */
export function drawGhost(c: CanvasRenderingContext2D, d: DieBody, theme: Theme, t: number): void {
  if (d.tumbling || d.settledAt < 0) return;
  const age = t - d.settledAt;
  const life = d.ghostLife;
  if (age > life) return;

  const p = age / life;
  const rise = 22 + p * 54;
  const fade = p < 0.12 ? p / 0.12 : Math.max(0, 1 - (p - 0.12) / 0.88);
  const pop = p < 0.12 ? 0.75 + (p / 0.12) * 0.25 : 1;
  const sy = d.y - d.z * 0.55;

  c.save();
  c.globalAlpha = fade * 0.92 * d.alpha;
  c.translate(d.x, sy - DIE * 0.62 - rise);
  c.scale(pop, pop);
  c.textAlign = 'center';
  c.textBaseline = 'middle';

  c.font = '700 50px ui-sans-serif, system-ui, sans-serif';
  c.fillStyle = 'rgba(0,0,0,0.5)';
  c.fillText(String(d.face), 0, 3);
  c.fillStyle = theme.accent;
  c.globalAlpha = fade * 0.5 * d.alpha;
  c.fillText(String(d.face), 0, 0);

  // Colour follows what is being reported, not the sign of the other currency:
  // in Framework B a roll gains Meta and costs Score at the same time.
  let delta = '';
  let deltaColour = theme.accent;
  if (d.metaDelta > 0) {
    delta = `+${Math.round(d.metaDelta)}`;
    deltaColour = theme.accent;
  } else if (d.scoreDelta > 0) {
    delta = `+${Math.round(d.scoreDelta)}`;
    deltaColour = theme.accent;
  } else if (d.scoreDelta < 0) {
    delta = String(Math.round(d.scoreDelta));
    deltaColour = '#e0685f';
  }
  if (delta) {
    c.globalAlpha = fade * 0.95 * d.alpha;
    c.font = '600 21px ui-sans-serif, system-ui, sans-serif';
    c.fillStyle = deltaColour;
    c.fillText(delta, 0, 36);
  }
  c.restore();
}

export function drawWorld(c: CanvasRenderingContext2D, world: World, theme: Theme): void {
  drawTray(c, theme, world.t, world.w, world.h);
  const order = [...world.dice].sort((a, b) => (a.y - a.z * 0.55) - (b.y - b.z * 0.55));
  for (const d of order) drawDie(c, d, theme, world.t);
  for (const d of order) drawGhost(c, d, theme, world.t);
}
