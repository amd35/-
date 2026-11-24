import { useId } from 'react';

/**
 * Golden crowned eagle crest that crowns the room header. Pure SVG so it scales
 * with the screen and costs no image download.
 */
export function RoomCrest({ className }: { className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const gold = `crest-gold-${uid}`;
  const deep = `crest-deep-${uid}`;
  const glow = `crest-glow-${uid}`;

  const feathers = [
    'M94 50 C 80 44 66 34 52 18 C 62 34 74 44 88 50 Z',
    'M92 55 C 76 53 60 45 44 31 C 58 47 74 57 90 59 Z',
    'M90 60 C 72 62 54 58 36 48 C 52 62 70 68 88 66 Z',
    'M89 64 C 74 68 58 66 42 60 C 58 72 74 76 88 70 Z',
  ];

  return (
    <svg
      className={`room-crest-svg${className ? ` ${className}` : ''}`}
      viewBox="0 0 220 84"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gold} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#8a5206" />
          <stop offset="38%" stopColor="#ffd24a" />
          <stop offset="70%" stopColor="#fff3c2" />
          <stop offset="100%" stopColor="#e0a92a" />
        </linearGradient>
        <linearGradient id={deep} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#5c1a04" />
          <stop offset="100%" stopColor="#c8102e" />
        </linearGradient>
        <radialGradient id={glow} cx="50%" cy="60%" r="60%">
          <stop offset="0%" stopColor="rgba(255,150,40,0.55)" />
          <stop offset="100%" stopColor="rgba(255,150,40,0)" />
        </radialGradient>
      </defs>

      <ellipse cx="110" cy="46" rx="88" ry="26" fill={`url(#${glow})`} />

      {[0, 1].map((side) => (
        <g
          key={side}
          className="room-crest-wing"
          transform={side ? 'translate(220 0) scale(-1 1)' : undefined}
          fill={`url(#${gold})`}
          stroke="#7a4d0a"
          strokeWidth="0.6"
        >
          {feathers.map((d) => (
            <path key={d} d={d} />
          ))}
        </g>
      ))}

      <g fill={`url(#${gold})`} stroke="#7a4d0a" strokeWidth="0.8">
        <path d="M92 52 L92 33 L101 44 L110 23 L119 44 L128 33 L128 52 Z" />
        <path d="M89 52 H131 V57 H89 Z" />
      </g>
      <circle cx="110" cy="40" r="2.6" fill={`url(#${deep})`} />
      <circle cx="97" cy="48" r="1.6" fill="#ffe9a0" />
      <circle cx="123" cy="48" r="1.6" fill="#ffe9a0" />
      <path d="M104 30 L110 20 L116 30 Z" fill="#fff6cf" opacity="0.85" />
    </svg>
  );
}
