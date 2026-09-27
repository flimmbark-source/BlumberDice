/**
 * Whether the primary pointer is a finger.
 *
 * The game tells the player how to roll, and on a phone two of those
 * instructions are false: there is no Space bar to press and nothing is
 * clicked. Hiding the keyboard half with CSS would leave the wrong verb
 * behind, so the prompts ask this instead and say the true thing.
 *
 * Read per call rather than cached: a tablet with a keyboard attached and
 * then removed changes the answer, and these are render-time reads on a
 * handful of labels, not a hot path.
 */
export function touchPrimary(): boolean {
  return typeof matchMedia === 'function'
    && matchMedia('(pointer: coarse)').matches;
}
