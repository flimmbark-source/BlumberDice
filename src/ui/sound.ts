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
function contact(c: AudioContext, at: number): void {
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
  g.gain.exponentialRampToValueAtTime(0.16, at + 0.004);
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
