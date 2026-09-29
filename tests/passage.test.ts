import { describe, expect, it } from 'vitest';
import {
  ARM_MS, DRIVE_IN_COMPACT_MS, DRIVE_IN_MS, DRIVE_OUT_COMPACT_MS, DRIVE_OUT_MS,
  driveTimings, HUD_RISE_MS, passageGeometry, passageKeyhole, passageScale,
} from '../src/ui/phase.ts';

/**
 * The passage is the one piece of this interface that is pure presentation and
 * still has arithmetic in it. These are the bits of that arithmetic the
 * stylesheet cannot check for itself: the clock the sound is booked from, and
 * the hole the drawn faceplate is cut around.
 */

describe('the drive clock', () => {
  it('is long on the faceplate and shorter where there is less to pass', () => {
    const wide = driveTimings(false);
    const stacked = driveTimings(false, true);
    expect(wide.in).toBe(DRIVE_IN_MS);
    expect(wide.out).toBe(DRIVE_OUT_MS);
    expect(stacked.in).toBe(DRIVE_IN_COMPACT_MS);
    expect(stacked.out).toBe(DRIVE_OUT_COMPACT_MS);
    expect(stacked.in).toBeLessThan(wide.in);
    expect(stacked.out).toBeLessThan(wide.out);
  });

  it('arms before it drives, and comes back quicker than it goes', () => {
    const t = driveTimings(false);
    expect(t.arm).toBe(ARM_MS);
    expect(t.arm).toBeGreaterThan(0);
    expect(t.out).toBeLessThan(t.in);
  });

  it('starts the instrument late enough to arrive with the camera', () => {
    for (const compact of [false, true]) {
      const t = driveTimings(false, compact);
      // It must still be travelling when the drive lands -- an instrument that
      // has already stopped did not arrive with anything.
      expect(t.hudDelay).toBeLessThan(t.in);
      expect(t.hudDelay + HUD_RISE_MS).toBeGreaterThan(t.in);
      // And it must not set off before the passage does.
      expect(t.hudDelay).toBeGreaterThan(0);
    }
  });

  it('cuts to a beat at each end under reduced motion', () => {
    const t = driveTimings(true);
    expect(t.arm).toBe(0);
    expect(t.restrike).toBe(0);
    expect(t.hudDelay).toBe(0);
    // Short enough to read as a cut, and still long enough that the phase
    // change is not simultaneous with the press that asked for it. 400ms is
    // also the length below which `playWhirr` drops its motor and plays the
    // detent alone, which is the point: a motor that drove nothing.
    expect(t.in).toBeGreaterThan(0);
    expect(t.in).toBeLessThan(400);
    expect(t.out).toBeLessThan(400);
  });
});

describe('the hole the faceplate is cut around', () => {
  const view = { w: 1000, h: 800 };
  const rect = { left: 200, top: 100, width: 400, height: 300 };

  it('states the chamber as a share of the window', () => {
    const g = passageGeometry(rect, view.w, view.h)!;
    expect(g.left).toBeCloseTo(20);
    expect(g.right).toBeCloseTo(60);
    expect(g.top).toBeCloseTo(12.5);
    expect(g.bottom).toBeCloseTo(50);
    expect(g.originX).toBeCloseTo(40);
    expect(g.originY).toBeCloseTo(31.25);
  });

  it('keeps the chamber in pixels too, for the rim drawn on it', () => {
    const g = passageGeometry(rect, view.w, view.h)!;
    expect(g.x).toBe(rect.left);
    expect(g.y).toBe(rect.top);
    expect(g.width).toBe(rect.width);
    expect(g.height).toBe(rect.height);
  });

  it('refuses to cut a shell around a chamber that is not on screen', () => {
    expect(passageGeometry({ left: 0, top: 0, width: 0, height: 0 }, view.w, view.h)).toBeNull();
    expect(passageGeometry(rect, 0, view.h)).toBeNull();
  });

  /**
   * The faceplate is one outline with a hole in it, which a single polygon can
   * only manage by running out to the hole along a line of zero width and back
   * along the same line. That trick is easy to get subtly wrong -- a bridge
   * that does not return along its own path leaves a wedge missing, and a hole
   * wound the same way round as the outline is not a hole at all -- so the
   * shape is checked rather than eyeballed.
   */
  it('cuts one outline with the chamber missing from the middle', () => {
    const g = passageGeometry(rect, view.w, view.h)!;
    const path = passageKeyhole(g);
    const pts = path.slice(path.indexOf('(') + 1, path.lastIndexOf(')'))
      .split(',')
      .map((pair) => pair.trim().split(/\s+/).map(parseFloat) as [number, number]);

    // The outline is the window, and the bridge leaves and returns on one line.
    expect(pts[0]).toEqual([0, 0]);
    expect(pts).toContainEqual([100, 100]);
    expect(pts).toContainEqual([100, 0]);
    expect(pts.filter((p) => p[0] === g.left && p[1] === 100)).toHaveLength(2);
    expect(pts.filter((p) => p[0] === g.left && p[1] === g.bottom)).toHaveLength(2);

    // Nonzero winding: the hole must be traversed the opposite way to the
    // window, or the polygon is simply solid.
    const area = (loop: Array<[number, number]>): number => loop.reduce(
      (a, p, i) => {
        const q = loop[(i + 1) % loop.length];
        return a + (p[0] * q[1] - q[0] * p[1]);
      },
      0,
    );
    const hole: Array<[number, number]> = [
      [g.left, g.bottom], [g.left, g.top], [g.right, g.top], [g.right, g.bottom],
    ];
    const window: Array<[number, number]> = [[0, 0], [0, 100], [100, 100], [100, 0]];
    expect(Math.sign(area(hole))).toBe(-Math.sign(area(window)));
  });
});

/**
 * How far the faceplate grows before it is off the screen. The browser
 * rasterises a scaling layer at the largest scale its animation reaches, so
 * this number is paid for squared, in the frame the drive starts.
 */
describe('the faceplate grows as far as it has to and no further', () => {
  const scaleFor = (
    tray: { left: number; top: number; width: number; height: number },
    vw: number,
    vh: number,
  ): number => passageScale(passageGeometry(tray, vw, vh)!);

  /** Every edge of the opening has cleared the window at the chosen scale. */
  const clears = (
    tray: { left: number; top: number; width: number; height: number },
    vw: number,
    vh: number,
  ): boolean => {
    const s = scaleFor(tray, vw, vh);
    const cx = tray.left + tray.width / 2;
    const cy = tray.top + tray.height / 2;
    return cx - s * (cx - tray.left) <= 0
      && cx + s * (tray.left + tray.width - cx) >= vw
      && cy - s * (cy - tray.top) <= 0
      && cy + s * (tray.top + tray.height - cy) >= vh;
  };

  it('clears the window in the layouts this game actually has', () => {
    // The tray, centred, as each configuration leaves it in Roll.
    const cases = [
      [{ left: 19, top: 252, width: 352, height: 341 }, 390, 844],    // phone
      [{ left: 427, top: 223, width: 585, height: 454 }, 1440, 900],  // desktop photo
      [{ left: 667, top: 198, width: 585, height: 504 }, 1920, 900],  // wide photo
    ] as const;
    for (const [tray, vw, vh] of cases) {
      expect(clears(tray, vw, vh)).toBe(true);
      // And is nowhere near the old flat 5, which is the whole point.
      expect(scaleFor(tray, vw, vh)).toBeLessThan(4);
    }
  });

  it('never asks for less than a pass or more than the old ceiling', () => {
    // A chamber already filling the window needs no growth to clear it, and
    // still has to read as passing rather than merely fading.
    expect(scaleFor({ left: 0, top: 0, width: 390, height: 844 }, 390, 844))
      .toBeGreaterThanOrEqual(1.9);
    // A pinhole in a huge window would ask for an absurd scale; it is capped.
    expect(scaleFor({ left: 195, top: 422, width: 4, height: 4 }, 390, 844))
      .toBeLessThanOrEqual(5);
  });
});
