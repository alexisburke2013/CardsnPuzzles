/*
 * FEEDBACK
 * Tiny sound + haptic layer. Sound is synthesized with the Web Audio API so the
 * app stays dependency-free and needs no audio files to cache. Every call is a
 * no-op when muted or when the API is unavailable, so callers never guard.
 *
 * A single AudioContext is created lazily on the first sound (browsers require
 * a user gesture before audio can play) and resumed on demand. Haptics use the
 * Vibration API where supported and silently do nothing elsewhere.
 */

const CUES = {
  move: { type: 'sine', frequency: 320, duration: 0.06, gain: 0.05 },
  select: { type: 'triangle', frequency: 440, duration: 0.05, gain: 0.05 },
  match: { type: 'sine', frequency: 660, duration: 0.12, gain: 0.07 },
  win: { type: 'sine', frequency: 880, duration: 0.28, gain: 0.09 },
  error: { type: 'sawtooth', frequency: 180, duration: 0.14, gain: 0.06 },
  hint: { type: 'triangle', frequency: 520, duration: 0.1, gain: 0.06 }
};

const HAPTICS = { match: 30, win: [40, 40, 80], error: 60, move: 12, select: 12, hint: 20 };

let audioContext = null;
let muted = false;

function context() {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return null;
  if (!audioContext) audioContext = new Ctor();
  if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
  return audioContext;
}

export function setMuted(value) {
  muted = Boolean(value);
  return muted;
}

export function isMuted() {
  return muted;
}

export function playCue(name) {
  const cue = CUES[name];
  if (!cue || muted) return;
  const ctx = context();
  if (!ctx) return;
  try {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = cue.type;
    oscillator.frequency.value = cue.frequency;
    gain.gain.setValueAtTime(cue.gain, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + cue.duration);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + cue.duration);
  } catch {
    /* Audio is a nicety; never let it break gameplay. */
  }
}

export function vibrate(name) {
  if (muted) return;
  const pattern = HAPTICS[name];
  if (pattern && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(pattern);
}

/* Fire both channels for a gameplay event. */
export function feedback(name) {
  playCue(name);
  vibrate(name);
}

export default { feedback, playCue, vibrate, setMuted, isMuted };
