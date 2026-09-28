import { useEffect, useRef, type MutableRefObject } from 'react';
import {
  canRoll, effectiveDice, type GameState, type RollRecord,
} from '../../engine/game.ts';
import { prefersReducedMotion } from '../motion.ts';
import { touchPrimary } from '../pointer.ts';
import { actions, store } from '../store.ts';
import { ISO_X, ISO_Y, project, v3 } from './math3d.ts';
import {
  createWorld, dieAt, DIE, nudgeDie, planThrow, releaseFadedGhosts, retireDie, setWorldSize,
  sweepSpent,
  spawnDie, step, throwDie, zapDie, zapTarget, type DieBody, type World,
} from './physics.ts';
import {
  drawBackdrop, drawProcOverlay, drawSurface, drawWorld, THEME_A, THEME_B,
} from './render.ts';

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

export function DiceTray({ s, rollRef, resizeRef, glassRef, sealed, immersed, onSealed }: {
  s: GameState;
  /** Filled in by the tray so the Roll button throws the same dice a click does. */
  rollRef: MutableRefObject<(() => void) | null>;
  /**
   * Filled in by the tray so the view can ask it to re-measure. A CSS
   * transform on an ancestor changes nothing about layout, so a scaled-up
   * chamber would keep its old backing store and go soft; nothing else can
   * tell the tray that has happened.
   */
  resizeRef?: MutableRefObject<(() => void) | null>;
  /**
   * The glass itself, for the view to drive into. The bezel around it
   * belongs to the faceplate, not to the roll area, so filling the window
   * with the arena leaves a sliver of plate down two edges.
   */
  glassRef?: MutableRefObject<HTMLDivElement | null>;
  /**
   * True while the chamber is shut — the Plan phase. The dice are still
   * shown and still settle, but a throw is not the tray's to make.
   */
  sealed?: boolean;
  /** True while crossing or inside the screen; removes the tray-local CRT backdrop. */
  immersed?: boolean;
  /** What a throw means instead, while sealed. */
  onSealed?: () => void;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** The chamber floor, on its own layer beneath the dice. */
  const groundRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const worldRef = useRef<World>(createWorld());
  const cursorRef = useRef<number>(0);
  /** Bonus dice the engine had already destroyed when the tray last looked. */
  const lapseRef = useRef<number>(0);
  const stateRef = useRef(s);
  stateRef.current = s;
  const sealedRef = useRef(false);
  sealedRef.current = Boolean(sealed);
  const immersedRef = useRef(false);
  immersedRef.current = Boolean(immersed);
  const onSealedRef = useRef<(() => void) | undefined>(undefined);
  onSealedRef.current = onSealed;
  /** Current surface width, so the frame loop can spot when it must change. */
  const sideRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ground = groundRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d')!;
    const gctx = ground.getContext('2d')!;
    const world = worldRef.current;
    let raf = 0;
    let last = performance.now();
    const mobile = touchPrimary();
    const activeFrameMs = mobile ? 1000 / 30 : 0;
    const idleFrameMs = mobile ? 1000 / 20 : 0;
    let groundDirty = true;
    let groundFramework: 'A' | 'B' | null = null;
    let groundWasShaking = false;
    let groundImmersed: boolean | null = null;

    // A normal player roll must reuse the physical dice already on the
    // surface. The engine cooldown can finish a few frames before a die's
    // visual settle does; during that gap we queue the click instead of
    // manufacturing a replacement cube.
    let queuedRoll: { hitKey: number | null } | null = null;
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
      // Layout size, not the measured rect.
      //
      // The photo skin lays the whole face out at its true pixel size and
      // then scales it as one object, so `getBoundingClientRect()` here
      // returns the *scaled* size. Writing that back as a CSS px size applies
      // the stage's scale a second time: the canvas ends up at k squared of
      // the tray, anchored top-left, which is why the arena sat small and up
      // in the corner. `clientWidth` is the layout box and is not affected by
      // an ancestor transform, so it is the one that survives being scaled.
      //
      // The canvases carry no inline CSS size at all now — the stylesheet
      // already stretches them over the tray — so only the backing store is
      // set here, and it stays correct under any transform.
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      // How much an ancestor is scaling this element on screen. Driving into
      // the chamber magnifies it several times over, and a backing store
      // sized for the layout box alone would be that many times too coarse.
      const view = w > 0 ? wrap.getBoundingClientRect().width / w : 1;
      // High-DPI phone screens can turn the two tray canvases into several
      // million pixels each. The chamber is moving content, so a modest
      // mobile backing-store cap buys a large fill-rate reduction with little
      // perceptual loss; desktop keeps the existing 3x ceiling.
      const dpr = Math.min((window.devicePixelRatio || 1) * view, mobile ? 1.75 : 3);
      for (const el of [canvas, ground]) {
        el.width = Math.max(1, Math.round(w * dpr));
        el.height = Math.max(1, Math.round(h * dpr));
      }
      viewW = w;
      viewH = h;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      gctx.setTransform(dpr, 0, 0, dpr, 0, 0);

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
        (w - 40) / diamondW,
        ((h - 12) * (1 - HEADROOM)) / diamondH,
      ));
      originX = w / 2;
      // Centre the arena in what is left, rather than dropping it to the
      // floor of the panel with all the slack piled above it.
      originY = Math.max(
        diamondH * zoom * 0.12,
        h - diamondH * zoom - (h - diamondH * zoom) * 0.42,
      );

      // The arena publishes its own ground plane: `--arena-back` is the far
      // corner of the projected diamond, which is the back rim of the circle
      // the surface is drawn as, and `--arena-depth` is how deep that circle
      // runs to its near rim. Nothing in the faceplate skin reads them, but
      // they are what lets a DOM element stand on the ground the canvas
      // actually drew rather than on a percentage guessing at it -- which is
      // what the arch in `ui/Ornaments.tsx` was built against.
      const arena = wrap.parentElement;
      if (arena) {
        arena.style.setProperty('--arena-back', `${originY}px`);
        arena.style.setProperty('--arena-depth', `${diamondH * zoom}px`);
      }
      groundDirty = true;
    };
    resize();
    if (resizeRef) resizeRef.current = resize;
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
      // Pointer events arrive in visual coordinates while the projection is
      // in layout ones, so under a scaled stage the two disagree by exactly
      // that scale. Deriving it from the element itself needs no knowledge of
      // which skin is mounted.
      const k = canvas.clientWidth > 0 ? rect.width / canvas.clientWidth : 1;
      return {
        x: ((clientX - rect.left) / k - originX) / zoom,
        y: ((clientY - rect.top) / k - originY) / zoom,
      };
    };

    // Rolls already in the log belong to a previous session; start after them.
    {
      const existing = stateRef.current.rollLog;
      cursorRef.current = existing.length > 0 ? existing[existing.length - 1].id : 0;
      lapseRef.current = stateRef.current.bonusLapses;
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
      target.procs = rec.procs?.slice() ?? [];
      target.minTumbleUntil = Math.min(target.minTumbleUntil, world.t + tumbleFor(backlog));
      // Keep a busy surface readable, but never truncate a mechanical proc:
      // those labels teach the player why the build fired.
      const baseGhostLife = backlog > 8 ? 620 : backlog > 3 ? 950 : 1400;
      const procLife = target.procs.length > 0 ? target.procs.length * 820 : 0;
      target.ghostLife = Math.max(baseGhostLife, procLife);
    };

    const frame = (now: number): void => {
      const game = stateRef.current;
      const newestRollId = game.rollLog.length > 0
        ? game.rollLog[game.rollLog.length - 1].id
        : 0;
      const visuallyBusy = newestRollId > cursorRef.current
        || game.pending.length > 0
        || game.bonusLapses > lapseRef.current
        || world.shake > 0.01
        || world.ghosts.length > 0
        || world.dice.some((die) => (
          die.state === 'tumbling'
          || die.state === 'aligning'
          || die.retiring
          || die.zapAt !== null
          || die.rollId !== null
          || die.alpha < 0.999
          || die.impacts.length > 0
        ));
      const minFrameMs = visuallyBusy ? activeFrameMs : idleFrameMs;
      if (minFrameMs > 0 && now - last < minFrameMs) {
        raf = requestAnimationFrame(frame);
        return;
      }

      const dt = Math.min(now - last, 60);
      last = now;

      const fresh = game.rollLog.filter((r) => r.id > cursorRef.current);
      if (fresh.length > 0) {
        const backlog = fresh.length + game.pending.length;
        for (const rec of fresh) assign(rec, backlog);
        cursorRef.current = fresh[fresh.length - 1].id;
      }

      // A bonus die that ran out of time is destroyed where it lies, whatever
      // else is happening on the surface. The engine counts them; the tray
      // owes one beam each.
      if (game.bonusLapses > lapseRef.current) {
        for (let i = lapseRef.current; i < game.bonusLapses; i++) {
          const doomed = zapTarget(world);
          if (doomed) zapDie(world, doomed);
        }
        lapseRef.current = game.bonusLapses;
      }

      // Re-fit the floor when the dice in play change, not only on resize.
      // Hysteresis, so a die landing and fading does not rescale every frame.
      if (Math.abs(sideFor(neededDice()) - sideRef.current) > DIE * 0.4) resize();

      step(world, dt);
      // Keep the surface to what the next throw will actually use.
      sweepSpent(world, effectiveDice(game));

      // And keep it up to that number as well as down to it. A bonus roll
      // puts a die on the clock the moment it is granted, so one appears on
      // the surface to roll alongside yours -- which is also what the beam
      // has to destroy when that clock runs out. Without this the tray only
      // ever materialised a bonus die when a roll was handed to it, and the
      // beam had nothing to take but the die the player rolls with.
      {
        const want = effectiveDice(game);
        let live = 0;
        for (const die of world.dice) if (!die.retiring && die.zapAt === null) live++;
        while (live < want && world.dice.length < MAX_DICE) {
          // This is capacity maintenance, not a player roll: a genuinely
          // granted extra die should appear. A normal click never comes
          // through this path merely because its existing die is still busy.
          throwDie(world, spawnDie(world, { dropped: true }), { minTumbleMs: 260 });
          live++;
        }
      }

      // Finish a queued player roll on the same physical dice as soon as the
      // previous visual settle is done. The engine action is intentionally
      // delayed with the visual throw, preventing double clicks from creating
      // multiple pending rolls while we wait.
      if (queuedRoll && canRoll(game)) {
        const dice = effectiveDice(game);
        const { reuse } = planThrow(world, dice, MAX_DICE);
        if (reuse.length >= dice || !hasBusyPhysicalDie()) {
          const hit = queuedRoll.hitKey === null
            ? null
            : world.dice.find((die) => die.key === queuedRoll!.hitKey) ?? null;
          queuedRoll = null;
          performRoll(hit);
        }
      }

      // The HUD counts a roll only once its number has faded off the die.
      store.heldBack = releaseFadedGhosts(world);

      const theme = game.framework === 'A' ? THEME_A : THEME_B;
      // One jolt, shared by both layers, so the ground and the dice on it
      // never come apart while the tray is shaking.
      const shake = world.shake;
      const shakeX = shake ? (Math.random() - 0.5) * shake : 0;
      const shakeY = shake ? (Math.random() - 0.5) * shake : 0;

      // The backdrop and arena floor are static. Repainting their gradients,
      // grain and ring geometry every frame was pure fill-rate/CPU work.
      // During shake they still redraw in lockstep with the dice, followed by
      // one clean unshifted frame when the shake ends.
      const shaking = shake > 0.01;
      const immersedNow = immersedRef.current;
      if (
        groundDirty
        || groundFramework !== game.framework
        || groundImmersed !== immersedNow
        || shaking
        || groundWasShaking
      ) {
        gctx.clearRect(0, 0, viewW, viewH);
        // Outside the passage, the tray is a CRT with its own phosphor
        // backdrop. While crossing or inside it, the viewport-level Roll field
        // supplies that backdrop so no rectangle reappears during the return.
        if (!immersedNow) drawBackdrop(gctx, viewW, viewH, theme);
        gctx.save();
        gctx.translate(originX + shakeX, originY + shakeY);
        gctx.scale(zoom, zoom);
        drawSurface(gctx, world, theme);
        gctx.restore();
        groundDirty = false;
        groundFramework = game.framework;
        groundImmersed = immersedNow;
        groundWasShaking = shaking;
      }

      ctx.clearRect(0, 0, viewW, viewH);
      ctx.save();
      ctx.translate(originX + shakeX, originY + shakeY);
      ctx.scale(zoom, zoom);
      drawWorld(ctx, world, theme);
      ctx.restore();
      drawProcOverlay(ctx, world, theme, originX, originY, zoom);

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

    const hasBusyPhysicalDie = (): boolean => world.dice.some(
      (die) => !die.retiring && die.zapAt === null
        && die.state !== 'rest' && die.state !== 'idle',
    );

    const performRoll = (hit: DieBody | null): void => {
      const game = stateRef.current;
      const dice = effectiveDice(game);
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
          minTumbleMs: calm ? 0 : 300 + i * 70,
          fromClick: i === 0,
          power: calm ? 0.45 : i === 0 ? 1.05 : 1,
        });
      });

      actions.roll();
    };

    const doRoll = (hit: DieBody | null): void => {
      const game = stateRef.current;
      if (!canRoll(game)) {
        // Not ready: the dice are still toys.
        if (hit) nudgeDie(hit);
        return;
      }
      if (queuedRoll) return;

      const dice = effectiveDice(game);
      const { reuse } = planThrow(world, dice, MAX_DICE);

      // If a physical die already exists but is only finishing its previous
      // tumble/alignment, wait for it. Spawning here is the intermittent
      // "second die" misfire: the mechanical roll count has not changed.
      if (reuse.length < dice && hasBusyPhysicalDie()) {
        queuedRoll = { hitKey: hit?.key ?? null };
        return;
      }

      performRoll(hit);
    };

    rollRef.current = () => {
      if (sealedRef.current) { onSealedRef.current?.(); return; }
      doRoll(null);
    };

    const onDown = (e: PointerEvent): void => {
      if (sealedRef.current) { onSealedRef.current?.(); return; }
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
      if (sealedRef.current) { onSealedRef.current?.(); return; }
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
  const touch = touchPrimary();

  return (
    <div
      className="tray"
      ref={(el) => {
        wrapRef.current = el;
        if (glassRef) glassRef.current = el;
      }}
    >
      <canvas className="tray__canvas tray__canvas--ground" ref={groundRef} aria-hidden />
      <canvas className="tray__canvas tray__canvas--dice" ref={canvasRef} aria-hidden />

      {/* Instrument telemetry printed on the glass. Every figure here is
          state the game already shows elsewhere -- what the button throws,
          how many rolls have happened, and the generator the run is
          reproducible from. It reports; it decides nothing. */}
      <div className="tray__readout" aria-hidden>
        <span className={`tray__status${ready ? '' : ' tray__status--wait'}`}>
          {resolving ? 'Resolving…' : ready ? 'Ready to roll…' : 'Cycling…'}
        </span>
        <span className="tray__gauges">
          <span className="tray__gauge">dice: <b>{dice}</b></span>
          <span className="tray__gauge">rolls: <b>{s.totalRolls}</b></span>
          <span className="tray__gauge">seed: <b>{seedTag(s)}</b></span>
        </span>
      </div>

      {/* While the chamber is shut a throw is not what a click does, so the
          hint does not claim otherwise. Driven in, the readout below the
          chamber carries the instruction and this one would sit under it. */}
      <div className={`tray__hint${(sealed || (ready && s.totalRolls < 6)) ? ' tray__hint--show' : ''}`}>
        {sealed
          ? (touch ? 'tap to open the chamber' : 'click to open the chamber')
          : touch
            ? (dice > 1 ? `tap to throw ${dice} dice` : 'tap the die to roll')
            : (dice > 1 ? `click to throw ${dice} dice` : 'click the die to roll')}
        {!sealed && !touch && <span className="tray__hintKey"> · or press Space</span>}
      </div>
      {resolving && s.pending.length > 3 && (
        <div className="tray__queue">{s.pending.length} rolls resolving</div>
      )}
    </div>
  );
}

/** The generator's live state, in the five hex digits a nameplate would show. */
function seedTag(s: GameState): string {
  return (s.rng.seed >>> 0).toString(16).toUpperCase().slice(-5).padStart(5, '0');
}

export { project, v3 };
