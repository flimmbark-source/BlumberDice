import { useEffect, useRef } from 'react';
import { canRoll, displayStats, getBuild, type GameState, type RollRecord } from '../../engine/game.ts';
import { actions } from '../store.ts';
import {
  createWorld, dieAt, DIE, nudgeDie, retireDie, setWorldWidth, spawnDie, step,
  throwDie, WORLD_H, type DieBody, type World,
} from './physics.ts';
import { drawWorld, THEME_A, THEME_B } from './render.ts';

const MAX_DICE = 12;

/** How long a die must tumble. Big cascades speed up so the tray keeps pace. */
function tumbleFor(backlog: number): number {
  if (backlog > 10) return 170;
  if (backlog > 4) return 300;
  return 480;
}

export function DiceTray({ s }: { s: GameState }): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<World>(createWorld());
  const cursorRef = useRef<number>(-1);
  const stateRef = useRef(s);
  stateRef.current = s;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d')!;
    const world = worldRef.current;
    let raf = 0;
    let last = performance.now();
    let scale = 1;
    let offX = 0;
    let offY = 0;

    const resize = (): void => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      // Fixed logical height, width follows the container, so the tray fills
      // the panel at any shape and nothing is ever cropped.
      scale = rect.height / WORLD_H;
      setWorldWidth(world, Math.max(420, rect.width / Math.max(scale, 0.0001)));
      offX = 0;
      offY = 0;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // Start the tray with the dice the current build actually rolls.
    const wanted = Math.max(1, Math.floor(displayStats(stateRef.current).handfulDice));
    for (let i = 0; i < wanted; i++) {
      spawnDie(world, {
        x: world.w / 2 + (i - (wanted - 1) / 2) * DIE * 1.5,
        y: world.h * 0.62,
      });
    }
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const toWorld = (clientX: number, clientY: number): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left - offX) / scale,
        y: (clientY - rect.top - offY) / scale,
      };
    };

    /** Hands a resolved roll to a die that is waiting for one. */
    const assign = (rec: RollRecord, backlog: number): void => {
      let target = world.dice.find((d) => d.tumbling && d.result === null && !d.retiring);

      if (!target) {
        const live = world.dice.filter((d) => !d.retiring);
        if (live.length >= MAX_DICE) {
          // Recycle the longest-settled die rather than crowding the tray.
          const settled = live.filter((d) => !d.tumbling).sort((a, b) => a.settledAt - b.settledAt);
          target = settled[0] ?? live[0];
        } else {
          target = spawnDie(world, { dropped: true });
        }
        throwDie(world, target, { minTumbleMs: tumbleFor(backlog) });
      }

      target.result = rec.face;
      target.rollId = rec.id;
      target.action = rec.action;
      target.scoreDelta = rec.score;
      target.metaDelta = rec.meta;
      target.isBonus = rec.isBonus;
      target.minTumbleUntil = Math.min(target.minTumbleUntil, world.t + tumbleFor(backlog));
      // Keep a busy tray readable: results linger only while there is room.
      target.ghostLife = backlog > 8 ? 620 : backlog > 3 ? 950 : 1400;
    };

    // Rolls already in the log belong to a previous session; start after them.
    {
      const existing = stateRef.current.rollLog;
      cursorRef.current = existing.length > 0 ? existing[existing.length - 1].id : 0;
    }

    const frame = (now: number): void => {
      const dt = Math.min(now - last, 60);
      last = now;
      const game = stateRef.current;

      // Drain newly resolved rolls.
      const log = game.rollLog;
      const fresh = log.filter((r) => r.id > cursorRef.current);
      if (fresh.length > 0) {
        const backlog = fresh.length + game.pending.length;
        for (const rec of fresh) assign(rec, backlog);
        cursorRef.current = fresh[fresh.length - 1].id;
      }

      step(world, dt);

      const theme = game.framework === 'A' ? THEME_A : THEME_B;
      ctx.save();
      const shake = world.shake;
      ctx.translate(
        offX + (shake ? (Math.random() - 0.5) * shake : 0),
        offY + (shake ? (Math.random() - 0.5) * shake : 0),
      );
      ctx.scale(scale, scale);
      ctx.beginPath();
      ctx.rect(0, 0, world.w, world.h);
      ctx.clip();
      drawWorld(ctx, world, theme);
      ctx.restore();

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    // --- input -------------------------------------------------------------

    const onMove = (e: PointerEvent): void => {
      const p = toWorld(e.clientX, e.clientY);
      const hit = dieAt(world, p.x, p.y);
      for (const d of world.dice) d.hover = d === hit;
      canvas.style.cursor = hit ? 'pointer' : 'default';
    };

    const onLeave = (): void => {
      for (const d of world.dice) d.hover = false;
    };

    const doRoll = (hit: DieBody | null): void => {
      const game = stateRef.current;
      if (!canRoll(game)) {
        // Not ready: the dice are still toys.
        if (hit) nudgeDie(hit);
        return;
      }

      const dice = Math.max(1, Math.floor(displayStats(game).handfulDice));
      const live = world.dice.filter((d) => !d.retiring && !d.tumbling);
      // Clear anything left from the previous action beyond what we re-throw.
      for (const d of live.slice(dice)) retireDie(d);

      const throwing = live.slice(0, dice);
      while (throwing.length < dice) {
        throwing.push(spawnDie(world, { dropped: true }));
      }
      // The die under the cursor leads, so a click reads as launching that one.
      if (hit && throwing.includes(hit)) {
        throwing.splice(throwing.indexOf(hit), 1);
        throwing.unshift(hit);
      }
      throwing.forEach((d, i) => {
        d.result = null;
        d.rollId = null;
        d.settledAt = -1;
        throwDie(world, d, {
          minTumbleMs: 480 + i * 70,
          fromClick: i === 0,
          power: i === 0 ? 1.05 : 1,
        });
      });

      actions.roll();
    };

    const onDown = (e: PointerEvent): void => {
      const p = toWorld(e.clientX, e.clientY);
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

  const build = getBuild(s);
  const stats = displayStats(s, build);
  const dice = Math.max(1, Math.floor(stats.handfulDice));
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

export type { DieBody };
