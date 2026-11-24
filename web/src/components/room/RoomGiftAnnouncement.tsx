import { useEffect, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { assetUrl } from '../../lib/api';
import { playGiftSound } from '../../lib/giftSound';
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

/** A clip that never reports its end must not trap the room behind the overlay. */
const VIDEO_GUARD_MS = 45000;

/**
 * Full-screen gift reveal inside a voice room. The gift artwork fills the whole
 * screen on a plain dark stage — no card or frame around it. An uploaded clip
 * decides its own length: the moment it ends the reveal closes and the next
 * queued gift (if any) starts. Other gifts stay for the admin's configured time.
 */
export function RoomGiftAnnouncement({
  item,
  onDone,
}: {
  item: GiftAnnouncement;
  onDone: () => void;
}) {
  const quantity = Math.max(1, item.quantity || item.gift.quantity || 1);
  const hasVideo = Boolean(item.gift.videoUrl);
  const style = {
    '--ga-color': item.style.color,
    '--ga-glow': item.style.glow,
  } as CSSProperties;

  useEffect(() => {
    if (hasVideo) {
      const guard = setTimeout(onDone, VIDEO_GUARD_MS);
      return () => clearTimeout(guard);
    }
    playGiftSound(item.gift);
    const seconds = Math.min(15, Math.max(2, item.style.duration || 5));
    const timer = setTimeout(onDone, seconds * 1000);
    return () => clearTimeout(timer);
  }, [hasVideo, item, onDone]);

  return createPortal(
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

      <div className="room-gift-announce-art">
        <GiftAnimation gift={item.gift} sound={hasVideo} loop={false} onEnded={onDone} />
      </div>

      <div className="room-gift-announce-caption">
        <span className="room-gift-announce-from">
          <span className="room-gift-announce-avatar">
            {item.sender.avatarUrl ? (
              <img src={assetUrl(item.sender.avatarUrl)} alt="" />
            ) : (
              item.sender.name.charAt(0)
            )}
          </span>
          <b>{item.sender.name}</b>
          <span className="room-gift-announce-arrow">←</span>
          <b>{item.recipient.name}</b>
        </span>
        <span className="room-gift-announce-name">
          {item.gift.name}
          {quantity > 1 ? ` × ${quantity}` : ''}
        </span>
        <span className="room-gift-announce-coins">
          <Icon name="coins" size={12} /> {formatCoins(item.coins)}
        </span>
      </div>
    </div>,
    document.body
  );
}
