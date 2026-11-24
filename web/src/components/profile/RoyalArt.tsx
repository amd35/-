/**
 * Gold / purple / fire artwork for the royal profile screen.
 * Pure inline SVG so the art scales on every phone size and needs no assets.
 */

export function CrownSvg({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 64" aria-hidden="true">
      <defs>
        <linearGradient id="rp-crown-gold" x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0" stopColor="#fff8d6" />
          <stop offset="0.42" stopColor="#ffd75e" />
          <stop offset="1" stopColor="#b07807" />
        </linearGradient>
      </defs>
      <path
        d="M15 46 8 15l26 17L60 7l26 25 26-17-7 31Z"
        fill="url(#rp-crown-gold)"
        stroke="#7a4a05"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <rect
        x="15"
        y="44"
        width="90"
        height="12"
        rx="4"
        fill="url(#rp-crown-gold)"
        stroke="#7a4a05"
        strokeWidth="2.2"
      />
      <circle cx="60" cy="50" r="4.4" fill="#e11d48" stroke="#7a0b22" strokeWidth="1.2" />
      <circle cx="38" cy="50" r="3" fill="#ff5b8f" />
      <circle cx="82" cy="50" r="3" fill="#ff5b8f" />
      <circle cx="8" cy="13" r="3.6" fill="#fff3c4" stroke="#7a4a05" strokeWidth="1.4" />
      <circle cx="112" cy="13" r="3.6" fill="#fff3c4" stroke="#7a4a05" strokeWidth="1.4" />
      <circle cx="60" cy="5" r="4.2" fill="#fff8d6" stroke="#7a4a05" strokeWidth="1.4" />
    </svg>
  );
}

/** One feathered wing. `flip` mirrors it for the opposite side. */
export function WingsSvg({ className, flip }: { className?: string; flip?: boolean }) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 80"
      aria-hidden="true"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <defs>
        <linearGradient id="rp-wing-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff3c4" />
          <stop offset="0.45" stopColor="#ffcf5e" />
          <stop offset="1" stopColor="#a4660a" />
        </linearGradient>
        <linearGradient id="rp-wing-fire" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff8a4c" />
          <stop offset="0.55" stopColor="#e11d48" />
          <stop offset="1" stopColor="#8b0f2a" />
        </linearGradient>
      </defs>
      <g stroke="#6b3d05" strokeWidth="1.1">
        <ellipse cx="30" cy="52" rx="27" ry="8.5" transform="rotate(-14 30 52)" fill="url(#rp-wing-fire)" />
        <ellipse cx="46" cy="43" rx="31" ry="9" transform="rotate(-22 46 43)" fill="url(#rp-wing-gold)" />
        <ellipse cx="63" cy="33" rx="31" ry="9" transform="rotate(-30 63 33)" fill="url(#rp-wing-gold)" />
        <ellipse cx="79" cy="23" rx="26" ry="8" transform="rotate(-38 79 23)" fill="url(#rp-wing-gold)" />
        <ellipse cx="90" cy="14" rx="18" ry="6.5" transform="rotate(-46 90 14)" fill="url(#rp-wing-gold)" />
      </g>
    </svg>
  );
}

export function ShieldSvg({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 72" aria-hidden="true">
      <defs>
        <linearGradient id="rp-shield-red" x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0" stopColor="#ff6b6b" />
          <stop offset="0.5" stopColor="#c1121f" />
          <stop offset="1" stopColor="#6b0a12" />
        </linearGradient>
      </defs>
      <path
        d="M32 3 58 11v27c0 16-13 26-26 31C19 64 6 54 6 38V11z"
        fill="url(#rp-shield-red)"
        stroke="#ffd75e"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path d="M32 13 49 18.5V38c0 11-8 18-17 22-9-4-17-11-17-22V18.5z" fill="rgba(0,0,0,.22)" />
      <path
        d="m23 34 6.5 6.5L42 27"
        stroke="#ffe9a8"
        strokeWidth="4.2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CoinSvg({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <radialGradient id="rp-coin-gold" cx="0.34" cy="0.28" r="0.8">
          <stop offset="0" stopColor="#fff8d6" />
          <stop offset="0.45" stopColor="#ffd75e" />
          <stop offset="1" stopColor="#a4660a" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="21" fill="url(#rp-coin-gold)" stroke="#7a4a05" strokeWidth="2.4" />
      <circle cx="24" cy="24" r="15.5" fill="none" stroke="rgba(255,255,255,.5)" strokeWidth="1.4" />
      <text
        x="24"
        y="31.5"
        textAnchor="middle"
        fontSize="19"
        fontWeight="800"
        fill="#7a4a05"
        fontFamily="system-ui, sans-serif"
      >
        V
      </text>
    </svg>
  );
}

export function GemSvg({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="rp-gem-pink" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd1ec" />
          <stop offset="0.5" stopColor="#ff4fa3" />
          <stop offset="1" stopColor="#8b1d6b" />
        </linearGradient>
      </defs>
      <path
        d="M24 4 44 19 24 44 4 19z"
        fill="url(#rp-gem-pink)"
        stroke="#6b1247"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M24 4 34 19 24 44 14 19z" fill="rgba(255,255,255,.3)" />
      <path d="M4 19h40" stroke="rgba(255,255,255,.45)" strokeWidth="1.2" />
    </svg>
  );
}

export function TrophySvg({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="rp-trophy-gold" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#fff8d6" />
          <stop offset="0.5" stopColor="#ffd75e" />
          <stop offset="1" stopColor="#a4660a" />
        </linearGradient>
      </defs>
      <path
        d="M14 6h20v12a10 10 0 0 1-20 0z"
        fill="url(#rp-trophy-gold)"
        stroke="#7a4a05"
        strokeWidth="1.8"
      />
      <path d="M14 9H8v3a6 6 0 0 0 6 6M34 9h6v3a6 6 0 0 1-6 6" fill="none" stroke="#7a4a05" strokeWidth="1.8" />
      <path d="M22 28h4v7h-4z" fill="url(#rp-trophy-gold)" stroke="#7a4a05" strokeWidth="1.4" />
      <rect x="14" y="35" width="20" height="5" rx="2" fill="url(#rp-trophy-gold)" stroke="#7a4a05" strokeWidth="1.4" />
      <rect x="11" y="40" width="26" height="5" rx="2" fill="url(#rp-trophy-gold)" stroke="#7a4a05" strokeWidth="1.4" />
    </svg>
  );
}

export function GiftSvg({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="rp-gift-box" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#ff8a4c" />
          <stop offset="0.55" stopColor="#e11d48" />
          <stop offset="1" stopColor="#8b0f2a" />
        </linearGradient>
      </defs>
      <rect x="7" y="18" width="34" height="24" rx="3" fill="url(#rp-gift-box)" stroke="#5c0a1c" strokeWidth="1.8" />
      <rect x="5" y="12" width="38" height="8" rx="2.4" fill="#ffd75e" stroke="#7a4a05" strokeWidth="1.6" />
      <rect x="21" y="12" width="6" height="30" fill="#ffd75e" stroke="#7a4a05" strokeWidth="1.2" />
      <path
        d="M24 12c-4-1-9-3-9-6s6-3 9 6c3-9 9-9 9-6s-5 5-9 6z"
        fill="#ffe9a8"
        stroke="#7a4a05"
        strokeWidth="1.4"
      />
    </svg>
  );
}

export function WalletSvg({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="rp-wallet-gold" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor="#ffe9a8" />
          <stop offset="0.5" stopColor="#f0b429" />
          <stop offset="1" stopColor="#8a5a06" />
        </linearGradient>
      </defs>
      <rect x="5" y="12" width="38" height="26" rx="6" fill="url(#rp-wallet-gold)" stroke="#7a4a05" strokeWidth="1.8" />
      <path d="M5 20h38" stroke="#7a4a05" strokeWidth="1.6" />
      <rect x="28" y="24" width="15" height="9" rx="3" fill="#3b1d05" />
      <circle cx="34" cy="28.5" r="2.2" fill="#ffd75e" />
    </svg>
  );
}

export function EditSvg({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <defs>
        <linearGradient id="rp-edit-violet" x1="0" y1="0" x2="0.5" y2="1">
          <stop offset="0" stopColor="#d8b4fe" />
          <stop offset="0.5" stopColor="#a855f7" />
          <stop offset="1" stopColor="#6b21a8" />
        </linearGradient>
      </defs>
      <circle cx="19" cy="15" r="7" fill="url(#rp-edit-violet)" stroke="#3b0764" strokeWidth="1.6" />
      <path
        d="M6 39a13 13 0 0 1 26 0z"
        fill="url(#rp-edit-violet)"
        stroke="#3b0764"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="m32 26 9-9 4 4-9 9-5 1z"
        fill="#ffd75e"
        stroke="#7a4a05"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
