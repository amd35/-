import { useId } from 'react';

export type CurrencyCode = 'GOLD' | 'DIAMOND' | 'BEANS';

/**
 * Inline SVG currency marks (gold coin, diamond, bean). Kept as vectors so they
 * stay crisp on every Android screen size, exactly like the other app badges.
 */
export function CurrencyIcon({ code, size = 22 }: { code: CurrencyCode; size?: number }) {
  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9]/g, '');
  if (code === 'DIAMOND') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <linearGradient id={`d${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#bff0ff" />
            <stop offset="45%" stopColor="#51a5e8" />
            <stop offset="100%" stopColor="#00499a" />
          </linearGradient>
        </defs>
        <path d="M12 2.6 21.4 9 12 21.4 2.6 9z" fill={`url(#d${uid})`} />
        <path d="M12 2.6 15.8 9H8.2z" fill="#e6faff" opacity="0.85" />
        <path d="M2.6 9h18.8L12 21.4z" fill="#003a7d" opacity="0.35" />
        <path d="M12 2.6 21.4 9 12 21.4 2.6 9z" fill="none" stroke="#9fe3ff" strokeWidth="0.7" />
      </svg>
    );
  }
  if (code === 'BEANS') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        <defs>
          <linearGradient id={`b${uid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fdf667" />
            <stop offset="55%" stopColor="#d69502" />
            <stop offset="100%" stopColor="#b96602" />
          </linearGradient>
        </defs>
        <path
          d="M18.6 3.9c3 3.4 1.6 8.9-2.6 12.2-4.1 3.2-9.2 3.5-11.3 1.1-2-2.3.3-6.9 4.2-10.2 3.6-3 7.7-4.6 9.7-3.1z"
          fill={`url(#b${uid})`}
          stroke="#8f5202"
          strokeWidth="1"
        />
        <ellipse cx="9.6" cy="10.4" rx="2.6" ry="1.5" fill="#fffbe0" opacity="0.75" transform="rotate(-35 9.6 10.4)" />
        <circle cx="14.6" cy="9.2" r="0.7" fill="#fff8c9" opacity="0.9" />
        <circle cx="16.2" cy="12.4" r="0.55" fill="#fff8c9" opacity="0.8" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <defs>
        <radialGradient id={`g${uid}`} cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fffaf0" />
          <stop offset="45%" stopColor="#fde484" />
          <stop offset="80%" stopColor="#d4af37" />
          <stop offset="100%" stopColor="#8b6508" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="9.2" fill={`url(#g${uid})`} stroke="#8b6508" strokeWidth="0.9" />
      <circle cx="12" cy="12" r="6.6" fill="none" stroke="#b8860b" strokeWidth="0.8" opacity="0.7" />
      <ellipse cx="9.4" cy="8.6" rx="3" ry="1.6" fill="#fffdf5" opacity="0.7" transform="rotate(-30 9.4 8.6)" />
    </svg>
  );
}
