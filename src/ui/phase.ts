/**
 * The two halves of a turn.
 *
 * `plan` is the machine at rest: the whole faceplate is in view, the build
 * tree and the inspector are usable, and the Score shield is engaged. The
 * shield is not merely Entropy protection — it freezes Score outright, so
 * nothing is earned or lost while planning. Spending is untouched, which is
 * what makes the phase worth being in.
 *
 * `roll` is the machine working: the view drives into the chamber until it
 * fills the screen, the shield comes off, and Score is live again — earned,
 * lost, and exposed to Entropy. Engaging the shield is what ends it.
 */
export type Phase = 'plan' | 'roll';

/** A 2D transform, applied to the viewport as `translate(tx,ty) scale(k)`. */
export interface Zoom {
  tx: number;
  ty: number;
  k: number;
}

export const NO_ZOOM: Zoom = { tx: 0, ty: 0, k: 1 };

export function zoomStyle(z: Zoom): string {
  return `translate(${z.tx}px, ${z.ty}px) scale(${z.k})`;
}

/**
 * The transform that fills the whole window with `rect`.
 *
 * `current` is the transform already applied to the element that was
 * measured, so the measurement is taken back to untransformed document space
 * before the new one is worked out. Scroll offsets matter here: the stacked
 * mobile layout is a scrolling document, and a viewport-relative DOMRect
 * otherwise points the drive at the wrong place whenever the page is scrolled.
 * This also lets the function be called again while already zoomed — on a
 * window resize — without compounding.
 */
export function zoomOnto(rect: DOMRect, current: Zoom, overscan = OVERSCAN): Zoom {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const sx = window.scrollX;
  const sy = window.scrollY;
  const ex = (rect.left + sx - current.tx) / current.k;
  const ey = (rect.top + sy - current.ty) / current.k;
  const ew = rect.width / current.k;
  const eh = rect.height / current.k;
  if (ew <= 0 || eh <= 0) return current;

  // Cover, not contain: the chamber reaches every edge of the window, and
  // whichever axis has spare goes past it. Fitting instead would letterbox
  // the drive and leave the faceplate showing down one side.
  const k = Math.max(vw / ew, vh / eh) * overscan;
  return {
    k,
    tx: (vw - ew * k) / 2 + sx - ex * k,
    ty: (vh - eh * k) / 2 + sy - ey * k,
  };
}

/**
 * A little more than exactly full.
 *
 * The deck changes shape between the phases — the switch is labelled
 * differently on each side — so the box the drive was aimed at can settle a
 * few pixels after it was measured. At this scale that is under a percent,
 * and covering by a percent and a half costs nothing while guaranteeing the
 * glass never comes up short of an edge.
 */
const OVERSCAN = 1.015;

/**
 * How long the drive takes, in each direction. Shared by the CSS and the
 * sound, so the motor runs exactly as long as the view moves.
 *
 * The push in is deliberately slow. It is a dolly being wound forward by a
 * machine, not a camera whip: the weight has to be felt, and at 900ms it was
 * over before it read as anything. The timing functions in `styles.css` carry
 * the rest of that character -- see the note there, which also explains why
 * the curve is not the shape it looks like it should be.
 *
 * The retraction is quicker. It is the same dolly on the same rails, so it
 * keeps the character, but the player is on their way back to work rather
 * than being shown something, and a slow exit is only a slow exit.
 */
export const DRIVE_IN_MS = 2200;
export const DRIVE_OUT_MS = 1400;

/**
 * Whether the chamber drive can run in this environment.
 *
 * The drive now works on both the fixed faceplate and the stacked mobile
 * layout. Mobile used to opt out because the page scrolls, but `zoomOnto`
 * now accounts for scroll offsets explicitly, so that restriction is stale.
 */
export function canDrive(): boolean {
  return typeof window !== 'undefined';
}
