import { useSyncExternalStore } from 'react';
import {
  allocate, createGame, discoverFrameworkB, drain, manualRoll, markStatsSeen, resolveDecision,
  refundAll, setPolicy, setSeal, setStake, setStoreNext, setUseHeld,
  switchFramework, tick,
  type DecisionChoice, type DecisionPolicy, type GameState,
} from '../engine/game.ts';
import { clearStorage, loadFromStorage, saveToStorage } from '../engine/save.ts';
import type { Face } from '../engine/types.ts';

/**
 * Holds the single mutable GameState and drives it with real time. React reads
 * it through useSyncExternalStore; nothing in the engine knows React exists.
 */
class GameStore {
  state: GameState;
  /**
   * Currency the dice tray is still holding back from the HUD, because the
   * number above the die has not faded yet. Read every frame by the counters,
   * so it is a plain field rather than notified state.
   */
  heldBack = { score: 0, meta: 0 };
  debug = false;
  private version = 0;
  private listeners = new Set<() => void>();
  private raf: number | null = null;
  private lastFrame = 0;
  private lastSave = 0;

  constructor() {
    this.state = loadFromStorage() ?? createGame(Math.floor(Math.random() * 0xffffffff));
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    if (this.raf === null) this.start();
    return () => {
      this.listeners.delete(fn);
      if (this.listeners.size === 0) this.stop();
    };
  };

  getSnapshot = (): number => this.version;

  private notify(): void {
    this.version += 1;
    for (const fn of this.listeners) fn();
  }

  /** Runs an engine action and republishes. */
  act = (fn: (s: GameState) => void): void => {
    fn(this.state);
    this.notify();
  };

  private start(): void {
    this.lastFrame = performance.now();
    const frame = (now: number): void => {
      const dt = Math.min(now - this.lastFrame, 250);
      this.lastFrame = now;
      this.step(dt, now);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private stop(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  private step(dt: number, now: number): void {
    const s = this.state;
    // Bonus dice run on a clock of their own, so the loop has to keep
    // turning for them even when nothing is rolling and the cooldown is up.
    if (s.pending.length > 0 || s.cooldownRemaining > 0 || s.bonusDice.length > 0) {
      tick(s, dt);
      this.notify();
    }
    if (now - this.lastSave > 4000) {
      this.lastSave = now;
      saveToStorage(s);
    }
  }

  save = (): void => saveToStorage(this.state);

  reset = (): void => {
    clearStorage();
    this.state = createGame(Math.floor(Math.random() * 0xffffffff));
    this.heldBack = { score: 0, meta: 0 };
    this.notify();
  };

  /** Debug tool: resolves `actions` manual rolls with no cooldown or prompts. */
  fastForward = (count: number): void => {
    for (let i = 0; i < count; i++) {
      this.state.cooldownRemaining = 0;
      this.state.decision = null;
      manualRoll(this.state);
      drain(this.state);
    }
    this.notify();
  };

  toggleDebug = (): void => {
    this.debug = !this.debug;
    this.notify();
  };
}

export const store = new GameStore();

// Prototype affordance: lets an automated harness drive the same store the UI
// uses, without a second code path.
declare global { interface Window { __blumber?: GameStore } }
if (typeof window !== 'undefined') window.__blumber = store;

export function useGame(): GameState {
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return store.state;
}

export function useStoreVersion(): number {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

// Thin action wrappers so components never import the engine directly.
export const actions = {
  roll: () => store.act(manualRoll),
  switchFramework: () => store.act(switchFramework),
  allocate: (id: string) => store.act((s) => { allocate(s, id); }),
  /** Set or clear the node the player is saving toward. */
  pin: (id: string | null) => store.act((s) => { s.pinned = id; }),
  refund: () => store.act((s) => { refundAll(s); }),
  /** Permanently discard current spendable Score; lifetime earned Score is unchanged. */
  deleteScore: () => store.act((s) => { s.score = 0; }),
  decide: (choice: DecisionChoice) => store.act((s) => resolveDecision(s, choice)),
  seal: (face: Face | null) => store.act((s) => setSeal(s, face)),
  stake: (n: number) => store.act((s) => setStake(s, n)),
  useHeld: (i: number | null) => store.act((s) => setUseHeld(s, i)),
  storeNext: (on: boolean) => store.act((s) => setStoreNext(s, on)),
  policy: <K extends keyof DecisionPolicy>(k: K, v: DecisionPolicy[K]) =>
    store.act((s) => setPolicy(s, k, v)),
  seenStats: () => store.act(markStatsSeen),
  discover: () => store.act(discoverFrameworkB),
};
