import { currentGoal, type Goal } from '../engine/goal.ts';
import type { GameState } from '../engine/game.ts';
import { NotationView } from './Notation.tsx';
import { actions, store } from './store.ts';
import { useCountUp } from './useCountUp.ts';

/**
 * What the player is working toward, kept beside the die.
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
  onOpenTree: () => void;
}): JSX.Element | null {
  const goal = currentGoal(s);
  // Follows the same eased total as the HUD, so the bar and the number agree.
  const { value: shownScore } = useCountUp(s.score, () => store.heldBack.score);
  const { value: shownMeta } = useCountUp(s.meta, () => store.heldBack.meta);

  if (goal.kind === 'none') return null;

  return (
    <div className={`goal${isReady(goal) ? ' goal--ready' : ''}`}>
      {goal.kind === 'milestone' && (
        <>
          <Head label="Next milestone" />
          <Bar have={shownScore} need={goal.cost} currency="Score" />
          <p className="goal__note">
            {goal.unlocks === 1 ? '1 upgrade unlocks' : `${goal.unlocks} upgrades unlock`}
            {' · choose in the web'}
          </p>
        </>
      )}

      {goal.kind === 'ready' && (
        <>
          <Head label="Upgrade ready" ready />
          <p className="goal__lead">
            {goal.available === 1 ? '1 upgrade available' : `${goal.available} upgrades available`}
          </p>
          <button type="button" className="goal__open" onClick={onOpenTree}>Open the web</button>
        </>
      )}

      {goal.kind === 'target' && (
        <>
          <Head label={goal.affordable ? 'Upgrade ready' : 'Next'} ready={goal.affordable} />
          <div className="goal__row">
            <span className="goal__name">{goal.node.name}</span>
            <button
              type="button"
              className="goal__unpin"
              onClick={() => actions.pin(null)}
              aria-label={`Stop targeting ${goal.node.name}`}
            >
              clear
            </button>
          </div>

          {/* The upgrade is its own reward preview, in the tree's own grammar. */}
          {goal.node.notation && (
            <div className="goal__nt">
              <NotationView notation={goal.node.notation} framework={s.framework} />
            </div>
          )}

          {goal.affordable ? (
            <button type="button" className="goal__open" onClick={onOpenTree}>Open the web</button>
          ) : (
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

const isReady = (g: Goal): boolean =>
  g.kind === 'ready' || (g.kind === 'target' && g.affordable);

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
