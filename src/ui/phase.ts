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
 * The transform that lays `rect` over the whole window.
 *
 * `current` is the transform already applied to the element that was
 * measured, so the measurement is taken back to untransformed space before
 * the new one is worked out. That is what lets this be called again while
 * already zoomed — on a window resize — without compounding.
 */
export function zoomOnto(rect: DOMRect, current: Zoom, margin = 0): Zoom {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const ex = (rect.left - current.tx) / current.k;
  const ey = (rect.top - current.ty) / current.k;
  const ew = rect.width / current.k;
  const eh = rect.height / current.k;
  if (ew <= 0 || eh <= 0) return current;

  const k = Math.min((vw - margin * 2) / ew, (vh - margin * 2) / eh);
  return {
    k,
    tx: (vw - ew * k) / 2 - ex * k,
    ty: (vh - eh * k) / 2 - ey * k,
  };
}

/** How long the drive in and out takes. Shared by the CSS and the sound. */
export const DRIVE_MS = 900;

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
  return typeof window !== 'undefined'
    && window.matchMedia('(min-width: 901px)').matches;
}
