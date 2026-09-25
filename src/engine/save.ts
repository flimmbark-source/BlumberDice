import { createGame, syncQueue, type GameState } from './game.ts';
import { NODES_BY_ID } from './nodes.ts';

const KEY = 'blumberdice.save.v1';
const SAVE_VERSION = 1;

export function serialize(s: GameState): string {
  return JSON.stringify({ v: SAVE_VERSION, state: s });
}

/**
 * Restores a save, filling in anything a newer build added and dropping node
 * ids that no longer exist. Returns null when the payload is unusable.
 */
export function deserialize(raw: string): GameState | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const box = parsed as { v?: number; state?: unknown };
  if (box.v !== SAVE_VERSION || typeof box.state !== 'object' || box.state === null) return null;

  const fresh = createGame();
  const loaded = box.state as Partial<GameState>;
  const merged: GameState = {
    ...fresh,
    ...loaded,
    rng: { ...fresh.rng, ...(loaded.rng ?? {}) },
    pattern: { ...fresh.pattern, ...(loaded.pattern ?? {}) },
    transient: {
      ...fresh.transient,
      ...(loaded.transient ?? {}),
      counters: { ...fresh.transient.counters, ...(loaded.transient?.counters ?? {}) },
    },
    policies: { ...fresh.policies, ...(loaded.policies ?? {}) },
    stats: {
      ...fresh.stats,
      ...(loaded.stats ?? {}),
      faceCounts: { ...fresh.stats.faceCounts, ...(loaded.stats?.faceCounts ?? {}) },
      patternCounts: { ...(loaded.stats?.patternCounts ?? {}) },
    },
    // Never restore mid-resolution state: a save taken during a cascade would
    // otherwise reload with orphaned intents.
    pending: [],
    decision: null,
    resolveTimer: 0,
    cooldownRemaining: 0,
    actionBudget: 0,
  };
  merged.allocated = (merged.allocated ?? ['start']).filter((id) => NODES_BY_ID.has(id));
  if (!merged.allocated.includes('start')) merged.allocated.unshift('start');
  // The visible queue must match the restored build before the first roll.
  syncQueue(merged);
  return merged;
}

export function saveToStorage(s: GameState): void {
  try {
    localStorage.setItem(KEY, serialize(s));
  } catch {
    // Storage unavailable or full — the run simply continues unsaved.
  }
}

export function loadFromStorage(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? deserialize(raw) : null;
  } catch {
    return null;
  }
}

export function clearStorage(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
