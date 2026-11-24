import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/realtime';

/** One gift sent in a room, pushed to every connected screen. */
interface GiftTickerItem {
  id: string;
  roomId: string;
  roomName: string;
  senderName: string;
  recipientName: string;
  giftName: string;
  quantity: number;
}

/**
 * App-wide gift ticker: every room gift sweeps a bar across the screen from the
 * left to the right, then it disappears. It shows on every screen — including
 * the room the gift was sent in — and tapping it opens that room.
 */
export function GiftTicker() {
  const { token } = useAuth();
  const { on } = useRealtime();
  const navigate = useNavigate();
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

  if (!token || !item) return null;

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
