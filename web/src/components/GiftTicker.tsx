import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useRealtime } from '../lib/realtime';
import type { GiftAnnouncement } from './room/RoomGiftAnnouncement';

/**
 * App-wide gift ticker: whenever anyone sends a gift in a room, a bar sweeps
 * across the screen from the left to the right and then disappears. Tapping it
 * opens the room the gift was sent in. The room itself is skipped — it already
 * reveals the gift full screen.
 */
export function GiftTicker() {
  const { token } = useAuth();
  const { on } = useRealtime();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const [item, setItem] = useState<GiftAnnouncement | null>(null);
  const queue = useRef<GiftAnnouncement[]>([]);
  const showing = useRef(false);

  const next = useCallback(() => {
    const following = queue.current.shift() ?? null;
    showing.current = Boolean(following);
    setItem(following);
  }, []);

  useEffect(() => {
    return on('room_gift_announcement', (data) => {
      const incoming = (data as { announcement?: GiftAnnouncement | null }).announcement;
      if (!incoming) return;
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
      <span className="gift-ticker-gift">{item.gift.name}</span>
      <span className="gift-ticker-names">
        {item.sender.name} ← {item.recipient.name}
      </span>
      <span className="gift-ticker-cta">ادخل الغرفة</span>
    </button>,
    document.body
  );
}
