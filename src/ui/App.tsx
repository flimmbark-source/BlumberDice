import { useEffect, useRef, useState } from 'react';
import {
  allocatedCost, canRefund, canRoll, canSwitchFramework, CONFIG, displayStats,
  effectiveDice, getBuild, type GameState,
} from '../engine/game.ts';
import { NODES } from '../engine/nodes.ts';
import { checkAllocation, isVisible } from '../engine/tree.ts';
import type { DiscoveryFlag } from '../engine/types.ts';
import { actions, store, useGame } from './store.ts';
import { useCountUp } from './useCountUp.ts';
import { ControlRail } from './ControlRail.tsx';
import { DecisionBar } from './DecisionBar.tsx';
import { GoalBar } from './GoalBar.tsx';
import { DiceTray } from './dice/DiceTray.tsx';
import { StatsPanel } from './StatsPanel.tsx';
import { TreeView } from './TreeView.tsx';
import { SelectedUpgrade } from './SelectedUpgrade.tsx';

type Tab = 'web' | 'stats' | 'log';

export function App(): JSX.Element {
  const s = useGame();
  const [tab, setTab] = useState<Tab>('web');
  // Which node the panels are describing. Owned by the app because two
  // columns read it: the web sets it, the upgrade panel shows it.
  const [inspected, setInspected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const knowsB = s.discovered.includes('frameworkB');
  const spent = allocatedCost(s);

  useEffect(() => { if (tab === 'stats') actions.seenStats(); }, [tab]);

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
      <TopBar s={s} knowsB={knowsB} tab={tab} setTab={setTab} canRefund={canRefund(s)}
        refundScore={spent.score} refundMeta={spent.meta} />

      <main className="main">
        {/* The game column is first in the DOM so Tab reaches Roll before
            fifty-four tree nodes; grid-column puts it back in the middle. */}
        <GamePanel
          s={s}
          onOpenTree={(id) => {
            setTab('web');
            // Selecting, never buying: the panel fills in and the node lights
            // up in the web, and allocating stays an explicit second act.
            if (id) setInspected(id);
          }}
        />

        <section className="col col--left">
          {tab === 'web' && (
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
            />
          )}
          {tab === 'stats' && (
            <aside className="panel panel--left">
              <h2 className="panel__title">Stats</h2>
              <div className="panel__body"><StatsPanel s={s} /></div>
            </aside>
          )}
          {tab === 'log' && (
            <aside className="panel panel--left">
              <h2 className="panel__title">Log</h2>
              <div className="panel__body"><LogPanel s={s} /></div>
            </aside>
          )}
        </section>

        <SelectedUpgrade s={s} nodeId={inspected} onReveal={setInspected} />
      </main>

      {store.debug && <DebugPanel s={s} />}
    </div>
  );
}


function TopBar({ s, knowsB, tab, setTab, canRefund: mayRefund, refundScore, refundMeta }: {
  s: GameState; knowsB: boolean; tab: Tab; setTab: (t: Tab) => void;
  canRefund: boolean; refundScore: number; refundMeta: number;
}): JSX.Element {
  const [menu, setMenu] = useState(false);
  return (
    <header className="topbar">
      <div className="brand">
        <BrandMark />
        <span className="brand__word"><b>Blumber</b><i>Dice</i></span>
      </div>

      <nav className="tabsx" role="tablist" aria-label="Panel">
        <TabBtn id="web" tab={tab} set={setTab} label="Build" badge={availableCount(s)} />
        <TabBtn id="stats" tab={tab} set={setTab} label="Stats" dot={statsUnread(s)} />
        <TabBtn id="log" tab={tab} set={setTab} label="Log" />
      </nav>

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
            </div>
          )}
        </div>
      </div>
    </header>
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
  // Held back while the rolled number is still showing above its die.
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

function GamePanel({ s, onOpenTree }: {
  s: GameState;
  onOpenTree: (nodeId?: string) => void;
}): JSX.Element {
  const build = getBuild(s);
  const stats = displayStats(s, build);
  const cd = CONFIG.baseCooldownMs * stats.cooldownMult;
  const ready = canRoll(s);
  const dice = effectiveDice(s, build);
  const rollRef = useRef<(() => void) | null>(null);

  return (
    <section className="game panel">
      <h2 className="panel__title">Dice</h2>

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

        <GoalBar s={s} onOpenTree={onOpenTree} />
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

function TabBtn({ id, tab, set, label, badge, dot }: {
  id: Tab; tab: Tab; set: (t: Tab) => void; label: string; badge?: number; dot?: boolean;
}): JSX.Element {
  return (
    <button type="button" className={`tab${tab === id ? ' tab--on' : ''}`} onClick={() => set(id)}>
      {label}
      {badge ? <span className="tab__badge">{badge}</span> : null}
      {dot ? <span className="tab__dot" aria-label="new" /> : null}
    </button>
  );
}

/**
 * The ordinary "there is something here you have not looked at" convention.
 * It points at the panel, not at what is in it.
 */
function statsUnread(s: GameState): boolean {
  return !s.sawStats && s.totalRolls >= CONFIG.discoveryRollThreshold;
}

function availableCount(s: GameState): number {
  const allocated = new Set(s.allocated);
  const discovered = new Set(s.discovered as DiscoveryFlag[]);
  let n = 0;
  for (const node of NODES) {
    if (!isVisible(node, discovered)) continue;
    if (checkAllocation(node.id, { allocated, discovered, score: s.score, meta: s.meta }).ok) n++;
  }
  return n;
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
        <button type="button" className="chip" onClick={() => store.act((g) => { g.score += 5000; })}>+5000 Score</button>
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
