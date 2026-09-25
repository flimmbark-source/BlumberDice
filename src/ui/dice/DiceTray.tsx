import { useEffect, useRef } from 'react';
import { canRoll, displayStats, type GameState, type RollRecord } from '../../engine/game.ts';
import { actions } from '../store.ts';
import { ISO_X, ISO_Y, project, v3 } from './math3d.ts';
import {
  createWorld, dieAt, DIE, nudgeDie, retireDie, setWorldSize, spawnDie, step,
  throwDie, type DieBody, type World,
} from './physics.ts';
import { drawWorld, THEME_A, THEME_B } from './render.ts';

const MAX_DICE = 9;
/** Surface side in world units. Fixed, so the dice always read the same size. */
const SURFACE_SIDE_IN_DICE = 4.8;
/** Fraction of the canvas height kept above the surface for the throw. */
const HEADROOM = 0.34;

/** How long a die must tumble. Big cascades speed up so the tray keeps pace. */
function tumbleFor(backlog: number): number {
  if (backlog > 10) return 140;
  if (backlog > 4) return 240;
  return 400;
}

export function DiceTray({ s }: { s: GameState }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<World>(createWorld());
  const cursorRef = useRef<number>(0);
  const stateRef = useRef(s);
  stateRef.current = s;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d')!;
    const world = worldRef.current;
    let raf = 0;
    let last = performance.now();
    // Screen-space placement and zoom of the projected surface.
    let originX = 0;
    let originY = 0;
    let zoom = 1;

    const resize = (): void => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // The surface keeps a fixed size in world units so a die always reads
      // the same size relative to it; the drawing is zoomed to fit instead.
      const side = DIE * SURFACE_SIDE_IN_DICE;
      setWorldSize(world, side, side);

      // With w == d the surface projects to a diamond whose top corner is the
      // world origin: it spans x in [-side*ISO_X, +side*ISO_X] and y in
      // [0, side].
      const diamondW = 2 * ISO_X * side;
      const diamondH = 2 * ISO_Y * side;
      // Clamped: a transient zero-height measurement during a layout change
      // would otherwise make the zoom negative and leave the tray blank until
      // the next resize, which may never come.
      zoom = Math.max(0.15, Math.min(
        (rect.width - 22) / diamondW,
        ((rect.height - 18) * (1 - HEADROOM)) / diamondH,
      ));
      originX = rect.width / 2;
      originY = Math.max(diamondH * zoom * 0.1, rect.height - 12 - diamondH * zoom);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // Start the tray with the dice the current build actually rolls.
    const wanted = Math.max(1, Math.floor(displayStats(stateRef.current).handfulDice));
    for (let i = 0; i < wanted; i++) {
      const spread = (i - (wanted - 1) / 2) * DIE * 1.35;
      spawnDie(world, { x: world.w / 2 + spread, y: world.d / 2 - spread * 0.5 });
    }

    const toWorldScreen = (clientX: number, clientY: number): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left - originX) / zoom,
        y: (clientY - rect.top - originY) / zoom,
      };
    };

    // Rolls already in the log belong to a previous session; start after them.
    {
      const existing = stateRef.current.rollLog;
      cursorRef.current = existing.length > 0 ? existing[existing.length - 1].id : 0;
    }

    /** Hands a resolved roll to a die that is waiting for one. */
    const assign = (rec: RollRecord, backlog: number): void => {
      let target = world.dice.find(
        (die) => die.state === 'tumbling' && die.result === null && !die.retiring,
      );

      if (!target) {
        const live = world.dice.filter((die) => !die.retiring);
        if (live.length >= MAX_DICE) {
          // Recycle the longest-settled die rather than crowding the surface.
          const settled = live
            .filter((die) => die.state === 'rest')
            .sort((a, b) => a.settledAt - b.settledAt);
          target = settled[0] ?? live[0];
        } else {
          target = spawnDie(world, { dropped: true });
        }
        throwDie(world, target, { minTumbleMs: tumbleFor(backlog) });
      }

      target.result = rec.face;
      target.rollId = rec.id;
      target.minTumbleUntil = Math.min(target.minTumbleUntil, world.t + tumbleFor(backlog));
      // Keep a busy surface readable: results linger only while there is room.
      target.ghostLife = backlog > 8 ? 620 : backlog > 3 ? 950 : 1400;
    };

    const frame = (now: number): void => {
      const dt = Math.min(now - last, 60);
      last = now;
      const game = stateRef.current;

      const fresh = game.rollLog.filter((r) => r.id > cursorRef.current);
      if (fresh.length > 0) {
        const backlog = fresh.length + game.pending.length;
        for (const rec of fresh) assign(rec, backlog);
        cursorRef.current = fresh[fresh.length - 1].id;
      }

      step(world, dt);

      const theme = game.framework === 'A' ? THEME_A : THEME_B;
      const shake = world.shake;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.translate(
        originX + (shake ? (Math.random() - 0.5) * shake : 0),
        originY + (shake ? (Math.random() - 0.5) * shake : 0),
      );
      ctx.scale(zoom, zoom);
      drawWorld(ctx, world, theme);
      ctx.restore();

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // --- input -------------------------------------------------------------

    const onMove = (e: PointerEvent): void => {
      const p = toWorldScreen(e.clientX, e.clientY);
      const hit = dieAt(world, p.x, p.y);
      for (const die of world.dice) die.hover = die === hit;
      canvas.style.cursor = hit ? 'pointer' : 'default';
    };

    const onLeave = (): void => {
      for (const die of world.dice) die.hover = false;
    };

    const doRoll = (hit: DieBody | null): void => {
      const game = stateRef.current;
      if (!canRoll(game)) {
        // Not ready: the dice are still toys.
        if (hit) nudgeDie(hit);
        return;
      }

      const dice = Math.max(1, Math.floor(displayStats(game).handfulDice));
      const live = world.dice.filter((die) => !die.retiring && die.state !== 'tumbling');
      // Clear anything left from the previous action beyond what we re-throw.
      for (const die of live.slice(dice)) retireDie(die);

      const throwing = live.slice(0, dice);
      while (throwing.length < dice) throwing.push(spawnDie(world, { dropped: true }));
      // The die under the cursor leads, so a click reads as launching that one.
      if (hit && throwing.includes(hit)) {
        throwing.splice(throwing.indexOf(hit), 1);
        throwing.unshift(hit);
      }
      throwing.forEach((die, i) => {
        throwDie(world, die, {
          minTumbleMs: 400 + i * 70,
          fromClick: i === 0,
          power: i === 0 ? 1.05 : 1,
        });
      });

      actions.roll();
    };

    const onDown = (e: PointerEvent): void => {
      const p = toWorldScreen(e.clientX, e.clientY);
      doRoll(dieAt(world, p.x, p.y));
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'Space') return;
      if ((e.target as HTMLElement)?.closest('input,button,select,textarea')) return;
      e.preventDefault();
      doRoll(null);
    };

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const dice = Math.max(1, Math.floor(displayStats(s).handfulDice));
  const ready = canRoll(s);
  const resolving = s.pending.length > 0;

  return (
    <div className="tray" ref={wrapRef}>
      <canvas className="tray__canvas" ref={canvasRef} />
      <div className={`tray__hint${ready && s.totalRolls < 6 ? ' tray__hint--show' : ''}`}>
        {dice > 1 ? `click to throw ${dice} dice` : 'click the die to roll'}
      </div>
      {resolving && s.pending.length > 3 && (
        <div className="tray__queue">{s.pending.length} rolls resolving</div>
      )}
    </div>
  );
}

export { project, v3 };
