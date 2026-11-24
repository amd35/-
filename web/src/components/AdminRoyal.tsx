import { useId, type CSSProperties } from 'react';

/**
 * Royal administration identity (YALLA PHONE).
 *
 * Every design is pure SVG + CSS: a genuinely transparent centre, razor sharp at
 * any size, real 3D-looking gold bevels and fire lighting, and zero image
 * download (so it costs the app no performance). The same design keys are used
 * by the store catalog (`avatar_frames.design`), so the profile frame, name
 * card, chat bubble, room entry and badge all share one visual language.
 */

export interface AdminPalette {
  label: string;
  /** Gold metal: highlight, body, shadow. */
  gold: [string, string, string];
  /** Wing feathers: highlight, body, tip. */
  wing: [string, string, string];
  /** Gemstone: highlight, body, shadow. */
  gem: [string, string, string];
  /** Fire glow colour. */
  fire: string;
  /** Banner: top, bottom. */
  banner: [string, string];
}

export const ADMIN_POSITIONS: Record<string, AdminPalette> = {
  'admin-royal': {
    label: 'الادمن العام',
    gold: ['#fff4c2', '#ffcf40', '#8a5206'],
    wing: ['#ff8a5c', '#c4122f', '#180a10'],
    gem: ['#ffd9dd', '#e11d48', '#5c0413'],
    fire: '#ff5a1f',
    banner: ['#c8102e', '#5c0413'],
  },
  'admin-manager': {
    label: 'المدير',
    gold: ['#fff1bd', '#f5c542', '#7d4a05'],
    wing: ['#ff9a6a', '#d11b2b', '#1a0b0d'],
    gem: ['#ffe0c9', '#f97316', '#6b1d02'],
    fire: '#ff7a1a',
    banner: ['#d81b2b', '#63101a'],
  },
  'admin-deputy': {
    label: 'نائب المدير',
    gold: ['#ffeccb', '#e9b87a', '#7a4a1c'],
    wing: ['#ffb08a', '#a81f3f', '#1c0d12'],
    gem: ['#ffe1ea', '#e0407a', '#5a0a26'],
    fire: '#ff6b6b',
    banner: ['#b01b45', '#4c0718'],
  },
  'admin-supervisor': {
    label: 'المشرف',
    gold: ['#ffe9a8', '#d9a521', '#6d4403'],
    wing: ['#ff9f5a', '#9b1b22', '#120a0a'],
    gem: ['#fff0c4', '#d4af37', '#6b4a05'],
    fire: '#ff8a2b',
    banner: ['#a3181f', '#430609'],
  },
  'admin-official': {
    label: 'الإدارة الرسمية',
    gold: ['#ffe6b8', '#cf9b4a', '#63400f'],
    wing: ['#f0a06a', '#8c2434', '#140c0e'],
    gem: ['#ffe9d1', '#c96a2b', '#5a2405'],
    fire: '#ff9a4d',
    banner: ['#9a2233', '#3d0912'],
  },
};

export const ADMIN_DESIGNS = Object.keys(ADMIN_POSITIONS);

export const ADMIN_BADGE_BY_RANK: Record<string, string> = {
  super_admin: 'admin-royal',
  admin_manager: 'admin-manager',
  admin_deputy: 'admin-deputy',
  admin_supervisor: 'admin-supervisor',
  admin_official: 'admin-official',
};

export function isAdminDesign(design: string | null | undefined): boolean {
  return Boolean(design && design.startsWith('admin-'));
}

export function adminLabel(design: string | null | undefined, fallback = 'الإدارة الرسمية'): string {
  return (design && ADMIN_POSITIONS[design]?.label) || fallback;
}

const RAD = Math.PI / 180;
const STAR = 'M0 -3 Q 0.6 -0.6 3 0 Q 0.6 0.6 0 3 Q -0.6 0.6 -3 0 Q -0.6 -0.6 0 -3 Z';

function polar(cx: number, cy: number, radius: number, degrees: number): [number, number] {
  return [cx + radius * Math.cos(degrees * RAD), cy + radius * Math.sin(degrees * RAD)];
}

/** One tapered feather pointing up from its base at (0, 0). */
function blade(length: number, width: number): string {
  return `M0 0 C ${width} ${-length * 0.3} ${width * 0.85} ${-length * 0.72} ${width * 0.12} ${-length} C ${-width * 0.5} ${-length * 0.64} ${-width * 0.62} ${-length * 0.26} 0 0 Z`;
}

const FRAME_FEATHERS = [
  { angle: 200, length: 26, width: 4.6 },
  { angle: 214, length: 33, width: 5.2 },
  { angle: 228, length: 37, width: 5.4 },
  { angle: 242, length: 33, width: 5 },
  { angle: 256, length: 25, width: 4.4 },
];

function FrameWing({
  wingId,
  goldId,
  palette,
  flip,
}: {
  wingId: string;
  goldId: string;
  palette: AdminPalette;
  flip?: boolean;
}) {
  return (
    <g transform={flip ? 'translate(100 0) scale(-1 1)' : undefined}>
      <g className="admin-wing">
        {FRAME_FEATHERS.map((feather) => {
          const [x, y] = polar(50, 45, 35, feather.angle - 2);
          return (
            <g key={`u${feather.angle}`} transform={`translate(${x} ${y}) rotate(${feather.angle + 90})`}>
              <path d={blade(feather.length * 1.1, feather.width * 1.24)} fill={palette.wing[2]} opacity="0.95" />
            </g>
          );
        })}
        {FRAME_FEATHERS.map((feather) => {
          const [x, y] = polar(50, 45, 37, feather.angle);
          return (
            <g key={feather.angle} transform={`translate(${x} ${y}) rotate(${feather.angle + 90})`}>
              <path
                d={blade(feather.length, feather.width)}
                fill={`url(#${wingId})`}
                stroke={palette.gold[1]}
                strokeWidth="0.55"
                strokeOpacity="0.85"
              />
              <path
                d={`M0 -1.2 C ${feather.width * 0.3} ${-feather.length * 0.4} ${feather.width * 0.26} ${-feather.length * 0.74} 0 ${-feather.length * 0.92}`}
                fill="none"
                stroke="#fff"
                strokeWidth="0.55"
                opacity="0.35"
              />
            </g>
          );
        })}
        {/* gold shoulder the feathers grow out of */}
        <path
          d="M32 51 C 30 40 34 31 42 26 L46 36 C 40 40 38 46 39 53 Z"
          fill={`url(#${goldId})`}
          stroke="rgba(0,0,0,0.4)"
          strokeWidth="0.5"
        />
      </g>
    </g>
  );
}

function Crown({
  x,
  y,
  scale = 1,
  palette,
  goldId,
  gemId,
  className,
}: {
  x: number;
  y: number;
  scale?: number;
  palette: AdminPalette;
  goldId: string;
  gemId: string;
  className?: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className={className}>
      <path
        d="M-14 0 L-16.5 -12 L-7 -5.5 L0 -14 L7 -5.5 L16.5 -12 L14 0 Z"
        fill={`url(#${goldId})`}
        stroke="rgba(0,0,0,0.5)"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
      <path d="M-11.5 -1.6 L-13 -9.4 L-6.4 -4.2 L0 -10.8 L6.4 -4.2 L13 -9.4 L11.5 -1.6 Z" fill="#fff" opacity="0.22" />
      <rect x="-14.6" y="-0.4" width="29.2" height="5.2" rx="1.6" fill={`url(#${goldId})`} stroke="rgba(0,0,0,0.45)" strokeWidth="0.6" />
      <circle cx="-16.5" cy="-12" r="1.8" fill={`url(#${gemId})`} className="admin-twinkle" />
      <circle cx="0" cy="-14" r="2.2" fill={`url(#${gemId})`} className="admin-twinkle" style={{ animationDelay: '0.5s' }} />
      <circle cx="16.5" cy="-12" r="1.8" fill={`url(#${gemId})`} className="admin-twinkle" style={{ animationDelay: '1s' }} />
      <rect x="-1.4" y="1.1" width="2.8" height="2.8" transform="rotate(45 0 2.5)" fill={palette.gem[0]} opacity="0.9" />
    </g>
  );
}

/** Profile frame: fiery eagle wings, gold ring, ruby crown and a title banner. */
export function AdminRoyalFrame({ design }: { design: string }) {
  const palette = ADMIN_POSITIONS[design] ?? ADMIN_POSITIONS['admin-royal'];
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const goldId = `ag-${uid}`;
  const wingId = `aw-${uid}`;
  const gemId = `am-${uid}`;
  const fireId = `af-${uid}`;
  const bannerId = `ab-${uid}`;
  const sheenId = `as-${uid}`;

  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" className="admin-frame-svg">
      <defs>
        <linearGradient id={goldId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette.gold[0]} />
          <stop offset="42%" stopColor={palette.gold[1]} />
          <stop offset="55%" stopColor={palette.gold[0]} />
          <stop offset="100%" stopColor={palette.gold[2]} />
        </linearGradient>
        <linearGradient id={wingId} x1="0" y1="1" x2="0.35" y2="0">
          <stop offset="0%" stopColor={palette.wing[2]} />
          <stop offset="52%" stopColor={palette.wing[1]} />
          <stop offset="100%" stopColor={palette.wing[0]} />
        </linearGradient>
        <linearGradient id={gemId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette.gem[0]} />
          <stop offset="55%" stopColor={palette.gem[1]} />
          <stop offset="100%" stopColor={palette.gem[2]} />
        </linearGradient>
        <radialGradient id={fireId}>
          <stop offset="0%" stopColor={palette.fire} stopOpacity="0" />
          <stop offset="58%" stopColor={palette.fire} stopOpacity="0.1" />
          <stop offset="80%" stopColor={palette.fire} stopOpacity="0.5" />
          <stop offset="100%" stopColor={palette.fire} stopOpacity="0" />
        </radialGradient>
        <linearGradient id={bannerId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.banner[0]} />
          <stop offset="100%" stopColor={palette.banner[1]} />
        </linearGradient>
        <linearGradient id={sheenId}>
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* fire aura + energy rings */}
      <circle cx="50" cy="45" r="52" fill={`url(#${fireId})`} className="admin-fire-pulse" />
      <circle
        cx="50"
        cy="45"
        r="48"
        fill="none"
        stroke={palette.fire}
        strokeWidth="0.9"
        strokeDasharray="2.5 12"
        opacity="0.55"
        className="admin-spin-slow"
      />

      <FrameWing wingId={wingId} goldId={goldId} palette={palette} />
      <FrameWing wingId={wingId} goldId={goldId} palette={palette} flip />

      {/* gold ring with ruby studs — the centre stays fully transparent */}
      <circle cx="50" cy="45" r="39" fill="none" stroke={`url(#${goldId})`} strokeWidth="4.4" />
      <circle cx="50" cy="45" r="36.6" fill="none" stroke="rgba(0,0,0,0.42)" strokeWidth="1.1" />
      <circle cx="50" cy="45" r="41.2" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.55" />
      <circle
        cx="50"
        cy="45"
        r="39"
        fill="none"
        stroke={`url(#${sheenId})`}
        strokeWidth="4.4"
        strokeDasharray="14 231"
        strokeLinecap="round"
        className="admin-spin-slow"
      />
      {Array.from({ length: 12 }).map((_, index) => {
        const angle = (360 / 12) * index - 90;
        const [x, y] = polar(50, 45, 39, angle);
        return (
          <rect
            key={angle}
            x={x - 1.5}
            y={y - 1.5}
            width="3"
            height="3"
            transform={`rotate(45 ${x} ${y})`}
            fill={index % 3 === 0 ? '#fff' : `url(#${gemId})`}
            stroke="rgba(0,0,0,0.35)"
            strokeWidth="0.3"
            className="admin-twinkle"
            style={{ animationDelay: `${(index % 5) * 0.3}s` }}
          />
        );
      })}

      {/* crown on top */}
      <g className="admin-crown-bob">
        <Crown x={50} y={9} scale={0.86} palette={palette} goldId={goldId} gemId={gemId} />
      </g>

      {/* title banner under the frame */}
      <g className="admin-banner-in">
        <path
          d="M21 82.5 L79 82.5 L84 90 L79 97.5 L21 97.5 L16 90 Z"
          fill={`url(#${bannerId})`}
          stroke={`url(#${goldId})`}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path d="M24 85 L76 85 L79.5 90 L76 95 L24 95 L20.5 90 Z" fill="none" stroke={palette.gold[0]} strokeWidth="0.5" opacity="0.65" />
        <path d={STAR} transform="translate(25 90) scale(0.8)" fill={palette.gold[0]} />
        <path d={STAR} transform="translate(75 90) scale(0.8)" fill={palette.gold[0]} />
        <text
          x="50"
          y="92.4"
          textAnchor="middle"
          fontSize="5.4"
          fontWeight="800"
          fill={palette.gold[0]}
          fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
          style={{ filter: 'drop-shadow(0 0.5px 0.6px rgba(0,0,0,0.75))' }}
        >
          {palette.label}
        </text>
      </g>

      {/* golden sparks */}
      {[
        [10, 44, 0],
        [90, 42, 0.8],
        [17, 70, 1.4],
        [83, 72, 0.5],
        [28, 20, 1.9],
        [72, 19, 1.1],
      ].map(([x, y, delay]) => (
        <g
          key={`${x}-${y}`}
          transform={`translate(${x} ${y})`}
          className="admin-twinkle"
          style={{ animationDelay: `${delay}s` }}
        >
          <path d={STAR} fill={palette.fire} />
          <path d={STAR} fill="#fff" transform="scale(0.45)" />
        </g>
      ))}
    </svg>
  );
}

/** A small eagle wing used by the name card, bubble and entry decorations. */
function WingGlyph({ id, palette, flip }: { id: string; palette: AdminPalette; flip?: boolean }) {
  return (
    <svg viewBox="0 0 44 40" className={`admin-wing-glyph${flip ? ' flip' : ''}`} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="1" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={palette.wing[2]} />
          <stop offset="55%" stopColor={palette.wing[1]} />
          <stop offset="100%" stopColor={palette.wing[0]} />
        </linearGradient>
      </defs>
      {[
        { a: 172, l: 17, w: 4.4 },
        { a: 196, l: 22, w: 4.8 },
        { a: 220, l: 25, w: 5 },
        { a: 244, l: 21, w: 4.6 },
        { a: 266, l: 16, w: 4 },
      ].map((feather) => {
        const [x, y] = polar(42, 20, 4, feather.a);
        return (
          <g key={feather.a} transform={`translate(${x} ${y}) rotate(${feather.a + 90})`}>
            <path
              d={blade(feather.l, feather.w)}
              fill={`url(#${id})`}
              stroke={palette.gold[1]}
              strokeWidth="0.6"
              strokeOpacity="0.8"
            />
          </g>
        );
      })}
    </svg>
  );
}

/** Fiery royal name card: crown on top, small wings, role + name + ID. */
export function AdminRoyalNameCard({
  design,
  name,
  id,
  effects = true,
}: {
  design: string;
  name: string;
  id?: string | null;
  effects?: boolean;
}) {
  const palette = ADMIN_POSITIONS[design] ?? ADMIN_POSITIONS['admin-royal'];
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <div
      className={`admin-namecard admin-namecard-${design}${effects ? ' fx' : ''}`}
      style={{ '--admin-fire': palette.fire, '--admin-gold': palette.gold[1] } as CSSProperties}
    >
      <span className="admin-namecard-aura" />
      {effects ? <span className="admin-namecard-shine" /> : null}
      <svg className="admin-namecard-crown" viewBox="0 0 40 24" aria-hidden="true">
        <defs>
          <linearGradient id={`nc-gold-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={palette.gold[0]} />
            <stop offset="55%" stopColor={palette.gold[1]} />
            <stop offset="100%" stopColor={palette.gold[2]} />
          </linearGradient>
          <linearGradient id={`nc-gem-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={palette.gem[0]} />
            <stop offset="100%" stopColor={palette.gem[2]} />
          </linearGradient>
        </defs>
        <path
          d="M8 18 L5.5 7 L14 12.5 L20 4 L26 12.5 L34.5 7 L32 18 Z"
          fill={`url(#nc-gold-${uid})`}
          stroke="rgba(0,0,0,0.45)"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
        <rect x="7" y="18" width="26" height="4.6" rx="1.4" fill={`url(#nc-gold-${uid})`} />
        <circle cx="5.5" cy="7" r="1.7" fill={`url(#nc-gem-${uid})`} />
        <circle cx="20" cy="4" r="2" fill={`url(#nc-gem-${uid})`} />
        <circle cx="34.5" cy="7" r="1.7" fill={`url(#nc-gem-${uid})`} />
      </svg>
      <span className="admin-namecard-wing left">
        <WingGlyph id={`nc-wl-${uid}`} palette={palette} />
      </span>
      <span className="admin-namecard-wing right">
        <WingGlyph id={`nc-wr-${uid}`} palette={palette} flip />
      </span>
      <span className="admin-namecard-copy">
        <span className="admin-namecard-role">{palette.label}</span>
        <span className="admin-namecard-name">{name}</span>
        {id ? (
          <span className="admin-namecard-id" dir="ltr">
            ID {id}
          </span>
        ) : null}
      </span>
    </div>
  );
}

/** Decorations rendered inside a real chat bubble (wings, crown, gold role). */
export function AdminBubbleDecor({
  label,
  announce = false,
  effects = true,
}: {
  label: string;
  announce?: boolean;
  effects?: boolean;
}) {
  const palette = ADMIN_POSITIONS['admin-royal'];
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <>
      <span className="admin-bubble-wing left">
        <WingGlyph id={`bb-wl-${uid}`} palette={palette} />
      </span>
      <span className="admin-bubble-wing right">
        <WingGlyph id={`bb-wr-${uid}`} palette={palette} flip />
      </span>
      <svg className="admin-bubble-crown" viewBox="0 0 40 24" aria-hidden="true">
        <path
          d="M8 18 L5.5 7 L14 12.5 L20 4 L26 12.5 L34.5 7 L32 18 Z"
          fill={palette.gold[1]}
          stroke="rgba(0,0,0,0.45)"
          strokeWidth="0.8"
          strokeLinejoin="round"
        />
        <rect x="7" y="18" width="26" height="4.6" rx="1.4" fill={palette.gold[1]} />
        <circle cx="20" cy="4" r="2" fill={palette.gem[1]} />
      </svg>
      {effects ? (
        <span className="admin-bubble-fire" aria-hidden="true">
          <span className="admin-bubble-flame" />
          {Array.from({ length: 8 }).map((_, index) => (
            <i key={index} style={{ animationDelay: `${index * 0.27}s`, left: `${6 + index * 12}%` }} />
          ))}
        </span>
      ) : null}
      {effects ? <span className="admin-bubble-sparks" aria-hidden="true" /> : null}
      <span className="admin-bubble-role">{announce ? 'إعلان إداري' : label}</span>
    </>
  );
}

/** Cinematic room entrance: eagle wings, descending crown, golden light, sparks. */
export function AdminRoyalEntry({
  design,
  label,
  name,
  effects = true,
}: {
  design: string;
  label: string;
  name: string;
  effects?: boolean;
}) {
  const palette = ADMIN_POSITIONS['admin-royal'];
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <div
      className={`admin-entry admin-entry-${design}${effects ? ' fx' : ''}`}
      style={{ '--admin-fire': palette.fire, '--admin-gold': palette.gold[1] } as CSSProperties}
    >
      <span className="admin-entry-fire" />
      <span className="admin-entry-beam" />
      <svg className="admin-entry-wings" viewBox="0 0 200 96" aria-hidden="true">
        <defs>
          <linearGradient id={`en-wl-${uid}`} x1="0" y1="1" x2="0.4" y2="0">
            <stop offset="0%" stopColor={palette.wing[2]} />
            <stop offset="50%" stopColor={palette.wing[1]} />
            <stop offset="100%" stopColor={palette.wing[0]} />
          </linearGradient>
          <linearGradient id={`en-gold-${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={palette.gold[0]} />
            <stop offset="50%" stopColor={palette.gold[1]} />
            <stop offset="100%" stopColor={palette.gold[2]} />
          </linearGradient>
        </defs>
        {[0, 1].map((side) => (
          <g key={side} transform={side ? 'translate(200 0) scale(-1 1)' : undefined}>
            <g className="admin-entry-wing">
              {[
                { a: 198, l: 44, w: 8 },
                { a: 218, l: 58, w: 9 },
                { a: 238, l: 66, w: 9.5 },
                { a: 258, l: 56, w: 8.5 },
                { a: 276, l: 40, w: 7 },
              ].map((feather) => {
                const [x, y] = polar(96, 52, 12, feather.a);
                return (
                  <g key={feather.a} transform={`translate(${x} ${y}) rotate(${feather.a + 90})`}>
                    <path
                      d={blade(feather.l, feather.w)}
                      fill={`url(#en-wl-${uid})`}
                      stroke={palette.gold[1]}
                      strokeWidth="1"
                      strokeOpacity="0.85"
                    />
                  </g>
                );
              })}
            </g>
          </g>
        ))}
        <circle cx="100" cy="52" r="9" fill="none" stroke={`url(#en-gold-${uid})`} strokeWidth="3" className="admin-entry-ring" />
      </svg>
      <svg className="admin-entry-crown" viewBox="0 0 60 40" aria-hidden="true">
        <path
          d="M12 30 L8 12 L21 21 L30 6 L39 21 L52 12 L48 30 Z"
          fill={palette.gold[1]}
          stroke="rgba(0,0,0,0.5)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <rect x="11" y="30" width="38" height="7" rx="2" fill={palette.gold[1]} stroke="rgba(0,0,0,0.4)" strokeWidth="0.8" />
        <circle cx="8" cy="12" r="2.4" fill={palette.gem[1]} />
        <circle cx="30" cy="6" r="3" fill={palette.gem[1]} />
        <circle cx="52" cy="12" r="2.4" fill={palette.gem[1]} />
      </svg>
      <span className="admin-entry-title">{label}</span>
      <span className="admin-entry-name">{name}</span>
      {effects ? (
        <span className="admin-entry-sparks" aria-hidden="true">
          {Array.from({ length: 9 }).map((_, index) => (
            <i key={index} style={{ animationDelay: `${index * 0.28}s`, left: `${8 + index * 10}%` }} />
          ))}
        </span>
      ) : null}
    </div>
  );
}

/** Crest badge for one official position: crown, wings and a ruby shield. */
export function AdminRoyalBadge({
  design,
  size = 26,
  label,
  className,
}: {
  design: string;
  size?: number;
  label?: string;
  className?: string;
}) {
  const palette = ADMIN_POSITIONS[design] ?? ADMIN_POSITIONS['admin-royal'];
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <svg
      className={`admin-badge ${className ?? ''}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={label ?? palette.label}
      style={{ filter: `drop-shadow(0 0 ${Math.max(3, size / 7)}px ${palette.fire}aa)` }}
    >
      <defs>
        <linearGradient id={`bd-gold-${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette.gold[0]} />
          <stop offset="50%" stopColor={palette.gold[1]} />
          <stop offset="100%" stopColor={palette.gold[2]} />
        </linearGradient>
        <linearGradient id={`bd-field-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.banner[0]} />
          <stop offset="100%" stopColor={palette.banner[1]} />
        </linearGradient>
        <linearGradient id={`bd-wing-${uid}`} x1="0" y1="1" x2="0.4" y2="0">
          <stop offset="0%" stopColor={palette.wing[2]} />
          <stop offset="100%" stopColor={palette.wing[1]} />
        </linearGradient>
      </defs>
      {[0, 1].map((side) => (
        <g key={side} transform={side ? 'translate(64 0) scale(-1 1)' : undefined}>
          {[0, 1, 2].map((index) => (
            <path
              key={index}
              d={blade(13 - index * 2, 4.4)}
              transform={`translate(${15 + index * 2} ${34 - index * 3}) rotate(${212 + index * 14})`}
              fill={`url(#bd-wing-${uid})`}
              stroke={palette.gold[1]}
              strokeWidth="0.7"
              strokeOpacity="0.8"
            />
          ))}
        </g>
      ))}
      <path
        d="M32 12 L51 18 L49 38 C 47 47 40 52 32 56 C 24 52 17 47 15 38 L13 18 Z"
        fill={`url(#bd-field-${uid})`}
        stroke={`url(#bd-gold-${uid})`}
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
      <path
        d="M32 17 L46 21.5 L44.5 37 C 43 44 37.5 48 32 51 C 26.5 48 21 44 19.5 37 L18 21.5 Z"
        fill="none"
        stroke={palette.gold[0]}
        strokeWidth="0.8"
        opacity="0.6"
      />
      <path
        d="M22 30 L19 20 L27 25 L32 15 L37 25 L45 20 L42 30 Z"
        fill={`url(#bd-gold-${uid})`}
        stroke="rgba(0,0,0,0.4)"
        strokeWidth="0.7"
        strokeLinejoin="round"
      />
      <rect x="21" y="30" width="22" height="4" rx="1.2" fill={palette.gold[1]} />
      <rect x="30" y="37" width="4" height="4" transform="rotate(45 32 39)" fill={palette.gem[1]} className="admin-twinkle" />
      <circle cx="32" cy="15" r="1.6" fill={palette.gem[0]} />
    </svg>
  );
}
