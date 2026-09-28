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
 * measured, so the measurement is taken back to untransformed space before
 * the new one is worked out. That is what lets this be called again while
 * already zoomed — on a window resize — without compounding.
 */
export function zoomOnto(rect: DOMRect, current: Zoom, overscan = OVERSCAN): Zoom {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const ex = (rect.left - current.tx) / current.k;
  const ey = (rect.top - current.ty) / current.k;
  const ew = rect.width / current.k;
  const eh = rect.height / current.k;
  if (ew <= 0 || eh <= 0) return current;

  // Cover, not contain: the chamber reaches every edge of the window, and
  // whichever axis has spare goes past it. Fitting instead would letterbox
  // the drive and leave the faceplate showing down one side.
  const k = Math.max(vw / ew, vh / eh) * overscan;
  return {
    k,
    tx: (vw - ew * k) / 2 - ex * k,
    ty: (vh - eh * k) / 2 - ey * k,
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
 * Whether there is anywhere to drive to.
 *
 * On a stacked phone layout the chamber is already the widest thing on the
 * page and the page itself scrolls; magnifying it would gain nothing and a
 * transform on an ancestor of a scrolling document causes more trouble than
 * it is worth. There the phase still happens — shield off, readout up — the
 * view just does not move.
 */
export function canDrive(): boolean {
  if (typeof window === 'undefined') return false;
  // The faceplate is showing exactly when the machine is not stacked, and
  // the drive belongs to the faceplate. Mirrors the stacking condition in
  // `styles.css`; the two must agree.
  return !window.matchMedia(
    '(max-width: 759px),'
    + '(max-width: 900px) and (min-height: 521px),'
    + '(max-width: 900px) and (orientation: portrait)',
  ).matches;
}
