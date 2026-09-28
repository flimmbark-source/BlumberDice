import { describe, expect, it } from 'vitest';
import {
  ARM_MS, DRIVE_IN_COMPACT_MS, DRIVE_IN_MS, DRIVE_OUT_COMPACT_MS, DRIVE_OUT_MS,
  driveTimings, HUD_RISE_MS, passageClipPaths, passageGeometry,
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
   * The four bands have to tile the window exactly: overlap and the enamel
   * doubles up along a seam, leave a gap and the roll field shows through the
   * faceplate before the player has gone anywhere.
   */
  it('tiles the window with four bands and one opening', () => {
    const g = passageGeometry(rect, view.w, view.h)!;
    const clips = passageClipPaths(g);
    const poly = (s: string): Array<[number, number]> => {
      const inner = s.slice(s.indexOf('(') + 1, s.lastIndexOf(')'));
      return inner.split(',').map((pair) => {
        const [x, y] = pair.trim().split(/\s+/).map((n) => parseFloat(n));
        return [x, y];
      });
    };
    const box = (s: string): { x0: number; y0: number; x1: number; y1: number } => {
      const pts = poly(s);
      return {
        x0: Math.min(...pts.map((p) => p[0])),
        y0: Math.min(...pts.map((p) => p[1])),
        x1: Math.max(...pts.map((p) => p[0])),
        y1: Math.max(...pts.map((p) => p[1])),
      };
    };

    const top = box(clips.top);
    const bottom = box(clips.bottom);
    const left = box(clips.left);
    const right = box(clips.right);

    // The bands meet the window's edges and each other, and stop at the hole.
    expect(top).toEqual({ x0: 0, y0: 0, x1: 100, y1: g.top });
    expect(bottom).toEqual({ x0: 0, y0: g.bottom, x1: 100, y1: 100 });
    expect(left).toEqual({ x0: 0, y0: g.top, x1: g.left, y1: g.bottom });
    expect(right).toEqual({ x0: g.right, y0: g.top, x1: 100, y1: g.bottom });

    // And together they cover the window less exactly one chamber.
    const area = (b: { x0: number; y0: number; x1: number; y1: number }): number =>
      (b.x1 - b.x0) * (b.y1 - b.y0);
    const hole = (g.right - g.left) * (g.bottom - g.top);
    expect(area(top) + area(bottom) + area(left) + area(right) + hole).toBeCloseTo(100 * 100);
  });
});
