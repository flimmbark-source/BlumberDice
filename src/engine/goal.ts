import { NODES, NODES_BY_ID } from './nodes.ts';
import { checkAllocation, isVisible } from './tree.ts';
import type { GameState } from './game.ts';
import type { DiscoveryFlag, PassiveNode } from './types.ts';

/**
 * What the player is working toward, derived entirely from the tree and the
 * costs already in it.
 *
 * Three things are kept apart on purpose:
 *
 * - a **milestone** is a threshold at which something becomes possible,
 * - a **goal** is a node the player explicitly pinned,
 * - a **recommendation** is the game deciding for them, which is not here and
 *   should not be added. Where several nodes share the cheapest cost the HUD
 *   reports the amount and how many open up, never which one to take.
 */
export type Goal =
  /** Nothing is reachable: the web is exhausted or everything is bought. */
  | { kind: 'none' }
  /** Nothing pinned, nothing affordable: the next threshold and its breadth. */
  | { kind: 'milestone'; cost: number; unlocks: number }
  /** Nothing pinned, but something can be bought now. */
  | { kind: 'ready'; available: number }
  /** A pinned node, with the shortfall broken out per currency. */
  | {
      kind: 'target';
      node: PassiveNode;
      affordable: boolean;
      score: { have: number; need: number };
      /** Null when the node costs no Meta, so no second bar is drawn. */
      meta: { have: number; need: number } | null;
      /** The one node this purchase would unlock, when there is exactly one. */
      after: PassiveNode | null;
    };

interface Ctx {
  allocated: Set<string>;
  discovered: Set<DiscoveryFlag>;
  score: number;
  meta: number;
}

const ctxOf = (s: GameState): Ctx => ({
  allocated: new Set(s.allocated),
  discovered: new Set(s.discovered),
  score: s.score,
  meta: s.meta,
});

/** Reachable means one prerequisite is already held — one purchase away. */
function candidates(c: Ctx): PassiveNode[] {
  return NODES.filter((n) => {
    if (c.allocated.has(n.id) || !isVisible(n, c.discovered)) return false;
    return n.prerequisites.length === 0 || n.prerequisites.some((p) => c.allocated.has(p));
  });
}

const affordable = (n: PassiveNode, c: Ctx): boolean =>
  checkAllocation(n.id, c).ok;

/**
 * The single node that buying `id` would newly put in reach.
 *
 * Only unambiguous successors count: if the purchase opens two doors, or
 * opens one that was already open by another route, there is no honest
 * "after" to show and the HUD omits it rather than inventing a path.
 */
export function successorOf(id: string, c: Ctx): PassiveNode | null {
  const after = new Set(c.allocated);
  after.add(id);
  const opened = NODES.filter((n) => {
    if (after.has(n.id) || !isVisible(n, c.discovered)) return false;
    if (!n.prerequisites.includes(id)) return false;
    // Already reachable without this purchase, so it is not news.
    return !n.prerequisites.some((p) => c.allocated.has(p));
  });
  return opened.length === 1 ? opened[0] : null;
}

export function currentGoal(s: GameState): Goal {
  const c = ctxOf(s);

  if (s.pinned) {
    const node = NODES_BY_ID.get(s.pinned);
    if (node && !c.allocated.has(node.id)) {
      const needScore = node.costs.score ?? 0;
      const needMeta = node.costs.meta ?? 0;
      return {
        kind: 'target',
        node,
        affordable: affordable(node, c),
        score: { have: s.score, need: needScore },
        meta: needMeta > 0 ? { have: s.meta, need: needMeta } : null,
        after: successorOf(node.id, c),
      };
    }
  }

  const reach = candidates(c);
  if (reach.length === 0) return { kind: 'none' };

  const ready = reach.filter((n) => affordable(n, c));
  if (ready.length > 0) return { kind: 'ready', available: ready.length };

  // Cheapest threshold, and how many nodes clear it at once. Several sharing
  // a price is the normal case early on, and is exactly why this reports a
  // number rather than a name.
  const cost = Math.min(...reach.map((n) => n.costs.score ?? 0));
  const unlocks = reach.filter((n) => (n.costs.score ?? 0) === cost && (n.costs.meta ?? 0) === 0).length;
  return { kind: 'milestone', cost, unlocks: Math.max(1, unlocks) };
}

/**
 * Nodes the player can buy right now, in stable tree order.
 *
 * The "X Available to Buy" button cycles this list. A pinned-but-unaffordable
 * goal is deliberately excluded: the button describes purchases available
 * now, so every stop in its cycle must actually be purchasable.
 */
export function openTargets(s: GameState): string[] {
  const c = ctxOf(s);
  return candidates(c).filter((n) => affordable(n, c)).map((n) => n.id);
}

/** Pinning is only meaningful for a node that is one purchase away. */
export function canPin(s: GameState, id: string): boolean {
  const c = ctxOf(s);
  if (c.allocated.has(id)) return false;
  const node = NODES_BY_ID.get(id);
  if (!node || !isVisible(node, c.discovered)) return false;
  return node.prerequisites.length === 0 || node.prerequisites.some((p) => c.allocated.has(p));
}
