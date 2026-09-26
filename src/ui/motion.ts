/**
 * The system "reduce motion" preference.
 *
 * This game is made of motion — a tumbling die, a hop as it settles, a number
 * fading above it, a total easing upward. All of it is exactly the kind of
 * sustained movement the setting exists to suppress, so it is read here once
 * and honoured in the physics and the counters as well as in CSS.
 */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function'
    && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
