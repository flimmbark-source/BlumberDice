import {
  useCallback, useEffect, useLayoutEffect, useRef, useState, type MutableRefObject,
} from 'react';
import {
  allocatedCost, canRefund, canRoll, canSwitchFramework, CONFIG, displayStats,
  effectiveDice, getBuild, type EntropyTick, type GameState,
} from '../engine/game.ts';
import { actions, store, useGame } from './store.ts';
import { useCountUp } from './useCountUp.ts';
import { ControlRail } from './ControlRail.tsx';
import { DecisionBar } from './DecisionBar.tsx';
import { GoalBar } from './GoalBar.tsx';
import { currentGoal, openTargets } from '../engine/goal.ts';
import { affordanceOf } from '../engine/tree.ts';
import { DiceTray } from './dice/DiceTray.tsx';
import { TreeView } from './TreeView.tsx';
import {
  hasLeadsTo, LeadsTo, MobileSelectedUpgrade, SelectedUpgrade,
} from './SelectedUpgrade.tsx';
import { StatsPanel } from './StatsPanel.tsx';
import { touchPrimary } from './pointer.ts';
import { STAGE_H, STAGE_W, useSkin, useStageScale } from './skin.ts';
import chassisUrl from './chassis.webp';
import {
  playChannelClick, playDeckRail, playScreensCollapse, playScreensRelight, playWhirr,
} from './sound.ts';
import { prefersReducedMotion } from './motion.ts';
import {
  centreRollView, driveTimings, HUD_RISE_MS, HUD_STOW_MS,
  NO_VIEW_TRANSFORM, type Passage, passageGeometry, type PassageGeometry,
  passageKeyhole, passageScale, type Phase, viewTransformStyle, type ViewTransform,
} from './phase.ts';

const TREE_UNLOCK_SCORE = 20;

/**
 * When in the arm beat the machine is handed over to the shell.
 *
 * Covering means `display: none` and `visibility: hidden` on most of the
 * faceplate, and both of those are layout. Doing layout in the middle of a
 * camera move is the most expensive moment available to do it in: measured on
 * the photographed faceplate, moving this off the drive was the difference
 * between 1360ms and 244ms of dropped frames per passage.
 *
 * So it happens in the arm beat, where nothing is travelling. The shell fades
 * up over the first half of the beat, this fires at two thirds, and the drive
 * starts at the end -- which leaves a third of the beat for the layout to
 * settle, and puts an opaque faceplate over the machine well before it
 * changes. Coming back, the machine is restored at the very end of the
 * return, in the same frame the shell is taken away and the tubes strike,
 * with the camera already home.
 */
const COVER_AT_ARM = 0.65;

/**
 * The parts of the machine that ride the faceplate through the passage.
 *
 * The faceplate used to go by blank: panels, controls and the chamber glass
 * were switched off the moment the shell covered them, so what travelled was
 * a bare sheet of enamel and the machine's face vanished at one end of the
 * drive and reappeared at the other. The live face rides the passage now.
 * Each traveller is scaled about the chamber's centre by the same factor and
 * curve as the shell, which reproduces a single global scale of the whole
 * plate exactly. The chamber glass has its own matching layer in the shell:
 * moving the live tray here would also magnify the dice canvas and make it
 * snap back when the passage ends.
 *
 * The list has to stay disjoint by rendered ancestry, or a panel inside a
 * real rail would be scaled twice. The photographed desktop is the exception:
 * its rail is `display: contents`, so there is no rail box to transform and
 * the fixed panels are the rendered boxes that must travel instead. The
 * `data-mobile='false'` guard keeps that exception off the mobile path.
 *
 * Kept in step with the selector list in `styles.css` under "the face rides
 * the plate"; the two describe the same set and there is no way to share one
 * string between them.
 */
const TRAVELLERS = '.topbar, .panel-rail, .app--photo[data-mobile="false"] .panel-rail > .fixed-panel, .fixed-panel--goal-mobile, .game__controls, .face-vent, .standby, .tray__readout, .tray__hint, .tray__queue';

type Tab = 'roll' | 'web' | 'stats' | 'log';

const MOBILE_SURFACE_QUERY =
  '(max-width: 759px),'
  + '(max-width: 900px) and (min-height: 521px),'
  + '(max-width: 900px) and (orientation: portrait)';

function useMobileSurfaces(): boolean {
  const read = (): boolean => (
    typeof window !== 'undefined' && window.matchMedia(MOBILE_SURFACE_QUERY).matches
  );
  const [mobile, setMobile] = useState(read);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_SURFACE_QUERY);
    const update = (): void => setMobile(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return mobile;
}

export function App(): JSX.Element {
  const s = useGame();
  const skin = useSkin();
  const stageScale = useStageScale(skin === 'photo');
  const mobileSurfaces = useMobileSurfaces();
  const [inspected, setInspected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>(() => (
    typeof window !== 'undefined' && window.matchMedia(MOBILE_SURFACE_QUERY).matches
      ? 'roll'
      : 'web'
  ));
  // Bumped on every channel change. It keys the flicker overlay, so the
  // animation restarts even when the same channel is picked twice.
  const [channel, setChannel] = useState(0);

  /**
   * Which half of the turn this is. It is deliberately not saved: a reload
   * comes back in Plan, with the shield on, rather than resuming mid-throw
   * with Score exposed.
   */
  const [phase, setPhase] = useState<Phase>('plan');
  const [view, setView] = useState<ViewTransform>(NO_VIEW_TRANSFORM);
  const [passage, setPassage] = useState<Passage | null>(null);
  const [restoreSnap, setRestoreSnap] = useState(false);
  /**
   * The faceplate the drawn chassis passes the player, cut around the
   * chamber the player is going through.
   *
   * The photograph does not need this: it is one bitmap at one known size, so
   * its shell is cut in the stylesheet once. The drawn chassis reflows, so
   * its shell has to be cut around whatever rectangle the tray is actually
   * occupying when the drive engages -- and the same rectangle is kept for
   * the return, because the machine the player comes back to is the one they
   * left. `cam` is the matching camera move, held separately because by the
   * time the view is driving back out the live transform has already been
   * reset to Plan.
   */
  const [shell, setShell] = useState<
    { geom: PassageGeometry; camX: number; camY: number } | null
  >(null);
  /** How long the instrument waits on its rail before it rises. */
  const [hudDelay, setHudDelay] = useState(0);
  /**
   * True while the resting machine has handed its physical chassis to the
   * travelling passage shell.
   *
   * The handoff must happen on the first actual drive frame, never during the
   * arm beat. During arm nothing has moved yet, so removing the photographed
   * chassis there is visible as a blink. The shell is pre-painted during arm,
   * then `covered` flips at the same render that starts `passage === 'in'`.
   */
  const [covered, setCovered] = useState(false);
  const chamberRef = useRef<HTMLDivElement>(null);
  const trayResizeRef = useRef<(() => void) | null>(null);
  const passageTimerRef = useRef<number | null>(null);
  const restoreTimerRef = useRef<number | null>(null);
  const armTimerRef = useRef<number | null>(null);
  const armFrameRef = useRef<number | null>(null);
  /** The live value of `shell`, for the arm beat's timer to check. */
  const shellRef = useRef<{ geom: PassageGeometry; camX: number; camY: number } | null>(null);
  /** The live camera translation, for handlers that must not re-render to read it. */
  const viewRef = useRef<ViewTransform>(NO_VIEW_TRANSFORM);
  viewRef.current = view;

  /**
   * Cut the faceplate around the chamber as it stands right now.
   *
   * Reports through `shellRef` as well as state, because the arm beat's timer
   * has to know whether it succeeded and React state is not readable from
   * inside the callback that set it.
   */
  const measureShell = (): void => {
    const rect = chamberRef.current?.getBoundingClientRect();
    const geom = rect
      ? passageGeometry(rect, window.innerWidth, window.innerHeight)
      : null;
    if (!rect || !geom) { shellRef.current = null; return; }
    const cam = centreRollView(rect, NO_VIEW_TRANSFORM);
    const cut = { geom, camX: cam.tx, camY: cam.ty };
    shellRef.current = cut;
    setShell(cut);
    setTravelOrigins(geom);
  };

  /**
   * Point each travelling panel at the chamber's centre.
   *
   * `transform-origin` is stated in the element's own, pre-transform box, so
   * the one shared scale keyframe means a different thing on every panel
   * unless each is told where the chamber is relative to itself. Told that,
   * `scale()` on each panel is arithmetically identical to scaling the whole
   * plate about the chamber -- which is what the shell behind them is doing.
   *
   * Rectangles are read live rather than from `geom` because the panels are
   * only ever hidden with `visibility`, never taken out of the flow, so their
   * boxes are valid at both ends of the passage. The camera translation is
   * subtracted out on the way back: the origin has to be expressed in the
   * machine's resting frame, which is the frame `geom` was measured in.
   *
   * The photographed desktop adds one more coordinate space. Its whole
   * 1672x941 stage is already scaled by `stageScale`, so a DOMRect is in
   * screen pixels while `transform-origin` on a child panel is in unscaled
   * stage pixels. Feeding the screen-space offset straight back into CSS makes
   * the return scale pivot around the wrong point; at passage scale that error
   * looks like the live text is flying in from the page corner. Convert the
   * offset back through the stage scale for those photo-stage descendants.
   */
  const setTravelOrigins = (geom: PassageGeometry): void => {
    const v = viewRef.current;
    const cx = geom.x + geom.width / 2;
    const cy = geom.y + geom.height / 2;
    for (const el of document.querySelectorAll<HTMLElement>(TRAVELLERS)) {
      const b = el.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;

      const inPhotoDesktop = Boolean(
        !mobileSurfaces && el.closest('.app--photo[data-mobile="false"]'),
      );
      const localScale = inPhotoDesktop && stageScale > 0 ? stageScale : 1;
      const originX = (cx - (b.left - v.tx)) / localScale;
      const originY = (cy - (b.top - v.ty)) / localScale;
      el.style.transformOrigin = `${originX}px ${originY}px`;
    }
    document.documentElement.style.setProperty('--pass-scale', String(passageScale(geom)));
  };

  const clearPassageTimers = (): void => {
    for (const ref of [passageTimerRef, restoreTimerRef, armTimerRef]) {
      if (ref.current !== null) window.clearTimeout(ref.current);
      ref.current = null;
    }
    if (armFrameRef.current !== null) cancelAnimationFrame(armFrameRef.current);
    armFrameRef.current = null;
  };

  const runPassage = (direction: 'in' | 'out', duration: number, restrike: number): void => {
    if (passageTimerRef.current !== null) window.clearTimeout(passageTimerRef.current);
    if (restoreTimerRef.current !== null) window.clearTimeout(restoreTimerRef.current);
    setRestoreSnap(false);
    // Entry hands the resting chassis to the already-painted travelling shell
    // in the same render that motion begins. This prevents any stationary
    // arm-frame where baked-in UI disappears before the plane moves.
    if (direction === 'in') setCovered(true);
    setPassage(direction);
    passageTimerRef.current = window.setTimeout(() => {
      // On return, the camera reaches Plan first. Only then is the machine UI
      // restored, in one frame, instead of individual panels sliding back
      // while the camera itself is still moving.
      if (direction === 'out') {
        // The machine comes back in the same frame the shell is taken away
        // and the tubes strike -- one piece of layout, with the camera home
        // and nothing moving to be interrupted by it.
        setCovered(false);
        setRestoreSnap(true);
        playScreensRelight();
        restoreTimerRef.current = window.setTimeout(() => {
          setRestoreSnap(false);
          shellRef.current = null;
          setShell(null);
          restoreTimerRef.current = null;
        }, Math.max(1, restrike));
      }
      setPassage(null);
      passageTimerRef.current = null;
    }, duration);
  };

  /**
   * Pass through the chamber glass, in three beats.
   *
   * First the machine arms: the travelling shell is measured and rasterised,
   * and on a phone the selector clunks over to the Roll surface and the page
   * comes back to the top. Nothing visible is removed yet; the resting face
   * remains intact until the first frame that actually moves.
   *
   * Then the drive engages. The viewport translates the chamber toward the
   * centre while the chamber glass and the rest of the live face scale with
   * the travelling faceplate. The screen therefore remains the thing the
   * player is crossing rather than becoming an empty aperture.
   *
   * Then the instrument arrives, on the drive's last detent rather than a
   * fifth of the way into it.
   */
  const enterRoll = (): void => {
    if (phase === 'roll' || passage !== null) return;
    if (!chamberRef.current) return;
    const t = driveTimings(prefersReducedMotion(), mobileSurfaces);

    // Surface navigation and the mechanical Roll phase are separate. If a
    // phone opens Roll from Score while looking at Build/Stats/Log, reveal the
    // chamber first so the passage always has a visible screen to cross, and
    // so the measurement below is of a chamber that is actually laid out.
    if (mobileSurfaces && tab !== 'roll') {
      setTab('roll');
      window.scrollTo(0, 0);
    }
    playScreensCollapse();
    setPassage('arm');

    /*
     * Cut the faceplate now, a beat before it has to move.
     *
     * The browser rasterises the shell the frame it appears, and mounting it
     * with the drive cost a measured 280ms stall on the first frame of the
     * move -- a fifth of the animation, frozen, exactly where the eye is
     * following it. The arm beat exists for work like this: nothing is
     * travelling yet, so the layer is built and painted with nothing to
     * interrupt, and the drive starts against a machine that is already warm.
     * It fades up over the beat rather than appearing, so the beat still looks
     * like one thing.
     *
     * A frame, not an instant: a phone opening Roll from Build has just been
     * told to switch surfaces, and the chamber has to be laid out before it
     * can be measured.
     */
    armFrameRef.current = requestAnimationFrame(() => {
      armFrameRef.current = null;
      measureShell();
      setHudDelay(t.hudDelay);
    });

    armTimerRef.current = window.setTimeout(() => {
      armTimerRef.current = null;
      if (armFrameRef.current !== null) {
        // Reduced motion runs no arm beat at all, so the frame above has not
        // happened yet and the measurement is taken here instead.
        cancelAnimationFrame(armFrameRef.current);
        armFrameRef.current = null;
        measureShell();
        setHudDelay(t.hudDelay);
      }
      if (!shellRef.current) {
        // No chamber on screen to go through. Opening one would be a claim
        // about a machine part that is not there, so the machine stays shut.
        setPassage(null);
        return;
      }
      playWhirr('in', t.in);
      playDeckRail('rise', HUD_RISE_MS, t.hudDelay);
      runPassage('in', t.in, t.restrike);
      setPhase('roll');
    }, Math.max(0, t.arm));
  };

  /** Engage the shield and let the view back out. */
  const endRollRef = useRef<(() => void) | null>(null);
  const endRoll = (): void => {
    if (phase !== 'roll') return;
    const t = driveTimings(prefersReducedMotion(), mobileSurfaces);
    // The entry cleared these when it finished. The panels have not moved --
    // they have been sitting invisibly in their Plan boxes the whole time --
    // so the same measurement is taken again for the way back.
    if (shellRef.current) setTravelOrigins(shellRef.current.geom);
    playWhirr('out', t.out);
    playDeckRail('stow', HUD_STOW_MS);
    runPassage('out', t.out, t.restrike);
    setPhase('plan');
  };
  endRollRef.current = phase === 'roll' ? endRoll : null;

  const changeChannel = (next: Tab): void => {
    setTab(next);
    setChannel((n) => n + 1);
    playChannelClick();
    // Each mobile tab is a complete surface. Do not leave the newly selected
    // one stranded above the current page scroll from a long Build tree.
    if (mobileSurfaces) window.scrollTo(0, 0);
  };
  const [expanded, setExpanded] = useState(false);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const focusN = useRef(0);
  const clearFocus = useCallback((): void => setFocus(null), []);

  // scoreEarned is lifetime Score for this run, so spending below 20 never
  // makes the tree vanish again after the player has discovered it.
  const treeUnlocked = s.stats.scoreEarned >= TREE_UNLOCK_SCORE;
  const knowsB = s.discovered.includes('frameworkB');
  const spent = allocatedCost(s);
  const hasGoalDisplay = treeUnlocked && currentGoal(s).kind !== 'none';
  // Desktop keeps Goal in the left rail. Stacked/mobile moves the same Goal
  // plate onto the Roll surface beneath the chamber/deck.
  const showGoalPanel = hasGoalDisplay && tab === 'web' && !mobileSurfaces;
  const photo = skin === 'photo';
  /*
   * The web only ever asks whether a node can be bought, so it is given the
   * one value of each currency that answers every such question the same way
   * -- see `affordanceOf`. Handed the live number instead, it rebuilt every
   * node's status and re-rendered the whole web on every frame Entropy moved
   * Score, which is every frame.
   */
  const afford = affordanceOf(s.score, s.meta);
  const showChain = treeUnlocked && Boolean(inspected) && hasLeadsTo(inspected);

  const focusNode = (id: string): void => {
    setInspected(id);
    focusN.current += 1;
    setFocus({ id, n: focusN.current });
  };

  const selectUpgrade = (id: string): void => {
    // Inspection and commitment are separate: following links through the
    // inspector never changes the player's explicit Goal.
    focusNode(id);
  };

  const openGoalInTree = (): void => {
    if (tab !== 'web') changeChannel('web');

    // "X Available to Buy" is a carousel over nodes that can actually be
    // purchased now. It changes inspection only; the star sets the Goal.
    const targets = openTargets(s);
    if (targets.length === 0) return;
    const current = inspected ? targets.indexOf(inspected) : -1;
    const next = targets[(current + 1) % targets.length];
    focusNode(next);
  };

  useEffect(() => {
    if (!treeUnlocked) {
      setInspected(null);
      setExpanded(false);
      return;
    }
  }, [treeUnlocked]);

  // Roll is a mobile-only navigation surface. If the viewport crosses back
  // into the desktop machine while it is selected, return the information
  // window to Build. Before the tree exists, mobile has only Roll to show.
  useEffect(() => {
    if (mobileSurfaces) {
      if (!treeUnlocked && tab !== 'roll') setTab('roll');
      return;
    }
    if (tab === 'roll') setTab('web');
  }, [mobileSurfaces, treeUnlocked, tab]);

  useEffect(() => {
    if (treeUnlocked && tab === 'stats') actions.seenStats();
  }, [treeUnlocked, tab]);

  /**
   * Planning is shielded; rolling is not. One place decides it.
   *
   * The two halves used to set the lock themselves and this effect only
   * caught Plan drifting out of step, which worked while the whole phase
   * change happened inside one click handler. It does not now: the drive is
   * armed first and commits a beat later, from a timer, and a store
   * notification arriving between the two was enough for this effect to see
   * Plan and an unlocked Score together and put the shield straight back on
   * — so the chamber opened with Score still frozen and the roll could not
   * earn or lose anything. Deriving the lock from the phase instead of
   * setting it alongside the phase removes the window entirely, and holds
   * across a reload or a refund as it did before.
   */
  useEffect(() => {
    const shielded = phase === 'plan';
    if (s.scoreLocked !== shielded) actions.toggleScoreLock();
  }, [phase, s.scoreLocked]);

  // Re-centre only after Roll has committed. The chamber's DOMRect already
  // includes the active skin scale and any document scroll, so the view only
  // needs the remaining screen-space translation. There is intentionally no
  // camera scale here.
  useLayoutEffect(() => {
    if (phase !== 'roll') { setView(NO_VIEW_TRANSFORM); return; }
    const el = chamberRef.current;
    if (el) setView((v) => centreRollView(el.getBoundingClientRect(), v));
  }, [phase, skin, stageScale]);

  // Photo-skin scaling changes the tray's visual pixel density without
  // changing its layout box. Re-measure after the scene settles so the canvas
  // backing store stays crisp; translation alone does not increase its size.
  useEffect(() => {
    const t = driveTimings(prefersReducedMotion(), mobileSurfaces);
    const ms = (phase === 'roll' ? t.in : t.out) + 40;
    const timer = window.setTimeout(() => trayResizeRef.current?.(), ms);
    return () => window.clearTimeout(timer);
  }, [view, phase, stageScale, mobileSurfaces]);

  // Keep the unchanged-size tray centred if the viewport changes while Roll
  // is active, and re-cut the faceplate with it: the hole the player comes
  // back out through has to be where the chamber will be, not where it was
  // before the window changed shape. The tray is centred at this point, so
  // its resting rectangle is its current one less the camera translation.
  useEffect(() => {
    if (phase !== 'roll') return;
    const onResize = (): void => {
      const el = chamberRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const v = viewRef.current;
      const geom = passageGeometry(
        { left: rect.left - v.tx, top: rect.top - v.ty, width: rect.width, height: rect.height },
        window.innerWidth,
        window.innerHeight,
      );
      const cam = centreRollView(rect, v);
      if (geom) {
        const cut = { geom, camX: cam.tx, camY: cam.ty };
        shellRef.current = cut;
        setShell(cut);
      }
      setView(cam);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [phase]);

  useEffect(() => clearPassageTimers, []);

  /**
   * Take the travel origins back off once nothing is travelling.
   *
   * They are inert at rest -- no transform is applied, so no origin is
   * consulted -- but they would be wrong after a resize, and leaving a stale
   * origin on a panel that grows its own transform later is a trap rather
   * than a saving.
   */
  useEffect(() => {
    if (passage !== null) return;
    for (const el of document.querySelectorAll<HTMLElement>(TRAVELLERS)) {
      el.style.removeProperty('transform-origin');
    }
    document.documentElement.style.removeProperty('--pass-scale');
  }, [passage]);

  /**
   * Publish the photo stage's fit to the document root.
   *
   * The panel the photograph is mounted in is not part of the photograph: it
   * is whatever the window has left over once the stage has been fitted into
   * it. Two places have to draw that panel -- the document, at rest, and the
   * shell, while it is travelling -- and they have to agree exactly or the
   * handoff at each end of the drive is a change of material. Publishing the
   * one number they both derive it from is cheaper than measuring it twice
   * and safer than writing it down twice. `0` means there is no stage,
   * which is how the drawn chassis says it fills the window itself.
   */
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--stage-k', photo ? String(stageScale) : '0');
    return () => { root.style.removeProperty('--stage-k'); };
  }, [photo, stageScale]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === '`') store.toggleDebug();
      if (e.key === 'Escape') endRollRef.current?.();
    };
    window.addEventListener('keydown', onKey);
    const onHide = (): void => store.save();
    window.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onHide);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onHide);
    };
  }, []);

  /**
   * Whether the machine's own face rides the plate through this passage.
   *
   * Phones only, for now, and measured rather than assumed: keeping the
   * panels lit means rasterising them at the drive's largest scale, which is
   * the cost the stacked layout can afford and the photographed faceplate --
   * already the slower of the two passages -- cannot.
   */
  const carry = passage !== null;

  return (
    <>
    {/* Up during the arm beat, with the shell, for the same reason: a
        window-sized gradient is a window-sized raster, and the drive should
        not begin by paying for one. */}
    {(phase === 'roll' || passage !== null)
      && <div className={`rollfield rollfield--${passage ?? 'held'}`} aria-hidden />}
    {/* The outer view supplies the camera translation for the stable dice
        tray. The faceplate fixtures and the shell's CRT-glass layer scale
        around the same measured centre, so the player crosses the screen
        without magnifying the live dice canvas. */}
    <div
      className={
        `viewport${phase === 'roll' || passage === 'out' ? ' viewport--driven' : ''}`
        + (passage === 'arm' ? ' viewport--arming' : '')
        + (passage === 'in' ? ' viewport--entering' : '')
        + (passage === 'out' ? ' viewport--exiting' : '')
        + (covered ? ' viewport--covered' : '')
        + (carry ? ' viewport--carry' : '')
        + (phase === 'roll' && passage === null ? ' viewport--unwalled' : '')
        + (restoreSnap ? ' viewport--restore-snap' : '')
      }
      style={{ transform: viewTransformStyle(view) }}
    >
    <div
      className={`app${photo ? ' app--photo' : ''}`}
      data-tab={tab}
      data-mobile={mobileSurfaces ? 'true' : 'false'}
      style={photo ? {
        ['--chassis' as string]: `url(${chassisUrl})`,
        ['--stage-k' as string]: String(stageScale),
        width: STAGE_W,
        height: STAGE_H,
      } : undefined}
    >
      <TopBar
        s={s}
        knowsB={knowsB}
        canRefund={canRefund(s)}
        refundScore={spent.score}
        refundMeta={spent.meta}
        treeUnlocked={treeUnlocked}
        mobileSurfaces={mobileSurfaces}
        tab={tab}
        setTab={changeChannel}
        onUnshield={enterRoll}
      />

      <main className="desktop" aria-label="Roll Reactor workspace">
        {/* Casing, not a control: it fills the face below the inspector and
            says nothing. */}
        {treeUnlocked && <div className="face-vent" aria-hidden />}

        <section className="game-area" aria-label="Game area">
          <GamePanel
            s={s}
            sealed={phase === 'plan'}
            immersed={phase === 'roll' || passage === 'in' || passage === 'out'}
            headroom={passage !== null || phase === 'roll'}
            onSealed={enterRoll}
            resizeRef={trayResizeRef}
            glassRef={chamberRef}
          />

          {mobileSurfaces && tab === 'roll' && hasGoalDisplay && (
            <section className="fixed-panel fixed-panel--goal fixed-panel--goal-mobile">
              <div className="fixed-panel__bar" />
              <div className="fixed-panel__body">
                <GoalBar s={s} onOpenTree={openGoalInTree} />
              </div>
            </section>
          )}
        </section>

        {treeUnlocked && (
          <div className="panel-rail panel-rail--left">
          <section className="fixed-panel fixed-panel--tree">
            <div className="fixed-panel__bar">
              {/* The ringed body labels the tree; Stats and Log keep the lamp
                  every other plate carries. */}
              {tab === 'web' && <PlanetMark />}
              <span className="fixed-panel__title">
                {tab === 'web' ? 'Build tree' : tab === 'stats' ? 'Stats' : 'Log'}
              </span>
            </div>
            <div className="fixed-panel__body">
              <span key={channel} className="crt-restrike" aria-hidden />
              {tab === 'web' && (
                <div className="tech-build">
                  <TreeView
                    allocatedKey={s.allocated.join(',')}
                    discoveredKey={s.discovered.join(',')}
                    score={afford.score}
                    meta={afford.meta}
                    framework={s.framework}
                    pinned={s.pinned}
                    inspected={inspected}
                    setInspected={setInspected}
                    expanded={expanded}
                    setExpanded={setExpanded}
                    focus={focus}
                    onFocusConsumed={clearFocus}
                    embedded
                  />
                </div>
              )}
              {tab === 'stats' && (
                <aside className="panel panel--utility">
                  <div className="panel__body"><StatsPanel s={s} /></div>
                </aside>
              )}
              {tab === 'log' && (
                <aside className="panel panel--utility">
                  <div className="panel__body"><LogPanel s={s} /></div>
                </aside>
              )}
            </div>
            <PanelFoot text={tab === 'web' ? 'Expand the machine. Every roll builds a bigger tomorrow.' : undefined} />
          </section>

          {mobileSurfaces && tab === 'web' && inspected && (
            <section className="fixed-panel fixed-panel--upgrade-mobile">
              <MobileSelectedUpgrade
                s={s}
                nodeId={inspected}
                onClose={() => setInspected(null)}
              />
            </section>
          )}

          {showGoalPanel && (
            <section className="fixed-panel fixed-panel--goal">
              {/* This plate prints its legend inside the screen, beside the
                  name it labels, so the bezel carries only its furniture. */}
              <div className="fixed-panel__bar" />
              <div className="fixed-panel__body">
                <GoalBar s={s} onOpenTree={openGoalInTree} />
              </div>
            </section>
          )}
          </div>
        )}

        {/* The photograph cuts its holes once and for all, so a slot with no
            panel in it is a dead black rectangle rather than an absence. Each
            one says so instead. The drawn chassis has no hole until there is
            something to put in it, and needs none of this. */}
        {photo && !treeUnlocked && <Standby slot="tree" />}
        {photo && !showGoalPanel && <Standby slot="goal" />}
        {photo && !(treeUnlocked && inspected) && <Standby slot="upgrade" />}
        {photo && !showChain && <Standby slot="chain" />}

        {treeUnlocked && inspected && !mobileSurfaces && (
          <div className="panel-rail panel-rail--right">
            <section className="fixed-panel fixed-panel--upgrade">
              <div className="fixed-panel__bar">
                <span className="fixed-panel__title">Selected upgrade</span>
              </div>
              <div className="fixed-panel__body">
                <SelectedUpgrade
                  s={s} nodeId={inspected} onReveal={selectUpgrade} embedded withChain={false}
                />
              </div>
              {/* The column's stamp belongs to whichever plate ends it. */}
              {!hasLeadsTo(inspected) && (
                <PanelFoot text="Small choices. Large consequences." mark />
              )}
            </section>

            {/* Its own plate, as the reference machine gives it -- but only
                when the node actually leads somewhere. */}
            {showChain && (
              <section className="fixed-panel fixed-panel--chain">
                <div className="fixed-panel__bar">
                  <span className="fixed-panel__title">Leads to</span>
                </div>
                <div className="fixed-panel__body">
                  <LeadsTo s={s} nodeId={inspected} onReveal={selectUpgrade} />
                </div>
                <PanelFoot text="Small choices. Large consequences." mark />
              </section>
            )}
          </div>
        )}

      </main>

      {store.debug && <DebugPanel s={s} />}
    </div>
    </div>

    {/* The machine passing the player, as one object. Cut and painted during
        the arm beat so the drive does not start by building it. */}
    {shell && passage !== null && (
      <PassageShell passage={passage} shell={shell} photo={photo} carry={carry} />
    )}

    {/* Outside the drive, so it stays put while the view moves. The readout
        comes up its rail as the drive takes its last detent -- not with the
        press, which used to put it on screen a fifth of the way into a
        two-second move -- and it is stowed again at the head of the return,
        while the faceplate coming back is still too far off to meet it. */}
    {(phase === 'roll' || passage === 'out') && (
      <div
        className={`rollhud${passage === 'out' ? ' rollhud--stow' : ''}`}
        style={{ ['--hud-delay' as string]: `${hudDelay}ms` }}
      >
        <div className="rollhud__inner">
          {/* The readout shakes harder the fuller the pressure meter behind
              it gets, so the thing you are about to lose is the thing that
              tells you how close it is. */}
          <div
            className="rollhud__unit"
            style={{
              ['--rumble' as string]: String(
                Math.max(0, Math.min(1, s.entropyLevel / CONFIG.entropyMax)),
              ),
            }}
          >
            <Currency
              label="Score"
              value={s.score}
              entropy={s.entropyLog}
              entropyLevel={s.entropyLevel}
              scoreLocked={s.scoreLocked}
              onToggleLock={endRoll}
              tab={touchPrimary() ? 'Tap to stop' : 'Click to stop'}
            />
          </div>
        </div>
      </div>
    )}
    </>
  );
}

/**
 * The line of paint along the bottom of a plate.
 *
 * Decoration only, and `aria-hidden` for it: it states no rule, carries no
 * number, and nothing in the machine depends on reading it.
 */
/**
 * A hole in the photographed faceplate with nothing mounted behind it.
 *
 * It states no rule and carries no number: it reports that this screen is
 * not showing anything, which is true, and is the difference between a
 * machine with a channel off and a machine that looks broken.
 */
/**
 * The machine, cut into four bands around the chamber and driven past the
 * camera.
 *
 * It exists because the tray must not scale. The depth in this passage is
 * the machine moving, not the subject growing, and the only piece of machine
 * that can travel past the player without taking the dice with it is the
 * faceplate itself -- which therefore has to be a separate copy with the
 * chamber cut out of it.
 *
 * One window-sized layer with the opening cut out of it, scaled about the
 * opening's centre. It was four layers clipped to a band each, which is the
 * obvious way to get a hole out of a shape that can only have one outline --
 * and four times the raster for the same picture, paid in the frame the drive
 * starts. `passageKeyhole` gets the hole out of a single outline instead. The
 * opening is measured from the tray during the arm beat, and the same
 * measurement is kept for the return, because the machine a player comes back
 * to is the one they left.
 *
 * Both skins are the same object here, which they did not used to be. The
 * photograph had its own shell, sized to the stage and clipped with the
 * aperture's percentages written down by hand; the surround it is letterboxed
 * into was not in that shell at all -- it was painted on the document, so it
 * could not travel, and it simply blinked out on the drive's first frame
 * while the machine it belongs to drove away without it. Measuring the
 * opening instead of writing it down lets the photograph, the panel it is
 * mounted in and the drawn chassis all be bands of one sheet, and one sheet
 * is the only thing that can move as one object.
 *
 * It covers the live interface while it runs. That is the point rather than a
 * side effect: panels peeling off sideways is a thing a faceplate cannot do,
 * so instead the whole face goes by at once, and the panels behind it are
 * dark by then -- the machine armed and put its screens out before any of
 * this started moving.
 */
function PassageShell({ passage, shell, photo, carry }: {
  passage: Passage;
  shell: { geom: PassageGeometry; camX: number; camY: number };
  photo: boolean;
  /** The live panels are riding the plate, so the plate paints behind them. */
  carry: boolean;
}): JSX.Element {
  const origin = `${shell.geom.originX}% ${shell.geom.originY}%`;
  return (
    <div
      className={`passage-shell passage-shell--${passage} passage-shell--${photo ? 'photo' : 'drawn'}`
        + (carry ? ' passage-shell--carry' : '')}
      style={{
        ['--cam-x' as string]: `${shell.camX}px`,
        ['--cam-y' as string]: `${shell.camY}px`,
        ['--pass-scale' as string]: String(passageScale(shell.geom)),
        ...(photo ? { ['--chassis' as string]: `url(${chassisUrl})` } : null),
      }}
      aria-hidden
    >
      <div className="passage-shell__camera">
        <span
          className="passage-shell__piece"
          style={{ clipPath: passageKeyhole(shell.geom), transformOrigin: origin }}
        />
        {/* The physical CRT glass now stays in the live tray itself. That keeps
            the real stacking order intact: dice behind the glass, telemetry
            above it. The shell only carries the metal around the opening. */}
        {photo && <span className="passage-shell__recess" style={{ transformOrigin: origin }} />}
        {!photo && (
          <span
            className="passage-shell__rim"
            style={{
              left: `${shell.geom.x}px`,
              top: `${shell.geom.y}px`,
              width: `${shell.geom.width}px`,
              height: `${shell.geom.height}px`,
            }}
          />
        )}
      </div>
    </div>
  );
}

function Standby({ slot }: { slot: 'tree' | 'goal' | 'upgrade' | 'chain' }): JSX.Element {
  return (
    <div className={`standby standby--${slot}`} aria-hidden>
      <span className="standby__text">No signal</span>
    </div>
  );
}

function PanelFoot({ text, mark = false }: { text?: string; mark?: boolean }): JSX.Element {
  return (
    <div className="fixed-panel__foot" aria-hidden>
      {mark && <OrbitMark />}
      <span className="fixed-panel__stamp">
        {(text ?? '').split(/(?<=\.)\s+/).map((line) => (
          <span key={line} className="fixed-panel__stampLine">{line}</span>
        ))}
      </span>
      <span className="flash fixed-panel__footFlash" />
    </div>
  );
}

/**
 * The tree plate's legend mark. The reference machine gives this one panel a
 * ringed body rather than a plain lamp, and it suits the thing it labels:
 * one centre with everything else in orbit around it.
 */
function PlanetMark(): JSX.Element {
  return (
    <svg className="fixed-panel__glyph" width={15} height={15} viewBox="0 0 16 16" aria-hidden>
      <circle cx={8} cy={7.4} r={3.9} fill="currentColor" />
      <ellipse
        cx={8} cy={8.4} rx={7} ry={2.4}
        fill="none" stroke="currentColor" strokeWidth={1.3}
        transform="rotate(-17 8 8.4)"
      />
    </svg>
  );
}

function OrbitMark(): JSX.Element {
  return (
    <svg className="fixed-panel__mark" width={22} height={22} viewBox="0 0 24 24" aria-hidden
      fill="none" stroke="currentColor" strokeWidth={1.1}>
      <circle cx={12} cy={12} r={7.4} />
      <ellipse cx={12} cy={12} rx={7.4} ry={3} />
      <ellipse cx={12} cy={12} rx={3} ry={7.4} />
      <ellipse cx={12} cy={12} rx={10.6} ry={4.2} transform="rotate(-27 12 12)" />
    </svg>
  );
}

function TopBar({
  s, knowsB, canRefund: mayRefund, refundScore, refundMeta,
  treeUnlocked, mobileSurfaces, tab, setTab, onUnshield,
}: {
  s: GameState;
  /** Taking the shield off is what opens the chamber. */
  onUnshield: () => void;
  knowsB: boolean;
  canRefund: boolean;
  refundScore: number;
  refundMeta: number;
  treeUnlocked: boolean;
  mobileSurfaces: boolean;
  tab: Tab;
  setTab: (tab: Tab) => void;
}): JSX.Element {
  const [menu, setMenu] = useState(false);
  return (
    <header className="topbar">
      <div className="brand">
        <BrandMark />
        <span className="brand__word"><b>Roll</b><i> Reactor</i></span>
      </div>

      {/* Desktop keeps its three information channels. Stacked/mobile adds
          Roll as a real surface alongside them. Before the tree unlocks,
          Roll is the only mobile tab because it is the only surface. */}
      {(treeUnlocked || mobileSurfaces) ? (
        <nav className="tabsx" role="tablist" aria-label="Game view">
          <TabBtn id="roll" tab={tab} set={setTab} label="Roll" icon={<RollIcon />} />
          {treeUnlocked && (
            <>
              <TabBtn id="web" tab={tab} set={setTab} label="Build" icon={<BuildIcon />} />
              <TabBtn id="stats" tab={tab} set={setTab} label="Stats" icon={<StatsIcon />} />
              <TabBtn id="log" tab={tab} set={setTab} label="Log" icon={<LogIcon />} />
            </>
          )}
        </nav>
      ) : (
        <div />
      )}

      <div className="topbar__right">
        {knowsB && (
          <div className="fwtoggle" role="group" aria-label="Active framework">
            <button
              type="button"
              className={`fwtoggle__btn${s.framework === 'A' ? ' fwtoggle__btn--on' : ''}`}
              onClick={() => { if (s.framework !== 'A') actions.switchFramework(); }}
              disabled={!canSwitchFramework(s) && s.framework !== 'A'}
            >
              <span className="fwtoggle__glyph">+</span>
              <span className="fwtoggle__text">gain Score</span>
            </button>
            <button
              type="button"
              className={`fwtoggle__btn${s.framework === 'B' ? ' fwtoggle__btn--on' : ''}`}
              onClick={() => { if (s.framework !== 'B') actions.switchFramework(); }}
              disabled={!canSwitchFramework(s) && s.framework !== 'B'}
            >
              <span className="fwtoggle__glyph">↺</span>
              <span className="fwtoggle__text">gain Meta</span>
            </button>
          </div>
        )}
        <div className="currencies">
          <Currency
            label="Score"
            value={s.score}
            entropy={s.entropyLog}
            entropyLevel={s.entropyLevel}
            scoreLocked={s.scoreLocked}
            onToggleLock={onUnshield}
          />
          {knowsB && <Currency label="Meta" value={s.meta} alt />}
          <span className="currencies__stamp" aria-hidden>
            <span>Roll Reactor</span>
            <span>v1.0</span>
          </span>
        </div>
        <div className="gear">
          <button type="button" className="iconbtn" aria-label="Settings"
            aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            <GearMark />
          </button>
          {menu && (
            <div className="gear__menu">
              <button
                type="button" className="gear__item" disabled={!mayRefund || s.scoreLocked}
                onClick={() => { actions.refund(); setMenu(false); }}
              >
                Refund every point
                <span className="gear__sub">
                  returns {refundScore.toLocaleString()} Score
                  {refundMeta > 0 ? ` and ${refundMeta.toLocaleString()} Meta` : ''}
                </span>
              </button>
              <button
                type="button"
                className="gear__item gear__item--danger"
                disabled={s.score <= 0 || s.scoreLocked}
                onClick={() => { actions.deleteScore(); setMenu(false); }}
              >
                Delete score
                <span className="gear__sub">sets current Score to 0</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function TabBtn({ id, tab, set, label, icon }: {
  id: Tab;
  tab: Tab;
  set: (tab: Tab) => void;
  label: string;
  icon: JSX.Element;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`tab tab--${id}${tab === id ? ' tab--on' : ''}`}
      onClick={() => set(id)}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/* Key-cap glyphs. Each one draws the panel its key opens. */

function RollIcon(): JSX.Element {
  return (
    <svg className="tab__icon" width={17} height={17} viewBox="0 0 18 18" aria-hidden
      fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
      <rect x={3.2} y={3.2} width={11.6} height={11.6} rx={3} />
      <circle cx={6.3} cy={6.3} r={1} fill="currentColor" stroke="none" />
      <circle cx={11.7} cy={6.3} r={1} fill="currentColor" stroke="none" />
      <circle cx={9} cy={9} r={1} fill="currentColor" stroke="none" />
      <circle cx={6.3} cy={11.7} r={1} fill="currentColor" stroke="none" />
      <circle cx={11.7} cy={11.7} r={1} fill="currentColor" stroke="none" />
    </svg>
  );
}

function BuildIcon(): JSX.Element {
  return (
    <svg className="tab__icon" width={17} height={17} viewBox="0 0 18 18" aria-hidden
      fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round">
      <path d="M9 4.5v4M9 8.5 4.5 13M9 8.5 13.5 13" />
      <circle cx={9} cy={3.4} r={1.9} /><circle cx={3.6} cy={13.8} r={1.9} />
      <circle cx={14.4} cy={13.8} r={1.9} />
    </svg>
  );
}

function StatsIcon(): JSX.Element {
  return (
    <svg className="tab__icon" width={17} height={17} viewBox="0 0 18 18" aria-hidden
      fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
      <path d="M4 14V9M9 14V4M14 14v-7" />
    </svg>
  );
}

function LogIcon(): JSX.Element {
  return (
    <svg className="tab__icon" width={17} height={17} viewBox="0 0 18 18" aria-hidden
      fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round">
      <rect x={3} y={3} width={12} height={12} rx={1.6} />
      <path d="M5.8 6.6h6.4M5.8 9h6.4M5.8 11.4h4" />
    </svg>
  );
}

function BrandMark(): JSX.Element {
  return (
    <svg className="brand__mark" width={42} height={42} viewBox="-16 -16 32 32" aria-hidden>
      <rect x={-11} y={-11} width={22} height={22} rx={6} />
      <circle cx={-4.5} cy={-4.5} r={2} /><circle cx={4.5} cy={4.5} r={2} />
      <circle cx={4.5} cy={-4.5} r={2} /><circle cx={-4.5} cy={4.5} r={2} />
    </svg>
  );
}

function GearMark(): JSX.Element {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden
      fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round">
      <circle cx={12} cy={12} r={3.2} />
      <path d="M12 2.6v2.6M12 18.8v2.6M2.6 12h2.6M18.8 12h2.6M5.4 5.4l1.8 1.8M16.8 16.8l1.8 1.8M18.6 5.4l-1.8 1.8M7.2 16.8l-1.8 1.8" />
    </svg>
  );
}

function Currency({
  label, value, alt = false, entropy, entropyLevel = 0, scoreLocked = false,
  onToggleLock, tab,
}: {
  label: string;
  value: number;
  alt?: boolean;
  /** Entropy steps to animate around this readout. Score only. */
  entropy?: EntropyTick[];
  /** 0..100 Entropy pressure shown as a red underlay around the Score glass. */
  entropyLevel?: number;
  /** True while the player has frozen Score at its current value. */
  scoreLocked?: boolean;
  onToggleLock?: () => void;
  /**
   * A tab stamped with what pressing this does, sprung out of its side.
   * It is a child of the readout rather than a sibling, so it sits outside
   * the box and still belongs to the same hit area — a label you can press
   * is better than one that looks pressable and is not.
   */
  tab?: string;
}): JSX.Element {
  const { value: shown, moving } = useCountUp(
    value,
    alt ? () => store.heldBack.meta : () => store.heldBack.score,
  );
  const rising = moving && value > shown;
  // Read off what is on the display rather than off the true total: while the
  // counter is still easing down through zero, the digits are what is red.
  const negative = Math.floor(shown) < 0;
  const state = negative ? ' currency__value--neg'
    : moving ? (rising ? ' currency__value--up' : ' currency__value--down')
    : '';
  const interactive = Boolean(onToggleLock);
  return (
    <div
      className={`currency${alt ? ' currency--alt' : ''}${scoreLocked ? ' currency--score-lock' : ''}${interactive ? ' currency--interactive' : ''}`}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-pressed={interactive ? scoreLocked : undefined}
      aria-label={interactive ? `${scoreLocked ? 'Unlock' : 'Lock'} Score at ${Math.floor(value)}` : undefined}
      title={interactive ? (scoreLocked ? 'Score locked — click to unlock' : 'Click to lock Score at its current value') : undefined}
      onClick={onToggleLock}
      onKeyDown={interactive ? (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggleLock?.();
        }
      } : undefined}
    >
      {entropy && (
        <>
          <span
            className="currency__entropy-meter"
            style={{ ['--entropy-fill' as string]: `${Math.max(0, Math.min(100, entropyLevel))}%` }}
            aria-hidden
          />
          <span className="currency__screen" aria-hidden />
        </>
      )}
      {scoreLocked && <span className="currency__forcefield" aria-hidden />}
      {tab && <span className="currency__tab" aria-hidden>{tab}</span>}
      <span className={`currency__value${state}${scoreLocked ? ' currency__value--score-lock' : ''}`}>
        {Math.floor(shown).toLocaleString()}
      </span>
      <span className="currency__label">{label}</span>
      {entropy && <EntropyGhosts ticks={entropy} />}
    </div>
  );
}

/**
 * Entropy, floated off the Score readout.
 *
 * The same idea as the number that lifts off a die: the amount that moved,
 * shown where it moved from, so the total never changes without saying why.
 * The engine keeps a short list of steps it has taken; this holds each one on
 * screen for as long as the animation runs and then forgets it.
 */
type EntropyProjectile = {
  tick: EntropyTick;
  x: number;
  y: number;
  hitX: number;
  hitY: number;
  impactX: number;
  impactY: number;
  bounceX: number;
  bounceY: number;
  farX: number;
  farY: number;
  angle: number;
};

function randomEntropyProjectile(tick: EntropyTick): EntropyProjectile {
  // The Score glass is much wider than it is tall, so a radial spawn around
  // its centre can accidentally begin *inside* the field. Instead, choose an
  // approach direction, intersect it with the field's rectangular perimeter,
  // then spawn farther out on that same ray.
  const angle = Math.random() * Math.PI * 2;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const halfW = 83;
  const halfH = 31;
  const tx = Math.abs(dx) > 0.001 ? halfW / Math.abs(dx) : Number.POSITIVE_INFINITY;
  const ty = Math.abs(dy) > 0.001 ? halfH / Math.abs(dy) : Number.POSITIVE_INFINITY;
  const hitScale = Math.min(tx, ty);
  const hitX = dx * hitScale;
  const hitY = dy * hitScale;

  const launchGap = 34 + Math.random() * 28;
  const x = hitX + dx * launchGap;
  const y = hitY + dy * launchGap;

  // Unshielded attacks penetrate into the Score glass before terminating,
  // rather than exploding immediately on the outer edge.
  const impactX = hitX * 0.38;
  const impactY = hitY * 0.38;

  // Shielded attacks reverse away from the exact collision point instead of
  // travelling through the field to the middle before changing direction.
  const bounceX = hitX + dx * 20;
  const bounceY = hitY + dy * 20;
  const farX = hitX + dx * 54;
  const farY = hitY + dy * 54;

  return {
    tick, x, y, hitX, hitY, impactX, impactY, bounceX, bounceY, farX, farY,
    angle: Math.atan2(dy, dx),
  };
}

function EntropyGhosts({ ticks }: { ticks: EntropyTick[] }): JSX.Element {
  const [shown, setShown] = useState<EntropyProjectile[]>([]);
  const seen = useRef(0);
  const timers = useRef<number[]>([]);
  const newest = ticks.length > 0 ? ticks[ticks.length - 1].id : 0;

  useEffect(() => () => {
    for (const timer of timers.current) window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (newest <= seen.current) return;
    const fresh = ticks.filter((t) => t.id > seen.current);
    seen.current = newest;
    setShown((cur) => [...cur, ...fresh.map(randomEntropyProjectile)]);
    const ids = new Set(fresh.map((t) => t.id));
    const timer = window.setTimeout(
      () => {
        setShown((cur) => cur.filter((p) => !ids.has(p.tick.id)));
        timers.current = timers.current.filter((id) => id !== timer);
      },
      ENTROPY_ATTACK_MS,
    );
    timers.current.push(timer);
    // `ticks` is mutated in place by the engine; newest id is the signal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newest]);

  if (shown.length === 0) return <></>;
  return (
    <span className="entropy" aria-hidden>
      {shown.map((p) => (
        <span
          key={p.tick.id}
          className={
            `entropy__projectile${p.tick.blocked ? ' entropy__projectile--blocked' : ''}`
            + (p.tick.amount > 0 ? ' entropy__projectile--gain' : '')
          }
          style={{
            ['--entropy-x' as string]: `${p.x}px`,
            ['--entropy-y' as string]: `${p.y}px`,
            ['--entropy-hit-x' as string]: `${p.hitX}px`,
            ['--entropy-hit-y' as string]: `${p.hitY}px`,
            ['--entropy-impact-x' as string]: `${p.impactX}px`,
            ['--entropy-impact-y' as string]: `${p.impactY}px`,
            ['--entropy-bounce-x' as string]: `${p.bounceX}px`,
            ['--entropy-bounce-y' as string]: `${p.bounceY}px`,
            ['--entropy-far-x' as string]: `${p.farX}px`,
            ['--entropy-far-y' as string]: `${p.farY}px`,
            ['--entropy-angle' as string]: `${p.angle}rad`,
            ['--entropy-reverse-angle' as string]: `${p.angle + Math.PI}rad`,
          }}
        >
          <span className="entropy__dot" />
          {!p.tick.blocked && (
            <>
              <span className="entropy__burst" />
              <span className="entropy__impact">
                {p.tick.amount > 0 ? `+${p.tick.amount}` : String(p.tick.amount)}
              </span>
            </>
          )}
          {p.tick.blocked && <span className="entropy__spark" />}
        </span>
      ))}
    </span>
  );
}

/** Long enough for approach, impact, and either fade or shield ricochet. */
const ENTROPY_ATTACK_MS = 3600;

function GamePanel({ s, sealed, immersed, headroom, onSealed, resizeRef, glassRef }: {
  s: GameState;
  /** True in the Plan phase: the chamber is shut and a throw opens it. */
  sealed: boolean;
  /** True while crossing or inside the screen; keeps CRT backdrop out through exit. */
  immersed: boolean;
  /** True for the whole passage and Roll: the dice layer keeps its headroom. */
  headroom: boolean;
  onSealed: () => void;
  resizeRef: MutableRefObject<(() => void) | null>;
  /** What the drive fills the window with: the glass, not its bezel. */
  glassRef: MutableRefObject<HTMLDivElement | null>;
}): JSX.Element {
  const build = getBuild(s);
  const stats = displayStats(s, build);
  const cd = CONFIG.baseCooldownMs * stats.cooldownMult;
  const ready = canRoll(s);
  const dice = effectiveDice(s, build);
  const rollRef = useRef<(() => void) | null>(null);

  return (
    <section className="game game-area__panel">
      <div className="game__arena">
        {/* The status lamp every other plate carries. It repeats what the
            telemetry line on the glass already says in words. */}
        <span className={`chamber__lamp${ready ? '' : ' chamber__lamp--busy'}`} aria-hidden />
        <DiceTray
          s={s}
          rollRef={rollRef}
          resizeRef={resizeRef}
          glassRef={glassRef}
          sealed={sealed}
          immersed={immersed}
          headroom={headroom}
          onSealed={onSealed}
        />
      </div>

      <div className="game__controls">
        <button
          type="button"
          className={`rollbtn${ready ? '' : ' rollbtn--wait'}`}
          onClick={() => (sealed ? onSealed() : rollRef.current?.())}
          disabled={!sealed && !ready}
        >
          <span className="rollbtn__pip" aria-hidden>
            <svg width={22} height={22} viewBox="-16 -16 32 32">
              <rect x={-11} y={-11} width={22} height={22} rx={6} />
              <circle cx={-4.5} cy={-4.5} r={2} /><circle cx={4.5} cy={4.5} r={2} />
              <circle cx={4.5} cy={-4.5} r={2} /><circle cx={-4.5} cy={4.5} r={2} />
            </svg>
          </span>
          <span className="rollbtn__label">{dice > 1 ? `Roll ${dice} dice` : 'Roll'}</span>
          <span className="rollbtn__time">
            {sealed ? 'Open the chamber'
              : ready ? (touchPrimary() ? 'Tap to roll' : 'Press space')
              : `${(s.cooldownRemaining / 1000).toFixed(2)}s`}
          </span>
          <span className="rollbtn__fill"
            style={{ width: `${cd > 0 ? (1 - Math.min(1, s.cooldownRemaining / cd)) * 100 : 100}%` }} />
        </button>

        {s.decision && <DecisionBar decision={s.decision} />}
        <ControlRail s={s} />
      </div>
    </section>
  );
}

function LogPanel({ s }: { s: GameState }): JSX.Element {
  return (
    <div className="logpanel">
      {s.log.length === 0 && <p className="muted">Nothing yet.</p>}
      {s.log.slice().reverse().map((e) => (
        <div key={e.id} className={`feed__line feed__line--${e.kind}`}>{e.text}</div>
      ))}
    </div>
  );
}

function DebugPanel({ s }: { s: GameState }): JSX.Element {
  return (
    <div className="debug">
      <div className="debug__title">debug — ` to hide</div>
      <div className="debug__row">
        <span>framework</span><b>{s.framework}</b>
        <span>rolls</span><b>{s.totalRolls}</b>
        <span>rng calls</span><b>{s.rng.calls}</b>
        <span>pending</span><b>{s.pending.length}</b>
        <span>bonus dice</span><b>{s.bonusDice.length}</b>
        <span>entropy</span><b>{s.entropyDir === 0 ? 'idle' : s.entropyDir < 0 ? 'draining' : 'restoring'}</b>
      </div>
      <div className="debug__row">
        <button type="button" className="chip" onClick={() => store.act((g) => {
          if (!g.scoreLocked) {
            g.score += 5000;
            g.stats.scoreEarned += 5000;
          }
        })}>+5000 Score</button>
        <button type="button" className="chip" onClick={() => store.act((g) => { g.meta += 500; })}>+500 Meta</button>
        <button
          type="button" className="chip"
          onClick={() => store.act((g) => { if (!g.scoreLocked) g.score -= 500; })}
        >
          −500 Score
        </button>
        <button
          type="button" className="chip"
          onClick={() => store.act((g) => { if (!g.discovered.includes('frameworkB')) g.discovered.push('frameworkB'); })}
        >
          reveal second framework
        </button>
        <button
          type="button" className="chip"
          onClick={() => store.act((g) => { g.bonusDice.push(CONFIG.bonusDieMs); })}
        >
          +1 bonus die
        </button>
        <button type="button" className="chip" onClick={() => store.fastForward(100)}>+100 rolls</button>
        <button type="button" className="chip" onClick={() => store.reset()}>hard reset</button>
      </div>
    </div>
  );
}
