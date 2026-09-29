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
  beginDiceFrame, diceFrameAnimating, drawBackdrop, drawProcOverlay, drawSurface,
  drawWorld, THEME_A, THEME_B,
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

/**
 * How far above the tray the dice layer reaches, in the tray's own units.
 *
 * A die is thrown to about two and a half of its own heights, and a die
 * dropped in for a bonus or a cascade starts at six and is thrown from there,
 * both of which are well above the top of a tray sized to hold the floor.
 * Inside the chamber that is right: it is a box, the bezel is its lid, and a
 * die that goes above the glass has gone behind it. Once the passage has
 * taken the box away there is no lid, and the same cut becomes a die that
 * vanishes at a line nobody can see and reappears out of it.
 *
 * So the dice layer is given the rest of the window to fall through. The tray
 * is centred by then, so half the difference between the window and the tray
 * is exactly the distance to the top of the screen; the extra sixth is so a
 * die can start above the screen and fall into it rather than beginning its
 * fall at the edge. `scale` is whatever an ancestor is scaling the tray by --
 * the photo stage's fit -- and converts the window's height into the layout
 * units the canvas is measured in.
 *
 * It is never negative: a tray taller than the window gets no headroom rather
 * than a canvas that starts below its own top.
 */
export function diceHeadroom(trayH: number, windowH: number, scale: number): number {
  if (!(trayH > 0) || !(scale > 0)) return 0;
  return Math.ceil(Math.max(0, (windowH / scale - trayH) / 2) + trayH / 6);
}

/**
 * Everything the dice layer draws that is not a function of the clock,
 * reduced to one number.
 *
 * The dice layer was the whole cost of this screen: measured, it was 19-26
 * million pixels a second of repainting, in both halves of the turn, and
 * nothing else on the page came within two orders of magnitude of it. Most of
 * that was spent redrawing a picture identical to the one already on the
 * canvas -- a tray of dice lying still, sixty times a second, for as long as
 * the tab was open.
 *
 * So the frame is compared against the last one and skipped when it matches.
 * The comparison has to be cheap enough to be worth making and complete
 * enough to be safe, which is why it takes the quantities the draw calls
 * actually read rather than a guess at them: a cube's place and orientation,
 * how far it has faded, whether it is under the pointer, the rings it has
 * left on the floor and the state that decides what is drawn at all. Anything
 * time-driven is deliberately absent, because the renderer reports that
 * separately -- see `beginDiceFrame`.
 *
 * Quantised, because these are floats settling by fractions of a pixel: to a
 * sixty-fourth of a world unit for a position, which is far finer than a
 * screen pixel at any zoom this tray uses, and to a four-thousandth of a turn
 * for an orientation.
 */
function worldSignature(world: World): number {
  let h = Math.imul(2166136261 ^ world.dice.length, 16777619) ^ world.ghosts.length;
  const mix = (v: number): void => { h = Math.imul(h ^ (v | 0), 16777619); };
  for (const d of world.dice) {
    mix(d.pos.x * 64); mix(d.pos.y * 64); mix(d.pos.z * 64);
    mix(d.q.x * 4096); mix(d.q.y * 4096); mix(d.q.z * 4096); mix(d.q.w * 4096);
    mix(d.alpha * 256);
    mix(d.hover ? 1 : 2);
    mix(d.state.charCodeAt(0) * 31 + (d.result ?? 0));
    mix(d.procs.length);
    mix(d.impacts.length);
    for (const im of d.impacts) mix(im.t);
    mix(d.zapAt === null ? 0 : 1);
  }
  for (const g of world.ghosts) {
    mix(g.pos.x * 64); mix(g.pos.y * 64);
    mix(g.alpha * 256);
    mix(g.result);
    mix(g.procs.length);
  }
  return h;
}

/** How long a die must tumble. Big cascades speed up so the tray keeps pace. */
function tumbleFor(backlog: number): number {
  if (backlog > 10) return 110;
  if (backlog > 4) return 180;
  return 300;
}

export function DiceTray({
  s, rollRef, resizeRef, glassRef, sealed, immersed, headroom, onSealed,
}: {
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
  /**
   * True from the moment a passage arms until it is over, and for all of Roll.
   *
   * This is the canvas's *size*, not what it is allowed to show: whether the
   * dice may actually be seen above the tray is the stylesheet's business
   * (`.viewport--unwalled`). The two are separated on purpose. Reallocating a
   * canvas is expensive, and doing it in the middle of a camera move is
   * expensive at the worst possible moment, so the headroom is taken during
   * the arm beat, while nothing is travelling, and kept until the passage is
   * completely over.
   */
  headroom?: boolean;
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
  const headroomRef = useRef(false);
  headroomRef.current = Boolean(headroom);
  const onSealedRef = useRef<(() => void) | undefined>(undefined);
  onSealedRef.current = onSealed;
  /** Current surface width, so the frame loop can spot when it must change. */
  const sideRef = useRef(0);
  /** The tray's own `resize`, so the walls coming and going can re-run it. */
  const localResizeRef = useRef<(() => void) | null>(null);

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
    /** Last frame's `worldSignature`, and whether that frame is still moving. */
    let lastSig = Number.NaN;
    let diceAnimating = true;
    /** Set by anything that changes the picture from outside the world. */
    let diceDirty = true;

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
     * How far above the tray the dice layer reaches, in the same CSS pixels.
     *
     * The floor never moves: `originY` stays where it was and this is added
     * on top of it for the dice alone, so opening the headroom changes what
     * can be *seen* and nothing about where anything *is*.
     */
    let lift = 0;

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
      // A ceiling on the backing store. The dice are large flat-shaded solids
      // with no fine detail to lose, and every step of this multiplier squares
      // the fill a throw costs: the old desktop ceiling of 3 asked a retina
      // screen for nine times the pixels of a plain one to draw the same six
      // faces.
      const dpr = Math.min((window.devicePixelRatio || 1) * view, mobile ? 1.5 : 2);

      // Only while the chamber has no walls; see `diceHeadroom`. Plan pays
      // nothing for any of it -- the lift is zero, the backing store is the
      // size it always was, and the frame clears the area it always cleared.
      lift = headroomRef.current ? diceHeadroom(h, window.innerHeight, view) : 0;

      ground.width = Math.max(1, Math.round(w * dpr));
      ground.height = Math.max(1, Math.round(h * dpr));
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round((h + lift) * dpr));
      // The stylesheet stretches both canvases over the tray; only the dice
      // layer ever departs from that, and only upward.
      canvas.style.top = lift > 0 ? `${-lift}px` : '';
      canvas.style.height = lift > 0 ? `${h + lift}px` : '';

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
      diceDirty = true;
    };
    resize();
    if (resizeRef) resizeRef.current = resize;
    localResizeRef.current = resize;
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    // The headroom is measured against the window, and the photo stage's
    // layout box does not change when the window does -- so the observer on
    // the tray never fires for the one change that matters most here.
    window.addEventListener('resize', resize);

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
        // `rect` is the dice canvas, which starts `lift` above the tray, so
        // the origin it is measured from has to carry the same lift.
        y: ((clientY - rect.top) / k - (originY + lift)) / zoom,
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
        if (availableForNextRoll(dice) >= dice || !hasPreviousRollInMotion()) {
          const hitKey = queuedRoll.hitKey;
          const hit = hitKey === null
            ? null
            : world.dice.find((die) => die.key === hitKey) ?? null;
          queuedRoll = null;
          performRoll(hit);
        }
      }

      // The HUD counts a roll only once its number has faded off the die.
      store.heldBack = releaseFadedGhosts(world);

      const theme = game.framework === 'A' ? THEME_A : THEME_B;
      if (groundFramework !== null && groundFramework !== game.framework) diceDirty = true;

      /*
       * One jolt, shared by both layers, so the ground and the dice on it
       * never come apart while the tray is shaking.
       *
       * It is baked into each layer's own transform rather than applied to
       * the two canvas elements with a CSS transform, which is the obvious
       * way to save the floor's redraw and was measured doing the opposite:
       * moving a transparent canvas over the page makes Chromium invalidate
       * the whole document layer beneath it, and the twelve million pixels a
       * second it saved on the floor came back as twenty-two million on the
       * document. The floor redrawing during a shake is the cheaper of the
       * two, so it stays.
       */
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

      /*
       * Draw only when the picture would differ from the one already there.
       *
       * Three things can make it differ: the world has moved (the signature
       * changes), the tray is being shaken (the jolt is a fresh random offset
       * every frame and is not in the world at all), or the previous frame
       * drew something that is still fading on the clock. `diceDirty` carries
       * everything outside the world -- a resize, a change of framework, the
       * headroom opening -- and is set by whoever makes that change.
       */
      const sig = worldSignature(world);
      if (sig !== lastSig || shaking || diceAnimating || diceDirty) {
        lastSig = sig;
        diceDirty = false;
        beginDiceFrame();
        ctx.clearRect(0, 0, viewW, viewH + lift);
        ctx.save();
        ctx.translate(originX + shakeX, originY + lift + shakeY);
        ctx.scale(zoom, zoom);
        drawWorld(ctx, world, theme);
        ctx.restore();
        drawProcOverlay(ctx, world, theme, originX, originY + lift, zoom);
        diceAnimating = diceFrameAnimating();
      }

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

    const primedDice = (): DieBody[] => world.dice.filter(
      (die) => !die.retiring && die.zapAt === null
        && die.state === 'tumbling' && die.result === null,
    );

    const hasPreviousRollInMotion = (): boolean => world.dice.some(
      (die) => !die.retiring && die.zapAt === null
        && (
          die.state === 'aligning'
          || (die.state === 'tumbling' && die.result !== null)
        ),
    );

    const availableForNextRoll = (dice: number): number => {
      const primed = primedDice().length;
      const neededToThrow = Math.max(0, dice - primed);
      return primed + planThrow(world, neededToThrow, MAX_DICE).reuse.length;
    };

    const performRoll = (hit: DieBody | null): void => {
      const game = stateRef.current;
      const dice = effectiveDice(game);

      // Bonus/capacity dice can already be tumbling with no result, waiting
      // for this engine roll. They count toward the requested dice but must
      // not be thrown again or replaced.
      const primed = primedDice();
      const neededToThrow = Math.max(0, dice - primed.length);
      const { reuse, retire } = planThrow(world, neededToThrow, MAX_DICE);
      for (const die of retire) retireDie(die);

      const throwing = [...reuse];
      while (throwing.length < neededToThrow) {
        throwing.push(spawnDie(world, { dropped: true }));
      }

      // The die under the cursor leads among dice that actually need a fresh
      // throw. A primed die is already in flight and simply receives a result.
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

      // A result-null tumbling die is not a misfire: it is a legitimate
      // capacity/bonus die already primed for this roll. Queue only when the
      // missing physical availability belongs to a previous result that is
      // still finishing its tumble/alignment.
      if (availableForNextRoll(dice) < dice && hasPreviousRollInMotion()) {
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
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      localResizeRef.current = null;
    };
  }, []);

  // Taking or giving back the headroom is a change of the canvas's size, so it
  // has to re-measure the moment it happens rather than waiting for the tray's
  // box to change -- which it never does.
  useEffect(() => { localResizeRef.current?.(); }, [headroom]);

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
