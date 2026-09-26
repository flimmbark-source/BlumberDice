import { useEffect, useState } from 'react';
import {
  allocatedCost, canRefund, canRoll, canSwitchFramework, CONFIG, displayStats,
  getBuild, type GameState,
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

type Tab = 'web' | 'stats' | 'log';

export function App(): JSX.Element {
  const s = useGame();
  const [tab, setTab] = useState<Tab>('web');
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
      <TopBar s={s} knowsB={knowsB} />
      <main className="main">
        <GamePanel s={s} onOpenTree={() => setTab('web')} />
        <aside className="side">
          <nav className="tabs">
            <TabBtn id="web" tab={tab} set={setTab} label="Web" badge={availableCount(s)} />
            <TabBtn id="stats" tab={tab} set={setTab} label="Stats" dot={statsUnread(s)} />
            <TabBtn id="log" tab={tab} set={setTab} label="Log" />
          </nav>
          <div className="side__body">
            {tab === 'web' && (
              <TreeView
                allocatedKey={s.allocated.join(',')}
                discoveredKey={s.discovered.join(',')}
                score={s.score}
                meta={s.meta}
                framework={s.framework}
                pinned={s.pinned}
                canRefund={canRefund(s)}
                refundScore={spent.score}
                refundMeta={spent.meta}
              />
            )}
            {tab === 'stats' && <StatsPanel s={s} />}
            {tab === 'log' && <LogPanel s={s} />}
          </div>
        </aside>
      </main>
      {store.debug && <DebugPanel s={s} />}
    </div>
  );
}

function TopBar({ s, knowsB }: { s: GameState; knowsB: boolean }): JSX.Element {
  return (
    <header className="topbar">
      <div className="brand">BlumberDice</div>
      <div className="currencies">
        <Currency label="Score" value={s.score} />
        {knowsB && <Currency label="Meta" value={s.meta} alt />}
      </div>
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
    </header>
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

function GamePanel({ s, onOpenTree }: { s: GameState; onOpenTree: () => void }): JSX.Element {
  const build = getBuild(s);
  const stats = displayStats(s, build);
  const cd = CONFIG.baseCooldownMs * stats.cooldownMult;
  const progress = cd > 0 ? 1 - Math.min(1, s.cooldownRemaining / cd) : 1;
  const ready = canRoll(s);

  return (
    <section className="game">
      <DiceTray s={s} />

      <div className={`cooldown${ready ? ' cooldown--ready' : ''}`}>
        <span className="cooldown__fill" style={{ width: `${progress * 100}%` }} />
      </div>

      <GoalBar s={s} onOpenTree={onOpenTree} />

      {s.decision && <DecisionBar decision={s.decision} />}

      <div className="game__lower">
        <div className="feed">
          {s.log.slice(-5).reverse().map((e) => (
            <div key={e.id} className={`feed__line feed__line--${e.kind}`}>{e.text}</div>
          ))}
        </div>
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
