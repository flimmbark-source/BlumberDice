import type { Face } from './types.ts';

export type PatternName =
  | 'pair'
  | 'triple'
  | 'step'
  | 'run'
  | 'longRun'
  | 'palindrome'
  | 'longPalindrome'
  | 'alternating'
  | 'fullSet'
  | 'newFace';

export interface PatternHit {
  name: PatternName;
  /** The faces that formed the pattern, oldest first. */
  faces: Face[];
}

export interface PatternState {
  /** Most recent roll last. Trimmed to `window`. */
  history: Face[];
  /** Distinct faces seen since the last Full Set completion. */
  setProgress: Face[];
}

export function createPatternState(): PatternState {
  return { history: [], setProgress: [] };
}

const isHigh = (f: Face) => f >= 4;

function detectRun(h: Face[], length: number): Face[] | null {
  if (h.length < length) return null;
  const slice = h.slice(h.length - length);
  let asc = true;
  let desc = true;
  for (let i = 1; i < slice.length; i++) {
    if (slice[i] !== slice[i - 1] + 1) asc = false;
    if (slice[i] !== slice[i - 1] - 1) desc = false;
  }
  return asc || desc ? slice : null;
}

function detectPalindrome(h: Face[], length: number): Face[] | null {
  if (h.length < length) return null;
  const slice = h.slice(h.length - length);
  for (let i = 0; i < Math.floor(length / 2); i++) {
    if (slice[i] !== slice[length - 1 - i]) return null;
  }
  // Reject a flat sequence — that is a repeat, not a palindrome.
  if (slice.every((f) => f === slice[0])) return null;
  return slice;
}

function detectAlternating(h: Face[], length: number): Face[] | null {
  if (h.length < length) return null;
  const slice = h.slice(h.length - length);
  for (let i = 1; i < slice.length; i++) {
    if (isHigh(slice[i]) === isHigh(slice[i - 1])) return null;
  }
  return slice;
}

/**
 * Appends a face and returns every pattern completed by it.
 *
 * `memory` widens detection: it adds the long-form run and palindrome and
 * lengthens the alternating window. It does not change the short forms, so a
 * Pattern build keeps working exactly as before after taking the keystone.
 */
export function pushRoll(
  state: PatternState,
  face: Face,
  opts: { window: number; memory: boolean },
): PatternHit[] {
  state.history.push(face);
  const maxWindow = Math.max(opts.window, 2);
  while (state.history.length > maxWindow) state.history.shift();

  const h = state.history;
  const hits: PatternHit[] = [];

  if (h.length >= 2 && h[h.length - 1] === h[h.length - 2]) {
    hits.push({ name: 'pair', faces: h.slice(-2) });
    if (h.length >= 3 && h[h.length - 2] === h[h.length - 3]) {
      hits.push({ name: 'triple', faces: h.slice(-3) });
    }
  }

  if (h.length >= 2) {
    const d = h[h.length - 1] - h[h.length - 2];
    if (d === 1 || d === -1) hits.push({ name: 'step', faces: h.slice(-2) });
  }

  const run3 = detectRun(h, 3);
  if (run3) hits.push({ name: 'run', faces: run3 });
  if (opts.memory) {
    const run4 = detectRun(h, 4);
    if (run4) hits.push({ name: 'longRun', faces: run4 });
  }

  const pal3 = detectPalindrome(h, 3);
  if (pal3) hits.push({ name: 'palindrome', faces: pal3 });
  if (opts.memory) {
    const pal5 = detectPalindrome(h, 5);
    if (pal5) hits.push({ name: 'longPalindrome', faces: pal5 });
  }

  const altLen = opts.memory ? 6 : 4;
  const alt = detectAlternating(h, altLen);
  if (alt) hits.push({ name: 'alternating', faces: alt });

  // Full Set accumulates until completed, then resets. A concentrated
  // distribution reaches it much more slowly — that tension is intended.
  if (!state.setProgress.includes(face)) {
    state.setProgress.push(face);
    hits.push({ name: 'newFace', faces: [face] });
    if (state.setProgress.length === 6) {
      hits.push({ name: 'fullSet', faces: state.setProgress.slice() });
      state.setProgress = [];
    }
  }

  return hits;
}

/** Faces still missing from the current Full Set window. */
export function missingFaces(state: PatternState): Face[] {
  return ([1, 2, 3, 4, 5, 6] as Face[]).filter((f) => !state.setProgress.includes(f));
}
