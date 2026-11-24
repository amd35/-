/**
 * Sounds for «هدايا الحظ», synthesised with the Web Audio API so they play
 * instantly with nothing to download.
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

function tone(
  ctx: AudioContext,
  out: AudioNode,
  options: { freq: number; at: number; dur: number; type?: OscillatorType; gain?: number; glideTo?: number }
) {
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = options.type ?? 'sine';
  osc.frequency.setValueAtTime(options.freq, options.at);
  if (options.glideTo) osc.frequency.exponentialRampToValueAtTime(options.glideTo, options.at + options.dur);
  const peak = options.gain ?? 0.2;
  env.gain.setValueAtTime(0.0001, options.at);
  env.gain.exponentialRampToValueAtTime(peak, options.at + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, options.at + options.dur);
  osc.connect(env).connect(out);
  osc.start(options.at);
  osc.stop(options.at + options.dur + 0.05);
}

function noise(ctx: AudioContext, out: AudioNode, at: number, dur: number, gain: number) {
  const frames = Math.floor(ctx.sampleRate * dur);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(5200, at);
  filter.frequency.exponentialRampToValueAtTime(320, at + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(gain, at);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  source.connect(filter).connect(env).connect(out);
  source.start(at);
  source.stop(at + dur + 0.05);
}

/** Rising shimmer while the bubble gathers its luck. */
export function playLuckyShake(): void {
  const ctx = audio();
  if (!ctx) return;
  const out = ctx.createGain();
  out.gain.value = 0.2;
  out.connect(ctx.destination);
  const now = ctx.currentTime + 0.02;
  for (let i = 0; i < 7; i += 1) {
    tone(ctx, out, {
      freq: 440 * Math.pow(2, i / 7),
      at: now + i * 0.13,
      dur: 0.22,
      type: 'triangle',
      gain: 0.1 + i * 0.012,
    });
  }
}

/** The bubble pops: a bright crack and a deep boom. */
export function playLuckyBurst(): void {
  const ctx = audio();
  if (!ctx) return;
  const out = ctx.createGain();
  out.gain.value = 0.26;
  out.connect(ctx.destination);
  const now = ctx.currentTime + 0.01;
  noise(ctx, out, now, 0.55, 0.5);
  tone(ctx, out, { freq: 180, glideTo: 52, at: now, dur: 0.6, type: 'sine', gain: 0.4 });
  tone(ctx, out, { freq: 1320, at: now, dur: 0.28, type: 'square', gain: 0.08 });
}

/** Winner fanfare; a bigger prize climbs higher and rings longer. */
export function playLuckyWin(prize = 0): void {
  const ctx = audio();
  if (!ctx) return;
  const out = ctx.createGain();
  out.gain.value = 0.22;
  out.connect(ctx.destination);
  const now = ctx.currentTime + 0.02;
  const steps = prize >= 10000 ? 6 : prize >= 2000 ? 5 : 4;
  const base = [523.25, 659.25, 783.99, 1046.5, 1318.51, 1567.98];
  for (let i = 0; i < steps; i += 1) {
    tone(ctx, out, {
      freq: base[i],
      at: now + i * 0.1,
      dur: i === steps - 1 ? 0.9 : 0.35,
      type: i === steps - 1 ? 'triangle' : 'sine',
      gain: 0.32,
    });
  }
}
