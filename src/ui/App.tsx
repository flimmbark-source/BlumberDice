import { useEffect, useRef, useState } from 'react';
import {
  allocatedCost, canRefund, canRoll, canSwitchFramework, CONFIG, displayStats,
  effectiveDice, getBuild, type GameState,
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
import { DesktopWindow } from './DesktopWindow.tsx';
import { StatsPanel } from './StatsPanel.tsx';

const TREE_UNLOCK_SCORE = 20;
type Tab = 'web' | 'stats' | 'log';

export function App(): JSX.Element {
  const s = useGame();
  const [inspected, setInspected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('web');
  const [expanded, setExpanded] = useState(false);
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
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

  const openGoalInTree = (): void => {
    setTab('web');

    // A chosen target should always jump straight back to that node.
    if (s.pinned) {
      focusNode(s.pinned);
      return;
    }

    // With no pinned goal, "Open in Tree" walks the currently affordable
    // nodes. If one is already inspected, move to the next; otherwise start
    // with the first. This makes the button useful in the generic "ready"
    // state instead of doing nothing.
    const targets = openTargets(s);
    if (targets.length === 0) return;
    const current = inspected ? targets.indexOf(inspected) : -1;
    focusNode(targets[(current + 1) % targets.length]);
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

  const alignWindows = (): void => {
    for (const id of ['tree', 'upgrade']) {
      try { localStorage.removeItem(`blumberdice.window.${id}`); } catch { /* optional persistence */ }
    }
    setLayoutVersion((v) => v + 1);
  };

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
        onAlignWindows={alignWindows}
      />

      <main className="desktop" aria-label="BlumberDice workspace">
        <section className="game-area" aria-label="Game area">
          <GamePanel s={s} />
        </section>

        {treeUnlocked && (
          <DesktopWindow
            key={`tree-${layoutVersion}`}
            id="tree"
            title={tab === 'web' ? 'Build tree' : tab === 'stats' ? 'Stats' : 'Log'}
            className="desktop-window--tree"
            defaultStyle={{ left: 12, top: 12, width: '23%', height: 'calc(100% - 24px)' }}
          >
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
          </DesktopWindow>
        )}

        {treeUnlocked && inspected && (
          <DesktopWindow
            key={`upgrade-${layoutVersion}`}
            id="upgrade"
            title="Selected upgrade"
            className="desktop-window--upgrade"
            defaultStyle={{ right: 12, top: 12, width: '23%', height: 'calc(100% - 24px)' }}
          >
            <SelectedUpgrade s={s} nodeId={inspected} onReveal={focusNode} embedded />
          </DesktopWindow>
        )}

      </main>

      {store.debug && <DebugPanel s={s} />}
    </div>
  );
}

function TopBar({
  s, knowsB, canRefund: mayRefund, refundScore, refundMeta,
  treeUnlocked, tab, setTab, onAlignWindows,
}: {
  s: GameState;
  knowsB: boolean;
  canRefund: boolean;
  refundScore: number;
  refundMeta: number;
  treeUnlocked: boolean;
  tab: Tab;
  setTab: (tab: Tab) => void;
  onAlignWindows: () => void;
}): JSX.Element {
  const [menu, setMenu] = useState(false);
  return (
    <header className="topbar">
      <div className="brand">
        <BrandMark />
        <span className="brand__word"><b>Blumber</b><i>Dice</i></span>
      </div>

      {treeUnlocked ? (
        <nav className="tabsx" role="tablist" aria-label="Tech window view">
          <TabBtn id="web" tab={tab} set={setTab} label="Build" />
          <TabBtn id="stats" tab={tab} set={setTab} label="Stats" />
          <TabBtn id="log" tab={tab} set={setTab} label="Log" />
        </nav>
      ) : (
        <div />
      )}

      <div className="topbar__right">
        {treeUnlocked && (
          <button type="button" className="window-arrange" onClick={onAlignWindows}>
            Align windows
          </button>
        )}
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
          <Currency label="Score" value={s.score} />
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
                type="button" className="gear__item" disabled={!mayRefund}
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
                disabled={s.score <= 0}
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

function TabBtn({ id, tab, set, label }: {
  id: Tab;
  tab: Tab;
  set: (tab: Tab) => void;
  label: string;
}): JSX.Element {
  return (
    <button
      type="button"
      className={`tab${tab === id ? ' tab--on' : ''}`}
      onClick={() => set(id)}
    >
      {label}
    </button>
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

function Currency({ label, value, alt = false }: { label: string; value: number; alt?: boolean }): JSX.Element {
  const { value: shown, moving } = useCountUp(
    value,
    alt ? () => store.heldBack.meta : () => store.heldBack.score,
  );
  const rising = moving && value > shown;
  return (
    <div className={`currency${alt ? ' currency--alt' : ''}`}>
      <span className={`currency__value${moving ? (rising ? ' currency__value--up' : ' currency__value--down') : ''}`}>
        {Math.floor(shown).toLocaleString()}
      </span>
      <span className="currency__label">{label}</span>
    </div>
  );
}

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
            {ready ? 'Space' : `${(s.cooldownRemaining / 1000).toFixed(2)}s`}
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
      </div>
      <div className="debug__row">
        <button type="button" className="chip" onClick={() => store.act((g) => {
          g.score += 5000;
          g.stats.scoreEarned += 5000;
        })}>+5000 Score</button>
        <button type="button" className="chip" onClick={() => store.act((g) => { g.meta += 500; })}>+500 Meta</button>
        <button
          type="button" className="chip"
          onClick={() => store.act((g) => { if (!g.discovered.includes('frameworkB')) g.discovered.push('frameworkB'); })}
        >
          reveal second framework
        </button>
        <button type="button" className="chip" onClick={() => store.fastForward(100)}>+100 rolls</button>
        <button type="button" className="chip" onClick={() => store.reset()}>hard reset</button>
      </div>
    </div>
  );
}
