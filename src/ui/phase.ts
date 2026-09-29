/**
 * The two halves of a turn.
 *
 * `plan` is the machine at rest: the whole faceplate is in view, the build
 * tree and the inspector are usable, and the Score shield is engaged.
 *
 * `roll` is the machine working. The player passes through the rolling
 * chamber's screen, the surrounding machine falls away, and the existing dice
 * tray is translated to the centre of the viewport at exactly its current
 * rendered size. Score is live again — earned, lost, and exposed to Entropy.
 * Engaging the shield reverses the passage and returns to Plan.
 */
export type Phase = 'plan' | 'roll';

/**
 * The beats of a passage, in the order they happen.
 *
 * `arm` is the pause before anything moves: the information screens collapse
 * to a line the way a tube does when its channel is cut, and on a phone the
 * selector clunks over to the Roll surface so the chamber is in frame before
 * the drive engages. It exists because a machine does not start travelling in
 * the same instant its screens go dark — and because the faceplate that
 * covers those screens a moment later must not be the thing that hides them.
 *
 * `in` and `out` are the drive itself.
 */
export type Passage = 'arm' | 'in' | 'out';

/**
 * View translation outside the machine.
 *
 * Deliberately no scale. The roll scene is not a magnified copy of the UI:
 * the dice tray keeps the size it already had and is only re-centred.
 */
export interface ViewTransform {
  tx: number;
  ty: number;
}

export const NO_VIEW_TRANSFORM: ViewTransform = { tx: 0, ty: 0 };

export function viewTransformStyle(v: ViewTransform): string {
  return `translate3d(${v.tx}px, ${v.ty}px, 0)`;
}

/**
 * Centre a rendered tray in the viewport without changing its size.
 *
 * The rect already includes page scroll, the photo skin's stage scale and the
 * current outer translation. Updating by the remaining screen-space delta is
 * therefore both simpler and more robust than reconstructing those transforms.
 */
export function centreRollView(
  rect: DOMRect,
  current: ViewTransform,
): ViewTransform {
  if (rect.width <= 0 || rect.height <= 0) return current;
  return {
    tx: current.tx + window.innerWidth / 2 - (rect.left + rect.width / 2),
    ty: current.ty + window.innerHeight / 2 - (rect.top + rect.height / 2),
  };
}

/**
 * The passage duration. Shared by CSS and sound.
 *
 * These timings are intentionally retained from the existing machine drive;
 * the visual language changes from "zoom the whole interface" to "pass through
 * the chamber", but the established mechanical weight does not change with it.
 */
export const DRIVE_IN_MS = 2200;
export const DRIVE_OUT_MS = 1400;

/**
 * The same drive over a stacked layout, which has far less machine to pass.
 *
 * The length of a drive should be the length of the thing it drives past. On
 * the faceplate the chamber is about a third of the width, so the plate has
 * two thirds of a screen to clear on each side and takes its full 2.2s doing
 * it. Stacked, the chamber is nearly the whole width: the faceplate is off
 * the edges of the frame about a quarter of the way in, and the remaining
 * second and a half is an empty green field with a die drifting through it.
 * Same curve, same weight, less distance — so, less time.
 */
export const DRIVE_IN_COMPACT_MS = 1500;
export const DRIVE_OUT_COMPACT_MS = 1000;

/** The screens-down beat before the drive engages. */
export const ARM_MS = 260;

/** How long the data screens take to strike back once the camera is home. */
export const RESTRIKE_MS = 460;

/**
 * Where in the drive the instrument reaches the player.
 *
 * The Score readout rises out of the bottom of the roll space on its own
 * rail. It used to leave as the drive started, which put it on screen a fifth
 * of the way into a two-second move — an instrument arriving somewhere the
 * camera had not got to yet. It leaves late enough now that it latches as the
 * drive takes its final detent.
 */
export const HUD_RISE_MS = 560;
export const HUD_STOW_MS = 380;
/** Lead time: the rail starts this far before the drive finishes. */
const HUD_LEAD_MS = 430;

export interface DriveTimings {
  arm: number;
  in: number;
  out: number;
  restrike: number;
  /** How long after the drive engages the instrument starts to rise. */
  hudDelay: number;
}

/**
 * The drive's clock, in full and in the reduced-motion cut.
 *
 * Reduced motion does not merely switch the animations off: the timers that
 * hold the peripheral machine hidden run off these same numbers, so leaving
 * them at full length would blank the interface for two seconds to no
 * purpose, and would run two seconds of motor noise over a cut. The cut
 * keeps a beat at each end — enough for a switch to read as pressed — and
 * nothing in between.
 */
export function driveTimings(reduced: boolean, compact = false): DriveTimings {
  if (reduced) {
    return { arm: 0, in: 140, out: 140, restrike: 0, hudDelay: 0 };
  }
  const driveIn = compact ? DRIVE_IN_COMPACT_MS : DRIVE_IN_MS;
  return {
    arm: ARM_MS,
    in: driveIn,
    out: compact ? DRIVE_OUT_COMPACT_MS : DRIVE_OUT_MS,
    restrike: RESTRIKE_MS,
    hudDelay: Math.max(0, driveIn - HUD_LEAD_MS),
  };
}

/**
 * The shape of the faceplate while it is passing the camera.
 *
 * Both skins solve the same problem: the tray must not change size, so the
 * depth has to come from the machine around it. The photograph can do that
 * with a fixed four-piece copy of itself, because it is one bitmap at one
 * known size. The drawn chassis cannot — it reflows — so its shell is cut to
 * whatever rectangle the tray is actually occupying at the moment the drive
 * engages, and that is what this measures.
 *
 * Everything is in viewport percentages so the pieces can be full-screen
 * layers clipped against a common coordinate space: four bands cut from one
 * plate line up across their seams, whereas four separately-sized boxes each
 * painting their own gradient do not.
 */
export interface PassageGeometry {
  /** The chamber hole, as percentages of the viewport. */
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** Hole centre, as percentages: the point the shell scales away from. */
  originX: number;
  originY: number;
  /** Hole size in CSS px, for the rim drawn around it. */
  width: number;
  height: number;
  /** Hole position in CSS px. */
  x: number;
  y: number;
}

export function passageGeometry(
  rect: { left: number; top: number; width: number; height: number },
  viewW: number,
  viewH: number,
): PassageGeometry | null {
  if (rect.width <= 0 || rect.height <= 0 || viewW <= 0 || viewH <= 0) return null;
  const left = (rect.left / viewW) * 100;
  const top = (rect.top / viewH) * 100;
  const right = ((rect.left + rect.width) / viewW) * 100;
  const bottom = ((rect.top + rect.height) / viewH) * 100;
  return {
    left,
    top,
    right,
    bottom,
    originX: (left + right) / 2,
    originY: (top + bottom) / 2,
    width: rect.width,
    height: rect.height,
    x: rect.left,
    y: rect.top,
  };
}

/**
 * The faceplate, as one window-sized layer with the chamber cut out of it.
 *
 * This was four layers, each carrying the whole faceplate and clipped to one
 * band around the opening, because a `polygon()` is a single subpath and a
 * single subpath looks like it cannot have a hole in it. It can: run the
 * outline out to the opening along a line of zero width, around the opening
 * the opposite way round, and back along the same line. The two windings
 * cancel and the middle is not filled.
 *
 * Four layers or one is not a matter of taste. The browser rasterises a
 * scaling layer at the largest scale the animation reaches, so each of those
 * four was being painted at the full size of the faceplate at its closest --
 * measured, a 280ms stall on the first frame of the drive, falling to 117ms
 * with three of the four removed. One layer is one quarter of the raster for
 * exactly the same picture.
 */
export function passageKeyhole(g: PassageGeometry): string {
  const l = `${g.left}%`;
  const r = `${g.right}%`;
  const t = `${g.top}%`;
  const b = `${g.bottom}%`;
  return `polygon(0 0, 0 100%, ${l} 100%, ${l} ${b}, ${l} ${t}, ${r} ${t},`
    + ` ${r} ${b}, ${l} ${b}, ${l} 100%, 100% 100%, 100% 0)`;
}

/**
 * How far the faceplate has to grow before it is off the screen.
 *
 * It used to grow to five times its size, which is a number rather than a
 * measurement, and the cost of it is not linear: the browser rasterises a
 * scaling layer at the largest scale its animation reaches, so five times the
 * size is twenty-five times the pixels, painted in the frame the drive
 * starts. Measured on a phone that was 272ms of stall at scale 5, 155 at 3,
 * 67 at 2.
 *
 * The scale that is actually needed is the one at which the opening's edges
 * have all passed the edges of the window, because past that the faceplate is
 * off-screen and every further pixel of it is painted for nobody. It depends
 * on the shape of the window and where the chamber sits in it, which is why
 * it is measured rather than written down -- and on both of the layouts this
 * game has, it comes out around two and a half rather than five.
 */
export function passageScale(g: PassageGeometry): number {
  const span = (from: number, to: number): number => (
    Math.abs(to - from) < 0.5 ? Number.POSITIVE_INFINITY : from / (from - to)
  );
  const need = Math.max(
    span(g.originX, g.left),
    span(100 - g.originX, 100 - g.right),
    span(g.originY, g.top),
    span(100 - g.originY, 100 - g.bottom),
  );
  // A margin, so the plate is clear of the frame rather than exactly level
  // with it; and a floor, so a chamber that already fills the window still
  // reads as passing rather than merely fading.
  return Math.min(5, Math.max(1.9, Number.isFinite(need) ? need * 1.2 : 5));
}
