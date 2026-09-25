import { useEffect, useRef, useState } from 'react';

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
): { value: number; moving: boolean } {
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  const goal = useRef(target);
  goal.current = target;
  const hold = useRef(getHold);
  hold.current = getHold;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const frame = (now: number): void => {
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      const revealed = goal.current - (hold.current?.() ?? 0);
      const diff = revealed - current.current;
      if (Math.abs(diff) < SNAP) {
        if (current.current !== revealed) {
          current.current = revealed;
          setShown(revealed);
        }
      } else {
        current.current += diff * (1 - Math.exp(-dt / TAU));
        setShown(current.current);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const revealed = target - (getHold?.() ?? 0);
  return { value: shown, moving: Math.abs(revealed - shown) >= SNAP };
}
