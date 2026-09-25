import { useEffect, useRef, useState } from 'react';

/** Time constant for the approach, in seconds. */
const TAU = 0.16;
/** Below this gap the counter snaps, so it always arrives. */
const SNAP = 0.75;

/**
 * Eases a displayed number toward its real value so currencies roll up rather
 * than jumping. Reports whether it is still catching up, which the HUD uses to
 * highlight the number while it moves.
 */
export function useCountUp(target: number): { value: number; moving: boolean } {
  const [shown, setShown] = useState(target);
  const current = useRef(target);
  const goal = useRef(target);
  goal.current = target;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();

    const frame = (now: number): void => {
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      const diff = goal.current - current.current;
      if (Math.abs(diff) < SNAP) {
        if (current.current !== goal.current) {
          current.current = goal.current;
          setShown(goal.current);
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

  return { value: shown, moving: Math.abs(target - shown) >= SNAP };
}
