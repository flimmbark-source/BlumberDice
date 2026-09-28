/**
 * The machine's one sound: the clunk of a channel selector.
 *
 * Synthesised rather than sampled, so it ships no asset and cannot fail to
 * load. Everything here is best-effort — a browser that refuses to make an
 * AudioContext, or one that has not had a gesture yet, simply gets silence.
 */

let ctx: AudioContext | null = null;
let failed = false;

function audio(): AudioContext | null {
  if (failed) return null;
  if (ctx) return ctx;
  try {
    const Ctor = window.AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) { failed = true; return null; }
    ctx = new Ctor();
    return ctx;
  } catch {
    failed = true;
    return null;
  }
}

/** Short burst of filtered noise: the contact, not the cabinet. */
function contact(c: AudioContext, at: number, level = 1): void {
  const frames = Math.floor(c.sampleRate * 0.045);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    // Decay the noise itself as well as the gain, so the tail is not just
    // a quieter version of the head: a switch gets duller as it settles.
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 2.2;
  }
  const src = c.createBufferSource();
  src.buffer = buf;

  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1750;
  band.Q.value = 0.85;

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.16 * level, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);

  src.connect(band).connect(g).connect(c.destination);
  src.start(at);
  src.stop(at + 0.06);
}

/** The low thump of the housing taking the detent. */
function body(c: AudioContext, at: number): void {
  const osc = c.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(190, at);
  osc.frequency.exponentialRampToValueAtTime(74, at + 0.07);

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.1, at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);

  osc.connect(g).connect(c.destination);
  osc.start(at);
  osc.stop(at + 0.1);
}

/**
 * Air moving past a large object, for the moment the chamber lip overtakes
 * the camera.
 *
 * Noise through a bandpass that sweeps the way the thing itself does: up and
 * open on the way in, down and closing on the way out. It is placed on the
 * part of the drive where the threshold is actually crossing the viewer, so
 * the sound is of the object passing rather than of the motor that moved it.
 */
function passBy(c: AudioContext, at: number, dur: number, inward: boolean): void {
  const frames = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
  const src = c.createBufferSource();
  src.buffer = buf;

  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(inward ? 380 : 2100, at);
  bp.frequency.exponentialRampToValueAtTime(inward ? 2100 : 380, at + dur);
  bp.Q.value = 0.7;

  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(0.055, at + dur * 0.45);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);

  src.connect(bp).connect(g).connect(c.destination);
  src.start(at);
  src.stop(at + dur + 0.02);
}

/**
 * A phosphor tube losing its channel: the picture drops to a line and the
 * line goes out. Two ticks a few hundredths apart with a short dying hum
 * under them, which is what the collapse looks like translated into air.
 */
export function playScreensCollapse(): void {
  const c = audio();
  if (!c) return;
  try {
    if (c.state === 'suspended') void c.resume();
    const at = c.currentTime + 0.001;

    const osc = c.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(640, at);
    osc.frequency.exponentialRampToValueAtTime(120, at + 0.14);

    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2400, at);
    lp.frequency.exponentialRampToValueAtTime(420, at + 0.14);

    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.05, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.17);

    osc.connect(lp).connect(g).connect(c.destination);
    osc.start(at);
    osc.stop(at + 0.19);

    contact(c, at, 0.7);
    contact(c, at + 0.055, 0.32);
  } catch {
    // Sound is decoration; never let it interrupt a phase change.
  }
}

/**
 * The same tubes striking back, which is a different event and sounds like
 * one: an irregular scatter of ticks as each screen catches, over a short
 * rising hum rather than a falling one. It is timed to `planScreenRestrike`
 * in `styles.css`, so the ticks land on the frames that flash.
 */
export function playScreensRelight(): void {
  const c = audio();
  if (!c) return;
  try {
    if (c.state === 'suspended') void c.resume();
    const at = c.currentTime + 0.001;

    const osc = c.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(96, at);
    osc.frequency.exponentialRampToValueAtTime(320, at + 0.2);

    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.045, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.26);

    osc.connect(g).connect(c.destination);
    osc.start(at);
    osc.stop(at + 0.28);

    // The strike, the two beats it settles through, and the tube arriving.
    for (const [t, level] of [[0.0, 0.5], [0.035, 0.85], [0.105, 0.4], [0.2, 0.55]] as const) {
      contact(c, at + t, level);
    }
    body(c, at + 0.2);
  } catch {
    // Sound is decoration; never let it interrupt a phase change.
  }
}

/**
 * The Score instrument travelling on its rail, and latching.
 *
 * Much smaller than the drive that carries the whole view: one short servo
 * and the catch at the end of it. `delay` exists because the readout leaves
 * before the drive has finished, so the sound has to be booked ahead rather
 * than played on the gesture.
 */
export function playDeckRail(direction: 'rise' | 'stow', ms: number, delayMs = 0): void {
  const c = audio();
  if (!c) return;
  try {
    if (c.state === 'suspended') void c.resume();
    const at = c.currentTime + 0.001 + Math.max(0, delayMs) / 1000;
    const dur = Math.max(0.08, ms / 1000);
    const rising = direction === 'rise';

    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(rising ? 120 : 210, at);
    osc.frequency.exponentialRampToValueAtTime(rising ? 210 : 120, at + dur * 0.8);

    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 620;
    lp.Q.value = 2.4;

    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.035, at + Math.min(0.05, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);

    osc.connect(lp).connect(g).connect(c.destination);
    osc.start(at);
    osc.stop(at + dur + 0.02);

    // A rail latches where it stops. Rising, that is at the top; stowing,
    // the release is at the start and the stop is out of sight.
    if (rising) {
      contact(c, at + dur * 0.9, 0.55);
      body(c, at + dur * 0.9);
    } else {
      contact(c, at, 0.45);
    }
  } catch {
    // Sound is decoration; never let it interrupt a phase change.
  }
}

/**
 * The drive gear taking the view into the chamber, or letting it back out.
 *
 * A servo rather than a switch: a filtered saw sweeping up or down under a
 * band of mechanism rumble, bracketed by the detent at each end. It runs the
 * length of the drive so the picture and the noise finish together.
 */
export function playWhirr(direction: 'in' | 'out', ms: number): void {
  const c = audio();
  if (!c) return;
  try {
    if (c.state === 'suspended') void c.resume();
    const at = c.currentTime + 0.001;
    const dur = ms / 1000;
    const inward = direction === 'in';

    // Under reduced motion the picture cuts rather than travels, and a motor
    // running over a cut is a motor driving nothing. The detent stays: a
    // switch that was pressed should still sound like one.
    if (dur < 0.4) {
      contact(c, at);
      body(c, at);
      return;
    }

    // The motor.
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    const f0 = inward ? 58 : 150;
    const f1 = inward ? 150 : 58;
    osc.frequency.setValueAtTime(f0, at);
    osc.frequency.exponentialRampToValueAtTime(f1, at + dur * 0.82);

    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(inward ? 320 : 900, at);
    lp.frequency.exponentialRampToValueAtTime(inward ? 900 : 320, at + dur * 0.82);
    lp.Q.value = 3.2;

    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.075, at + 0.07);
    g.gain.setValueAtTime(0.075, at + dur * 0.78);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    osc.connect(lp).connect(g).connect(c.destination);
    osc.start(at);
    osc.stop(at + dur + 0.02);

    // The mechanism it is driving.
    const frames = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, frames, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * 0.6;
    const noise = c.createBufferSource();
    noise.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(inward ? 700 : 1500, at);
    bp.frequency.exponentialRampToValueAtTime(inward ? 1500 : 700, at + dur * 0.82);
    bp.Q.value = 1.1;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, at);
    ng.gain.exponentialRampToValueAtTime(0.03, at + 0.09);
    ng.gain.setValueAtTime(0.03, at + dur * 0.75);
    ng.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    noise.connect(bp).connect(ng).connect(c.destination);
    noise.start(at);
    noise.stop(at + dur + 0.02);

    // The detent at each end: it starts moving, and it arrives.
    contact(c, at);
    body(c, at);
    contact(c, at + dur * 0.92);
    body(c, at + dur * 0.92);

    // And two along the way, where the drive chain catches and gives. They
    // are placed on the flat spots in the timing function in `styles.css`,
    // so the sound is of the thing the eye is watching rather than beside
    // it, and they are quiet: a catch, not an arrival.
    const catches = inward ? [0.32, 0.62] : [0.38, 0.68];
    for (const t of catches) contact(c, at + dur * t, 0.34);

    // And the chamber lip going by. Inward it is the back half of the move,
    // where `chamberPassIn` lets the threshold grow past the frame; outward
    // it is the front, where the threshold is still enormous and closing.
    passBy(c, at + dur * (inward ? 0.55 : 0.04), dur * 0.42, inward);
  } catch {
    // Sound is decoration; never let it interrupt a phase change.
  }
}

/**
 * The channel selector moving one position. Call it from the click that
 * changed the channel: the gesture is what lets the context start.
 */
export function playChannelClick(): void {
  const c = audio();
  if (!c) return;
  try {
    if (c.state === 'suspended') void c.resume();
    const at = c.currentTime + 0.001;
    contact(c, at);
    body(c, at);
  } catch {
    // Sound is decoration; never let it interrupt a channel change.
  }
}
