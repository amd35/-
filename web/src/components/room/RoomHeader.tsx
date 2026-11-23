import { Icon } from '../../lib/ui';
import type { SeatUser } from './MicSeat';
import { RoomCrest } from './RoomCrest';

/**
 * Compact room header: only the room artwork and its name stay on screen.
 * The settings gear is the single control kept, so the owner can still manage
 * the room; the ID, owner card, counters and country row are hidden.
 */
export function RoomHeader({
  name,
  canManage,
  onBack,
  onSettings,
}: {
  name: string;
  code: string;
  owner: SeatUser | null;
  occupied: number;
  total: number;
  members: number;
  capacity: number;
  country: string;
  language: string;
  canManage: boolean;
  onBack: () => void;
  onSettings: () => void;
  onMembers: () => void;
  onStore: () => void;
}) {
  return (
    <header className="room-head room-head-clean">
      <button type="button" className="room-back" onClick={onBack} aria-label="رجوع">
        <Icon name="arrowLeft" size={16} />
      </button>

      {canManage ? (
        <button
          type="button"
          className="room-back room-head-gear"
          onClick={onSettings}
          aria-label="إعدادات الغرفة"
        >
          <Icon name="settings" size={16} />
        </button>
      ) : null}

      <div className="room-head-crest" aria-hidden="true">
        <RoomCrest />
      </div>

      <div className="room-announce">
        <span className="room-announce-text">{name}</span>
      </div>
    </header>
  );
}
