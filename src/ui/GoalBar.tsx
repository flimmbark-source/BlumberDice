import { currentGoal, type Goal } from '../engine/goal.ts';
import { NODES } from '../engine/nodes.ts';
import { checkAllocation } from '../engine/tree.ts';
import type { DiscoveryFlag } from '../engine/types.ts';
import type { GameState } from '../engine/game.ts';
import { NotationView } from './Notation.tsx';
import { NodeMark } from './NodeMark.tsx';
import { store } from './store.ts';
import { useCountUp } from './useCountUp.ts';

/**
 * What the player is working toward, shown beneath the Build tree.
 *
 * The loop this exists to make legible is: roll, watch a bar fill, reach a
 * threshold, make a build decision, pick the next one. Without it the score
 * is a counter with no destination.
 *
 * It states milestones and it carries a goal the player chose. It never
 * suggests a node.
 */
export function GoalBar({ s, onOpenTree }: {
  s: GameState;
  /** Focuses the tree on the next thing worth looking at. */
  onOpenTree: () => void;
}): JSX.Element | null {
  const goal = currentGoal(s);
  const availableToBuy = purchasableCount(s);
  // Follows the same eased total as the HUD, so the bar and the number agree.
  const { value: shownScore } = useCountUp(s.score, () => store.heldBack.score, true);
  const { value: shownMeta } = useCountUp(s.meta, () => store.heldBack.meta);

  if (goal.kind === 'none') return null;

  return (
    <div className={`goal${isReady(goal) ? ' goal--ready' : ''}`}>
      {goal.kind === 'milestone' && (
        <>
          <div className="goal__top">
            <Head label="Next milestone" />
            <Legend />
          </div>
          <Bar have={shownScore} need={goal.cost} currency="Score" />
          <p className="goal__note">
            {goal.unlocks === 1 ? '1 upgrade unlocks' : `${goal.unlocks} upgrades unlock`}
            {' · choose in the tree'}
          </p>
        </>
      )}

      {goal.kind === 'ready' && (
        <>
          <div className="goal__top">
            <span className="goal__mark" aria-hidden>◆</span>
            <p className="goal__lead">
              {goal.available === 1 ? '1 upgrade available' : `${goal.available} upgrades available`}
            </p>
            <Legend />
          </div>
          <div className="goal__act">
            <OpenButton n={goal.available} onClick={onOpenTree} />
          </div>
        </>
      )}

      {goal.kind === 'target' && (
        <>
          <div className="goal__top">
            {/* The node the player chose, so naming it here is reporting a
                decision rather than making one. */}
            <NodeMark type={goal.node.nodeType} region={goal.node.region} size={26} />
            <span className="goal__name">{goal.node.name}</span>
            <Legend />
          </div>

          {/* What the upgrade does, in the tree's own grammar. It sits with
              the name it belongs to, above the action. */}
          {goal.node.notation && (
            <div className="goal__nt">
              <NotationView notation={goal.node.notation} framework={s.framework} />
            </div>
          )}

          <div className="goal__act">
            <OpenButton n={availableToBuy} onClick={onOpenTree} />
          </div>

          {!goal.affordable && (
            <>
              {/* Never one blended percentage: the player has to see which
                  currency is the one holding them up. */}
              <Bar have={shownScore} need={goal.score.need} currency="Score"
                short={goal.score.have < goal.score.need} />
              {goal.meta && (
                <Bar have={shownMeta} need={goal.meta.need} currency="Meta" alt
                  short={goal.meta.have < goal.meta.need} />
              )}
              {goal.after && (
                <p className="goal__after">
                  <span className="goal__afterLabel">after</span>
                  {goal.after.name} · {(goal.after.costs.score ?? 0).toLocaleString()}
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function purchasableCount(s: GameState): number {
  const allocated = new Set(s.allocated);
  const discovered = new Set(s.discovered as DiscoveryFlag[]);
  const ctx = { allocated, discovered, score: s.score, meta: s.meta };
  return NODES.reduce((count, node) => count + (checkAllocation(node.id, ctx).ok ? 1 : 0), 0);
}


const isReady = (g: Goal): boolean =>
  g.kind === 'ready' || (g.kind === 'target' && g.affordable);

/**
 * The panel's own legend, printed on the glass at the end of the top row
 * rather than on the bezel above it.
 */
function Legend(): JSX.Element {
  return <span className="goal__legend">Next goal</span>;
}

/** Walks the tree through the nodes that can be bought, one press at a time. */
function OpenButton({ n, onClick }: { n: number; onClick: () => void }): JSX.Element {
  return (
    <button type="button" className="goal__open" onClick={onClick}>
      {n} Available to Buy
    </button>
  );
}

function Head({ label, ready }: { label: string; ready?: boolean }): JSX.Element {
  return (
    <div className="goal__head">
      {ready && <span className="goal__mark" aria-hidden>◆</span>}
      {label}
    </div>
  );
}

function Bar({ have, need, currency, alt, short }: {
  have: number; need: number; currency: string; alt?: boolean; short?: boolean;
}): JSX.Element {
  const shown = Math.min(Math.floor(have), need);
  const pct = need > 0 ? Math.min(1, Math.max(0, have / need)) : 1;
  return (
    <div className={`goalbar${alt ? ' goalbar--alt' : ''}${short ? ' goalbar--short' : ''}`}>
      <div className="goalbar__nums">
        <span className="goalbar__cur">{shown.toLocaleString()}</span>
        <span className="goalbar__sep">/</span>
        <span className="goalbar__need">{need.toLocaleString()}</span>
        <span className="goalbar__cy">{currency}</span>
      </div>
      <div className="goalbar__track">
        <span className="goalbar__fill" style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}
