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
