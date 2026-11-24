/**
 * Royal level-up fanfare, synthesised with the Web Audio API so it plays
 * instantly with nothing to download. Higher levels start on a brighter note.
 */
let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) context = new Ctor();
  if (context.state === 'suspended') void context.resume();
  return context;
}

export function playLevelUpSound(level = 1): void {
  const ctx = audio();
  if (!ctx) return;
  const out = ctx.createGain();
  out.gain.value = 0.22;
  out.connect(ctx.destination);
  const now = ctx.currentTime;
  // Every ten levels the fanfare climbs a little, so a rare level sounds richer.
  const shift = Math.min(12, Math.max(0, Math.floor(level / 10)));
  const notes = [523.25, 659.25, 783.99, 1046.5, 1318.51].map((freq) => freq * 2 ** (shift / 12));
  notes.forEach((freq, index) => {
    const at = now + index * 0.11;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = index === notes.length - 1 ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(freq, at);
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.5, at + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.9);
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + 1);
  });
  const spark = ctx.createOscillator();
  const sparkGain = ctx.createGain();
  spark.type = 'sine';
  spark.frequency.setValueAtTime(notes[notes.length - 1] * 2, now + 0.5);
  sparkGain.gain.setValueAtTime(0, now + 0.5);
  sparkGain.gain.linearRampToValueAtTime(0.25, now + 0.58);
  sparkGain.gain.exponentialRampToValueAtTime(0.001, now + 1.6);
  spark.connect(sparkGain).connect(out);
  spark.start(now + 0.5);
  spark.stop(now + 1.7);
}
