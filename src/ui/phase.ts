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

  const source = untransformedRect(rect, current);
  if (source.w <= 0 || source.h <= 0) return current;

  // Cover, not contain: the chamber reaches every edge of the window, and
  // whichever axis has spare goes past it. Fitting instead would letterbox
  // the drive and leave the faceplate showing down one side.
  const k = Math.max(vw / source.w, vh / source.h) * overscan;
  return placeSource(
    source,
    k,
    { x: vw / 2, y: vh / 2 },
  );
}

/**
 * The roll camera, rather than a generic rectangle zoom.
 *
 * Desktop keeps the original full-window drive. A stacked phone has a
 * different composition: the fixed Score/Entropy instrument occupies the
 * bottom of the screen, so the chamber is aimed into the usable field above
 * it instead of being centred behind it. The actual rendered HUD height is
 * supplied by App, which keeps this tied to the interface rather than to a
 * guessed phone size.
 */
export function zoomForRoll(
  rect: DOMRect,
  current: Zoom,
  hudHeight = 0,
): Zoom {
  if (!isStackedLayout()) return zoomOnto(rect, current);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const source = untransformedRect(rect, current);
  if (source.w <= 0 || source.h <= 0) return current;

  // Leave a small visual seam above the HUD so the dice never appear to roll
  // underneath the instrument that reports what the roll is doing to Score.
  const seam = Math.max(12, Math.min(24, vh * 0.025));
  const reserve = Math.min(vh * 0.38, Math.max(0, hudHeight) + seam);
  const top = Math.max(6, Math.min(16, vh * 0.015));
  const usableH = Math.max(1, vh - reserve - top);

  // The chamber should become the roll world, not merely grow. Cover the
  // usable field, accepting crop at the sides when a portrait screen is much
  // taller than the chamber. The dice arena is centred in the glass, so that
  // crop removes bezel/screen periphery before it removes the action.
  const k = Math.max(vw / source.w, usableH / source.h) * OVERSCAN;

  return placeSource(
    source,
    k,
    { x: vw / 2, y: top + usableH / 2 },
  );
}

interface SourceRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function untransformedRect(rect: DOMRect, current: Zoom): SourceRect {
  const sx = window.scrollX;
  const sy = window.scrollY;
  return {
    x: (rect.left + sx - current.tx) / current.k,
    y: (rect.top + sy - current.ty) / current.k,
    w: rect.width / current.k,
    h: rect.height / current.k,
  };
}

function placeSource(
  source: SourceRect,
  k: number,
  target: { x: number; y: number },
): Zoom {
  const sx = window.scrollX;
  const sy = window.scrollY;
  const cx = source.x + source.w / 2;
  const cy = source.y + source.h / 2;
  return {
    k,
    tx: target.x + sx - cx * k,
    ty: target.y + sy - cy * k,
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

function isStackedLayout(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia(
      '(max-width: 759px),'
      + '(max-width: 900px) and (min-height: 521px),'
      + '(max-width: 900px) and (orientation: portrait)',
    ).matches;
}
