import { useEffect, useRef, useState } from 'react';
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
import { SelectedUpgrade } from './SelectedUpgrade.tsx';
import { StatsPanel } from './StatsPanel.tsx';
import { touchPrimary } from './pointer.ts';

const TREE_UNLOCK_SCORE = 20;
type Tab = 'web' | 'stats' | 'log';

export function App(): JSX.Element {
  const s = useGame();
  const [inspected, setInspected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('web');
  const [expanded, setExpanded] = useState(false);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const focusN = useRef(0);

  // scoreEarned is lifetime Score for this run, so spending below 20 never
  // makes the tree vanish again after the player has discovered it.
  const treeUnlocked = s.stats.scoreEarned >= TREE_UNLOCK_SCORE;
  const knowsB = s.discovered.includes('frameworkB');
  const spent = allocatedCost(s);
  const hasGoalDisplay = treeUnlocked && currentGoal(s).kind !== 'none';

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
    setTab('web');

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === '`') store.toggleDebug();
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
    <div className="app">
      <TopBar
        s={s}
        knowsB={knowsB}
        canRefund={canRefund(s)}
        refundScore={spent.score}
        refundMeta={spent.meta}
        treeUnlocked={treeUnlocked}
        tab={tab}
        setTab={setTab}
      />

      <main className="desktop" aria-label="Roll Reactor workspace">
        <section className="game-area" aria-label="Game area">
          <GamePanel s={s} />
        </section>

        {treeUnlocked && (
          <section className="fixed-panel fixed-panel--tree">
            <div className="fixed-panel__bar">
              <span className="fixed-panel__title">
                {tab === 'web' ? 'Build tree' : tab === 'stats' ? 'Stats' : 'Log'}
              </span>
            </div>
            <div className="fixed-panel__body">
              {tab === 'web' && (
                <div className="tech-build">
                  <TreeView
                    allocatedKey={s.allocated.join(',')}
                    discoveredKey={s.discovered.join(',')}
                    score={s.score}
                    meta={s.meta}
                    scoreLocked={s.scoreLocked}
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
                  {hasGoalDisplay && (
                    <div className="tech-build__goal">
                      <GoalBar
                        s={s}
                        onOpenTree={openGoalInTree}
                      />
                    </div>
                  )}
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
          </section>
        )}

        {treeUnlocked && inspected && (
          <section className="fixed-panel fixed-panel--upgrade">
            <div className="fixed-panel__bar">
              <span className="fixed-panel__title">Selected upgrade</span>
            </div>
            <div className="fixed-panel__body">
              <SelectedUpgrade s={s} nodeId={inspected} onReveal={selectUpgrade} embedded />
            </div>
          </section>
        )}
      </main>

      {store.debug && <DebugPanel s={s} />}
    </div>
  );
}

function TopBar({
  s, knowsB, canRefund: mayRefund, refundScore, refundMeta,
  treeUnlocked, tab, setTab,
}: {
  s: GameState;
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
            scoreLocked={s.scoreLocked}
            onToggleLock={actions.toggleScoreLock}
          />
          {knowsB && <Currency label="Meta" value={s.meta} alt />}
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
    <svg className="brand__mark" width={34} height={34} viewBox="-16 -16 32 32" aria-hidden>
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

function Currency({ label, value, alt = false, entropy, scoreLocked = false, onToggleLock }: {
  label: string;
  value: number;
  alt?: boolean;
  /** Entropy steps to animate around this readout. Score only. */
  entropy?: EntropyTick[];
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
          className={`entropy__projectile${p.tick.blocked ? ' entropy__projectile--blocked' : ''}`}
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
              <span className="entropy__impact">-1</span>
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

function GamePanel({ s }: { s: GameState }): JSX.Element {
  const build = getBuild(s);
  const stats = displayStats(s, build);
  const cd = CONFIG.baseCooldownMs * stats.cooldownMult;
  const ready = canRoll(s);
  const dice = effectiveDice(s, build);
  const rollRef = useRef<(() => void) | null>(null);

  return (
    <section className="game game-area__panel">
      <div className="game__arena">
        <DiceTray s={s} rollRef={rollRef} />
      </div>

      <div className="game__controls">
        <button
          type="button"
          className={`rollbtn${ready ? '' : ' rollbtn--wait'}`}
          onClick={() => rollRef.current?.()}
          disabled={!ready}
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
            {ready ? (touchPrimary() ? 'Tap' : 'Space') : `${(s.cooldownRemaining / 1000).toFixed(2)}s`}
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
