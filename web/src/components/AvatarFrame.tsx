import { useId, type ReactNode } from 'react';
import { assetUrl } from '../lib/api';

export interface FrameInfo {
  id: string;
  design: string | null;
  kind: string;
  imageUrl: string | null;
  rarity: string;
}

function useSvgId(prefix: string): string {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

/** Linear gradient definition used by most frames. */
function Gradient({ id, stops }: { id: string; stops: [string, string, string] }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stopColor={stops[0]} />
      <stop offset="50%" stopColor={stops[1]} />
      <stop offset="100%" stopColor={stops[2]} />
    </linearGradient>
  );
}

function Ring({ id, strokeWidth = 5.5, className }: { id: string; strokeWidth?: number; className?: string }) {
  return (
    <circle
      cx="50"
      cy="50"
      r="45"
      fill="none"
      stroke={`url(#${id})`}
      strokeWidth={strokeWidth}
      className={className}
    />
  );
}

function Wing({ x, y, fill, flip = false }: { x: number; y: number; fill: string; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) ${flip ? 'scale(-1 1)' : ''}`}>
      <g className="av-flap">
        <path
          d="M0 0 C 8 -4 16 -8 25 -16 C 22 -4 16 4 8 8 C 14 8 20 4 24 -2 C 20 10 12 16 2 14 C 7 18 14 19 20 16 C 12 24 2 24 -6 20 Z"
          fill={fill}
          opacity="0.95"
        />
        <path d="M2 2 C 8 -1 13 -5 18 -10 C 15 -2 10 3 4 6 Z" fill="#fff" opacity="0.35" />
      </g>
    </g>
  );
}

function Crown({ id }: { id: string }) {
  return (
    <g className="av-bob">
      <path
        d="M40 6 L44 15 L50 8 L56 15 L60 6 L58 21 L42 21 Z"
        fill={`url(#${id})`}
        stroke="#7a4d0a"
        strokeWidth="0.8"
      />
      <circle cx="50" cy="19" r="1.6" fill="#fff8c9" />
    </g>
  );
}

function Diamonds({ id, count = 8 }: { id: string; count?: number }) {
  return (
    <g>
      {Array.from({ length: count }).map((_, index) => {
        const angle = (360 / count) * index - 90;
        const rad = (angle * Math.PI) / 180;
        const x = 50 + Math.cos(rad) * 45;
        const y = 50 + Math.sin(rad) * 45;
        return (
          <rect
            key={angle}
            x={x - 2.6}
            y={y - 2.6}
            width="5.2"
            height="5.2"
            transform={`rotate(45 ${x} ${y})`}
            fill={`url(#${id})`}
            stroke="#fffbe6"
            strokeWidth="0.5"
            className="av-twinkle"
            style={{ animationDelay: `${(index % 4) * 0.35}s` }}
          />
        );
      })}
    </g>
  );
}

function Car({ accent, glow }: { accent: string; glow: string }) {
  return (
    <g>
      <path
        d="M30 84 L30 76 C30 73 32 71 35 71 L40 71 L44 63 L56 63 L60 71 L65 71 C68 71 70 73 70 76 L70 84 Z"
        fill="#1b1430"
        stroke={glow}
        strokeWidth="1.2"
      />
      <rect x="34" y="74" width="32" height="2.6" rx="1.3" fill={accent} className="av-flash" />
      <rect x="42" y="65" width="16" height="5" rx="2" fill="#7fd4ff" opacity="0.45" />
    </g>
  );
}

function Bolt({ x, y, scale = 1, fill }: { x: number; y: number; scale?: number; fill: string }) {
  return (
    <path
      transform={`translate(${x} ${y}) scale(${scale})`}
      d="M0 0 L6 0 L3 6 L7 6 L-2 17 L0 9 L-4 9 Z"
      fill={fill}
      className="av-flash"
    />
  );
}

function GoldEagle() {
  const id = useSvgId('fg');
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <Gradient id={id} stops={['#fff6c9', '#d4a017', '#8b6508']} />
      </defs>
      <Wing x={70} y={72} fill={`url(#${id})`} />
      <Wing x={30} y={72} fill={`url(#${id})`} flip />
      <Ring id={id} />
      <Crown id={id} />
    </svg>
  );
}

function SilverEagle() {
  const id = useSvgId('fs');
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <Gradient id={id} stops={['#ffffff', '#c0c8d8', '#6b7688']} />
      </defs>
      <Wing x={70} y={72} fill={`url(#${id})`} />
      <Wing x={30} y={72} fill={`url(#${id})`} flip />
      <Ring id={id} />
    </svg>
  );
}

function RoyalCrown() {
  const id = useSvgId('fr');
  const gem = useSvgId('gem');
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <Gradient id={id} stops={['#ffe680', '#d4a017', '#a0522d']} />
        <Gradient id={gem} stops={['#9be7ff', '#2f8fff', '#1e40af']} />
      </defs>
      <Ring id={id} strokeWidth={6} />
      <Crown id={id} />
      <circle cx="50" cy="13" r="2.4" fill={`url(#${gem})`} className="av-twinkle" />
      <Wing x={66} y={74} fill={`url(#${id})`} />
      <Wing x={34} y={74} fill={`url(#${id})`} flip />
    </svg>
  );
}

function SportsCar() {
  const id = useSvgId('fc');
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <Gradient id={id} stops={['#d7f6ff', '#39b6ff', '#1b4bff']} />
      </defs>
      <g className="av-spin">
        <Ring id={id} strokeWidth={3} className="av-dash" />
      </g>
      <circle cx="50" cy="50" r="41" fill="none" stroke="#39b6ff" strokeWidth="1" opacity="0.5" />
      <Car accent="#ff2d55" glow="#39b6ff" />
    </svg>
  );
}

function RacingLed() {
  const id = useSvgId('fl');
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <Gradient id={id} stops={['#00f0ff', '#ff2d55', '#00f0ff']} />
      </defs>
      <g className="av-spin">
        <Ring id={id} strokeWidth={5} className="av-dash" />
      </g>
      <g className="av-spin-rev">
        <circle
          cx="50"
          cy="50"
          r="49"
          fill="none"
          stroke="#ff2d55"
          strokeWidth="1.6"
          strokeDasharray="2 9"
          opacity="0.9"
        />
      </g>
      <Car accent="#ff2d55" glow="#00f0ff" />
    </svg>
  );
}

function Fire() {
  const id = useSvgId('ff');
  const blur = useSvgId('blur');
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <Gradient id={id} stops={['#ffe066', '#ff8c00', '#ff2d00']} />
        <filter id={blur} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="2.4" />
        </filter>
      </defs>
      <circle cx="50" cy="50" r="47" fill="none" stroke="#ff5a00" strokeWidth="7" opacity="0.55" filter={`url(#${blur})`} className="av-flicker" />
      <g className="av-spin">
        <Ring id={id} strokeWidth={4.5} className="av-dash" />
      </g>
      <Bolt x={34} y={10} scale={1.1} fill="#ffd75e" />
      <Bolt x={62} y={12} scale={0.9} fill="#ff8c00" />
    </svg>
  );
}

function Lightning() {
  const id = useSvgId('ft');
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <Gradient id={id} stops={['#d9f6ff', '#00bfff', '#4b6bff']} />
      </defs>
      <g className="av-pulse">
        <Ring id={id} strokeWidth={4.5} />
      </g>
      <Bolt x={20} y={16} scale={1.5} fill="#a5e9ff" />
      <Bolt x={72} y={58} scale={1.2} fill="#7fd4ff" />
    </svg>
  );
}

function RoyalPurple() {
  const id = useSvgId('fp');
  const gem = useSvgId('pg');
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <Gradient id={id} stops={['#f3e8ff', '#a855f7', '#4c1d95']} />
        <Gradient id={gem} stops={['#fff', '#e9d5ff', '#9333ea']} />
      </defs>
      <g className="av-spin-slow">
        <Ring id={id} strokeWidth={5} className="av-dash" />
      </g>
      {[0, 90, 180, 270].map((angle) => {
        const rad = ((angle - 90) * Math.PI) / 180;
        return (
          <rect
            key={angle}
            x={50 + Math.cos(rad) * 45 - 2.6}
            y={50 + Math.sin(rad) * 45 - 2.6}
            width="5.2"
            height="5.2"
            transform={`rotate(45 ${50 + Math.cos(rad) * 45} ${50 + Math.sin(rad) * 45})`}
            fill={`url(#${gem})`}
            className="av-twinkle"
          />
        );
      })}
    </svg>
  );
}

function DiamondGold() {
  const id = useSvgId('fd');
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <Gradient id={id} stops={['#fffbe6', '#f4e290', '#b8860b']} />
      </defs>
      <Ring id={id} strokeWidth={4} />
      <Diamonds id={id} count={10} />
      <Crown id={id} />
    </svg>
  );
}

function Galaxy() {
  const id = useSvgId('fk');
  const stars = useSvgId('stars');
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <Gradient id={id} stops={['#c4b5fd', '#7c3aed', '#1e1b4b']} />
        <radialGradient id={stars}>
          <stop offset="0%" stopColor="#fff" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <g className="av-spin-slow">
        <Ring id={id} strokeWidth={4.5} className="av-dash" />
      </g>
      {[
        [18, 24],
        [82, 30],
        [24, 78],
        [76, 76],
        [50, 6],
      ].map(([x, y], index) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r="2.6"
          fill={`url(#${stars})`}
          className="av-twinkle"
          style={{ animationDelay: `${index * 0.4}s` }}
        />
      ))}
    </svg>
  );
}

function Aurora() {
  const id = useSvgId('fa');
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#a7f3d0" />
          <stop offset="35%" stopColor="#34d399" />
          <stop offset="70%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#c084fc" />
        </linearGradient>
      </defs>
      <g className="av-spin-slow">
        <Ring id={id} strokeWidth={5} />
      </g>
      <circle cx="50" cy="50" r="47" fill="none" stroke="#a7f3d0" strokeWidth="1" opacity="0.5" className="av-pulse" />
    </svg>
  );
}

function Emerald() {
  const id = useSvgId('fe');
  const gem = useSvgId('eg');
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <Gradient id={id} stops={['#a7f3d0', '#10b981', '#064e3b']} />
        <Gradient id={gem} stops={['#eafff6', '#34d399', '#047857']} />
      </defs>
      <Ring id={id} strokeWidth={5} />
      {[45, 135, 225, 315].map((angle) => {
        const rad = ((angle - 90) * Math.PI) / 180;
        return (
          <circle
            key={angle}
            cx={50 + Math.cos(rad) * 45}
            cy={50 + Math.sin(rad) * 45}
            r="3.2"
            fill={`url(#${gem})`}
            className="av-twinkle"
          />
        );
      })}
    </svg>
  );
}

function Rainbow() {
  const id = useSvgId('fb');
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff4d6d" />
          <stop offset="25%" stopColor="#ffb703" />
          <stop offset="50%" stopColor="#4ade80" />
          <stop offset="75%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <g className="av-spin">
        <Ring id={id} strokeWidth={5} className="av-dash" />
      </g>
    </svg>
  );
}

const DESIGNS: Record<string, () => ReactNode> = {
  'eagle-gold': GoldEagle,
  'eagle-silver': SilverEagle,
  'royal-crown': RoyalCrown,
  'sports-car': SportsCar,
  'racing-led': RacingLed,
  fire: Fire,
  lightning: Lightning,
  'royal-purple': RoyalPurple,
  'diamond-gold': DiamondGold,
  galaxy: Galaxy,
  aurora: Aurora,
  emerald: Emerald,
  rainbow: Rainbow,
};

/**
 * Draws an avatar frame over the parent avatar. Frames are pure SVG + CSS animations,
 * so they cost no image download and stay sharp at every size.
 */
export function AvatarFrame({ frame }: { frame: FrameInfo | null }) {
  if (!frame) return null;
  if (frame.kind === 'image') {
    if (!frame.imageUrl) return null;
    return (
      <span className="av-frame av-frame-image">
        <img src={assetUrl(frame.imageUrl)} alt="" />
      </span>
    );
  }
  const Design = DESIGNS[frame.design ?? ''] ?? DESIGNS.galaxy;
  return (
    <span className={`av-frame av-frame-${frame.design ?? 'galaxy'}`} aria-hidden="true">
      <Design />
    </span>
  );
}
