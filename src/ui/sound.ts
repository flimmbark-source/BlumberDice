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
