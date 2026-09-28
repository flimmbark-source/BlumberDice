import { checkAllocation, describeNode, isVisible } from '../engine/tree.ts';
import { NODES, NODES_BY_ID } from '../engine/nodes.ts';
import type { GameState } from '../engine/game.ts';
import type { DiscoveryFlag, PassiveNode } from '../engine/types.ts';
import { NotationView, Prose } from './Notation.tsx';
import { NodeMark } from './NodeMark.tsx';
import { actions } from './store.ts';
import { canPin } from '../engine/goal.ts';

/**
 * The docked panel for whichever node the player last pointed at.
 *
 * It replaces the tooltip that used to float over the web. A fixed column
 * cannot shove the layout around the way a docked panel in the flow once
 * did, which was the reason for floating it in the first place.
 */
export function SelectedUpgrade({ s, nodeId, onReveal, embedded = false, withChain = true }: {
  s: GameState;
  nodeId: string | null;
  onReveal: (id: string) => void;
  embedded?: boolean;
  /** False when the caller mounts `LeadsTo` on a plate of its own. */
  withChain?: boolean;
}): JSX.Element {
  const node = nodeId ? NODES_BY_ID.get(nodeId) ?? null : null;
  if (!node) {
    return (
      <aside className="panel panel--right">
        {!embedded && <h2 className="panel__title">Selected upgrade</h2>}
        <p className="panel__empty">Select a node in the build tree to read it.</p>
      </aside>
    );
  }

  const allocated = new Set(s.allocated);
  const discovered = new Set(s.discovered as DiscoveryFlag[]);
  const owned = allocated.has(node.id);
  const check = checkAllocation(node.id, { allocated, discovered, score: s.score, meta: s.meta });
  const reachable = node.prerequisites.length === 0
    || node.prerequisites.some((p) => allocated.has(p));
  const state: 'owned' | 'available' | 'short' | 'locked' = owned ? 'owned'
    : check.ok ? 'available'
    : reachable ? 'short' : 'locked';
  const isGoal = s.pinned === node.id;
  const pinnable = canPin(s, node.id);
  return (
    <aside className="panel panel--right">
      {!embedded && <h2 className="panel__title">Selected upgrade</h2>}

      <div className="upg">
        <div className="upg__head">
          <NodeMark type={node.nodeType} region={node.region} size={54} glyph />
          <div className="upg__id">
            <div className="upg__nameRow">
              <span className="upg__name">{node.name}</span>
              {!owned && (
                <button
                  type="button"
                  className={`upg__goalStar${isGoal ? ' upg__goalStar--on' : ''}`}
                  aria-label={isGoal ? 'Clear goal' : pinnable ? `Set ${node.name} as goal` : 'Connect this upgrade before setting it as a goal'}
                  title={isGoal ? 'Current Goal — click to clear' : pinnable ? 'Set as Goal' : 'Connect this upgrade first'}
                  disabled={!pinnable && !isGoal}
                  onClick={() => actions.pin(isGoal ? null : node.id)}
                >
                  {isGoal ? '★' : '☆'}
                </button>
              )}
            </div>
            <span className="upg__chips">
              <span className="chipx">{CLASS_LABEL[node.nodeType]}</span>
              <span className={`chipx chipx--${state}`}>{STATE_LABEL[state]}</span>
            </span>
          </div>
        </div>

        {node.notation && (
          <div className="upg__nt">
            <NotationView
              notation={node.notation}
              framework={s.framework}
              game={s}
              nodeId={node.id}
            />
          </div>
        )}

        <Prose text={describeNode(node, s.framework)} />

        <div className="upg__cost">
          <span className="upg__costLabel">Cost</span>
          <span className="upg__costVal">
            {(node.costs.score ?? 0) > 0 && (
              <span className="coin coin--score">{(node.costs.score ?? 0).toLocaleString()}</span>
            )}
            {(node.costs.meta ?? 0) > 0 && (
              <span className="coin coin--meta">{(node.costs.meta ?? 0).toLocaleString()}</span>
            )}
            {!node.costs.score && !node.costs.meta && <span className="coin">—</span>}
          </span>
        </div>

        {state === 'available' && (
          <button type="button" className="btn btn--primary"
            onClick={() => actions.allocate(node.id)}>
            Allocate
          </button>
        )}

        {state === 'locked' && (
          <p className="upg__note">Connect an adjacent node first.</p>
        )}
      </div>

      {withChain && <Chain s={s} node={node} onReveal={onReveal} />}
    </aside>
  );
}

/**
 * Phone inspector: the same complete mechanical effect, with redundant
 * representations removed. The tree stays on screen behind it and the
 * spending controls stay in the same compact sheet, so inspecting a node
 * never turns into a page-scroll task.
 */
export function MobileSelectedUpgrade({ s, nodeId, onClose }: {
  s: GameState;
  nodeId: string | null;
  onClose: () => void;
}): JSX.Element | null {
  const node = nodeId ? NODES_BY_ID.get(nodeId) ?? null : null;
  if (!node) return null;

  const allocated = new Set(s.allocated);
  const discovered = new Set(s.discovered as DiscoveryFlag[]);
  const owned = allocated.has(node.id);
  const check = checkAllocation(node.id, {
    allocated, discovered, score: s.score, meta: s.meta,
  });
  const reachable = node.prerequisites.length === 0
    || node.prerequisites.some((p) => allocated.has(p));
  const state: 'owned' | 'available' | 'short' | 'locked' = owned ? 'owned'
    : check.ok ? 'available'
    : reachable ? 'short' : 'locked';
  const isGoal = s.pinned === node.id;
  const pinnable = canPin(s, node.id);

  return (
    <aside className="mobile-upgrade" aria-label={`Selected upgrade: ${node.name}`}>
      <div className="mobile-upgrade__head">
        <NodeMark type={node.nodeType} region={node.region} size={34} glyph />
        <div className="mobile-upgrade__identity">
          <span className="mobile-upgrade__name">{node.name}</span>
          <span className={`mobile-upgrade__state mobile-upgrade__state--${state}`}>
            {STATE_LABEL[state]}
          </span>
        </div>
        {!owned && (
          <button
            type="button"
            className={`mobile-upgrade__goal${isGoal ? ' mobile-upgrade__goal--on' : ''}`}
            aria-label={isGoal ? 'Clear goal' : pinnable ? `Set ${node.name} as goal` : 'Connect this upgrade before setting it as a goal'}
            disabled={!pinnable && !isGoal}
            onClick={() => actions.pin(isGoal ? null : node.id)}
          >
            {isGoal ? '★' : '☆'}
          </button>
        )}
        <button type="button" className="mobile-upgrade__close" aria-label="Close selected upgrade" onClick={onClose}>
          ×
        </button>
      </div>

      {/* Keep the game's detailed symbolic notation on phone as well as the
          full authored prose. Space is saved through tighter layout and by
          omitting only secondary navigation such as Leads To. */}
      {node.notation && (
        <div className="mobile-upgrade__notation">
          <NotationView
            notation={node.notation}
            framework={s.framework}
            game={s}
            nodeId={node.id}
          />
        </div>
      )}

      <div className="mobile-upgrade__effect">
        <Prose text={describeNode(node, s.framework)} />
      </div>

      <div className="mobile-upgrade__footer">
        <span className="mobile-upgrade__cost" aria-label="Cost">
          {(node.costs.score ?? 0) > 0 && (
            <span className="coin coin--score">{(node.costs.score ?? 0).toLocaleString()}</span>
          )}
          {(node.costs.meta ?? 0) > 0 && (
            <span className="coin coin--meta">{(node.costs.meta ?? 0).toLocaleString()}</span>
          )}
          {!node.costs.score && !node.costs.meta && <span className="coin">—</span>}
        </span>

        {state === 'available' && (
          <button type="button" className="btn btn--primary mobile-upgrade__allocate"
            onClick={() => actions.allocate(node.id)}>
            Allocate
          </button>
        )}
        {state === 'locked' && (
          <span className="mobile-upgrade__note">Connect an adjacent node first.</span>
        )}
      </div>
    </aside>
  );
}

const CLASS_LABEL: Record<PassiveNode['nodeType'], string> = {
  small: 'Small node', notable: 'Notable', keystone: 'Keystone', bridge: 'Bridge',
};
const STATE_LABEL = {
  owned: 'Owned', available: 'Available', short: 'Cannot afford', locked: 'Locked',
} as const;

/**
 * What this node leads to: the nodes that name it as a prerequisite.
 *
 * Facts of the graph, not advice — every one of them is listed, and a node
 * the player cannot see yet stays unnamed rather than being spoiled.
 */
/** Whether this node leads anywhere, so a caller can skip drawing the plate. */
export function hasLeadsTo(nodeId: string | null): boolean {
  if (!nodeId) return false;
  return NODES.some((n) => n.prerequisites.includes(nodeId));
}

/** The chain, mounted on its own plate. */
export function LeadsTo({ s, nodeId, onReveal }: {
  s: GameState;
  nodeId: string | null;
  onReveal: (id: string) => void;
}): JSX.Element | null {
  const node = nodeId ? NODES_BY_ID.get(nodeId) ?? null : null;
  if (!node) return null;
  return <Chain s={s} node={node} onReveal={onReveal} bare />;
}

function Chain({ s, node, onReveal, bare = false }: {
  s: GameState;
  node: PassiveNode;
  onReveal: (id: string) => void;
  /** On its own plate the legend is the plate's, so the heading is dropped. */
  bare?: boolean;
}): JSX.Element | null {
  const allocated = new Set(s.allocated);
  const discovered = new Set(s.discovered as DiscoveryFlag[]);
  const next = NODES.filter((n) => n.prerequisites.includes(node.id));
  if (next.length === 0) return null;

  return (
    <div className={`chain${bare ? ' chain--bare' : ''}`}>
      {!bare && <h3 className="chain__title">Leads to</h3>}
      <ul className="chain__list">
        {next.map((n) => {
          const seen = isVisible(n, discovered);
          const held = allocated.has(n.id);
          return (
            <li key={n.id} className={`chain__row${held ? ' chain__row--owned' : ''}`}>
              {seen ? (
                <button type="button" className="chain__btn" onClick={() => onReveal(n.id)}>
                  <NodeMark type={n.nodeType} region={n.region} size={26} />
                  <span className="chain__name">{n.name}</span>
                  <span className="coin coin--score">{(n.costs.score ?? 0).toLocaleString()}</span>
                </button>
              ) : (
                <span className="chain__btn chain__btn--hidden">
                  <NodeMark type={n.nodeType} region={n.region} size={26} dim />
                  <span className="chain__name">???</span>
                  <span className="chain__lock" aria-label="not yet discovered">🔒</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
