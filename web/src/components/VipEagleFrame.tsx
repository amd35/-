import { useId } from 'react';

/**
 * Legendary VIP avatar frames: a diamond-studded ring with a royal crown, two huge
 * eagle wings, a 3D "VIP" shield and sparkling gems. Everything is vector + CSS
 * animation, so the frame has a genuinely transparent centre hole, stays razor sharp
 * at every size and costs no image download.
 */

export interface VipFramePalette {
  /** Ring / crown / shield metal: highlight, body, shadow. */
  metal: [string, string, string];
  /** Wing feathers: tip, body, base. */
  wing: [string, string, string];
  /** Gemstone: highlight, body, shadow. */
  gem: [string, string, string];
  /** Halo + energy arcs around the frame. */
  glow: string;
}

export const VIP_EAGLE_FRAMES: Record<string, VipFramePalette> = {
  'vip-eagle-royal': {
    metal: ['#fff6cf', '#e8b53c', '#8a5a06'],
    wing: ['#ffeaa6', '#e2a92e', '#7c4f05'],
    gem: ['#ffe3ea', '#e11d48', '#6b0a1e'],
    glow: '#ffcf5c',
  },
  'vip-eagle-sapphire': {
    metal: ['#fff6cf', '#e8b53c', '#8a5a06'],
    wing: ['#d6ecff', '#3f8dfd', '#0f2f7a'],
    gem: ['#e6f4ff', '#2f7ff0', '#0a245e'],
    glow: '#4ea6ff',
  },
  'vip-eagle-inferno': {
    metal: ['#ffe6bd', '#d98a2b', '#5a2a06'],
    wing: ['#ffd0a8', '#ff5a1f', '#6e1200'],
    gem: ['#ffd9c9', '#ff2d1a', '#5c0700'],
    glow: '#ff5a2d',
  },
  'vip-eagle-amethyst': {
    metal: ['#fff6cf', '#e8b53c', '#8a5a06'],
    wing: ['#f0dcff', '#a855f7', '#43128a'],
    gem: ['#f8e8ff', '#c026d3', '#520f7d'],
    glow: '#b06cff',
  },
  'vip-eagle-emerald': {
    metal: ['#fff6cf', '#e8b53c', '#8a5a06'],
    wing: ['#d4ffe9', '#10b981', '#04543c'],
    gem: ['#dcfff1', '#0fd08a', '#04422f'],
    glow: '#2ee6a0',
  },
  'vip-eagle-diamond': {
    metal: ['#ffffff', '#cfd9e8', '#6f7f96'],
    wing: ['#ffffff', '#c6d5e9', '#6f7f96'],
    gem: ['#ffffff', '#dbeafe', '#8497b3'],
    glow: '#dfe9ff',
  },
  'vip-eagle-obsidian': {
    metal: ['#ffe9a8', '#c9922a', '#1c1206'],
    wing: ['#a89468', '#2b2420', '#0b0908'],
    gem: ['#fff0b8', '#e0b23c', '#6d4a05'],
    glow: '#ffc93c',
  },
  'vip-eagle-frost': {
    metal: ['#ffffff', '#cfe6ff', '#6f90b8'],
    wing: ['#ecfbff', '#7fd4ff', '#25628f'],
    gem: ['#f4ffff', '#9fe6ff', '#2f6f96'],
    glow: '#7fe8ff',
  },
};

export const VIP_EAGLE_DESIGNS = Object.keys(VIP_EAGLE_FRAMES);

const RAD = Math.PI / 180;

function polar(radius: number, degrees: number): [number, number] {
  return [50 + radius * Math.cos(degrees * RAD), 50 + radius * Math.sin(degrees * RAD)];
}

/** One tapered feather pointing up from its base at (0, 0). */
function blade(length: number, width: number): string {
  return `M0 0 C ${width} ${-length * 0.3} ${width * 0.85} ${-length * 0.72} ${width * 0.12} ${-length} C ${-width * 0.5} ${-length * 0.64} ${-width * 0.62} ${-length * 0.26} 0 0 Z`;
}

/** Annular sector between two radii — the beveled wing shoulder sitting on the ring. */
function sector(inner: number, outer: number, from: number, to: number): string {
  const [x1, y1] = polar(outer, from);
  const [x2, y2] = polar(outer, to);
  const [x3, y3] = polar(inner, to);
  const [x4, y4] = polar(inner, from);
  return `M ${x1} ${y1} A ${outer} ${outer} 0 0 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 0 0 ${x4} ${y4} Z`;
}

const FEATHERS = [
  { angle: -6, length: 12, width: 5.4 },
  { angle: -22, length: 22, width: 6.2 },
  { angle: -38, length: 30, width: 6.8 },
  { angle: -55, length: 30, width: 6.4 },
  { angle: -72, length: 22, width: 5.6 },
];

const SPARKS = [
  { x: 9, y: 44, size: 2.6, delay: 0 },
  { x: 91, y: 42, size: 2.2, delay: 0.7 },
  { x: 16, y: 74, size: 1.9, delay: 1.3 },
  { x: 84, y: 76, size: 2.4, delay: 0.9 },
  { x: 28, y: 14, size: 2, delay: 1.7 },
  { x: 72, y: 14, size: 1.8, delay: 2.2 },
];

const STAR = 'M0 -3 Q 0.55 -0.55 3 0 Q 0.55 0.55 0 3 Q -0.55 0.55 -3 0 Q -0.55 -0.55 0 -3 Z';

function Wing({
  wingId,
  metalId,
  dark,
  flip = false,
}: {
  wingId: string;
  metalId: string;
  dark: string;
  flip?: boolean;
}) {
  return (
    <g transform={flip ? 'translate(100 0) scale(-1 1)' : undefined}>
      <g className="av-wing">
        {/* darker under-layer gives the fan depth */}
        {FEATHERS.map((feather) => {
          const [x, y] = polar(42, feather.angle - 2);
          return (
            <g key={`under-${feather.angle}`} transform={`translate(${x} ${y}) rotate(${feather.angle + 88})`}>
              <path d={blade(feather.length * 1.08, feather.width * 1.22)} fill={dark} opacity="0.92" />
            </g>
          );
        })}
        {FEATHERS.map((feather) => {
          const [x, y] = polar(44.5, feather.angle);
          return (
            <g key={feather.angle} transform={`translate(${x} ${y}) rotate(${feather.angle + 90})`}>
              <path
                d={blade(feather.length, feather.width)}
                fill={`url(#${wingId})`}
                stroke="rgba(0,0,0,0.35)"
                strokeWidth="0.45"
              />
              <path
                d={`M0 -1.4 C ${feather.width * 0.34} ${-feather.length * 0.4} ${feather.width * 0.3} ${-feather.length * 0.74} 0 ${-feather.length * 0.92}`}
                fill="none"
                stroke="#fff"
                strokeWidth="0.7"
                opacity="0.35"
              />
            </g>
          );
        })}
        {/* short coverts layered over the primaries */}
        {FEATHERS.map((feather) => {
          const [x, y] = polar(43.5, feather.angle + 2);
          return (
            <g key={`covert-${feather.angle}`} transform={`translate(${x} ${y}) rotate(${feather.angle + 90})`}>
              <path
                d={blade(feather.length * 0.56, feather.width * 0.98)}
                fill={`url(#${wingId})`}
                stroke="rgba(0,0,0,0.35)"
                strokeWidth="0.4"
              />
              <path d="M0 -1 L0.8 -3.4" stroke="#fff" strokeWidth="0.55" opacity="0.4" />
            </g>
          );
        })}
        {/* raised mount the feathers grow out of */}
        <path d={sector(39.5, 48.6, -76, -4)} fill={`url(#${metalId})`} stroke="rgba(0,0,0,0.45)" strokeWidth="0.6" />
        <path d={sector(45.6, 48.6, -74, -6)} fill="#fff" opacity="0.32" />
        <path d={sector(39.5, 41.6, -74, -6)} fill="#000" opacity="0.22" />
      </g>
    </g>
  );
}

export function VipEagleFrame({ design }: { design: string }) {
  const palette = VIP_EAGLE_FRAMES[design] ?? VIP_EAGLE_FRAMES['vip-eagle-royal'];
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const metal = `vm-${uid}`;
  const wing = `vw-${uid}`;
  const gem = `vg-${uid}`;
  const halo = `vh-${uid}`;
  const sheen = `vs-${uid}`;
  const crownGlow = `vc-${uid}`;

  return (
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient id={metal} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette.metal[0]} />
          <stop offset="42%" stopColor={palette.metal[1]} />
          <stop offset="54%" stopColor={palette.metal[0]} />
          <stop offset="100%" stopColor={palette.metal[2]} />
        </linearGradient>
        <linearGradient id={wing} x1="0" y1="1" x2="0.3" y2="0">
          <stop offset="0%" stopColor={palette.wing[2]} />
          <stop offset="55%" stopColor={palette.wing[1]} />
          <stop offset="100%" stopColor={palette.wing[0]} />
        </linearGradient>
        <linearGradient id={gem} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette.gem[0]} />
          <stop offset="55%" stopColor={palette.gem[1]} />
          <stop offset="100%" stopColor={palette.gem[2]} />
        </linearGradient>
        <radialGradient id={halo}>
          <stop offset="0%" stopColor={palette.glow} stopOpacity="0" />
          <stop offset="58%" stopColor={palette.glow} stopOpacity="0" />
          <stop offset="78%" stopColor={palette.glow} stopOpacity="0.45" />
          <stop offset="100%" stopColor={palette.glow} stopOpacity="0" />
        </radialGradient>
        <radialGradient id={crownGlow}>
          <stop offset="0%" stopColor={palette.glow} stopOpacity="0.65" />
          <stop offset="100%" stopColor={palette.glow} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={sheen}>
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* aura + energy rings behind everything */}
      <circle cx="50" cy="50" r="54" fill={`url(#${halo})`} className="av-pulse" />
      <circle
        cx="50"
        cy="50"
        r="52"
        fill="none"
        stroke={palette.glow}
        strokeWidth="1.1"
        strokeDasharray="3 13"
        opacity="0.55"
        className="av-spin-slow"
      />
      <circle
        cx="50"
        cy="50"
        r="56"
        fill="none"
        stroke={palette.glow}
        strokeWidth="0.7"
        strokeDasharray="1.6 20"
        opacity="0.4"
        className="av-spin-rev"
      />

      <Wing wingId={wing} metalId={metal} dark={palette.wing[2]} />
      <Wing wingId={wing} metalId={metal} dark={palette.wing[2]} flip />

      {/* diamond-studded ring */}
      <circle cx="50" cy="50" r="46.4" fill="none" stroke={`url(#${metal})`} strokeWidth="4.6" />
      <circle cx="50" cy="50" r="44.4" fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="1.3" />
      <circle cx="50" cy="50" r="48.5" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6" />
      <circle
        cx="50"
        cy="50"
        r="46.4"
        fill="none"
        stroke={`url(#${sheen})`}
        strokeWidth="4.6"
        strokeDasharray="16 276"
        strokeLinecap="round"
        className="av-spin-slow"
      />

      {Array.from({ length: 12 }).map((_, index) => {
        const angle = (360 / 12) * index;
        const [x, y] = polar(46.4, angle);
        return (
          <g
            key={angle}
            transform={`translate(${x} ${y}) rotate(45)`}
            className="av-twinkle"
            style={{ animationDelay: `${(index % 5) * 0.3}s` }}
          >
            <rect
              x="-1.7"
              y="-1.7"
              width="3.4"
              height="3.4"
              fill={index % 2 ? `url(#${gem})` : '#fff'}
              stroke="rgba(0,0,0,0.35)"
              strokeWidth="0.35"
            />
          </g>
        );
      })}

      {/* royal crown */}
      <g className="av-bob">
        <circle cx="50" cy="2" r="13" fill={`url(#${crownGlow})`} className="av-pulse" />
        <path
          d="M36 6 L34 -4.5 L42.5 0 L50 -6.5 L57.5 0 L66 -4.5 L64 6 Z"
          fill={`url(#${metal})`}
          stroke="rgba(0,0,0,0.5)"
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
        <path d="M37.4 4.4 L36.2 -2.2 L43 1.6 L50 -3.4 L57 1.6 L63.8 -2.2 L62.6 4.4 Z" fill="#fff" opacity="0.24" />
        <rect
          x="37"
          y="4.4"
          width="26"
          height="4.6"
          rx="1.6"
          fill={`url(#${metal})`}
          stroke="rgba(0,0,0,0.45)"
          strokeWidth="0.6"
        />
        <circle cx="34" cy="-4.6" r="1.6" fill={`url(#${gem})`} className="av-twinkle" />
        <circle cx="50" cy="-6.6" r="1.9" fill="#fff" className="av-twinkle" style={{ animationDelay: '0.5s' }} />
        <circle cx="66" cy="-4.6" r="1.6" fill={`url(#${gem})`} className="av-twinkle" style={{ animationDelay: '1s' }} />
        {[42, 50, 58].map((x, index) => (
          <rect
            key={x}
            x={x - 1.1}
            y={5.6}
            width="2.2"
            height="2.2"
            transform={`rotate(45 ${x} 6.7)`}
            fill="#fff"
            opacity="0.85"
            className="av-twinkle"
            style={{ animationDelay: `${0.3 + index * 0.4}s` }}
          />
        ))}
      </g>

      {/* 3D VIP shield */}
      <g className="av-bob" style={{ animationDelay: '0.6s' }}>
        <path
          d="M50 90 L64 94 L62 99.6 C 57 103.6 43 103.6 38 99.6 L36 94 Z"
          fill={`url(#${metal})`}
          stroke="rgba(0,0,0,0.5)"
          strokeWidth="0.7"
          strokeLinejoin="round"
        />
        <path d="M50 92.6 L61 95.8 L59.4 98.8 C 55.8 102 44.2 102 40.6 98.8 L39 95.8 Z" fill="#170f26" opacity="0.9" />
        <text
          x="50"
          y="100.6"
          textAnchor="middle"
          fontSize="6.8"
          fontWeight="800"
          letterSpacing="0.5"
          fill={`url(#${metal})`}
          fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        >
          VIP
        </text>
        <rect
          x="48.6"
          y="91.4"
          width="2.8"
          height="2.8"
          transform="rotate(45 50 92.8)"
          fill={`url(#${gem})`}
          className="av-twinkle"
        />
      </g>

      {/* sparkles */}
      {SPARKS.map((spark) => (
        <g
          key={`${spark.x}-${spark.y}`}
          transform={`translate(${spark.x} ${spark.y}) scale(${spark.size / 3})`}
          className="av-twinkle"
          style={{ animationDelay: `${spark.delay}s` }}
        >
          <path d={STAR} fill={palette.glow} />
          <path d={STAR} fill="#fff" transform="scale(0.5)" />
        </g>
      ))}
    </svg>
  );
}
