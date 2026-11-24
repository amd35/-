import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRealtime } from '../../lib/realtime';
import type { GiftTickerItem } from '../../lib/giftTicker';

function lineFor(item: GiftTickerItem): string {
  const quantity = item.quantity > 1 ? ` × ${item.quantity}` : '';
  return `🎁 ${item.giftName}${quantity} — ${item.senderName} ← ${item.recipientName}`;
}

/**
 * Gift announcement bar under the mic seats in every room. The whole bar sweeps
 * across the stage from the left to the right and disappears; the next gift
 * brings it back. Tapping it opens the room the gift was sent in.
 */
export function RoomGiftMarquee({ initial }: { initial: GiftTickerItem | null }) {
  const { on } = useRealtime();
  const navigate = useNavigate();
  const [item, setItem] = useState<GiftTickerItem | null>(initial);
  const [visible, setVisible] = useState(Boolean(initial));

  useEffect(() => {
    return on('room_gift_ticker', (data) => {
      const incoming = data as unknown as GiftTickerItem | null;
      if (!incoming?.roomId || !incoming.giftName) return;
      setItem(incoming);
      setVisible(true);
    });
  }, [on]);

  if (!item || !visible) return null;

  return (
    <div className="room-gift-marquee-slot">
      <button
        key={item.id}
        type="button"
        className="room-gift-marquee"
        onClick={() => navigate(`/rooms/${item.roomId}`)}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) setVisible(false);
        }}
      >
        <span className="room-gift-marquee-badge">🎁 هدية</span>
        <span className="room-gift-marquee-line">{lineFor(item)}</span>
      </button>
    </div>
  );
}
