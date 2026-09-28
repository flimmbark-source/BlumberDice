import { useEffect, useRef, useState, type MutableRefObject } from 'react';
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
import { DiceTray } from './dice/DiceTray.tsx';
import { TreeView } from './TreeView.tsx';
import { hasLeadsTo, LeadsTo, SelectedUpgrade } from './SelectedUpgrade.tsx';
import { StatsPanel } from './StatsPanel.tsx';
import { touchPrimary } from './pointer.ts';
import { STAGE_H, STAGE_W, useSkin, useStageScale } from './skin.ts';
import chassisUrl from './chassis.webp';
import { playChannelClick, playWhirr } from './sound.ts';
import {
  canDrive, DRIVE_MS, NO_ZOOM, type Phase, zoomOnto, zoomStyle, type Zoom,
} from './phase.ts';

const TREE_UNLOCK_SCORE = 20;
type Tab = 'web' | 'stats' | 'log';

export function App(): JSX.Element {
  const s = useGame();
  const skin = useSkin();
  const stageScale = useStageScale(skin === 'photo');
  const [inspected, setInspected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('web');
  // Bumped on every channel change. It keys the flicker overlay, so the
  // animation restarts even when the same channel is picked twice.
  const [channel, setChannel] = useState(0);

  /**
   * Which half of the turn this is. It is deliberately not saved: a reload
   * comes back in Plan, with the shield on, rather than resuming mid-throw
   * with Score exposed.
   */
  const [phase, setPhase] = useState<Phase>('plan');
  const [zoom, setZoom] = useState<Zoom>(NO_ZOOM);
  const chamberRef = useRef<HTMLDivElement>(null);
  const trayResizeRef = useRef<(() => void) | null>(null);

  /**
   * Drive into the chamber. The shield comes off as the view arrives, which
   * is the whole point of the phase: Score is frozen while planning and live
   * while rolling.
   */
  const enterRoll = (): void => {
    if (phase === 'roll') return;
    const el = chamberRef.current;
    if (!el) return;
    playWhirr('in', DRIVE_MS);
    if (canDrive()) {
      setZoom((z) => zoomOnto(el.getBoundingClientRect(), z, 8));
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setPhase('roll');
    if (s.scoreLocked) actions.toggleScoreLock();
  };

  /** Engage the shield and let the view back out. */
  const endRollRef = useRef<(() => void) | null>(null);
  const endRoll = (): void => {
    if (phase !== 'roll') return;
    playWhirr('out', DRIVE_MS);
    setZoom(NO_ZOOM);
    setPhase('plan');
    if (!s.scoreLocked) actions.toggleScoreLock();
  };
  endRollRef.current = phase === 'roll' ? endRoll : null;

  const changeChannel = (next: Tab): void => {
    setTab(next);
    setChannel((n) => n + 1);
    playChannelClick();
  };
  const [expanded, setExpanded] = useState(false);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const focusN = useRef(0);

  // scoreEarned is lifetime Score for this run, so spending below 20 never
  // makes the tree vanish again after the player has discovered it.
  const treeUnlocked = s.stats.scoreEarned >= TREE_UNLOCK_SCORE;
  const knowsB = s.discovered.includes('frameworkB');
  const spent = allocatedCost(s);
  const hasGoalDisplay = treeUnlocked && currentGoal(s).kind !== 'none';
  // The goal gets its own plate under the tree, so it exists only while the
  // Build view is the one on screen.
  const showGoalPanel = hasGoalDisplay && tab === 'web';
  const photo = skin === 'photo';
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

  useEffect(() => {
    if (treeUnlocked && tab === 'stats') actions.seenStats();
  }, [treeUnlocked, tab]);

  // Planning is shielded, always. This is what holds that true across a
  // reload, a refund, or anything else that reaches the lock directly.
  useEffect(() => {
    if (phase === 'plan' && !s.scoreLocked) actions.toggleScoreLock();
  }, [phase, s.scoreLocked]);

  // A transform changes nothing about layout, so the tray has to be told the
  // drive has finished or it keeps the backing store it was sized for.
  useEffect(() => {
    const t = window.setTimeout(() => trayResizeRef.current?.(), DRIVE_MS + 40);
    return () => window.clearTimeout(t);
  }, [zoom]);

  // The window changing shape while driven in would otherwise leave the
  // chamber off-centre until the phase ended.
  useEffect(() => {
    if (phase !== 'roll') return;
    const onResize = (): void => {
      const el = chamberRef.current;
      if (!el) return;
      setZoom((z) => (canDrive() ? zoomOnto(el.getBoundingClientRect(), z, 8) : NO_ZOOM));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [phase]);

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

  return (
    <>
    {/* The drive lives on a wrapper, outside the faceplate's own transform,
        so the two compose instead of fighting. */}
    <div className={`viewport${phase === 'roll' ? ' viewport--driven' : ''}`}
      style={{ transform: zoomStyle(zoom) }}>
    <div
      className={`app${photo ? ' app--photo' : ''}`}
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
            onSealed={enterRoll}
            resizeRef={trayResizeRef}
            chamberRef={chamberRef}
          />
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
                    score={s.score}
                    meta={s.meta}
                    framework={s.framework}
                    pinned={s.pinned}
                    inspected={inspected}
                    setInspected={setInspected}
                    expanded={expanded}
                    setExpanded={setExpanded}
                    focus={focus}
                    onFocusConsumed={() => setFocus(null)}
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

        {treeUnlocked && inspected && (
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

    {/* Outside the drive, so it stays put while the view moves. The readout
        rises into the player's view when the chamber opens, and engaging its
        shield is what closes it again. */}
    {phase === 'roll' && (
      <div className="rollhud">
        <div className="rollhud__inner">
          <Currency
            label="Score"
            value={s.score}
            entropy={s.entropyLog}
            entropyLevel={s.entropyLevel}
            scoreLocked={s.scoreLocked}
            onToggleLock={endRoll}
          />
          <p className="rollhud__hint">
            Click the dice to roll · lock Score to stop
          </p>
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
  treeUnlocked, tab, setTab, onUnshield,
}: {
  s: GameState;
  /** Taking the shield off is what opens the chamber. */
  onUnshield: () => void;
  knowsB: boolean;
  canRefund: boolean;
  refundScore: number;
  refundMeta: number;
  treeUnlocked: boolean;
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

      {treeUnlocked ? (
        /* One bank of recessed keys for the three fixed information views. */
        <nav className="tabsx" role="tablist" aria-label="Game view">
          <TabBtn id="web" tab={tab} set={setTab} label="Build" icon={<BuildIcon />} />
          <TabBtn id="stats" tab={tab} set={setTab} label="Stats" icon={<StatsIcon />} />
          <TabBtn id="log" tab={tab} set={setTab} label="Log" icon={<LogIcon />} />
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
      className={`tab${tab === id ? ' tab--on' : ''}`}
      onClick={() => set(id)}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

/* Key-cap glyphs. Each one draws the panel its key opens. */

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

function Currency({ label, value, alt = false, entropy, entropyLevel = 0, scoreLocked = false, onToggleLock }: {
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

function GamePanel({ s, sealed, onSealed, resizeRef, chamberRef }: {
  s: GameState;
  /** True in the Plan phase: the chamber is shut and a throw opens it. */
  sealed: boolean;
  onSealed: () => void;
  resizeRef: MutableRefObject<(() => void) | null>;
  /** What the drive fills the window with. */
  chamberRef: MutableRefObject<HTMLDivElement | null>;
}): JSX.Element {
  const build = getBuild(s);
  const stats = displayStats(s, build);
  const cd = CONFIG.baseCooldownMs * stats.cooldownMult;
  const ready = canRoll(s);
  const dice = effectiveDice(s, build);
  const rollRef = useRef<(() => void) | null>(null);

  return (
    <section className="game game-area__panel">
      <div className="game__arena" ref={chamberRef}>
        {/* The status lamp every other plate carries. It repeats what the
            telemetry line on the glass already says in words. */}
        <span className={`chamber__lamp${ready ? '' : ' chamber__lamp--busy'}`} aria-hidden />
        <DiceTray
          s={s}
          rollRef={rollRef}
          resizeRef={resizeRef}
          sealed={sealed}
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
