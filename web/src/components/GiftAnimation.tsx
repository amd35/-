import { useEffect, useId, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { assetUrl } from '../lib/api';
import { formatCoins, Icon } from '../lib/ui';

export interface GiftVisual {
  name: string;
  design?: string | null;
  videoUrl?: string | null;
  coverUrl?: string | null;
  rarity?: string;
  price?: number;
}

const GOLD = '#ffd75e';

/**
 * Renders a gift: an uploaded MP4/WebM clip when the admin supplied one, otherwise
 * one of the built-in animated scenes. Scenes are layered SVG with CSS motion, so
 * they render instantly on every device without downloading a video.
 */
export function GiftAnimation({
  gift,
  className = '',
}: {
  gift: GiftVisual;
  className?: string;
}) {
  const uid = useId().replace(/[:]/g, '');
  if (gift.videoUrl) {
    return (
      <div className={`gift-scene gift-video ${className}`}>
        <video
          src={assetUrl(gift.videoUrl)}
          poster={assetUrl(gift.coverUrl)}
          autoPlay
          loop
          muted
          playsInline
        />
      </div>
    );
  }
  return (
    <div className={`gift-scene ${className}`}>
      {renderScene(gift.design || 'hearts', uid)}
    </div>
  );
}

/**
 * Card-sized gift artwork: the gift's cover image when one is set,
 * otherwise the built-in animated scene.
 */
export function GiftCover({ gift, className = '' }: { gift: GiftVisual; className?: string }) {
  const src = assetUrl(gift.coverUrl);
  if (!src) return <GiftAnimation gift={gift} className={className} />;
  return (
    <div className={`gift-scene gift-cover ${className}`}>
      <img src={src} alt={gift.name} />
    </div>
  );
}

function sparkles(uid: string, count = 6): ReactNode {
  return Array.from({ length: count }).map((_, index) => {
    const left = 18 + ((index * 27) % 164);
    const top = 12 + ((index * 41) % 150);
    return (
      <circle
        key={index}
        cx={left}
        cy={top}
        r={index % 2 ? 2 : 3}
        fill="#fff6c9"
        className="gift-sparkle"
        style={{ animationDelay: `${(index % 5) * 0.4}s` }}
      />
    );
  });
}

function renderScene(design: string, uid: string): ReactNode {
  const gold = `${uid}-gold`;
  const dark = `${uid}-dark`;

  switch (design) {
    case 'sports-car':
    case 'golden-car': {
      const isGold = design === 'golden-car';
      return (
        <svg viewBox="0 0 220 170" className="gift-svg">
          <defs>
            <linearGradient id={gold} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={isGold ? '#ffe89a' : '#ff6178'} />
              <stop offset="0.55" stopColor={isGold ? '#f5b400' : '#d21f45'} />
              <stop offset="1" stopColor={isGold ? '#8a5a00' : '#7d0f28'} />
            </linearGradient>
            <radialGradient id={dark}>
              <stop offset="0" stopColor={GOLD} stopOpacity="0.55" />
              <stop offset="1" stopColor={GOLD} stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx="110" cy="140" rx="84" ry="18" fill={`url(#${dark})`} />
          <g className="gift-float">
            <path
              d="M26 112c4-24 24-34 48-38l20-15c9-7 22-9 34-4l30 13c20 5 34 17 37 34l1 13c0 6-5 11-11 11H39c-8 0-14-6-13-14Z"
              fill={`url(#${gold})`}
              stroke="rgba(255,255,255,.28)"
              strokeWidth="1.5"
            />
            <path d="M91 74l17-14c8-6 19-7 29-3l20 9-66 8Z" fill="#160c26" opacity=".82" />
            <path d="M20 100h32M10 113h26" stroke={GOLD} strokeWidth="3.5" className="gift-speed" />
            <g className="gift-wheel">
              <circle cx="65" cy="125" r="17" fill="#120a1e" stroke={GOLD} strokeWidth="3" />
              <path d="M65 112v26M52 125h26" stroke={GOLD} strokeWidth="2" />
            </g>
            <g className="gift-wheel">
              <circle cx="171" cy="125" r="17" fill="#120a1e" stroke={GOLD} strokeWidth="3" />
              <path d="M171 112v26M158 125h26" stroke={GOLD} strokeWidth="2" />
            </g>
            <path
              d="M34 104c42-8 116-8 172 0"
              stroke="#fff"
              strokeOpacity=".45"
              strokeWidth="2"
              className="gift-shine-line"
            />
          </g>
          {sparkles(uid, 5)}
        </svg>
      );
    }
    case 'private-jet':
      return (
        <svg viewBox="0 0 220 170" className="gift-svg">
          <defs>
            <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="0.6" stopColor="#d9d4f5" />
              <stop offset="1" stopColor="#9b8fd4" />
            </linearGradient>
          </defs>
          <g className="gift-drift">
            <g className="gift-cloud">
              <ellipse cx="44" cy="42" rx="26" ry="10" fill="#ffffff" opacity=".16" />
              <ellipse cx="60" cy="36" rx="18" ry="8" fill="#ffffff" opacity=".14" />
            </g>
            <g className="gift-cloud slow">
              <ellipse cx="178" cy="128" rx="30" ry="11" fill="#ffffff" opacity=".12" />
            </g>
          </g>
          <g className="gift-float">
            <path
              d="M40 92l62-14c14-3 27-2 39 4l40 20c5 3 4 8-2 8H52c-9 0-17-4-22-10-3-4 0-7 10-8Z"
              fill={`url(#${gold})`}
              stroke={GOLD}
              strokeWidth="1.5"
            />
            <path d="M96 78l14-30c2-5 7-5 9 0l12 27-35 3Z" fill="#c9c2ec" />
            <path d="M120 96l34 34 12-2-22-38-24 6Z" fill="#a99ee0" />
            <path d="M58 96l-26 26 10 3 30-22-14-7Z" fill="#a99ee0" />
            <circle cx="82" cy="90" r="3" fill={GOLD} className="gift-blink" />
            <circle cx="94" cy="88" r="3" fill={GOLD} className="gift-blink" />
            <path d="M6 118h44M0 128h30" stroke={GOLD} strokeWidth="3" className="gift-speed" />
          </g>
          {sparkles(uid, 4)}
        </svg>
      );
    case 'royal-yacht':
      return (
        <svg viewBox="0 0 220 170" className="gift-svg">
          <defs>
            <linearGradient id={gold} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff4c9" />
              <stop offset="0.5" stopColor="#f3c445" />
              <stop offset="1" stopColor="#9c6a05" />
            </linearGradient>
            <linearGradient id={dark} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f8f5ff" />
              <stop offset="1" stopColor="#b9a9e8" />
            </linearGradient>
          </defs>
          <g className="gift-float">
            <path d="M34 104h152l-16 26c-4 6-10 9-17 9H70c-8 0-15-4-19-11l-17-24Z" fill={`url(#${dark})`} stroke={GOLD} strokeWidth="2.5" />
            <path d="M66 82h72l18 20H54l12-20Z" fill="#efeaff" stroke={GOLD} strokeWidth="2" />
            <rect x="84" y="64" width="38" height="18" rx="4" fill="#dcd3fb" stroke={GOLD} strokeWidth="2" />
            <path d="M103 44v20" stroke={GOLD} strokeWidth="3" />
            <path d="M105 46l18 8-18 8V46Z" fill={GOLD} />
            <circle cx="76" cy="93" r="2.4" fill="#7c3aed" className="gift-blink" />
            <circle cx="92" cy="93" r="2.4" fill="#7c3aed" className="gift-blink" />
            <circle cx="108" cy="93" r="2.4" fill="#7c3aed" className="gift-blink" />
            <circle cx="124" cy="93" r="2.4" fill="#7c3aed" className="gift-blink" />
          </g>
          <path d="M6 140c18-9 34-9 52 0s34 9 52 0 34-9 52 0 34 9 52 0" fill="none" stroke="#7dd3fc" strokeWidth="3" className="gift-wave" />
          <path d="M6 152c18-9 34-9 52 0s34 9 52 0 34-9 52 0 34 9 52 0" fill="none" stroke="#4f46e5" strokeWidth="2.5" className="gift-wave slow" />
          {sparkles(uid, 5)}
        </svg>
      );
    case 'royal-crown':
      return (
        <svg viewBox="0 0 220 170" className="gift-svg">
          <defs>
            <linearGradient id={gold} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fff3b0" />
              <stop offset="0.5" stopColor="#f7c948" />
              <stop offset="1" stopColor="#a06d05" />
            </linearGradient>
            <linearGradient id={dark} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ff6fb5" />
              <stop offset="1" stopColor="#8b5cf6" />
            </linearGradient>
          </defs>
          <ellipse cx="110" cy="140" rx="70" ry="14" fill={GOLD} opacity=".18" />
          <g className="gift-float">
            <path
              d="M42 122l-10-58 34 24 24-44 24 44 34-24-10 58H42Z"
              fill={`url(#${gold})`}
              stroke="#7a5100"
              strokeWidth="2"
            />
            <rect x="42" y="120" width="116" height="16" rx="6" fill={`url(#${gold})`} stroke="#7a5100" strokeWidth="2" />
            <circle cx="110" cy="94" r="9" fill={`url(#${dark})`} className="gift-pulse" />
            <circle cx="72" cy="108" r="6" fill="#7dd3fc" />
            <circle cx="148" cy="108" r="6" fill="#7dd3fc" />
            <circle cx="66" cy="64" r="5" fill="#fff6c9" className="gift-pulse" />
            <circle cx="110" cy="40" r="5" fill="#fff6c9" className="gift-pulse" />
            <circle cx="154" cy="64" r="5" fill="#fff6c9" className="gift-pulse" />
            <path d="M50 128h100" stroke="#fff" strokeOpacity=".65" strokeWidth="2" className="gift-shine-line" />
          </g>
          {sparkles(uid, 7)}
        </svg>
      );
    case 'roses':
      return (
        <svg viewBox="0 0 220 170" className="gift-svg">
          <defs>
            <radialGradient id={dark}>
              <stop offset="0" stopColor="#ff8ec4" />
              <stop offset="1" stopColor="#b31245" />
            </radialGradient>
            <linearGradient id={gold} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#9ef0a8" />
              <stop offset="1" stopColor="#1f8a4c" />
            </linearGradient>
          </defs>
          <g className="gift-float">
            <path d="M110 148c-8-28-22-44-44-54M110 148c2-32 10-50 28-62M110 148c-2-26-2-44 0-64" stroke={`url(#${gold})`} strokeWidth="5" fill="none" />
            <path d="M78 100c-14-6-24-2-30 8 12 6 24 4 30-8ZM136 104c14-6 24-2 30 8-12 6-24 4-30-8Z" fill="#2fa35c" />
            <g className="gift-sway">
              <circle cx="62" cy="78" r="20" fill={`url(#${dark})`} />
              <path d="M52 72c4-8 16-8 20 0-2 8-16 10-20 0Z" fill="#ffc2da" opacity=".7" />
            </g>
            <g className="gift-sway slow">
              <circle cx="110" cy="58" r="24" fill={`url(#${dark})`} />
              <path d="M98 51c5-9 19-9 24 0-2 10-20 12-24 0Z" fill="#ffc2da" opacity=".7" />
            </g>
            <g className="gift-sway">
              <circle cx="160" cy="80" r="19" fill={`url(#${dark})`} />
              <path d="M151 74c4-7 15-7 18 0-2 8-14 9-18 0Z" fill="#ffc2da" opacity=".7" />
            </g>
          </g>
          {Array.from({ length: 7 }).map((_, index) => (
            <path
              key={index}
              d="M0 0c3 5 8 5 10 0-2-5-7-5-10 0Z"
              fill="#ff7ab8"
              className="gift-petal"
              style={{
                transform: `translate(${40 + index * 22}px, ${120 - (index % 3) * 14}px)`,
                animationDelay: `${index * 0.45}s`,
              }}
            />
          ))}
          {sparkles(uid, 4)}
        </svg>
      );
    case 'golden-lion':
      return (
        <svg viewBox="0 0 220 170" className="gift-svg">
          <defs>
            <radialGradient id={gold}>
              <stop offset="0" stopColor="#fff3b0" />
              <stop offset="0.6" stopColor="#f2b705" />
              <stop offset="1" stopColor="#8f5a00" />
            </radialGradient>
            <radialGradient id={dark}>
              <stop offset="0" stopColor="#3a2205" />
              <stop offset="1" stopColor="#120a1e" />
            </radialGradient>
          </defs>
          <g className="gift-float">
            <g className="gift-pulse-slow">
              {Array.from({ length: 14 }).map((_, index) => {
                const angle = (index / 14) * Math.PI * 2;
                return (
                  <ellipse
                    key={index}
                    cx={110 + Math.cos(angle) * 44}
                    cy={88 + Math.sin(angle) * 44}
                    rx="13"
                    ry="9"
                    fill={`url(#${gold})`}
                    opacity=".9"
                    transform={`rotate(${(index / 14) * 360} ${110 + Math.cos(angle) * 44} ${88 + Math.sin(angle) * 44})`}
                  />
                );
              })}
            </g>
            <circle cx="110" cy="88" r="42" fill={`url(#${gold})`} />
            <circle cx="110" cy="92" r="32" fill={`url(#${dark})`} />
            <path d="M92 82l10-6 4 8-14-2ZM128 82l-10-6-4 8 14-2Z" fill={GOLD} className="gift-blink" />
            <circle cx="97" cy="83" r="2.6" fill="#fff" />
            <circle cx="123" cy="83" r="2.6" fill="#fff" />
            <path d="M110 92l-7 8h14l-7-8Z" fill="#e0a100" />
            <path d="M98 110c7 6 17 6 24 0" stroke={GOLD} strokeWidth="2.5" fill="none" />
          </g>
          {sparkles(uid, 6)}
        </svg>
      );
    case 'golden-eagle':
      return (
        <svg viewBox="0 0 220 170" className="gift-svg">
          <defs>
            <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff4bf" />
              <stop offset="0.55" stopColor="#f3b70b" />
              <stop offset="1" stopColor="#8f5a00" />
            </linearGradient>
          </defs>
          <circle cx="110" cy="84" r="52" fill={GOLD} opacity=".12" className="gift-pulse-slow" />
          <g className="gift-float">
            <g className="gift-wing left">
              <path d="M104 86c-18-22-40-34-66-36 10 18 26 34 48 44l18-8Z" fill={`url(#${gold})`} stroke="#7a5100" strokeWidth="1.5" />
              <path d="M52 62l18 18M64 56l20 22" stroke="#7a5100" strokeWidth="1.6" opacity=".7" />
            </g>
            <g className="gift-wing right">
              <path d="M116 86c18-22 40-34 66-36-10 18-26 34-48 44l-18-8Z" fill={`url(#${gold})`} stroke="#7a5100" strokeWidth="1.5" />
              <path d="M168 62l-18 18M156 56l-20 22" stroke="#7a5100" strokeWidth="1.6" opacity=".7" />
            </g>
            <path d="M110 58c12 0 20 10 20 24 0 18-8 32-20 40-12-8-20-22-20-40 0-14 8-24 20-24Z" fill={`url(#${gold})`} stroke="#7a5100" strokeWidth="1.5" />
            <circle cx="103" cy="78" r="2.6" fill="#2b1700" />
            <circle cx="117" cy="78" r="2.6" fill="#2b1700" />
            <path d="M110 84l-5 6h10l-5-6Z" fill="#8f5a00" />
          </g>
          {sparkles(uid, 6)}
        </svg>
      );
    case 'diamond':
      return (
        <svg viewBox="0 0 220 170" className="gift-svg">
          <defs>
            <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#e0f7ff" />
              <stop offset="0.5" stopColor="#7dd3fc" />
              <stop offset="1" stopColor="#6d28d9" />
            </linearGradient>
            <linearGradient id={dark} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#ffffff" stopOpacity=".9" />
              <stop offset="1" stopColor="#c4b5fd" stopOpacity=".5" />
            </linearGradient>
          </defs>
          <ellipse cx="110" cy="142" rx="58" ry="12" fill="#7dd3fc" opacity=".2" />
          <g className="gift-diamond">
            <path d="M110 36l52 30-24 62H82L58 66l52-30Z" fill={`url(#${gold})`} stroke="#e0f7ff" strokeWidth="1.6" />
            <path d="M110 36l22 30-22 62-22-62 22-30Z" fill={`url(#${dark})`} opacity=".55" />
            <path d="M58 66h104M110 36v92" stroke="#ffffff" strokeOpacity=".55" strokeWidth="1.4" />
            <path d="M58 66l24 62M162 66l-24 62" stroke="#ffffff" strokeOpacity=".4" strokeWidth="1.2" />
          </g>
          {sparkles(uid, 8)}
        </svg>
      );
    case 'treasure':
      return (
        <svg viewBox="0 0 220 170" className="gift-svg">
          <defs>
            <linearGradient id={gold} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffe89a" />
              <stop offset="1" stopColor="#a86b00" />
            </linearGradient>
            <linearGradient id={dark} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#8a4b1f" />
              <stop offset="1" stopColor="#4a240c" />
            </linearGradient>
          </defs>
          <g className="gift-rays">
            {Array.from({ length: 9 }).map((_, index) => (
              <path
                key={index}
                d="M110 92L96 18h28L110 92Z"
                fill={GOLD}
                opacity=".16"
                transform={`rotate(${index * 40} 110 92)`}
              />
            ))}
          </g>
          <g className="gift-float">
            <rect x="52" y="96" width="116" height="52" rx="8" fill={`url(#${dark})`} stroke={GOLD} strokeWidth="3" />
            <g className="gift-lid">
              <path d="M50 96c0-22 18-34 60-34s60 12 60 34H50Z" fill={`url(#${dark})`} stroke={GOLD} strokeWidth="3" />
            </g>
            <rect x="98" y="96" width="24" height="26" rx="4" fill={GOLD} />
            <circle cx="110" cy="106" r="4" fill="#4a240c" />
            <circle cx="74" cy="112" r="5" fill={GOLD} className="gift-pulse" />
            <circle cx="146" cy="112" r="5" fill={GOLD} className="gift-pulse" />
          </g>
          {sparkles(uid, 7)}
        </svg>
      );
    case 'hearts':
      return (
        <svg viewBox="0 0 220 170" className="gift-svg">
          <defs>
            <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ff9ec7" />
              <stop offset="1" stopColor="#d63384" />
            </linearGradient>
          </defs>
          <g className="gift-float">
            <path d="M110 146C70 120 44 98 44 72c0-18 14-30 30-30 14 0 26 8 36 24 10-16 22-24 36-24 16 0 30 12 30 30 0 26-26 48-66 74Z" fill={`url(#${gold})`} stroke="#ffd0e4" strokeWidth="2" />
          </g>
          {Array.from({ length: 9 }).map((_, index) => (
            <path
              key={index}
              d="M0 0c4 6 10 6 14 0-4-6-10-6-14 0Z"
              fill={index % 2 ? '#ff8ec4' : '#a78bfa'}
              className="gift-heart"
              style={{ animationDelay: `${index * 0.35}s`, transform: `translate(${26 + index * 20}px, 150px)` }}
            />
          ))}
          {sparkles(uid, 5)}
        </svg>
      );
    case 'legend-dragon':
      return (
        <svg viewBox="0 0 220 170" className="gift-svg">
          <defs>
            <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#e9d5ff" />
              <stop offset="0.5" stopColor="#8b5cf6" />
              <stop offset="1" stopColor="#3b0764" />
            </linearGradient>
            <radialGradient id={dark}>
              <stop offset="0" stopColor="#f0abfc" stopOpacity=".8" />
              <stop offset="1" stopColor="#7c3aed" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle cx="110" cy="86" r="60" fill={`url(#${dark})`} className="gift-pulse-slow" />
          <g className="gift-float">
            <path d="M64 60c18-18 44-22 64-12 16 8 26 24 26 42 0 20-12 36-30 44-8 4-18 4-26 0l-14-8 16-12-20-6 12-16-22-2 14-14-20-6Z" fill={`url(#${gold})`} stroke="#c4b5fd" strokeWidth="1.6" />
            <path d="M120 54l16-22 6 26M96 48L82 24l-4 28" fill="#a78bfa" stroke="#c4b5fd" strokeWidth="1.4" />
            <path d="M138 84c8 2 14 8 16 16-10 2-18-2-22-10l6-6Z" fill="#f0abfc" className="gift-blink" />
            <circle cx="126" cy="80" r="4" fill="#fff6c9" />
            <circle cx="126" cy="80" r="1.8" fill="#2b1700" />
            <path d="M142 108c8 4 16 4 24 0" stroke="#f0abfc" strokeWidth="2" fill="none" />
          </g>
          <g className="gift-fire">
            <circle cx="58" cy="118" r="12" fill="#f0abfc" opacity=".55" />
            <circle cx="48" cy="104" r="7" fill="#c084fc" opacity=".6" />
            <circle cx="68" cy="100" r="5" fill="#e9d5ff" opacity=".6" />
          </g>
          {sparkles(uid, 8)}
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 220 170" className="gift-svg">
          <defs>
            <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffd1e6" />
              <stop offset="1" stopColor="#d63384" />
            </linearGradient>
          </defs>
          <g className="gift-float">
            <rect x="58" y="82" width="104" height="62" rx="10" fill={`url(#${gold})`} />
            <rect x="50" y="66" width="120" height="24" rx="8" fill="#ff8ec4" />
            <path d="M110 66v78" stroke="#fff" strokeWidth="8" opacity=".8" />
            <path d="M110 66c-16 0-26-8-26-18s16-12 26 4c10-16 26-14 26-4s-10 18-26 18Z" fill="#ffd75e" />
          </g>
          {sparkles(uid, 6)}
        </svg>
      );
  }
}

const RARITY_LABEL: Record<string, string> = {
  common: 'عادي',
  rare: 'نادر',
  epic: 'ملحمي',
  legendary: 'أسطوري',
  vip: 'VIP',
};

/** Full-screen animation shown to both sides the moment a gift is sent. */
export function GiftReveal({
  gift,
  senderName,
  recipientName,
  onClose,
}: {
  gift: GiftVisual;
  senderName: string;
  recipientName?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onClose, 5600);
    return () => clearTimeout(timer);
  }, [onClose]);

  return createPortal(
    <div className="gift-reveal" onClick={onClose}>
      <div className="gift-reveal-glow" />
      <div className="gift-reveal-stage">
        <GiftAnimation gift={gift} />
      </div>
      <div className="gift-reveal-copy">
        <span className={`pill rarity-${gift.rarity || 'common'}`}>
          {RARITY_LABEL[gift.rarity || 'common'] ?? gift.rarity}
        </span>
        <h2>{gift.name}</h2>
        <p className="tiny">
          {senderName}
          {recipientName ? ` ← ${recipientName}` : ''}
        </p>
        {gift.price ? (
          <span className="gift-reveal-price">
            <Icon name="coins" size={15} /> {formatCoins(gift.price)}
          </span>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
