import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRealtime } from '../../lib/realtime';
import { formatCoins, Icon } from '../../lib/ui';
import type { GiftTickerItem } from '../../lib/giftTicker';
import { GiftCover } from '../GiftAnimation';

/**
 * «شريط الهدية» under the mic seats. It shows the gift itself (its video, its
 * photo or its drawn scene) together with the sender's and the recipient's
 * names, slides in from the left, holds in the middle so it can be read, then
 * leaves. Tapping it opens the room the gift was sent in.
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
        className={`room-gift-marquee rarity-${item.gift?.rarity ?? 'legendary'}`}
        onClick={() => navigate(`/rooms/${item.roomId}`)}
        onAnimationEnd={(event) => {
          if (event.target === event.currentTarget) setVisible(false);
        }}
      >
        <span className="room-gift-marquee-art">
          {item.gift ? (
            <GiftCover
              gift={{
                name: item.gift.name,
                design: item.gift.design,
                videoUrl: item.gift.videoUrl,
                coverUrl: item.gift.coverUrl,
                rarity: item.gift.rarity ?? 'common',
              }}
            />
          ) : (
            <Icon name="gift" size={26} />
          )}
        </span>
        <span className="room-gift-marquee-body">
          <span className="room-gift-marquee-gift">
            {item.giftName}
            {item.quantity > 1 ? ` × ${item.quantity}` : ''}
            {item.coins ? (
              <span className="room-gift-marquee-coins">{formatCoins(item.coins)}</span>
            ) : null}
          </span>
          <span className="room-gift-marquee-flow">
            <span className="room-gift-marquee-who">من</span>
            <span className="room-gift-marquee-name">{item.senderName || '—'}</span>
            <span className="room-gift-marquee-arrow">←</span>
            <span className="room-gift-marquee-who">إلى</span>
            <span className="room-gift-marquee-name">{item.recipientName || '—'}</span>
          </span>
        </span>
      </button>
    </div>
  );
}
