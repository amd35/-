import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../lib/i18n';

/**
 * Lina's side of a call. She has no device and no WebRTC endpoint, so her video
 * is drawn on a canvas (captured as a real MediaStream) and her voice is spoken
 * by the device speech engine. Billing, timer and history stay server-driven.
 */

const LINES: Record<'ar' | 'en', string[]> = {
  ar: [
    'هلا بيك 🤍 أنا لينا، وصلني اتصالك وشفتك واضح.',
    'خلي الكاميرا مفتوحة حتى نتكلم ويه بعض أحسن 😊',
    'تذكر إن كل دقيقة مكالمة تُحسب بالكونز، ومحاولاتك المجانية تُستخدم أول.',
    'إذا تحب تشحن رصيدك، افتح المحفظة واختار الباقة اللي تناسبك 💜',
    'أنا دايماً هنا — تكدر تفتح فيديو أو تحكي صوتي بأي وقت.',
    'تحب نحكي أكثر عن التطبيق أو عن يومك؟',
    'كلامك يفرحني 🤍 خبرني شنو أكثر شي تحب تستخدمه بالتطبيق.',
    'إذا حبيت توقف المكالمة اضغط الزر الأحمر، وأنا أنتظرك مرة ثانية.',
  ],
  en: [
    "Hi! I'm Lina 🤍 your call came through and I can see you clearly.",
    'Keep your camera on so we can talk face to face 😊',
    'Remember every call minute is billed in coins, and your free attempts are used first.',
    'You can top up from the Wallet tab anytime 💜',
    "I'm always here — open a video call or a voice call whenever you like.",
    'Want to talk more about the app, or about your day?',
    'Tell me what you use most in the app 🤍',
    'Tap the red button when you want to hang up, and I will be waiting.',
  ],
};

interface BotSpeech {
  speaking: boolean;
  line: string;
}

function useBotSpeech(active: boolean, muted: boolean): BotSpeech {
  const { lang } = useI18n();
  const [speaking, setSpeaking] = useState(false);
  const [line, setLine] = useState('');

  useEffect(() => {
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
    const lines = LINES[lang] ?? LINES.ar;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let index = 0;
    let failures = 0;

    if (!active || muted) {
      setSpeaking(false);
      setLine('');
      try {
        synth?.cancel();
      } catch {
        /* no engine */
      }
      return;
    }

    const wait = (fn: () => void, ms: number) => {
      timer = setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
    };

    // No speech engine on this device: she still talks, with on-screen text.
    const silentCycle = () => {
      if (cancelled) return;
      setLine(lines[index % lines.length]);
      index += 1;
      setSpeaking(true);
      wait(() => {
        setSpeaking(false);
        wait(silentCycle, 1_200);
      }, 3_600);
    };

    if (!synth) {
      silentCycle();
      return () => {
        cancelled = true;
        if (timer) clearTimeout(timer);
        setSpeaking(false);
      };
    }

    const speak = () => {
      if (cancelled) return;
      const text = lines[index % lines.length];
      index += 1;
      setLine(text);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang === 'ar' ? 'ar-SA' : 'en-US';
      utterance.rate = 1;
      utterance.pitch = 1.15;
      const voices = synth.getVoices();
      const match = voices.find((voice) => voice.lang.toLowerCase().startsWith(lang));
      if (match) utterance.voice = match;
      utterance.onstart = () => {
        failures = 0;
        setSpeaking(true);
      };
      utterance.onend = () => {
        setSpeaking(false);
        wait(speak, 1_100);
      };
      utterance.onerror = () => {
        setSpeaking(false);
        failures += 1;
        if (failures >= 3) silentCycle();
        else wait(speak, 900);
      };
      try {
        synth.speak(utterance);
      } catch {
        failures += 1;
        if (failures >= 3) silentCycle();
        else wait(speak, 900);
      }
    };

    wait(speak, 450);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      setSpeaking(false);
      try {
        synth.cancel();
      } catch {
        /* ignore */
      }
    };
  }, [active, muted, lang]);

  return { speaking, line };
}

/** Voice-only calls: speaks, with a small "speaking" badge. */
export function BotVoice({ active, muted }: { active: boolean; muted: boolean }) {
  const { t } = useI18n();
  const { speaking, line } = useBotSpeech(active, muted);
  if (!active) return null;
  return (
    <>
      <div className={`call-bot-badge voice ${speaking ? 'on' : ''}`}>
        <span className="call-bot-dot" />
        {speaking ? t('botSpeaking') : t('botListening')}
      </div>
      {line ? <div className="bot-caption voice">{line}</div> : null}
    </>
  );
}

function drawLina(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, speaking: boolean) {
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#2a1050');
  bg.addColorStop(0.55, '#3a1150');
  bg.addColorStop(1, '#120a24');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  const blob = (x: number, y: number, r: number, color: string, alpha: number) => {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  };
  blob(w * 0.18 + Math.sin(time * 0.5) * 22, h * 0.22, 280, '#ff4fa3', 0.4);
  blob(w * 0.88 + Math.cos(time * 0.42) * 22, h * 0.72, 320, '#5b6bff', 0.32);

  ctx.globalAlpha = 0.18;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 14; i += 1) {
    const x = ((i * 97) % w) + Math.sin(time * 0.6 + i) * 8;
    const y = ((i * 173) % h) + Math.cos(time * 0.5 + i) * 10;
    ctx.beginPath();
    ctx.arc(x, y, 2 + (i % 3), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const bob = Math.sin(time * 1.6) * 6;
  const sway = Math.sin(time * 0.9) * 5;
  ctx.save();
  ctx.translate(w / 2 + sway, h * 0.46 + bob);

  // shoulders
  const body = ctx.createLinearGradient(0, 150, 0, 380);
  body.addColorStop(0, '#3a2154');
  body.addColorStop(1, '#22123a');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(-200, 380);
  ctx.quadraticCurveTo(-180, 195, 0, 178);
  ctx.quadraticCurveTo(180, 195, 200, 380);
  ctx.closePath();
  ctx.fill();

  // neck
  ctx.fillStyle = '#e8b89f';
  ctx.fillRect(-34, 110, 68, 92);

  // hair behind
  ctx.fillStyle = '#2a1533';
  ctx.beginPath();
  ctx.ellipse(0, 8, 152, 178, 0, 0, Math.PI * 2);
  ctx.fill();

  // face
  const skin = ctx.createLinearGradient(0, -120, 0, 140);
  skin.addColorStop(0, '#fde0d0');
  skin.addColorStop(1, '#f0bda4');
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.ellipse(0, 0, 108, 130, 0, 0, Math.PI * 2);
  ctx.fill();

  // fringe
  ctx.fillStyle = '#2a1533';
  ctx.beginPath();
  ctx.moveTo(-112, -18);
  ctx.quadraticCurveTo(-98, -152, 0, -154);
  ctx.quadraticCurveTo(98, -152, 112, -18);
  ctx.quadraticCurveTo(70, -94, 0, -88);
  ctx.quadraticCurveTo(-70, -94, -112, -18);
  ctx.fill();

  // side strands
  ctx.beginPath();
  ctx.moveTo(-108, -40);
  ctx.quadraticCurveTo(-152, 70, -126, 210);
  ctx.quadraticCurveTo(-100, 92, -96, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(108, -40);
  ctx.quadraticCurveTo(152, 70, 126, 210);
  ctx.quadraticCurveTo(100, 92, 96, 0);
  ctx.fill();

  // eyes
  const blink = Math.sin(time * 1.25) > 0.985 ? 0.12 : 1;
  const look = Math.sin(time * 0.6) * 4;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(-42, 8, 20, 15 * blink, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(42, 8, 20, 15 * blink, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3b1a4a';
  ctx.beginPath();
  ctx.ellipse(-42 + look, 8, 9, 10 * blink, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(42 + look, 8, 9, 10 * blink, 0, 0, Math.PI * 2);
  ctx.fill();

  // brows
  ctx.strokeStyle = '#2a1533';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-58, -20);
  ctx.quadraticCurveTo(-42, -30, -26, -20);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(26, -20);
  ctx.quadraticCurveTo(42, -30, 58, -20);
  ctx.stroke();

  // blush
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#ff7fa8';
  ctx.beginPath();
  ctx.ellipse(-64, 44, 22, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(64, 44, 22, 12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // mouth — opens with her voice
  const open = speaking ? 0.3 + 0.7 * Math.abs(Math.sin(time * 11)) : 0;
  const mouthHeight = 9 + open * 36;
  ctx.fillStyle = '#c2557a';
  ctx.beginPath();
  ctx.ellipse(0, 80, 26, mouthHeight / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  if (open > 0.08) {
    ctx.fillStyle = '#7d2140';
    ctx.beginPath();
    ctx.ellipse(0, 81, 17, Math.max(2, mouthHeight / 2 - 6), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // earrings
  ctx.fillStyle = '#ffd75e';
  ctx.beginPath();
  ctx.arc(-108, 72, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(108, 72, 7, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  const vignette = ctx.createLinearGradient(0, h * 0.55, 0, h);
  vignette.addColorStop(0, 'rgba(10,6,16,0)');
  vignette.addColorStop(1, 'rgba(10,6,16,0.85)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, h * 0.55, w, h * 0.45);
}

/** Video calls: a live canvas stream of Lina, synced with her voice. */
export function BotVideoStage({ active, muted }: { active: boolean; muted: boolean }) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { speaking, line } = useBotSpeech(active, muted);
  const speakingRef = useRef(false);

  useEffect(() => {
    speakingRef.current = speaking;
  }, [speaking]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const width = 540;
    const height = 960;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let frame = 0;
    const started = performance.now();
    const loop = (now: number) => {
      drawLina(ctx, width, height, (now - started) / 1000, speakingRef.current);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);

    const stream = canvas.captureStream(15);
    video.srcObject = stream;
    void video.play().catch(() => undefined);

    return () => {
      cancelAnimationFrame(frame);
      stream.getTracks().forEach((track) => track.stop());
      video.srcObject = null;
    };
  }, []);

  return (
    <>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      <video ref={videoRef} className="remote" autoPlay playsInline muted />
      <div className={`call-bot-badge ${speaking ? 'on' : ''}`}>
        <span className="call-bot-dot" />
        {speaking ? t('botSpeaking') : t('botListening')}
      </div>
      {line ? <div className="bot-caption">{line}</div> : null}
    </>
  );
}
