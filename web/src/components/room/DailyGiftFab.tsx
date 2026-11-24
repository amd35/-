/**
 * «هدايا اليوم» floating ad: a small looping gift button in the room's bottom
 * corner. It only opens the gift shop — the room stage, the mic seats and the
 * bottom bar stay untouched, so it can never cover a control.
 */
export function DailyGiftFab({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="daily-fab" onClick={onOpen} aria-label="هدايا اليوم">
      <span className="daily-fab-orb">
        <svg viewBox="0 0 48 48" className="daily-fab-gift" aria-hidden="true">
          <defs>
            <linearGradient id="dailyFabGold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff3bf" />
              <stop offset="0.5" stopColor="#f6c94b" />
              <stop offset="1" stopColor="#c9931c" />
            </linearGradient>
          </defs>
          <path d="M24 15c-4-7-11-5-11-1s7 4 11 1Z" fill="#ffe9a6" />
          <path d="M24 15c4-7 11-5 11-1s-7 4-11 1Z" fill="#ffe9a6" />
          <rect x="7" y="14" width="34" height="7" rx="3" fill="#ffe9a6" />
          <rect x="9" y="21" width="30" height="18" rx="3" fill="url(#dailyFabGold)" />
          <rect x="21" y="14" width="6" height="25" fill="#b8791a" opacity="0.8" />
        </svg>
        <span className="daily-fab-spark" />
      </span>
      <span className="daily-fab-label">هدايا اليوم</span>
    </button>
  );
}
