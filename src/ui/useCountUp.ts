import { useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './motion.ts';
import { touchPrimary } from './pointer.ts';

/** Time constant for the approach, in seconds. */
const TAU = 0.16;
/** Below this gap the counter snaps, so it always arrives. */
const SNAP = 0.75;

/**
 * Eases a displayed number toward its real value so currencies roll up rather
 * than jumping.
 *
 * `getHold` lets a caller withhold part of the value: the dice tray reports
 * the currency from rolls whose number is still showing above the die, so the
 * counter does not move until the player has seen what they rolled. It is read
 * every frame rather than passed as a prop, so a roll landing does not cost a
 * React render.
 */
export function useCountUp(
  target: number,
  getHold?: () => number,
  snapDown = false,
): { value: number; moving: boolean } {
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  const goal = useRef(target);
  goal.current = target;
  const hold = useRef(getHold);
  hold.current = getHold;

  // A total that eases upward is still motion, and the hold that keeps it in
  // step with the fading ghost is only there to match an animation we are no
  // longer playing. Under the setting, the number is simply the number.
  const calm = prefersReducedMotion();
  const mobile = touchPrimary();

  useEffect(() => {
    if (calm) return;
    let raf = 0;
    let last = performance.now();
    const minFrameMs = mobile ? 1000 / 30 : 0;

    const frame = (now: number): void => {
      if (minFrameMs > 0 && now - last < minFrameMs) {
        raf = requestAnimationFrame(frame);
        return;
      }

      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      const held = hold.current?.() ?? 0;
      const revealed = goal.current - held;
      const diff = revealed - current.current;

      // Score losses are event feedback, not a decorative count animation.
      // Entropy can attack every 50ms at maximum pressure, so easing downward
      // with the same 160ms time constant used for gains makes the display
      // accumulate a backlog of hits. When requested by the Score callers,
      // consume the latest revealed loss immediately. Each entropy hit can
      // therefore move the displayed integer on the next paint, while gains
      // keep their existing smooth roll-up.
      if (snapDown && diff < 0) {
        current.current = revealed;
        setShown(revealed);
      } else if (Math.abs(diff) < SNAP) {
        if (current.current !== revealed) {
          current.current = revealed;
          setShown(revealed);
        }
      } else {
        current.current += diff * (1 - Math.exp(-dt / TAU));
        setShown(current.current);
      }

      // Once both the counter and its withheld dice payout are settled there
      // is nothing left to poll. A later target change restarts this effect.
      const settled = Math.abs(revealed - current.current) < SNAP && held === 0;
      if (settled) {
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      if (raf) cancelAnimationFrame(raf);
    };
  }, [calm, mobile, snapDown, target]);

  if (calm) return { value: target, moving: false };

  const revealed = target - (getHold?.() ?? 0);
  return { value: shown, moving: Math.abs(revealed - shown) >= SNAP };
}
