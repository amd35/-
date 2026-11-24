import { useEffect, useState } from 'react';

const KEY = 'yalal.hide-gift-bars';
const EVENT = 'yalal:gift-bars';

/**
 * The member's own switch for the gift strips and their ads — the app-wide
 * ticker, the bar under the mic seats and the million-gift strip. It lives in
 * this device's storage, so the room owner, its staff, its members and plain
 * visitors each decide for themselves from «المزيد».
 */
export function giftBarsHidden(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function setGiftBarsHidden(hidden: boolean): void {
  try {
    localStorage.setItem(KEY, hidden ? '1' : '0');
  } catch {
    // Storage unavailable (private mode): the switch simply does not persist.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useGiftBarsHidden(): boolean {
  const [hidden, setHidden] = useState(giftBarsHidden);
  useEffect(() => {
    const sync = () => setHidden(giftBarsHidden());
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return hidden;
}
