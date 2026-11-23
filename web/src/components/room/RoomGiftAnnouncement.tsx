import type { CSSProperties } from 'react';
import { assetUrl } from '../../lib/api';
import { formatCoins, Icon } from '../../lib/ui';
import { GiftAnimation } from '../GiftAnimation';
import type { RoomGiftInfo } from '../RoomGiftSheet';

export type GiftAnnouncementEffect = 'light' | 'medium' | 'strong';

/** One gift announcement pushed to everyone inside a voice room. */
export interface GiftAnnouncement {
  id: string;
  roomId: string;
  sender: { id: string; name: string; avatarUrl: string | null };
  recipient: { id: string; name: string; avatarUrl: string | null };
  gift: RoomGiftInfo;
  quantity: number;
  coins: number;
  style: {
    duration: number;
    effects: boolean;
    color: string;
    glow: string;
    effect: GiftAnnouncementEffect;
  };
}

/**
 * Floating horizontal bar shown right under the room header when someone sends
 * a gift. It never covers the seats or the controls: the gift artwork stays in
 * its own small tile and the whole bar fades away after the configured time.
 */
export function RoomGiftAnnouncement({ item }: { item: GiftAnnouncement }) {
  const quantity = Math.max(1, item.quantity || item.gift.quantity || 1);
  const style = {
    '--ga-color': item.style.color,
    '--ga-glow': item.style.glow,
    '--ga-dur': `${Math.min(15, Math.max(2, item.style.duration || 5))}s`,
  } as CSSProperties;

  return (
    <div
      className={`room-gift-announce fx-${item.style.effect} rarity-${item.gift.rarity}${
        item.style.effects ? ' with-fx' : ''
      }`}
      style={style}
      role="status"
      aria-live="polite"
    >
      <span className="room-gift-announce-glow" aria-hidden="true" />
      {item.style.effects ? (
        <span className="room-gift-announce-sparks" aria-hidden="true">
          {Array.from({ length: 8 }, (_, index) => (
            <i key={index} style={{ '--i': index } as CSSProperties} />
          ))}
        </span>
      ) : null}

      <span className="room-gift-announce-avatar">
        {item.sender.avatarUrl ? (
          <img src={assetUrl(item.sender.avatarUrl)} alt="" />
        ) : (
          item.sender.name.charAt(0)
        )}
      </span>

      <span className="room-gift-announce-copy">
        <span className="room-gift-announce-title">
          🎁 تم إرسال هدية إلى <b>{item.recipient.name}</b>
        </span>
        <span className="room-gift-announce-meta">
          <b>{item.sender.name}</b>
          <span className="room-gift-announce-gift">
            {item.gift.name}
            {quantity > 1 ? ` × ${quantity}` : ''}
          </span>
          <span className="room-gift-announce-coins">
            <Icon name="coins" size={11} /> {formatCoins(item.coins)}
          </span>
        </span>
      </span>

      <span className="room-gift-announce-art">
        <GiftAnimation gift={item.gift} sound={Boolean(item.gift.videoUrl)} />
      </span>
    </div>
  );
}
