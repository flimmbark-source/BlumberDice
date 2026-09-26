import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  canRoll, effectiveDice, type GameState, type LogEntry, type RollRecord,
} from '../../engine/game.ts';
import { prefersReducedMotion } from '../motion.ts';
import { actions, store } from '../store.ts';
import { ISO_X, ISO_Y, project, v3 } from './math3d.ts';
import {
  createWorld, dieAt, DIE, nudgeDie, planThrow, releaseFadedGhosts, retireDie, setWorldSize,
  sweepSpent,
  spawnDie, step, throwDie, type DieBody, type World,
} from './physics.ts';
import { drawBackdrop, drawWorld, THEME_A, THEME_B } from './render.ts';

const MAX_DICE = 9;
/** Surface side in world units. Fixed, so the dice always read the same size. */
const SURFACE_SIDE_IN_DICE = 4.8;
/**
 * How wide the surface has to be to hold `n` dice without them piling up.
 *
 * Bonus rolls can leave six dice lying around, and a floor built for one
 * die had them heaped over each other and out of the panel. The surface
 * grows with the dice actually in play and the drawing zooms to fit, so a
 * single die still fills the arena.
 */
function sideFor(dice: number): number {
  return DIE * Math.max(SURFACE_SIDE_IN_DICE, 2.35 * Math.sqrt(Math.max(1, dice)));
}
/**
 * Fraction of the canvas height kept above the surface for the throw.
 *
 * Reserved space, not wasted space — a thrown die uses it. But at a third
 * of a now much taller panel it was an obvious hole above the arena, and
 * the throw arc does not need to grow with the panel.
 */
const HEADROOM = 0.28;

/** How long a die must tumble. Big cascades speed up so the tray keeps pace. */
function tumbleFor(backlog: number): number {
  if (backlog > 10) return 110;
  if (backlog > 4) return 180;
  return 300;
}

export function DiceTray({ s, rollRef }: {
  s: GameState;
  /** Filled in by the tray so the Roll button throws the same dice a click does. */
  rollRef: MutableRefObject<(() => void) | null>;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<World>(createWorld());
  const cursorRef = useRef<number>(0);
  const stateRef = useRef(s);
  stateRef.current = s;
  /** Current surface width, so the frame loop can spot when it must change. */
  const sideRef = useRef(0);

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
    /** Canvas size in CSS pixels; the context is already scaled for dpr. */
    let viewW = 0;
    let viewH = 0;

    /**
     * How many dice the floor has to hold: what the next click throws, but
     * never fewer than are standing on it. A cascade can leave more dice out
     * than a click uses, and sizing only for the click heaped them up.
     */
    const neededDice = (): number => Math.max(
      effectiveDice(stateRef.current),
      world.dice.filter((die) => !die.retiring).length,
    );

    const resize = (): void => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      viewW = rect.width;
      viewH = rect.height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // The surface is sized for the dice in play; the drawing is zoomed to
      // fit, so the arena always fills the panel whatever that size is.
      const side = sideFor(neededDice());
      sideRef.current = side;
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
        (rect.width - 40) / diamondW,
        ((rect.height - 12) * (1 - HEADROOM)) / diamondH,
      ));
      originX = rect.width / 2;
      // Centre the arena in what is left, rather than dropping it to the
      // floor of the panel with all the slack piled above it.
      originY = Math.max(
        diamondH * zoom * 0.12,
        rect.height - diamondH * zoom - (rect.height - diamondH * zoom) * 0.42,
      );
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    // Start the tray with the dice the current build actually rolls.
    const wanted = effectiveDice(stateRef.current);
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
      target.heldScore = rec.score;
      target.heldMeta = rec.meta;
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

      // Re-fit the floor when the dice in play change, not only on resize.
      // Hysteresis, so a die landing and fading does not rescale every frame.
      if (Math.abs(sideFor(neededDice()) - sideRef.current) > DIE * 0.4) resize();

      step(world, dt);
      // Keep the surface to what the next throw will actually use.
      sweepSpent(world, effectiveDice(game));
      // The HUD counts a roll only once its number has faded off the die.
      store.heldBack = releaseFadedGhosts(world);

      const theme = game.framework === 'A' ? THEME_A : THEME_B;
      const shake = world.shake;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawBackdrop(ctx, viewW, viewH, theme);
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

      const dice = effectiveDice(game);
      // Dice still showing a number are left where they are: a bonus roll
      // that has just landed should not be swept away by the next click.
      const { reuse, retire } = planThrow(world, dice, MAX_DICE);
      for (const die of retire) retireDie(die);

      const throwing = [...reuse];
      while (throwing.length < dice) throwing.push(spawnDie(world, { dropped: true }));
      // The die under the cursor leads, so a click reads as launching that one.
      if (hit && throwing.includes(hit)) {
        throwing.splice(throwing.indexOf(hit), 1);
        throwing.unshift(hit);
      }
      const calm = prefersReducedMotion();
      throwing.forEach((die, i) => {
        throwDie(world, die, {
          // Reduced motion keeps the throw but drops the long tumble: the die
          // is steered onto its face as soon as the physics allows.
          minTumbleMs: calm ? 0 : 300 + i * 70,
          fromClick: i === 0,
          power: calm ? 0.45 : i === 0 ? 1.05 : 1,
        });
      });

      actions.roll();
    };

    rollRef.current = () => doRoll(null);

    const onDown = (e: PointerEvent): void => {
      const p = toWorldScreen(e.clientX, e.clientY);
      doRoll(dieAt(world, p.x, p.y));
    };

    const onKey = (e: KeyboardEvent): void => {
      if (e.code !== 'Space') return;
      // Anything focusable owns its own Space: the passive web's nodes are
      // activated with it, and they are not <button> elements.
      if ((e.target as HTMLElement)?.closest(
        'input,button,select,textarea,[role="button"],[tabindex]',
      )) return;
      e.preventDefault();
      doRoll(null);
    };

    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);

    return () => {
      cancelAnimationFrame(raf);
      // Nothing is left to reveal once the tray is gone.
      store.heldBack = { score: 0, meta: 0 };
      ro.disconnect();
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const dice = effectiveDice(s);
  const ready = canRoll(s);
  const resolving = s.pending.length > 0;

  return (
    <div className="tray" ref={wrapRef}>
      <canvas className="tray__canvas" ref={canvasRef} aria-hidden />
      <div className={`tray__hint${ready && s.totalRolls < 6 ? ' tray__hint--show' : ''}`}>
        {dice > 1 ? `click to throw ${dice} dice` : 'click the die to roll'}
        <span className="tray__hintKey"> · or press Space</span>
      </div>
      {resolving && s.pending.length > 3 && (
        <div className="tray__queue">{s.pending.length} rolls resolving</div>
      )}
      <ProcVisuals log={s.log} />
    </div>
  );
}

type ProcVisual = {
  id: number;
  kind: 'jackpot' | 'pattern' | 'bonus';
  title: string;
  detail: string;
};

function visualFor(entry: LogEntry): ProcVisual | null {
  if (entry.kind === 'jackpot') {
    if (entry.text.startsWith('Jackpot ')) {
      return {
        id: entry.id,
        kind: 'jackpot',
        title: 'JACKPOT',
        detail: entry.text.slice('Jackpot '.length),
      };
    }
    if (entry.text.startsWith('Ride paid ')) {
      return {
        id: entry.id,
        kind: 'jackpot',
        title: 'RIDE HIT',
        detail: entry.text.slice('Ride paid '.length),
      };
    }
    // "Riding..." and wager bookkeeping are states/results, not the headline
    // event itself, so they stay in the Log without stealing the screen.
    return null;
  }

  if (entry.kind === 'pattern') {
    return { id: entry.id, kind: 'pattern', title: 'PATTERN', detail: entry.text };
  }

  if (entry.kind === 'bonus') {
    return { id: entry.id, kind: 'bonus', title: 'BONUS ROLL', detail: entry.text };
  }

  return null;
}

/**
 * Big game events belong in the arena, not only in the text log.
 *
 * The engine log is the source of truth; this layer is presentation only.
 * Events queue rather than overwrite each other during a cascade.
 */
function ProcVisuals({ log }: { log: LogEntry[] }): JSX.Element | null {
  const newestId = log.length > 0 ? log[log.length - 1].id : 0;
  const seen = useRef(newestId);
  const queue = useRef<ProcVisual[]>([]);
  const [active, setActive] = useState<ProcVisual | null>(null);

  useEffect(() => {
    if (newestId <= seen.current) return;
    const fresh = log.filter((entry) => entry.id > seen.current);
    seen.current = newestId;
    const visuals = fresh.map(visualFor).filter((v): v is ProcVisual => v !== null);
    if (visuals.length === 0) return;
    queue.current.push(...visuals);
    setActive((current) => current ?? queue.current.shift() ?? null);
  }, [newestId, log]);

  useEffect(() => {
    if (!active) return;
    const ms = active.kind === 'jackpot' ? 1750 : 1100;
    const timer = window.setTimeout(() => {
      setActive(queue.current.shift() ?? null);
    }, ms);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (!active) return null;

  return (
    <div className="tray__procLayer" aria-live="polite" aria-atomic="true">
      <div key={active.id} className={`tray__proc tray__proc--${active.kind}`}>
        <span className="tray__procTitle">{active.title}</span>
        <span className="tray__procDetail">{active.detail}</span>
      </div>
    </div>
  );
}

export { project, v3 };
