import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/realtime';
import type { GiftTickerItem } from '../lib/giftTicker';

/**
 * App-wide gift ticker for every screen outside the rooms: a room gift sweeps a
 * bar across the screen from the left to the right, then it disappears. Tapping
 * it opens the room the gift was sent in. Inside a room the fixed announcement
 * bar under the mic seats takes over (`RoomGiftMarquee`).
 */
export function GiftTicker() {
  const { token } = useAuth();
  const { on } = useRealtime();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [item, setItem] = useState<GiftTickerItem | null>(null);
  const queue = useRef<GiftTickerItem[]>([]);
  const showing = useRef(false);

  const next = useCallback(() => {
    const following = queue.current.shift() ?? null;
    showing.current = Boolean(following);
    setItem(following);
  }, []);

  useEffect(() => {
    return on('room_gift_ticker', (data) => {
      const incoming = data as unknown as GiftTickerItem | null;
      if (!incoming?.roomId || !incoming.giftName) return;
      if (showing.current) {
        queue.current.push(incoming);
        return;
      }
      showing.current = true;
      setItem(incoming);
    });
  }, [on]);

  if (!token || !item || pathname.startsWith('/rooms/')) return null;

  const open = () => {
    navigate(`/rooms/${item.roomId}`);
    next();
  };

  return createPortal(
    <button
      type="button"
      className="gift-ticker"
      onClick={open}
      onAnimationEnd={(event) => {
        if (event.target === event.currentTarget) next();
      }}
    >
      <span className="gift-ticker-emoji" aria-hidden="true">
        🎁
      </span>
      <span className="gift-ticker-gift">{item.giftName}</span>
      <span className="gift-ticker-names">
        {item.senderName} ← {item.recipientName}
      </span>
      <span className="gift-ticker-cta">ادخل الغرفة</span>
    </button>,
    document.body
  );
}
