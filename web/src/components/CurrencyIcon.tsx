import { useId } from 'react';
import goldArt from '../assets/currency/gold-coin.png';
import diamondArt from '../assets/currency/diamond.png';

export type CurrencyCode = 'GOLD' | 'DIAMOND' | 'BEANS';

/**
 * Currency marks: the gold coin and the diamond use the app's rendered artwork,
 * so the wallet, gift shop and profile all show the same icon on every screen.
 */
export function CurrencyIcon({ code, size = 22 }: { code: CurrencyCode; size?: number }) {
  const raw = useId();
  const uid = raw.replace(/[^a-zA-Z0-9]/g, '');
  if (code === 'DIAMOND') {
    return (
      <img
        className="currency-art"
        src={diamondArt}
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    );
  }
  if (code === 'GOLD') {
    return (
      <img
        className="currency-art"
        src={goldArt}
        width={size}
        height={size}
        alt=""
        aria-hidden="true"
        draggable={false}
      />
    );
  }
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
