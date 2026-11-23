import { GiftAnimation } from '../GiftAnimation';
import type { RoomGiftInfo } from '../RoomGiftSheet';

/**
 * Full-screen gift reveal inside a voice room: a dimmed stage, the gift's
 * complete artwork scaled to the screen, and the sender / gift / quantity.
 */
export function RoomGiftFlash({ gift, sender }: { gift: RoomGiftInfo; sender: string }) {
  const quantity = gift.quantity ?? 1;
  return (
    <div className="room-gift-flash" role="status" aria-live="polite">
      <div className="room-gift-flash-glow" aria-hidden="true" />
      <div className="room-gift-flash-art">
        <GiftAnimation gift={gift} />
      </div>
      <div className="room-gift-flash-label">
        <span className="room-gift-flash-sender">{sender}</span>
        <span className="room-gift-flash-name">
          {gift.name}
          {quantity > 1 ? <b className="room-gift-flash-qty">× {quantity}</b> : null}
        </span>
      </div>
    </div>
  );
}
