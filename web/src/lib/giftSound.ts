/**
 * Per-gift sound effects, synthesised with the Web Audio API.
 *
 * Every gift gets its own sound: the design picks the character of the effect
 * (engine rev, jet whoosh, royal fanfare, dragon roar …) and the gift's own
 * slug shifts the pitch and the melody, so two gifts of the same design still
 * sound different. Nothing has to be downloaded, so the effect plays instantly.
 */

export interface GiftSoundInfo {
  slug?: string | null;
  design?: string | null;
  name?: string | null;
  rarity?: string | null;
}

let context: AudioContext | null = null;
let output: GainNode | null = null;

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) {
    context = new Ctor();
    output = context.createGain();
    output.gain.value = 0.45;
    output.connect(context.destination);
  }
  if (context.state === 'suspended') void context.resume();
  return { ctx: context, out: output! };
}

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** Pentatonic ladder used to turn a hash into a short melody. */
const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

function melody(seed: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => LADDER[(seed >>> (index * 3)) % LADDER.length]);
}

interface NoteOptions {
  freq: number;
  at: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  attack?: number;
  glideTo?: number;
  vibrato?: number;
}

function note(ctx: AudioContext, out: AudioNode, options: NoteOptions): void {
  const { freq, at, dur, type = 'sine', gain = 0.18, attack = 0.015, glideTo, vibrato } = options;
  const osc = ctx.createOscillator();
  const env = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(24, glideTo), at + dur);
  if (vibrato) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = vibrato;
    depth.gain.value = freq * 0.06;
    lfo.connect(depth).connect(osc.frequency);
    lfo.start(at);
    lfo.stop(at + dur + 0.05);
  }
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(env).connect(out);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

let noiseBuffer: AudioBuffer | null = null;

function noise(
  ctx: AudioContext,
  out: AudioNode,
  options: { at: number; dur: number; gain?: number; from: number; to: number; q?: number }
): void {
  const { at, dur, gain = 0.16, from, to, q = 1.2 } = options;
  if (!noiseBuffer) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.Q.value = q;
  filter.frequency.setValueAtTime(from, at);
  filter.frequency.exponentialRampToValueAtTime(Math.max(60, to), at + dur);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, at);
  env.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.12, dur / 3));
  env.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  source.connect(filter).connect(env).connect(out);
  source.start(at);
  source.stop(at + dur + 0.05);
}

// Browsers only allow audio after a gesture, so prepare the audio context on the
// first tap/key press. That way the first gift that arrives is never silent.
if (typeof window !== 'undefined') {
  const events = ['pointerdown', 'touchstart', 'keydown'];
  const unlock = () => {
    const engine = audio();
    if (engine && engine.ctx.state === 'suspended') void engine.ctx.resume();
    events.forEach((event) => window.removeEventListener(event, unlock));
  };
  events.forEach((event) => window.addEventListener(event, unlock, { passive: true }));
}

/** Plays the gift's own sound effect. Safe to call when audio is unavailable. */
export function playGiftSound(gift: GiftSoundInfo): void {
  const engine = audio();
  if (!engine) return;
  const { ctx, out } = engine;

  const key = `${gift.slug ?? ''}|${gift.design ?? ''}|${gift.name ?? ''}`.toLowerCase();
  const seed = hash(key || 'gift');
  const semitones = (seed % 12) - 6;
  const rate = Math.pow(2, semitones / 12);
  const t = ctx.currentTime + 0.02;
  const design = (gift.design ?? '').toLowerCase();
  const steps = melody(seed, 5);

  switch (design) {
    case 'sports-car':
    case 'golden-car': {
      // Engine revving up and settling back down.
      note(ctx, out, { freq: 62 * rate, glideTo: 155 * rate, at: t, dur: 0.85, type: 'sawtooth', gain: 0.22, attack: 0.05 });
      note(ctx, out, { freq: 92 * rate, glideTo: 190 * rate, at: t + 0.12, dur: 0.7, type: 'square', gain: 0.08 });
      noise(ctx, out, { at: t, dur: 0.9, from: 320, to: 1400, gain: 0.1 });
      note(ctx, out, { freq: 190 * rate, glideTo: 120 * rate, at: t + 0.9, dur: 0.5, type: 'sawtooth', gain: 0.16 });
      break;
    }
    case 'private-jet': {
      // Take-off whoosh with a high fly-by whistle.
      noise(ctx, out, { at: t, dur: 1.4, from: 420, to: 3400, gain: 0.2, q: 0.8 });
      noise(ctx, out, { at: t + 0.7, dur: 0.9, from: 2600, to: 500, gain: 0.14 });
      note(ctx, out, { freq: 900 * rate, glideTo: 1600 * rate, at: t + 0.3, dur: 0.7, type: 'sine', gain: 0.1 });
      break;
    }
    case 'royal-yacht': {
      // Rolling waves with a soft regal chord.
      noise(ctx, out, { at: t, dur: 1.3, from: 300, to: 900, gain: 0.12, q: 0.6 });
      [0, 4, 7].forEach((step, index) =>
        note(ctx, out, {
          freq: 330 * rate * Math.pow(2, step / 12),
          at: t + index * 0.08,
          dur: 1.1,
          type: 'sine',
          gain: 0.1,
          attack: 0.12,
        })
      );
      break;
    }
    case 'royal-crown': {
      // Short royal fanfare.
      const fanfare = [0, 4, 7, 12, 7, 12];
      fanfare.forEach((step, index) =>
        note(ctx, out, {
          freq: 392 * rate * Math.pow(2, step / 12),
          at: t + index * 0.14,
          dur: index === fanfare.length - 1 ? 0.7 : 0.22,
          type: 'triangle',
          gain: 0.15,
        })
      );
      noise(ctx, out, { at: t + 0.6, dur: 0.7, from: 3200, to: 5200, gain: 0.07, q: 2 });
      break;
    }
    case 'roses': {
      // Gentle rising bells.
      steps.slice(0, 4).forEach((step, index) =>
        note(ctx, out, { freq: 523 * rate * Math.pow(2, step / 12), at: t + index * 0.12, dur: 0.7, type: 'sine', gain: 0.13 })
      );
      break;
    }
    case 'golden-lion': {
      // Deep growling roar.
      note(ctx, out, { freq: 78 * rate, glideTo: 58 * rate, at: t, dur: 1.2, type: 'sawtooth', gain: 0.24, vibrato: 9 });
      note(ctx, out, { freq: 52 * rate, glideTo: 42 * rate, at: t + 0.1, dur: 1.1, type: 'square', gain: 0.09 });
      noise(ctx, out, { at: t, dur: 1.15, from: 200, to: 700, gain: 0.16 });
      break;
    }
    case 'golden-eagle': {
      // High eagle cry over wind.
      note(ctx, out, { freq: 2200 * rate, glideTo: 1250 * rate, at: t, dur: 0.5, type: 'sawtooth', gain: 0.1 });
      note(ctx, out, { freq: 1750 * rate, glideTo: 2400 * rate, at: t + 0.22, dur: 0.4, type: 'sine', gain: 0.1 });
      noise(ctx, out, { at: t, dur: 1, from: 900, to: 3000, gain: 0.08 });
      break;
    }
    case 'diamond': {
      // Crystal sparkles.
      [0, 1, 2, 3, 4, 5].forEach((index) =>
        note(ctx, out, {
          freq: (1800 + ((seed >>> (index * 4)) % 6) * 420) * rate,
          at: t + index * 0.07,
          dur: 0.35,
          type: 'sine',
          gain: 0.1,
        })
      );
      break;
    }
    case 'treasure': {
      // Lid opens: coin clinks over a low thud.
      note(ctx, out, { freq: 120 * rate, glideTo: 70 * rate, at: t, dur: 0.35, type: 'sine', gain: 0.22 });
      [0, 1, 2, 3, 4].forEach((index) =>
        note(ctx, out, {
          freq: (1400 + ((seed >>> (index * 5)) % 8) * 260) * rate,
          at: t + 0.18 + index * 0.09,
          dur: 0.28,
          type: 'triangle',
          gain: 0.11,
        })
      );
      break;
    }
    case 'hearts': {
      // Warm romantic chord.
      [0, 4, 7, 11].forEach((step, index) =>
        note(ctx, out, {
          freq: 440 * rate * Math.pow(2, step / 12),
          at: t + index * 0.06,
          dur: 1,
          type: 'sine',
          gain: 0.1,
          attack: 0.09,
        })
      );
      break;
    }
    case 'legend-dragon': {
      // Dragon roar with a fiery sweep.
      note(ctx, out, { freq: 48 * rate, glideTo: 70 * rate, at: t, dur: 1.5, type: 'sawtooth', gain: 0.26, vibrato: 6 });
      note(ctx, out, { freq: 70 * rate, glideTo: 50 * rate, at: t + 0.2, dur: 1.2, type: 'square', gain: 0.1 });
      noise(ctx, out, { at: t + 0.1, dur: 1.4, from: 180, to: 2600, gain: 0.2, q: 0.7 });
      break;
    }
    case 'photo': {
      // Romantic chime with a different pitch for every photo gift.
      steps.slice(0, 4).forEach((step, index) =>
        note(ctx, out, {
          freq: 587 * rate * Math.pow(2, step / 12),
          at: t + index * 0.11,
          dur: 0.85,
          type: 'sine',
          gain: 0.11,
          attack: 0.04,
        })
      );
      break;
    }
    default: {
      // Generic gift: bright sparkle arpeggio, still unique per gift.
      steps.slice(0, 5).forEach((step, index) =>
        note(ctx, out, {
          freq: 659 * rate * Math.pow(2, step / 12),
          at: t + index * 0.08,
          dur: 0.5,
          type: 'triangle',
          gain: 0.12,
        })
      );
      break;
    }
  }
}
