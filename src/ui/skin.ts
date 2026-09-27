import { useEffect, useState } from 'react';

/**
 * Which faceplate the machine is wearing.
 *
 * `photo` lays the supplied chassis photograph down as one image and drops
 * the live content into the holes cut in it. It is the default, because it is
 * the machine this game is meant to be.
 *
 * `css` is the drawn chassis. It is still here and still maintained, because
 * it is the one that reflows, lights its own lamps and works at any window
 * shape — and because the photograph cannot do any of those things.
 *
 * `?skin=css` switches to it, `?skin=photo` switches back, and the choice is
 * remembered. The photograph is a fixed 1672x941 object, so below the size
 * where it is still legible the drawn chassis takes over whatever was asked
 * for; see `fitsPhoto`.
 */
export type Skin = 'css' | 'photo';

const KEY = 'blumberdice.skin';

/** The photograph's own dimensions. The stage is scaled from these. */
export const STAGE_W = 1672;
export const STAGE_H = 941;

function readSkin(): Skin {
  if (typeof window === 'undefined') return 'css';
  const asked = new URLSearchParams(window.location.search).get('skin');
  if (asked === 'photo' || asked === 'css') {
    try { localStorage.setItem(KEY, asked); } catch { /* optional */ }
    return asked === 'photo' && !fitsPhoto() ? 'css' : asked;
  }
  // Default to the photograph. Only an explicit, remembered 'css' opts out,
  // so a first visit gets the machine rather than the drawing of it.
  let stored: Skin = 'photo';
  try {
    stored = localStorage.getItem(KEY) === 'css' ? 'css' : 'photo';
  } catch {
    stored = 'photo';
  }
  return stored === 'photo' && fitsPhoto() ? 'photo' : 'css';
}

/**
 * The photograph is a single fixed object: it cannot reflow, and scaled down
 * to a phone it is a 430px-wide picture of a machine rather than a machine.
 * Below the width where it is still legible the drawn chassis takes over,
 * which is the one it was built to do.
 */
function fitsPhoto(): boolean {
  return window.innerWidth >= 1000 && window.innerHeight >= 560;
}

export function useSkin(): Skin {
  const [skin] = useState<Skin>(readSkin);
  return skin;
}

/**
 * The scale that fits the fixed stage inside the window.
 *
 * Every size in this project is in px, so the stage is laid out at its true
 * pixel size and then scaled as a whole. Fitting by percentage instead would
 * move the boxes and leave the type behind.
 */
export function useStageScale(active: boolean): number {
  const [k, setK] = useState(1);
  useEffect(() => {
    if (!active) return;
    const fit = (): void => {
      setK(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [active]);
  return k;
}
